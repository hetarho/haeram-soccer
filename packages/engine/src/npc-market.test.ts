import { describe, expect, it } from 'vitest';
import type { Club, MatchPlayback, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import {
  npcCanSell,
  npcMarket,
  npcMarketDays,
  npcOffer,
  NPC_MARKET,
  returnNpcLoans,
} from './npc-market';
import { closeNpcSummer, closeNpcWindow, intakeNpcYouth } from './npc-careers';
import { foundSquads } from './persisted-squads';
import { generatedPlayer, invalidateNpcSquad, stature } from './world';
import { worldMarketFixture } from './world-market.testkit';
import { marketValueAt, marketWageAt } from './market-prices';
import { npcWageBill, npcWageLimit } from './books';
import { clubRegistration } from './registration';
import { currentDay, SEASON_END_DAY } from './calendar';
import { playerTotals, settleNpcSeason } from './npc-stats';
import { zeroMetrics } from './primitives';
import { M } from './match/record';
import { enrollSquadPlayer } from './persisted-squads';
import { coachingGrade } from './aptitude';
import { crossWar } from './wartime';
import { suitorFor } from './transfers';
import { expireContracts } from './contracts';

/** Three tiny synthetic NPC squads; no fixture simulation, world generation or time progression. */
function fixture(year = 1950) {
  const w = worldMarketFixture();
  w.year = year;
  w.calendar = { day: npcMarketDays(w.year)[0]![0]! };
  w.clubs = [
    w.clubs[0]!,
    ...[0, 1, 2].map((n): Club => ({
      ...w.clubs[1]!,
      id: `ENG:0:0:${n}`,
      country: 'ENG',
      strength: 65,
    })),
  ];
  foundSquads(w);
  w.people = {};
  for (const c of w.clubs.slice(1)) {
    for (const p of w.squads![c.id]!) {
      p.born = w.year - 24;
      p.potential = 65;
      p.until = w.year + 3;
      for (const a of ATTRIBUTES) p.attrs[a] = 65;
      p.wage = marketWageAt(c.country, w.year, c.tier, p);
    }
    c.books = {
      seasons: [],
      cash: '999999999999',
      debt: '0',
      openingIncome: npcWageBill(w, c).toString(),
    };
    invalidateNpcSquad(w, c.id);
  }
  return { w, seller: w.clubs[1]!, buyer: w.clubs[2]!, other: w.clubs[3]! };
}
function listedKeeper(w: World, seller: Club, age = 24) {
  const p = generatedPlayer('ENG', w.seed, 'listed-keeper', w.year, 75, 'GK', age, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = 75;
  p.until = w.year;
  p.potential = 75;
  p.wage = marketWageAt('ENG', w.year, 0, p);
  w.squads![seller.id]!.push(p);
  // Keep this seller inside its signing budget unless a test explicitly makes it overspend.
  seller.books!.openingIncome = npcWageBill(w, seller).toString();
  return p;
}
function missingKeeper(w: World, c: Club) {
  w.squads![c.id] = w.squads![c.id]!.filter((p) => p.position !== 'GK');
  invalidateNpcSquad(w, c.id);
}
const locations = (w: World, id: string) =>
  Object.entries(w.squads ?? {})
    .filter(([, ps]) => ps.some((p) => p.id === id))
    .map(([club]) => club);

describe('isolated NPC transfer windows', () => {
  it('buys a needed keeper at market value, settles both books and preserves one live identity', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    const before = structuredClone(p),
      untouched = w.squads![other.id];
    missingKeeper(w, buyer);
    const fee = marketValueAt('ENG', w.year, seller.tier, p);
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([buyer.id]);
    const live = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(live.attrs).toEqual(before.attrs);
    expect(live.name).toBe(before.name);
    expect(live.born).toBe(before.born);
    expect(live.until).toBeGreaterThan(w.year);
    expect(live.wage).toBe(marketWageAt('ENG', w.year, buyer.tier, live));
    expect(seller.books!.transfersReceived).toBe(fee);
    expect(buyer.books!.transfersPaid).toBe(fee);
    expect(w.playerRecords![p.id]!.moves).toEqual([
      { year: w.year, day: currentDay(w), from: seller.id, to: buyer.id, fee },
    ]);
    expect(w.squads![other.id]).toBe(untouched);
    expect(w.events).toEqual([]);
  });

  it('an over-limit club cannot buy and lists its highest wage first without selling below eighteen', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    p.wage = (BigInt(p.wage) * 100n).toString();
    missingKeeper(w, buyer);
    expect(npcOffer(w, seller, w.squads![buyer.id]![0]!, buyer, '1')).toBeUndefined();
    npcMarket(w);
    expect(w.playerRecords![p.id]!.moves[0]!.to).toBe(buyer.id);
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
    expect(
      Object.values(w.playerRecords!)
        .flatMap((r) => r.moves)
        .some((m) => m.to === seller.id),
    ).toBe(false);
    w.squads![seller.id] = w.squads![seller.id]!.slice(0, NPC_MARKET.minimum);
    expect(w.squads![seller.id]!.every((q) => !npcCanSell(w, seller, q))).toBe(true);
  });

  it('protects each line minimum and the last goalkeeper', () => {
    const { w, seller } = fixture();
    const keepers = w.squads![seller.id]!.filter((p) => p.position === 'GK');
    w.squads![seller.id] = w.squads![seller.id]!.filter(
      (p) => p.position !== 'GK' || p === keepers[0],
    );
    expect(npcCanSell(w, seller, keepers[0]!)).toBe(false);
  });

  it('awards a contested player by stature even when the stronger club appears later', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    missingKeeper(w, other);
    const expected = stature(w.seed, buyer.id) > stature(w.seed, other.id) ? buyer : other;
    expect(stature(w.seed, buyer.id)).not.toBe(stature(w.seed, other.id));
    w.clubs.reverse();
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([expected.id]);
  });

  it('runs only on configured window days, once across reloads and identically for one seed', () => {
    const a = fixture(),
      b = fixture();
    for (const { w, seller, buyer } of [a, b]) {
      listedKeeper(w, seller);
      missingKeeper(w, buyer);
    }
    a.w.calendar!.day++;
    npcMarket(a.w);
    expect(a.w.playerRecords).toBeUndefined();
    a.w.calendar!.day--;
    npcMarket(a.w);
    npcMarket(b.w);
    expect(a.w.playerRecords).toEqual(b.w.playerRecords);
    const loaded = JSON.parse(JSON.stringify(a.w)) as World;
    const before = JSON.stringify(loaded);
    npcMarket(loaded);
    expect(JSON.stringify(loaded)).toBe(before);
    expect(npcMarketDays(a.w.year).map((days) => days.length)).toEqual([3, 3]);
  });

  it('uses the higher offered wage when stature is equal', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    for (const [c, id] of [
      [buyer, 'bidder-a'],
      [other, 'bidder-b'],
    ] as const) {
      const players = w.squads![c.id]!;
      delete w.squads![c.id];
      c.id = id;
      w.squads![id] = players;
      missingKeeper(w, c);
    }
    w.clubs = [...w.clubs];
    buyer.tier = 1;
    expect(stature(w.seed, buyer.id)).toBe(stature(w.seed, other.id));
    expect(BigInt(marketWageAt('ENG', w.year, other.tier, p))).toBeGreaterThan(
      BigInt(marketWageAt('ENG', w.year, buyer.tier, p)),
    );
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([other.id]);
  });

  it('refuses counted signings at the registration limit and permits the same signing with room', () => {
    const { w, seller, buyer } = fixture(2024);
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    const players = w.squads![buyer.id]!;
    while (players.length < 25) {
      const q = structuredClone(players[0]!);
      q.id = `counted:${players.length}`;
      q.wage = '0';
      players.push(q);
    }
    buyer.books!.openingIncome = '999999999999999';
    expect(clubRegistration(buyer, w.year, players).counted).toBe(25);
    expect(npcOffer(w, buyer, p, seller, '1')).toBeUndefined();
    players.pop();
    expect(npcOffer(w, buyer, p, seller, '1')).toBeDefined();
    expect(npcOffer(w, buyer, p, seller, '-1')).toBeUndefined();
  });

  it('ranks the best affordable listing first and does not double-spend fee commitments', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    const stronger = structuredClone(p);
    stronger.id = 'stronger-keeper';
    for (const a of ATTRIBUTES) stronger.attrs[a] = 76;
    w.squads![seller.id]!.push(stronger);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    missingKeeper(w, buyer);
    buyer.books!.openingIncome = (
      npcWageBill(w, buyer) + BigInt(marketWageAt('ENG', w.year, buyer.tier, stronger))
    ).toString();
    expect(npcOffer(w, buyer, stronger, seller, '1')).toBeDefined();
    npcMarket(w);
    expect(w.playerRecords![stronger.id]!.moves[0]!.to).toBe(buyer.id);
    buyer.books!.cash = '0';
    buyer.books!.transfersPaid = '999999999999999999999999';
    expect(npcOffer(w, buyer, p, seller, '1')).toBeUndefined();
  });

  it('reserves registration room at a loan parent until the player returns', () => {
    const { w, seller, buyer, other } = fixture(2024);
    const p = listedKeeper(w, seller, 23);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    missingKeeper(w, buyer);
    npcMarket(w);
    expect(w.playerRecords![p.id]!.loan).toBeDefined();
    missingKeeper(w, seller);
    const players = w.squads![seller.id]!;
    while (players.length < 24) {
      const filler = structuredClone(players[0]!);
      filler.id = `reserved:${players.length}`;
      filler.wage = '0';
      players.push(filler);
    }
    seller.books!.openingIncome = '999999999999999';
    const candidate = w.squads![other.id]!.find((p) => p.position === 'GK')!;
    expect(npcOffer(w, seller, candidate, other, '1')).toBeUndefined();
    const withoutLoan = structuredClone(w);
    delete withoutLoan.playerRecords![p.id]!.loan;
    expect(
      npcOffer(withoutLoan, withoutLoan.clubs[1]!, candidate, withoutLoan.clubs[3]!, '1'),
    ).toBeDefined();
  });

  it('returns a young blocked loan before renewing contracts at the shared close', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller, 19);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    p.until = w.year + 4;
    p.graduate = true;
    p.joined = w.year - 2;
    const terms = { wage: p.wage, until: p.until };
    missingKeeper(w, buyer);
    npcMarket(w);
    expect(w.playerRecords![p.id]!.moves[0]!.loan).toBe(true);
    expect(locations(w, p.id)).toEqual([buyer.id]);
    expect(w.playerRecords![p.id]!.loan!.contractUntil).toBe(terms.until);
    const automatic = structuredClone(w);
    automatic.calendar = { day: SEASON_END_DAY + 1 };
    closeNpcSummer(automatic);
    expect(locations(automatic, p.id)).toEqual([seller.id]);
    expect(automatic.playerRecords![p.id]!.loan).toBeUndefined();
    expect(automatic.playerRecords![p.id]!.moves.at(-1)).toMatchObject({
      from: buyer.id,
      to: seller.id,
      fee: '0',
    });
    w.calendar = { day: SEASON_END_DAY + 1 };
    returnNpcLoans(w);
    expect(locations(w, p.id)).toEqual([seller.id]);
    const returned = w.squads![seller.id]!.find((q) => q.id === p.id)!;
    expect(returned.wage).toBe(terms.wage);
    expect(returned.until).toBe(terms.until);
    expect(returned.loanUntil).toBeUndefined();
    expect(returned.graduate).toBe(true);
    expect(returned.joined).toBe(w.year - 2);
    expect(w.playerRecords![p.id]!.loan).toBeUndefined();
    expect(w.playerRecords![p.id]!.moves.at(-1)).toMatchObject({
      from: buyer.id,
      to: seller.id,
      fee: '0',
    });
    closeNpcSummer(w);
    expect(locations(w, p.id)).toEqual([seller.id]);
  });

  it('moves registered employment with the same person and club contract', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    p.personality.professionalism = 5;
    p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    enrollSquadPlayer(w, seller, p);
    missingKeeper(w, buyer);
    npcMarket(w);
    const person = w.people![p.id]!;
    expect(person.club).toBe(buyer.id);
    expect(person.employment.filter((job) => job.role === 'player').map((job) => job.club)).toEqual(
      [seller.id, buyer.id],
    );
    expect(person.employment.at(-1)!.contractUntil!.year).toBe(
      w.squads![buyer.id]!.find((q) => q.id === p.id)!.until,
    );
  });

  it('keeps winter contributions under the same ID, separated by the two real clubs', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    w.npcSeason = {
      year: w.year,
      model: MATCH_MODEL_REVISION,
      trackedFrom: { year: w.year, day: 0, round: 0 },
      competitions: [],
    };
    const settle = (club: Club) => {
      const metrics = zeroMetrics();
      metrics[M.minutes] = 90;
      metrics[M.goals] = 1;
      const playback: MatchPlayback = {
        record: {
          id: `synthetic-winter:${club.id}`,
          year: w.year,
          round: w.round,
          kind: 'league',
          country: club.country,
          groupKey: 'synthetic',
          home: club.id,
          away: 'own',
          score: { home: 1, away: 0 },
          incidents: [],
          lineCounts: [1, 0],
          players: [{ id: p.id, metrics }],
          metrics: [metrics, zeroMetrics()],
          tactics: ['balanced', 'balanced'],
          highlights: [],
        },
        frames: [],
        squads: [[p], []],
      };
      settleNpcSeason(w, playback, true);
    };
    settle(seller);
    w.calendar!.day = npcMarketDays(w.year)[1]![0]!;
    npcMarket(w);
    settle(buyer);
    const row = w.npcSeason.competitions[0]!.players.find((row) => row.id === p.id)!;
    expect(row.clubs.map((part) => part.club)).toEqual([seller.id, buyer.id]);
    expect(row.clubs.map((part) => part.metrics[M.goals])).toEqual([1, 1]);
    expect(row.clubs.map((part) => part.cleanSheets)).toEqual([1, 1]);
    expect(playerTotals(row).metrics[M.goals]).toBe(2);
  });

  it('refills on summer last day without reusing an unregistered transferred youngster ID', () => {
    const { w, seller, buyer } = fixture();
    intakeNpcYouth(w, seller, w.year);
    const young = w.squads![seller.id]!.find(
      (p) => p.id.includes(':y:') && (coachingGrade(p) ?? 0) < 4,
    )!;
    expect(young).toBeDefined();
    expect(w.people?.[young.id]).toBeUndefined();
    w.squads![seller.id] = w.squads![seller.id]!.filter((p) => p.id !== young.id);
    w.squads![buyer.id]!.push(young);
    const day = npcMarketDays(w.year)[0]!.at(-1)!;
    w.squads![seller.id] = w.squads![seller.id]!.filter((p) => p.position !== 'GK').slice(0, 12);
    w.calendar!.day = day - 1;
    closeNpcWindow(w);
    expect(w.squads![seller.id]).toHaveLength(12);
    w.calendar!.day = day;
    closeNpcWindow(w);
    expect(locations(w, young.id)).toEqual([buyer.id]);
    expect(w.squads![seller.id]!.length).toBeGreaterThanOrEqual(22);
    expect(w.squads![seller.id]!.some((p) => p.position === 'GK')).toBe(true);
    const ids = Object.values(w.squads!).flatMap((ps) => ps.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    const state = clubRegistration(seller, w.year, w.squads![seller.id]!);
    expect(state.counted).toBeLessThanOrEqual(state.allowed);
    // A retained move also reserves the identity after its live row has left football.
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.id !== young.id);
    w.playerRecords = {
      [young.id]: { moves: [{ year: w.year, day, from: seller.id, to: buyer.id, fee: '0' }] },
    };
    intakeNpcYouth(w, seller, w.year);
    expect(locations(w, young.id)).toEqual([]);
  });

  it('incoming offers require a real need and enough money for their actual fee and wage', () => {
    const { w, buyer } = fixture();
    const p = w.players.find((p) => p.position === 'GK')!;
    for (const a of ATTRIBUTES) p.attrs[a] = 65;
    p.potential = 65;
    expect(suitorFor(w, p, () => 0, '1')).toBeUndefined();
    missingKeeper(w, buyer);
    expect(suitorFor(w, p, () => 0, '1')?.id).toBe(buyer.id);
    buyer.books!.cash = '0';
    buyer.books!.debt = buyer.books!.openingIncome!;
    expect(suitorFor(w, p, () => 0, '999999999999999')).toBeUndefined();
    buyer.books!.openingIncome = '0';
    expect(suitorFor(w, p, () => 0, '1')).toBeUndefined();
  });

  it('keeps an expired own player on the same need and books gate with a new contract and recorded fee', () => {
    const { w, buyer } = fixture();
    const p = w.players.find((p) => p.position === 'GK')!;
    for (const a of ATTRIBUTES) p.attrs[a] = 65;
    p.potential = 65;
    p.until = w.year;
    missingKeeper(w, buyer);
    expireContracts(w);
    const live = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(live).toBeDefined();
    expect(live.until).toBeGreaterThan(w.year);
    expect(live.wage).toBe(marketWageAt('ENG', w.year, buyer.tier, live));
    expect(w.playerRecords![p.id]!.moves).toHaveLength(1);
    expect(w.playerRecords![p.id]!.moves[0]).toMatchObject({ from: 'own', to: buyer.id });
    expect(buyer.books!.transfersPaid).toBe(w.playerRecords![p.id]!.moves[0]!.fee);
  });

  it('extends the loan end with the parent contract through the skipped summers', () => {
    const { w, seller, buyer } = fixture();
    w.year = 1938;
    const p = listedKeeper(w, seller, 19);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    p.until = 1950;
    missingKeeper(w, buyer);
    npcMarket(w);
    const record = w.playerRecords![p.id]!;
    expect(record.loan).toBeDefined();
    const until = record.loan!.until,
      contract = record.loan!.contractUntil;
    w.year = 1946;
    crossWar(w, 1938);
    expect(record.loan!.until).toBe(until + 7);
    expect(record.loan!.contractUntil).toBe(contract + 7);
    expect(record.moves).toHaveLength(1);
  });
});
