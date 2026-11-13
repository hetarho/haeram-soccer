import { describe, expect, it } from 'vitest';
import { COUNTRIES, CATALOG_HASH, CATALOG_VERSION } from '../../catalogs/src/index';
import type { Club, Player, TransferBid, World } from '../../contracts/src/types';
import { validateWorld } from '../../contracts/src/schema';
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { closeNpcSummer, NPC_YOUTH } from './npc-careers';
import { developAnnually } from './training';
import { TRAINING_GROUND } from './facility-model';
import {
  clubPlayers,
  clubStyle,
  invalidateNpcSquad,
  invalidateNpcSquads,
  lineup,
  NPC_SQUAD,
  npcSquad,
  rating,
  refreshNpcSquads,
  refillPlace,
  squad,
  squadPlaces,
  startingSquad,
} from './world';
import { clubManager } from './managerMarket';
import { materializePeople, movePerson, returnLoan } from './npc-continuity';
import { closeDisciplineSeason, recordNpcInjury } from './discipline';
import { crossWar } from './wartime';
import {
  joinFreeAgents,
  refreshFreeAgents,
  signFreeAgentAtClose,
} from './free-agents';
import { respondBid } from './transfers';
import { signFreeAgent } from './ops-squad';
import { clubPlayer, freeAgentTerms, worldMarketPage } from './world-market';
import { transferOffers } from './scout-search';
import { coachingGrade } from './aptitude';
import { lineOf } from './player';
import { isInjured, overall } from './player-state';
import { takeOver } from './takeover';
import { staffAuthority } from './testing';
import { retirePerson } from './careers';
import { readCopy } from './fixture-copy';

/** Ten small synthetic clubs, no world generation, fixture settlement or season simulation. */
function fixture(year = 1950, owner = true): World {
  const w = worldMarketFixture();
  w.year = year;
  w.catalog = CATALOG_VERSION;
  w.catalogHash = CATALOG_HASH;
  const model = w.clubs[0]!;
  w.clubs = COUNTRIES.map((c, i): Club => ({
    ...model,
    id: `${c.code}:0:0:0`,
    name: `club-${i}`,
    short: `C${i}`,
    country: c.code,
    strength: 55,
    reputation: 40,
  }));
  w.clubs.push(
    ...['HUN', 'SCO'].map(
      (country): Club => ({
        ...model,
        id: `euro:${country}`,
        name: country,
        country,
        representative: true,
      }),
    ),
  );
  w.playerClub = owner ? w.clubs[0]!.id : '';
  if (!owner) w.players = [];
  w.tactic = w.manager.philosophy;
  w.calendar = { day: 0 };
  w.settings = staffAuthority(1);
  foundSquads(w);
  if (owner) materializePeople(w);
  return w;
}
function liveIds(w: World) {
  const ids = [
    ...w.players.filter((p) => p.status === 'active'),
    ...Object.values(w.squads ?? {}).flat(),
    ...(w.freeAgents ?? []),
  ].map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  return ids;
}
function bid(w: World, p: Player, club: string, direction: TransferBid['direction']): TransferBid {
  const b: TransferBid = {
    id: `bid:${p.id}:${direction}`,
    direction,
    playerId: p.id,
    club,
    fee: '1',
    counterFee: '1',
    year: w.year,
    day: 0,
    due: 0,
    status: direction === 'out' ? 'countered' : 'pending',
  };
  w.bids = [b];
  return b;
}

describe('persisted playable squads', () => {
  it.each([1930, 1980])('founds all eight associations exactly once in %i', (year) => {
    const w = fixture(year, false),
      before = structuredClone(w.squads);
    expect(Object.keys(w.squads!)).toHaveLength(COUNTRIES.length);
    for (const c of w.clubs) {
      if (c.representative) {
        expect(w.squads![c.id]).toBeUndefined();
        expect(squad(w, c)).toEqual(expect.any(Array));
        continue;
      }
      const players = w.squads![c.id]!;
      expect(players).toHaveLength(NPC_SQUAD.size);
      for (const generated of npcSquad(w.seed, year, c)) {
        const stored = players.find((p) => p.id === generated.id)!;
        expect({ ...stored, until: generated.until }).toEqual(generated);
      }
      for (const p of players) {
        expect(BigInt(p.wage)).toBeGreaterThan(0n);
        expect(p.until).toBeGreaterThanOrEqual(year + 1);
        expect(p.until).toBeLessThanOrEqual(year + 5);
        if ((coachingGrade(p) ?? 0) >= 4) expect(w.people![p.id]!.club).toBe(c.id);
      }
    }
    w.year++;
    foundSquads(w);
    materializePeople(w);
    expect(w.squads).toEqual(before);
    liveIds(w);
  });

  it('selects the eleven and line-cover bench once per club, keeping attributes through a rollover', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      other = w.clubs[2]!;
    const held = structuredClone(w.squads![c.id]),
      cached = squad(w, c),
      untouched = squad(w, other);
    expect(cached).toHaveLength(18);
    expect(cached.slice(0, 11)).toEqual(
      lineup(w.squads![c.id]!, clubStyle(c), clubManager(w, c), w.year),
    );
    const places = squadPlaces(clubStyle(c));
    for (let i = 11; i < 18; i++)
      expect(lineOf(cached[i]!.position)).toBe(lineOf(places[i]!.position));
    expect(squad(w, c)).toBe(cached);
    invalidateNpcSquad(w, c.id);
    expect(squad(w, c)).not.toBe(cached);
    expect(squad(w, other)).toBe(untouched);
    w.year++;
    materializePeople(w);
    expect(w.squads![c.id]).toEqual(held);
    for (const p of squad(w, c)) expect(p.attrs).toEqual(held!.find((q) => q.id === p.id)!.attrs);
  });

  it('replaces unavailable starters from the bench, then outside the eighteen, for that fixture only', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      selected = squad(w, c),
      starter = selected[0]!;
    const f = { kind: 'league' as const };
    recordNpcInjury(w, starter.id, c.id, 500);
    const replacement = startingSquad(w, c, f)[0]!;
    expect(replacement.id).not.toBe(starter.id);
    expect(selected.slice(11)).toContain(replacement);
    for (const p of selected.slice(11)) recordNpcInjury(w, p.id, c.id, 500);
    const outsider = startingSquad(w, c, f)[0]!;
    expect(selected).not.toContain(outsider);
    expect(w.squads![c.id]).toContain(outsider);
    expect(startingSquad(w, c)[0]).toBe(starter);
    for (const p of w.squads![c.id]!) recordNpcInjury(w, p.id, c.id, 500);
    expect(startingSquad(w, c, f)[0]).toBe(starter);
    const ban = {
      player: starter.id,
      club: c.id,
      matches: 2,
      scope: 'league' as const,
      reason: 'yellows' as const,
    };
    w.discipline!.bans.push(ban);
    recordNpcInjury(w, 'rep', w.clubs[8]!.id, 500);
    w.year++;
    closeDisciplineSeason(w);
    expect(w.discipline!.out.some((o) => o.player === starter.id)).toBe(true);
    expect(w.discipline!.out.some((o) => o.player === 'rep')).toBe(false);
    expect(w.discipline!.bans).toContain(ban);
  });

  it('keeps a chosen eighteen across reload/helper cache loss until a selection boundary', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      chosen = squad(w, c);
    w.managerMarket = {
      year: w.year,
      round: 0,
      free: [],
      clubs: { [c.id]: [3, w.year] },
      serial: 0,
    };
    const outside = w.squads![c.id]![20]!;
    for (const key of Object.keys(outside.attrs) as (keyof Player['attrs'])[])
      outside.attrs[key] = 99;
    invalidateNpcSquads(w);
    const remote = JSON.parse(JSON.stringify(readCopy(w))) as World;
    expect(squad(w, c)).toEqual(chosen);
    expect(squad(remote, c)).toEqual(chosen);
    refreshNpcSquads(w);
    expect(squad(w, c)).toContain(outside);
    expect(squad(w, c).slice(0, 11)).toEqual(
      lineup(w.squads![c.id]!, clubStyle(c), clubManager(w, c), w.year),
    );
  });

  it('moves the actual live player on purchase, sale, loan out and return, keeping our departed career', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      buyer = w.clubs[2]!;
    const p = structuredClone(w.squads![c.id]![20]!),
      attrs = structuredClone(p.attrs);
    const sellerChoice = squad(w, c),
      untouched = squad(w, w.clubs[3]!);
    recordNpcInjury(w, p.id, c.id, 40);
    respondBid(w, bid(w, p, c.id, 'out').id, true);
    expect(squad(w, c)).not.toBe(sellerChoice);
    expect(squad(w, w.clubs[3]!)).toBe(untouched);
    expect(clubPlayer(w, c, p.id)).toBeUndefined();
    const ours = w.players.find((q) => q.id === p.id)!;
    expect(isInjured(w, ours)).toBe(true);
    ours.career[0] = 7;
    ours.graduate = true;
    liveIds(w);
    // The bidder has a real vacancy and books that can carry the agreed fee and contract.
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((q) => lineOf(q.position) !== lineOf(ours.position));
    buyer.books = { seasons: [], cash: '999999999999', debt: '0', openingIncome: '999999999999' };
    respondBid(w, bid(w, ours, buyer.id, 'in').id, true);
    const sold = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(sold.attrs).toEqual(attrs);
    expect(sold.personality).toEqual(p.personality);
    expect(sold.potential).toBe(p.potential);
    expect(ours.status).toBe('sold');
    expect(ours.career[0]).toBe(7);
    expect(sold).not.toBe(ours);
    liveIds(w);
    respondBid(w, bid(w, sold, buyer.id, 'out').id, true);
    const returned = w.players.find((q) => q.id === p.id)!;
    expect(returned.career[0]).toBe(7);
    expect(returned.graduate).toBe(true);
    returned.loanUntil = w.year + 1;
    movePerson(w, returned, buyer.id, true, returned.loanUntil);
    liveIds(w);
    const loaned = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(loaned.loanUntil).toBe(w.year + 1);
    returnLoan(w, loaned);
    liveIds(w);
    expect(w.players.filter((q) => q.id === p.id)).toHaveLength(1);
    expect(w.players.find((q) => q.id === p.id)).toMatchObject({
      status: 'active',
      attrs,
      graduate: true,
    });
    expect(w.players.find((q) => q.id === p.id)!.career[0]).toBe(7);
    expect(w.people![p.id]!.ownCareer![0]).toBe(7);
  });

  it('returns a loan in to its persisted parent without losing attributes', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      p = structuredClone(w.squads![c.id]![0]!);
    const b = bid(w, p, c.id, 'out');
    b.loan = true;
    respondBid(w, b.id, true);
    const loaned = w.players.find((q) => q.id === p.id)!;
    expect(w.people![p.id]!.loan?.club).toBe(c.id);
    liveIds(w);
    returnLoan(w, loaned);
    liveIds(w);
    expect(w.squads![c.id]!.find((q) => q.id === p.id)).toMatchObject({ attrs: p.attrs, born: p.born });
    expect(loaned.status).toBe('sold');
  });

  it.each(['immediate', 'close'])('a %s free signing restores one live row and its career', (how) => {
    const w = fixture(),
      p = w.players[5]!;
    p.career[0] = 12;
    p.graduate = true;
    movePerson(w, p, undefined, true);
    expect(joinFreeAgents(w, p, w.year)).toBe(true);
    liveIds(w);
    const agent = w.freeAgents![0]!;
    if (how === 'immediate') signFreeAgent(w, { player: freeAgentTerms(w, agent).player });
    else expect(signFreeAgentAtClose(w, lineOf(p.position), 100)).toBeDefined();
    liveIds(w);
    expect(w.freeAgents).toHaveLength(0);
    expect(w.players.filter((q) => q.id === p.id)).toHaveLength(1);
    expect(w.players.find((q) => q.id === p.id)).toMatchObject({ status: 'active', graduate: true });
    expect(w.players.find((q) => q.id === p.id)!.career[0]).toBe(12);
  });

  it('reads every persisted market player, including those outside the eighteen, without a redraw', () => {
    const w = fixture(),
      c = w.clubs[1]!;
    const first = worldMarketPage(w, { world: w.id, team: c.id });
    expect(first.total).toBe(NPC_SQUAD.size);
    expect(worldMarketPage(w, { world: w.id, team: c.id })).toEqual(first);
    expect(transferOffers(w)).toEqual(transferOffers(w));
    for (const p of w.squads![c.id]!) expect(clubPlayer(w, c, p.id)).toBe(p);
  });

  it('takes over the entire stored squad with its contracts and removes the NPC entry', () => {
    const w = fixture(1950, false),
      c = w.clubs[0]!,
      before = structuredClone(w.squads![c.id]);
    takeOver(w, c.id, { tier: 'oil', traits: [] });
    expect(w.squads![c.id]).toBeUndefined();
    expect(w.players).toHaveLength(NPC_SQUAD.size);
    for (const p of before!)
      expect(w.players.find((q) => q.id === p.id)).toMatchObject({
        attrs: p.attrs,
        personality: p.personality,
        potential: p.potential,
        wage: p.wage,
        until: p.until,
      });
    liveIds(w);
  });

  it('fills a takeover to twenty only when fewer are held', () => {
    const w = fixture(1950, false),
      c = w.clubs[0]!;
    const kept = w.squads![c.id]!.slice(0, 14);
    // This fixture represents fourteen players already held, with no departed registry records.
    for (const p of w.squads![c.id]!.slice(14)) if (w.people) delete w.people[p.id];
    w.squads![c.id] = kept;
    takeOver(w, c.id, { tier: 'oil', traits: [] });
    expect(w.players).toHaveLength(20);
    expect(w.players.slice(0, 14)).toEqual(kept);
    liveIds(w);
  });

  it('moves a released player from the pool into a real squad at the refresh', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      p = w.squads![c.id]![0]!;
    const before = structuredClone(p);
    w.squads![c.id] = w.squads![c.id]!.filter((q) => lineOf(q.position) !== lineOf(p.position) || q.id === p.id);
    joinFreeAgents(w, p, w.year);
    expect(w.squads![c.id]!.some((q) => q.id === p.id)).toBe(false);
    liveIds(w);
    w.round = 4;
    refreshFreeAgents(w);
    expect(w.freeAgents).toHaveLength(0);
    const live = Object.values(w.squads!)
      .flat()
      .find((q) => q.id === p.id)!;
    expect(live).toMatchObject({
      attrs: before.attrs,
      potential: before.potential,
      born: before.born,
    });
    expect(live).not.toHaveProperty('freeSince');
    liveIds(w);
  });

  it('replaces a registered retiree below the last age without changing his career identity', () => {
    const w = fixture(),
      c = w.clubs[1]!;
    const p = w.squads![c.id]!.find((q) => w.people?.[q.id])!;
    const person = w.people![p.id]!,
      before = structuredClone(person);
    retirePerson(w, person);
    let survivors = 0;
    closeNpcSummer(w, () => {
      survivors = w.squads![c.id]!.length;
    });
    expect(w.squads![c.id]).toHaveLength(
      Math.max(NPC_SQUAD.size, survivors + NPC_YOUTH.byAcademy[c.levels!.academy]!.count),
    );
    expect(w.squads![c.id]!.some((q) => q.id === p.id)).toBe(false);
    expect(person).toMatchObject({ name: before.name, born: before.born, playing: 'retired' });
  });

  it('replaces retirees with academy youth and freezes running contract seasons through war', () => {
    const w = fixture(1938),
      c = w.clubs[1]!,
      p = w.squads![c.id]![0]!,
      other = w.squads![c.id]![1]!;
    p.born = 1898;
    const person = w.people?.[p.id];
    if (person) person.born = p.born;
    const contract = other.until,
      before = structuredClone(other);
    developAnnually(w, before, {
      year: w.year + 1,
      youth: clubManager(w, c).youth,
      ground: TRAINING_GROUND[c.levels!.ground]!.growth,
      adaptation: c.cohesion ?? 0.8,
      report: false,
    });
    let survivors = 0;
    let firstPlace: Player['position'] | undefined;
    closeNpcSummer(w, () => {
      survivors = w.squads![c.id]!.length;
      firstPlace = refillPlace(clubStyle(c), w.squads![c.id]!);
    });
    expect(w.squads![c.id]).toHaveLength(
      Math.max(NPC_SQUAD.size, survivors + NPC_YOUTH.byAcademy[c.levels!.academy]!.count),
    );
    const youth = w.squads![c.id]!.find((q) => q.id === `${c.id}:y:1939:0`)!;
    expect(youth.id).not.toBe(p.id);
    expect(youth.id.startsWith(c.id)).toBe(true);
    expect([17, 18]).toContain(1939 - youth.born);
    expect(youth.position).toBe(firstPlace);
    expect(other).toEqual(before);
    other.loanUntil = 1940;
    movePerson(w, other, c.id);
    w.people![other.id]!.loan = { club: w.playerClub, until: 1940 };
    w.year = 1946;
    crossWar(w, 1938);
    expect(other.until).toBe(contract + 7);
    expect(other.loanUntil).toBe(1947);
    expect(w.people![other.id]!.loan!.until).toBe(1947);
    liveIds(w);
  });

  it('validates a plain save → load with the entire squad deep-equal and rejects duplicate live ids', () => {
    const w = fixture();
    const loaded = validateWorld(JSON.parse(JSON.stringify(w)));
    expect(loaded.squads).toEqual(w.squads);
    expect(loaded.clubs.map((c) => c.levels)).toEqual(w.clubs.map((c) => c.levels));
    for (const value of [-1, 6, 1.5]) {
      const malformed = structuredClone(w);
      malformed.clubs[1]!.levels!.ground = value;
      expect(() => validateWorld(malformed)).toThrow();
    }
    const c = w.clubs[1]!;
    const missing = structuredClone(w);
    delete missing.squads![c.id];
    expect(() => validateWorld(missing)).toThrow();
    const representative = structuredClone(w);
    representative.squads![w.clubs[8]!.id] = [];
    expect(() => validateWorld(representative)).toThrow();
    w.squads![c.id]!.push(structuredClone(w.players[0]!));
    expect(() => validateWorld(w)).toThrow();
  });

  it('invalidates the rating with the club choice after its attributes change', () => {
    const w = fixture(),
      c = w.clubs[1]!,
      before = rating(w, c);
    for (const p of w.squads![c.id]!)
      for (const key of Object.keys(p.attrs) as (keyof Player['attrs'])[]) p.attrs[key] = 90;
    invalidateNpcSquad(w, c.id);
    expect(rating(w, c)).toBeGreaterThan(before);
    expect(overall(clubPlayers(w, c)[0]!)).toBeGreaterThan(before);
  });
});
