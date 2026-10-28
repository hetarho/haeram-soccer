import { describe, expect, it, vi } from 'vitest';
import * as recruitment from './recruitment';
import type { WorldMarketQuery } from '../../contracts/src/types';
import { WORLD_MARKET_PAGE_SIZE } from '../../contracts/src/schema';
import { worldMarketDetail, worldMarketOffer, worldMarketPage } from './world-market';
import { worldMarketFixture } from './world-market.testkit';
import { squad, invalidateNpcSquads, makePlayer } from './world';
import { transferOffers, squadCommand } from './ops-squad';
import { placeBid, respondBid, bidBoard, dailyMarket } from './transfers';
import { continuousSquad, movePerson, returnLoan } from './npc-continuity';
import { overall } from './player-state';
import { registration } from './registration';
import { zeroMetrics } from './primitives';
import { recordTransfer } from './transfer-records';

const query = (w: ReturnType<typeof worldMarketFixture>, q: Omit<WorldMarketQuery, 'world'> = {}) =>
  worldMarketPage(w, { ...q, world: w.id });
const foreignTarget = (w: ReturnType<typeof worldMarketFixture>) => ({
  world: w.id,
  kind: 'club' as const,
  clubId: 'foreign',
  playerId: squad(w, w.clubs[1])[0].id,
});

function spanishReturnFixture(age = 22, graduate = true) {
  const w = worldMarketFixture();
  w.year = 2001;
  w.clubs[0].country = 'ESP';
  for (const p of w.players) p.born = w.year - 25;
  const original = w.players[0];
  original.born = w.year - age;
  if (graduate) original.graduate = true;
  movePerson(w, original, w.playerClub, true);
  original.status = 'sold';
  movePerson(w, original, 'foreign', true);
  while (w.players.length < 26)
    w.players.push({ ...w.players[1], id: `counted:${w.players.length}` });
  const target = { world: w.id, kind: 'club' as const, clubId: 'foreign', playerId: original.id };
  return { w, original, target };
}

// The fixture holds just current squads. Dated cases settle only the market, never fixtures or a whole day.
describe('bounded whole-world market', () => {
  it('finds every represented club and available scout identity, including our inspectable players', () => {
    const w = worldMarketFixture();
    const before = structuredClone(w);
    const expected = [
      ...w.clubs.flatMap((c) => squad(w, c)),
      ...transferOffers(w).map((o) => o.player),
    ];
    const found = query(w, { pageSize: WORLD_MARKET_PAGE_SIZE });
    const next = query(w, { page: 1, pageSize: WORLD_MARKET_PAGE_SIZE });
    expect(found.total).toBe(expected.length);
    expect(new Set([...found.items, ...next.items].map((o) => o.player.id))).toEqual(
      new Set(expected.map((p) => p.id)),
    );
    const own = query(w, { team: w.playerClub });
    expect(own.items.every((o) => o.own && !o.available && o.source?.country === 'ENG')).toBe(true);
    expect(query(w, { team: 'foreign' }).items.every((o) => o.source?.country === 'ESP')).toBe(
      true,
    );
    expect(
      query(w, { team: 'representative' }).items.every((o) => o.source?.country === 'HUN'),
    ).toBe(true);
    expect(w).toEqual(before);
    own.items[0].player.attrs.pace = 1;
    expect(w.players[0].attrs.pace).toBe(before.players[0].attrs.pace);
    expect(query(w, { team: 'missing', page: 999 })).toMatchObject({
      total: 0,
      page: 0,
      items: [],
    });
    const last = query(w, { page: Number.MAX_SAFE_INTEGER, pageSize: 7 });
    expect(last.page).toBe(Math.ceil(last.total / 7) - 1);
    expect(last.items.length).toBeLessThanOrEqual(7);
  });

  it('combines name, recommendation, league/team, proficient position, line and fit filters', () => {
    const w = worldMarketFixture();
    w.clubs[1].strength = 80;
    const offer = worldMarketOffer(w, foreignTarget(w))!;
    w.shortlist = {
      year: w.year,
      day: 0,
      requests: [],
      entries: [{ playerId: offer.player.id, line: 'GK' }],
    };
    const found = query(w, {
      name: offer.player.name.toUpperCase(),
      recommendedOnly: true,
      league: { country: 'ESP', tier: 0, group: 0 },
      team: 'foreign',
      position: 'GK',
      line: 'GK',
      fit: 'improves',
    });
    expect(found.items.map((o) => o.player.id)).toEqual([offer.player.id]);
    expect(query(w, { recommendedOnly: true, line: 'FW' }).total).toBe(0);
    const fitting = query(w, { fit: 'improves', pageSize: 50 });
    expect(fitting.total).toBeGreaterThan(0);
    for (const candidate of fitting.items) {
      const preview = recruitment.recruitmentPreview(w, candidate);
      expect(preview.strengthDelta > 0 || preview.fitDelta > 0).toBe(true);
    }
    const p = squad(w, w.clubs[1])[1];
    p.positions = { CB: 3, AM: 2 };
    expect(query(w, { team: 'foreign', line: 'MF' }).items.some((o) => o.player.id === p.id)).toBe(
      true,
    );
    expect(
      query(w, { team: 'foreign', position: 'AM' }).items.some((o) => o.player.id === p.id),
    ).toBe(true);
    p.positions.AM = 1;
    expect(query(w, { team: 'foreign', line: 'MF' }).items.some((o) => o.player.id === p.id)).toBe(
      false,
    );
    expect(
      query(w, { team: 'foreign', position: 'AM' }).items.some((o) => o.player.id === p.id),
    ).toBe(false);
  });

  it.each(['name', 'age', 'ovr', 'potential', 'fee', 'wage'] as const)(
    'orders %s both ways with stable ID ties across pages',
    (sort) => {
      const w = worldMarketFixture();
      const value = (o: ReturnType<typeof query>['items'][number]) =>
        sort === 'name'
          ? o.player.name
          : sort === 'age'
            ? w.year - o.player.born
            : sort === 'ovr'
              ? overall(o.player)
              : sort === 'potential'
                ? o.player.potential
                : BigInt(sort === 'fee' ? o.fee : o.player.wage);
      for (const direction of ['asc', 'desc'] as const) {
        const first = query(w, { sort, direction, pageSize: 7 });
        const rows = Array.from(
          { length: Math.ceil(first.total / 7) },
          (_, page) => query(w, { sort, direction, pageSize: 7, page }).items,
        ).flat();
        expect(new Set(rows.map((o) => o.player.id)).size).toBe(first.total);
        for (let i = 1; i < rows.length; i++) {
          const a = value(rows[i - 1]),
            b = value(rows[i]);
          if (a === b) expect(rows[i - 1].player.id < rows[i].player.id).toBe(true);
          else expect(direction === 'asc' ? a < b : a > b).toBe(true);
        }
      }
    },
  );

  it('rejects stale worlds and invalid page bounds without changing the world', () => {
    const w = worldMarketFixture(),
      before = structuredClone(w);
    expect(() => worldMarketPage(w, { world: 'another' })).toThrow('다른 커리어');
    for (const q of [{ page: -1 }, { page: 0.5 }, { pageSize: 0 }, { pageSize: 51 }])
      expect(() => query(w, q)).toThrow();
    expect(worldMarketOffer(w, { ...foreignTarget(w), world: 'another' })).toBeUndefined();
    expect(w).toEqual(before);
  });

  it('builds read-only financial/tactical previews only for the requested detail, with foreign adaptation', () => {
    const w = worldMarketFixture(),
      before = structuredClone(w),
      target = foreignTarget(w);
    const preview = vi.spyOn(recruitment, 'recruitmentPreview');
    query(w);
    expect(preview).not.toHaveBeenCalled();
    const detail = worldMarketDetail(w, target);
    expect(preview).toHaveBeenCalledTimes(2);
    preview.mockRestore();
    expect(detail.offer.foreign).toBe(true);
    expect(detail.buy.eligible).toBe(true);
    expect(detail.buy.fee).toBe(detail.offer.fee);
    expect(w).toEqual(before);
  });
});

describe('stable-identity approaches', () => {
  it.each([false, true])(
    'negotiates a non-scout player; loan=%s preserves source, fees, identity and one affiliation',
    (loan) => {
      const w = worldMarketFixture(),
        target = foreignTarget(w);
      const offer = worldMarketOffer(w, target)!;
      expect(transferOffers(w).some((o) => o.player.id === target.playerId)).toBe(false);
      squadCommand(w, { type: 'recruit', target, loan });
      const bid = w.bids![0];
      expect(bid).toMatchObject({
        playerId: target.playerId,
        club: target.clubId,
        fee: loan ? offer.loanFee : offer.fee,
      });
      expect(() => placeBid(w, target, offer.fee, loan)).toThrow('이미 협상');
      // Settlement is isolated from probabilistic day progression by preparing an actual counter.
      bid.status = 'countered';
      bid.counterFee = bid.fee;
      const cash = BigInt(w.cash);
      respondBid(w, bid.id, true);
      const p = w.players.find((p) => p.id === target.playerId)!;
      expect(p.name).toBe(offer.player.name);
      expect(p.born).toBe(offer.player.born);
      expect(BigInt(w.cash)).toBe(cash - BigInt(bid.fee));
      expect(w.people![p.id].club).toBe(w.playerClub);
      expect(squad(w, w.clubs[1]).some((p) => p.id === target.playerId)).toBe(false);
      expect(w.transfers!.facts[0]).toMatchObject({
        club: target.clubId,
        player: p.id,
        fee: bid.fee,
        loan,
      });
      expect(() => respondBid(w, bid.id, true)).toThrow();
      expect(() => placeBid(w, target, bid.fee)).toThrow();
      expect(p.adaptation).toBeCloseTo(offer.player.personality.adaptability * 0.05 + 0.3);
      if (loan) {
        expect(w.people![p.id].loan?.club).toBe(target.clubId);
        returnLoan(w, p);
        expect(w.people![p.id].club).toBe(target.clubId);
        expect(squad(w, w.clubs[1]).filter((p) => p.id === target.playerId)).toHaveLength(1);
      }
    },
  );

  it('rejects own/stale targets, closed windows, cash and registration limits before mutation', () => {
    const w = worldMarketFixture(),
      target = foreignTarget(w),
      offer = worldMarketOffer(w, target)!;
    const own = query(w, { team: w.playerClub }).items[0].target;
    expect(() => squadCommand(w, { type: 'recruit', target: own })).toThrow();
    expect(() => placeBid(w, { ...target, world: 'other' }, offer.fee)).toThrow();
    expect(() => placeBid(w, { ...target, clubId: 'representative' }, offer.fee)).toThrow();
    w.calendar = { day: 40 };
    const closed = structuredClone(w);
    expect(() => placeBid(w, target, offer.fee)).toThrow('닫혀');
    const free = transferOffers(w)[0];
    squadCommand(w, {
      type: 'recruit',
      target: { world: w.id, kind: 'offer', playerId: free.player.id },
    });
    expect(w.players.some((p) => p.id === free.player.id)).toBe(true);
    w.calendar = { day: 3 };
    w.cash = '0';
    const poor = structuredClone(w);
    expect(() => placeBid(w, target, offer.fee)).toThrow('부족');
    expect(w).toEqual(poor);
    w.cash = closed.cash;
    const first = w.players[0];
    while (w.players.length < 40) w.players.push({ ...first, id: `fill:${w.players.length}` });
    const full = structuredClone(w);
    expect(() => placeBid(w, target, offer.fee)).toThrow('최대');
    expect(w).toEqual(full);
  });

  it('revalidates affiliation and availability at counter settlement, keeping pinned terms', () => {
    const w = worldMarketFixture(),
      target = foreignTarget(w),
      offer = worldMarketOffer(w, target)!;
    placeBid(w, target, offer.fee);
    const bid = w.bids![0];
    bid.status = 'countered';
    w.clubs[1].strength += 5;
    invalidateNpcSquads(w);
    expect(bid.offer!.fee).toBe(offer.fee);
    movePerson(w, offer.player, 'representative');
    const before = structuredClone(w);
    expect(() => respondBid(w, bid.id, true)).toThrow('이미 계약');
    expect(w).toEqual(before);
  });

  it('enforces the actual counted registration rule, including incoming loan exceptions', () => {
    const w = worldMarketFixture();
    w.year = 2021;
    w.clubs[0].tier = 1; // England's second tier counts under-21 loans.
    for (const p of w.players) p.born = 1990;
    while (w.players.length < 25)
      w.players.push({ ...w.players[0], id: `counted:${w.players.length}` });
    const young = squad(w, w.clubs[1]).find((p) => w.year - p.born <= 21)!;
    const target = { world: w.id, kind: 'club' as const, clubId: 'foreign', playerId: young.id };
    const offer = worldMarketOffer(w, target)!;
    expect(() => placeBid(w, target, offer.loanFee, true)).toThrow('등록 한도');
    expect(() => placeBid(w, target, offer.fee)).not.toThrow();
  });

  it.each([
    ['employment', 0],
    ['employment', 1],
    ['transfer', 0],
    ['transfer', 1],
  ] as const)(
    'keeps returning-player season totals only in their season (%s, years away=%s)',
    (record, years) => {
      const w = worldMarketFixture();
      const original = w.players[0];
      original.career[0] = 123;
      original.season[0] = 45;
      if (record === 'employment') movePerson(w, original, w.playerClub, true);
      original.status = 'sold';
      movePerson(w, original, 'foreign', true);
      if (record === 'transfer')
        recordTransfer(w, {
          direction: 'out',
          loan: false,
          player: original,
          club: 'foreign',
          fee: '100',
        });
      w.year += years;
      const target = {
        world: w.id,
        kind: 'club' as const,
        clubId: 'foreign',
        playerId: original.id,
      };
      const offer = worldMarketOffer(w, target)!;
      placeBid(w, target, offer.fee);
      w.bids![0].status = 'countered';
      respondBid(w, w.bids![0].id, true);
      expect(w.players.filter((p) => p.id === original.id)).toHaveLength(1);
      expect(w.players.find((p) => p.id === original.id)).toMatchObject({
        status: 'active',
        career: original.career,
        season: years === 0 ? original.season : zeroMetrics(),
      });
      expect(squad(w, w.clubs[1]).some((p) => p.id === original.id)).toBe(false);
    },
  );

  it.each([false, true])(
    'recognizes a returning graduate before previews, submission and a saved counter acceptance (loan=%s)',
    (loan) => {
      const { w, original, target } = spanishReturnFixture();
      expect(registration(w)).toMatchObject({ counted: 25, exempt: 0, total: 25 });
      const beforeReads = structuredClone(w);
      const offer = worldMarketOffer(w, target)!;
      expect(offer.player.graduate).toBe(true);
      expect(query(w, { name: original.name, team: 'foreign' }).items[0].player.graduate).toBe(
        true,
      );
      expect(worldMarketDetail(w, target)).toMatchObject({
        buy: { eligible: true },
        loan: { eligible: true },
      });
      expect(w).toEqual(beforeReads);

      placeBid(w, target, loan ? offer.loanFee : offer.fee, loan);
      const saved = JSON.parse(JSON.stringify(w)) as typeof w;
      // Older saved offers did not carry the retained own-club graduate qualification.
      delete saved.bids![0].offer!.player.graduate;
      saved.bids![0].status = 'countered';
      respondBid(saved, saved.bids![0].id, true);
      expect(saved.bids![0].status).toBe('completed');
      expect(saved.players.filter((p) => p.id === original.id)).toHaveLength(1);
      expect(saved.players.find((p) => p.id === original.id)).toMatchObject({
        status: 'active',
        graduate: true,
      });
      expect(registration(saved)).toMatchObject({ counted: 25, exempt: 1, total: 26 });
    },
  );

  it('still blocks older graduates, non-graduates and returns above the total ceiling', () => {
    for (const [age, graduate, total] of [
      [23, true, 25],
      [22, false, 25],
      [22, true, 40],
    ] as const) {
      const { w, target } = spanishReturnFixture(age, graduate);
      while (w.players.length < total + 1)
        w.players.push({ ...w.players[1], id: `counted:${w.players.length}` });
      const offer = worldMarketOffer(w, target)!;
      expect(worldMarketDetail(w, target).buy.eligible).toBe(false);
      const before = structuredClone(w);
      expect(() => placeBid(w, target, offer.fee)).toThrow(
        total === 40 ? '최대 40명' : '등록 한도',
      );
      expect(w).toEqual(before);
    }
  });

  it.each([false, true])(
    'keeps a returning-player bid pending until its daily answer and completes once (loan=%s)',
    (loan) => {
      const w = worldMarketFixture();
      const original = w.players[0];
      original.career[0] = 123;
      original.season[0] = 45;
      movePerson(w, original, w.playerClub, true);
      original.status = 'sold';
      movePerson(w, original, 'foreign', true);
      const target = {
        world: w.id,
        kind: 'club' as const,
        clubId: 'foreign',
        playerId: original.id,
      };
      const offer = worldMarketOffer(w, target)!;
      const fee = (BigInt(loan ? offer.loanFee : offer.fee) * 2n).toString();
      placeBid(w, target, fee, loan);
      const bid = w.bids![0],
        cash = BigInt(w.cash);
      expect(bid).toMatchObject({ day: 3, due: 5, status: 'pending' });

      w.calendar = { day: 4 };
      dailyMarket(w);
      expect(bid.status).toBe('pending');
      expect(BigInt(w.cash)).toBe(cash);
      expect(w.people![original.id].club).toBe('foreign');

      w.calendar = { day: bid.due };
      dailyMarket(w);
      expect(bid.status).toBe('completed');
      expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
      expect(w.players.filter((p) => p.id === original.id)).toHaveLength(1);
      expect(w.players.find((p) => p.id === original.id)).toMatchObject({
        status: 'active',
        career: original.career,
        season: original.season,
      });
      expect(w.people![original.id].club).toBe(w.playerClub);
      expect(squad(w, w.clubs[1]).some((p) => p.id === original.id)).toBe(false);
      expect(w.transfers!.facts).toEqual([
        expect.objectContaining({ player: original.id, club: 'foreign', fee, loan }),
      ]);
      if (loan) expect(w.people![original.id].loan?.club).toBe('foreign');

      w.calendar = { day: bid.due + 1 };
      dailyMarket(w);
      expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
      expect(w.transfers!.facts).toHaveLength(1);
    },
  );

  it('expires an outgoing bid when its target is already an active own player', () => {
    const w = worldMarketFixture(),
      target = foreignTarget(w),
      offer = worldMarketOffer(w, target)!;
    placeBid(w, target, offer.fee);
    const bid = w.bids![0],
      cash = w.cash;
    w.players.push(structuredClone(offer.player));
    w.calendar = { day: 4 };
    dailyMarket(w);
    expect(bid.status).toBe('expired');
    expect(w.cash).toBe(cash);
  });

  it('rechecks cash, registration, window and source availability when a saved bid settles', () => {
    for (const blockedBy of ['cash', 'registration', 'window', 'loan'] as const) {
      const source = worldMarketFixture(),
        target = foreignTarget(source),
        offer = worldMarketOffer(source, target)!;
      placeBid(source, target, offer.fee);
      const w = JSON.parse(JSON.stringify(source)) as typeof source;
      w.bids![0].status = 'countered';
      if (blockedBy === 'cash') w.cash = '0';
      if (blockedBy === 'window') w.calendar = { day: 40 };
      if (blockedBy === 'registration')
        while (w.players.length < 40)
          w.players.push({ ...w.players[0], id: `full:${w.players.length}` });
      if (blockedBy === 'loan') {
        movePerson(w, offer.player, 'foreign');
        w.people![offer.player.id].loan = { club: 'representative', until: w.year + 1 };
      }
      const before = structuredClone(w);
      expect(() => respondBid(w, w.bids![0].id, true)).toThrow();
      expect(w).toEqual(before);
    }
  });

  it('keeps retained native players discoverable when actual arrivals occupy the same positions', () => {
    const w = worldMarketFixture(),
      club = w.clubs[1];
    const natives = structuredClone(squad(w, club));
    for (const [slot, player] of natives.entries()) {
      const person = movePerson(w, player, club.id);
      person.origin = { club: club.id, slot };
    }
    const arrival = w.players[0];
    arrival.status = 'sold';
    movePerson(w, arrival, club.id, true);
    const roster = squad(w, club);
    expect(new Set(roster.map((p) => p.id))).toEqual(
      new Set([...natives.map((p) => p.id), arrival.id]),
    );
    expect(query(w, { team: club.id }).total).toBe(natives.length + 1);
  });

  it.each(['LWB', 'RWB'] as const)(
    'keeps an overflow %s arrival at his actual position and discoverable in the market',
    (position) => {
      const w = worldMarketFixture(),
        club = w.clubs[1];
      const natives = structuredClone(squad(w, club));
      expect(natives.every((p) => p.position !== position)).toBe(true);
      for (const [slot, player] of natives.entries()) {
        const person = movePerson(w, player, club.id);
        person.origin = { club: club.id, slot };
      }
      const arrival = makePlayer('ENG', w.seed, `own:${position}`, w.year, 80, position, 21, 0);
      arrival.status = 'sold';
      w.players.push(arrival);
      const person = movePerson(w, arrival, club.id, true);
      const before = structuredClone(w);

      const roster = continuousSquad(w, club);
      expect(roster).toHaveLength(natives.length + 1);
      expect(new Set(roster.map((p) => p.id))).toEqual(
        new Set([...natives.map((p) => p.id), arrival.id]),
      );
      expect(roster.slice(0, natives.length)).toEqual(natives);
      const shown = roster.find((p) => p.id === arrival.id)!;
      expect(shown).toMatchObject({
        id: arrival.id,
        name: arrival.name,
        born: arrival.born,
        position,
        positions: { [position]: 3 },
        qualities: arrival.qualities,
        personality: { professionalism: arrival.personality.professionalism },
        status: 'active',
      });
      expect(Math.abs(overall(shown) - club.strength)).toBeLessThanOrEqual(1);
      expect(shown.fatigue).toBe(natives[0].fatigue);
      expect(person.position).toBe(position);
      expect(continuousSquad(w, club)).toEqual(roster);

      expect(query(w, { team: club.id }).total).toBe(natives.length + 1);
      const filtered = query(w, { team: club.id, position, line: 'DF' });
      expect(filtered.items.some((o) => o.player.id === arrival.id)).toBe(true);
      const target = { world: w.id, kind: 'club' as const, clubId: club.id, playerId: arrival.id };
      expect(worldMarketOffer(w, target)).toMatchObject({
        target,
        source: { club: club.id, country: club.country },
        player: { position, positions: { [position]: 3 }, qualities: arrival.qualities },
        available: true,
        own: false,
      });
      expect(query(w, { team: w.playerClub }).items.some((o) => o.player.id === arrival.id)).toBe(
        false,
      );
      expect(w).toEqual(before);
    },
  );

  it('retains legacy index bids, pinned generated bids and saved bids without offer snapshots', () => {
    const w = worldMarketFixture(),
      offer = transferOffers(w)[1];
    placeBid(w, 1, offer.fee);
    const bid = w.bids![0];
    bid.status = 'countered';
    w.policy = { recruitment: 1, support: 3 };
    respondBid(w, bid.id, true);
    expect(w.players.some((p) => p.id === offer.player.id)).toBe(true);
    const legacy = transferOffers(w, w.year, true)[2];
    w.bids!.push({
      id: 'legacy',
      direction: 'out',
      playerId: legacy.player.id,
      fee: legacy.fee,
      year: w.year,
      day: 3,
      due: 5,
      status: 'countered',
    });
    respondBid(w, 'legacy', true);
    expect(w.players.some((p) => p.id === legacy.player.id)).toBe(true);
    expect(bidBoard(w).find((entry) => entry.bid.id === bid.id)?.player?.id).toBe(offer.player.id);
  });
});
