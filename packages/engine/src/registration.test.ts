import { placeBid, respondBid } from './transfers';
import { transferOffers } from './ops-squad';
import { movePerson } from './npc-continuity';
import { describe, it, expect } from 'vitest';
import { createWorld } from './index';
import { makePlayer, clubOf, joinClub } from './world';
import { registration, registrationRoom } from './registration';
import { validateWorld, canonical } from '../../contracts/src/index';
import { country, currency, priceIndex } from '../../catalogs/src/index';
import { prepareSeason } from './season';
import type { CountryCode, Player } from '../../contracts/src/types';
function fixture(code: CountryCode, year: number, tier: number, count: number) {
  const w = createWorld({
    country: code,
    name: 'Synthetic Registration',
    color: '#224466',
    seed: 'registration',
    level: 'normal',
  });
  const own = clubOf(w),
    depth = country(code).groups.length;
  const displaced = w.clubs.find(
    (c) => c.country === code && c.tier === tier && !c.representative && c.id !== own.id,
  );
  if (displaced) {
    displaced.tier = depth;
    displaced.group = 0;
  }
  own.tier = tier;
  own.group = 0;
  w.lower = tier >= depth;
  w.year = year;
  w.currency = currency(code, year).code;
  w.priceIndex = priceIndex(code, year).value;
  w.players = Array.from({ length: count }, (_, i) =>
    makePlayer(code, w.seed, `registration:${i}`, year, 50, i === 0 ? 'GK' : 'CM', 25, tier),
  );
  w.manager = { ...w.manager, born: year - 50, since: year, until: year + 3 };
  w.people = undefined;
  w.academy = { players: [] };
  prepareSeason(w);
  return w;
}
function candidate(w: ReturnType<typeof fixture>, age = 24, position: Player['position'] = 'CM') {
  return makePlayer(
    clubOf(w).country,
    w.seed,
    `registration:candidate:${age}:${position}`,
    w.year,
    50,
    position,
    age,
    clubOf(w).tier,
  );
}
describe('season-specific squad registration', () => {
  it('uses the forty-player ceiling before the first rule, with no forced releases', () => {
    const w = fixture('ENG', 2009, 0, 39),
      p = candidate(w);
    expect(registrationRoom(w, p)).toBeUndefined();
    w.players.push(p);
    expect(registrationRoom(w, candidate(w, 20))).toContain('40명');
    expect(registration(w)).toMatchObject({ total: 40, counted: 40, allowed: 40, ceiling: 40 });
  });
  it('allows exempt young players alongside a full top-flight counted list and preserves over-limit squads', () => {
    const w = fixture('ENG', 2012, 0, 25);
    expect(registrationRoom(w, candidate(w, 24))).toContain('25명');
    expect(registrationRoom(w, candidate(w, 20))).toBeUndefined();
    w.players.push(candidate(w, 24));
    const before = w.players.length;
    expect(registration(w).counted).toBe(26);
    expect(w.players).toHaveLength(before);
    expect(registrationRoom(w, candidate(w, 20))).toBeUndefined();
    expect(registrationRoom(w, candidate(w, 24))).toBeDefined();
  });
  it('exempts League One goalkeepers but counts a young Championship loanee', () => {
    const one = fixture('ENG', 2021, 2, 23); // goalkeeper exempt, 22 counted outfield players
    expect(registration(one)).toMatchObject({ counted: 22, exempt: 1 });
    expect(registrationRoom(one, candidate(one, 30, 'GK'))).toBeUndefined();
    expect(registrationRoom(one, candidate(one, 30))).toBeDefined();
    const second = fixture('ENG', 2021, 1, 25),
      young = candidate(second, 19);
    expect(registrationRoom(second, young)).toBeUndefined();
    young.loanUntil = second.year + 1;
    expect(registrationRoom(second, young)).toContain('임대 선수');
  });
  it('checks the loan exemption at bid creation and again before accepting a counter', () => {
    const full = fixture('ENG', 2021, 1, 25);
    full.cash = '999999999999';
    const offers = transferOffers(full),
      index = offers.findIndex((o) => !o.freeAgent && full.year - o.player.born <= 21);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(() => placeBid(full, index, offers[index].fee, true)).toThrow('임대 선수');
    placeBid(full, index, offers[index].fee, false);
    expect(full.bids!.at(-1)!.status).toBe('pending');
    const w = fixture('ENG', 2021, 1, 24);
    w.cash = '999999999999';
    const market = transferOffers(w),
      candidateIndex = market.findIndex((o) => !o.freeAgent && w.year - o.player.born <= 21);
    placeBid(w, candidateIndex, market[candidateIndex].fee, true);
    const bid = w.bids!.at(-1)!;
    bid.status = 'countered';
    bid.counterFee = bid.fee;
    const extra = candidate(w, 30);
    w.players.push(extra);
    movePerson(w, extra, w.playerClub, true);
    const before = canonical(w);
    expect(() => respondBid(w, bid.id, true)).toThrow('임대 선수');
    expect(canonical(w)).toBe(before);
  });
  it('adds at most two Serie B bandiera places from actual counted first-team tenure; absence grants none', () => {
    const w = fixture('ITA', 2018, 1, 18);
    expect(registration(w).allowed).toBe(18);
    expect(registrationRoom(w, candidate(w))).toBeDefined();
    w.players[0].joined = 2014;
    w.players[1].joined = 2014;
    w.players[2].joined = 2010;
    expect(registration(w).allowed).toBe(20);
    expect(registrationRoom(w, candidate(w))).toBeUndefined();
  });
  it('exempts a Spanish academy graduate aged twenty-two while counting a signed peer', () => {
    const w = fixture('ESP', 2000, 0, 25),
      p = candidate(w, 22);
    expect(registrationRoom(w, p)).toBeDefined();
    p.graduate = true;
    expect(registrationRoom(w, p)).toBeUndefined();
    p.born = w.year - 23;
    expect(registrationRoom(w, p)).toBeDefined();
  });
  it('uses this season division and year immediately after promotion, retaining every existing player', () => {
    const w = fixture('ENG', 2012, 1, 27);
    expect(registration(w).allowed).toBe(40);
    const ids = w.players.map((p) => p.id);
    clubOf(w).tier = 0;
    expect(registration(w)).toMatchObject({ counted: 27, allowed: 25 });
    expect(w.players.map((p) => p.id)).toEqual(ids);
    expect(registrationRoom(w, candidate(w, 24))).toBeDefined();
    expect(registrationRoom(w, candidate(w, 20))).toBeUndefined();
  });
  it('records first-team join seasons and graduate flags losslessly without inventing absent tenure', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Join Years',
      color: '#224466',
      seed: 'join-years',
      level: 'normal',
    });
    expect(w.players.every((p) => p.joined === w.year && !p.graduate)).toBe(true);
    const player = w.players[0];
    joinClub(player, 'academy', w.year);
    player.graduate = true;
    const saved = validateWorld(JSON.parse(canonical(w)));
    expect(saved.players[0]).toMatchObject({ joined: w.year, graduate: true });
    delete saved.players[0].joined;
    expect(validateWorld(saved).players[0].joined).toBeUndefined();
  });
});
