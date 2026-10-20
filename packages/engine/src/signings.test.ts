import { legacySettings } from './responsibilities';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf, POSITION_LABEL } from './player';
import { describe, expect, it } from 'vitest';
import type { Direction, Line, Player, TransferBid, World } from '../../contracts/src/types';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  activePlayers,
  advanceDays,
  compareIds,
  createWorld,
  currentDay,
  drawShortlist,
  financeStance,
  formationOf,
  noteSigning,
  ownStarters,
  judgeRequests,
  nextShortlistDraw,
  openShortlistWindow,
  operate,
  operatingCosts,
  overall,
  placeBid,
  ratio,
  SEASON_ROUNDS,
  seasonDayOf,
  shortlistOffers,
  shortLine,
  signingRequests,
  signingVerdict,
  staffSignings,
  transferOffers,
  transferWindowDays,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';

/**
 * A rich level-4 club on the winter window's opening day, half its season played with revenue far
 * beyond its wage bill, so only the rule under test holds the chief scout back.
 */
function club(finance?: Direction['finance'], seed = 'staff-signings') {
  const w = founded(seed);
  w.intervention = 4;
  w.settings = legacySettings(4);
  w.cash = '999999999999';
  w.round = 23;
  w.income = '999999999999';
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  if (finance) w.direction = { finance };
  return w;
}
/** The club as founded, built once per seed. */
const founded = (seed: string) =>
  cachedWorld(`founded:${seed}`, () =>
    createWorld({
      country: 'ENG',
      name: 'Scout Town',
      color: '#224433',
      seed,
      level: 'easy' as const,
    }),
  );
const staffBids = (w: World) => (w.bids || []).filter((bid) => bid.staff);
const reports = (w: World) =>
  (w.inbox || []).filter(
    (item) => item.kind === 'staff-report' && item.title.startsWith('단장 영입'),
  );
/** Leaves `count` active players of `line`, the others sold. */
function keep(w: World, role: Line, count: number) {
  for (const p of activePlayers(w)
    .filter((one) => lineOf(one.position) === role)
    .slice(count))
    p.status = 'sold';
}
/** Marks a player as already bid for in this window, so the scout passes him by. */
function tried(w: World, playerId: string) {
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `out:test:${playerId}`,
    direction: 'out',
    playerId,
    fee: '1',
    year: w.year,
    day,
    due: day,
    status: 'rejected',
  };
  w.bids = [...(w.bids || []), bid];
}

describe('the chief scout signs players at level 4 (→CLUB-33)', () => {
  it('fills a short role with a free agent first', () => {
    const w = club('careful');
    const free = transferOffers(w)[0];
    expect(free.freeAgent).toBe(true);
    keep(w, lineOf(free.player.position), 1);
    expect(shortLine(w)).toMatchObject({
      kind: 'short',
      line: lineOf(free.player.position),
      count: 1,
    });
    const cash = w.cash;
    staffSignings(w);
    const signed = w.players.find((p) => p.id === free.player.id)!;
    expect(signed.status).toBe('active');
    expect(signed.clauses).toBeDefined();
    expect(w.cash).toBe(cash);
    expect(staffBids(w)).toMatchObject([{ staff: 'short', status: 'completed', fee: '0' }]);
    expect(reports(w).at(-1)!.title).toBe(`단장 영입 · 자유계약 ${free.player.name}`);
    expect(reports(w).at(-1)!.detail).toContain('영입 기조');
  });

  it('bids the asking fee for an upgrade at 표준, none at 신중', () => {
    const w = club();
    expect(shortLine(w)).toBeUndefined();
    // The free agent is passed by, so the upgrade goes to a fee-bearing player.
    tried(w, transferOffers(w)[0].player.id);
    staffSignings(w);
    const [bid] = staffBids(w);
    expect(bid).toMatchObject({ staff: 'upgrade', status: 'pending' });
    const offer = transferOffers(w).find((one) => one.player.id === bid.playerId)!;
    expect(bid.fee).toBe(offer.fee);
    const starter = Math.min(
      ...activePlayers(w)
        .filter((p) => lineOf(p.position) === lineOf(offer.player.position))
        .map((p) => overall(p)),
    );
    expect(overall(offer.player)).toBeGreaterThanOrEqual(starter + 5);
    expect(reports(w).at(-1)!.title).toBe(`단장 영입 제안 · ${offer.player.name}`);
    // 공격적 bids 110% of asking.
    const bold = club('aggressive');
    tried(bold, transferOffers(bold)[0].player.id);
    staffSignings(bold);
    const [high] = staffBids(bold);
    const asked = transferOffers(bold).find((one) => one.player.id === high.playerId)!.fee;
    expect(high.fee).toBe(ratio(asked, 110n, 100n));
    for (const finance of ['careful', 'stable'] as const) {
      const quiet = club(finance);
      staffSignings(quiet);
      expect(staffBids(quiet)).toEqual([]);
      expect(quiet.players).toHaveLength(w.players.length);
    }
  });

  it("keeps 재정 기조's money checks", () => {
    const w = club();
    const offer = transferOffers(w)[1];
    const perRound =
      (BigInt(operatingCosts(w).annual) + BigInt(offer.player.wage)) / BigInt(SEASON_ROUNDS);
    // Cash for the runway and one and a half fees: 표준 may spend half the cash above it.
    w.cash = (perRound * 13n + (BigInt(offer.fee) * 3n) / 2n).toString();
    const standard = signingVerdict(w, offer.player, offer.fee);
    expect(standard.ok).toBe(false);
    expect(standard.reason).toContain('여유 자금의 50%');
    w.direction = { finance: 'aggressive' };
    expect(signingVerdict(w, offer.player, offer.fee).ok).toBe(true);
    // Below the runway nothing is spent at all.
    w.cash = (perRound * BigInt(financeStance(w).runway)).toString();
    expect(signingVerdict(w, offer.player, offer.fee).reason).toContain('운영비');
    // Without revenue the wage bill has no room.
    const poor = club();
    poor.income = '0';
    expect(signingVerdict(poor, offer.player, offer.fee).reason).toContain('인건비');
    tried(poor, transferOffers(poor)[0].player.id);
    staffSignings(poor);
    expect(staffBids(poor)).toEqual([]);
  });

  it("answers its own counters, never the owner's", () => {
    // The selling clubs counter some bids at the asking fee: find a staff bid they countered.
    for (let seed = 0; seed < 40; seed++) {
      const w = club(undefined, `counter-${seed}`);
      tried(w, transferOffers(w)[0].player.id);
      staffSignings(w);
      const [bid] = staffBids(w);
      if (!bid) continue;
      advanceDays(w, 4);
      const answer = (w.inbox || []).find(
        (item) => item.ref === bid.id && /역제안/.test(item.title),
      );
      if (!answer) continue;
      expect(['completed', 'rejected']).toContain(bid.status);
      expect(answer.attention).toBe(false);
      expect(answer.detail).toContain('단장');
      return;
    }
    throw new Error('no countered staff bid in 40 seeds');
  });

  it("leaves the owner's countered bid to the owner", () => {
    for (let seed = 0; seed < 40; seed++) {
      const w = club(undefined, `owner-${seed}`);
      w.intervention = 3;
      w.settings = legacySettings(3);
      const offers = transferOffers(w);
      placeBid(w, 1, offers[1].fee);
      w.intervention = 4;
      w.settings = legacySettings(4);
      advanceDays(w, 4);
      const own = (w.bids || []).find((bid) => !bid.staff && bid.direction === 'out')!;
      if (own.status !== 'countered') continue;
      expect(own.counterFee).toBeDefined();
      return;
    }
    throw new Error('no countered owner bid in 40 seeds');
  });

  it('looks on the opening day and every 7th day after, and waits for a pending bid', () => {
    const w = club();
    tried(w, transferOffers(w)[0].player.id);
    const opening = currentDay(w);
    w.calendar = { day: opening + 3 };
    staffSignings(w);
    expect(staffBids(w)).toEqual([]);
    w.calendar = { day: opening + 7 };
    staffSignings(w);
    expect(staffBids(w)).toHaveLength(1);
    // A week later his bid is still open: he waits.
    staffBids(w)[0].due = opening + 20;
    w.calendar = { day: opening + 14 };
    staffSignings(w);
    expect(staffBids(w)).toHaveLength(1);
  });

  it('makes no signings below level 4 or outside windows', () => {
    const below = club();
    below.intervention = 3;
    below.settings = legacySettings(3);
    staffSignings(below);
    expect(staffBids(below)).toEqual([]);
    const closed = club();
    closed.calendar = { day: seasonDayOf(closed.year, 3, 1) };
    staffSignings(closed);
    expect(staffBids(closed)).toEqual([]);
    // Over a whole window at level 4 the daily market makes the looks itself: the window opens
    // with the short role requested, and the 단장 moves for the manager's pick first.
    const daily = club();
    const free = transferOffers(daily)[0];
    keep(daily, lineOf(free.player.position), 1);
    daily.calendar = { day: seasonDayOf(daily.year, 12, 31) };
    advanceDays(daily, 2);
    const request = daily.shortlist!.requests.find(
      (one) => one.line === lineOf(free.player.position),
    )!;
    expect(request).toMatchObject({ kind: 'short' });
    expect(
      daily.players.some((p) => p.id === request.pick) ||
        staffBids(daily).some((bid) => bid.playerId === request.pick),
    ).toBe(true);
  });
});

describe("the shortlist and the manager's requests (→CLUB-33)", () => {
  const ROLES: Line[] = ['GK', 'DF', 'MF', 'FW'];
  /** Sets every skill of a player, so his overall is `level` in any role. */
  const rate = (p: Player, level: number) => {
    for (const a of ATTRIBUTES) p.attrs[a] = level;
  };
  /** An owner-run club (level 2) on the winter window's opening day. */
  function owned(seed = 'shortlist') {
    const w = club(undefined, seed);
    w.intervention = 2;
    w.settings = legacySettings(2);
    return w;
  }

  it('lists up to three per role, free agents first, then ability, potential and id', () => {
    const w = owned();
    drawShortlist(w);
    expect(w.shortlist).toMatchObject({ year: w.year, day: currentDay(w) });
    const market = transferOffers(w).filter((offer) => offer.available);
    for (const role of ROLES) {
      const listed = w.shortlist!.entries.filter((entry) => entry.line === role);
      const expected = market
        .filter((offer) => lineOf(offer.player.position) === role)
        .sort(
          (a, b) =>
            Number(b.freeAgent) - Number(a.freeAgent) ||
            overall(b.player) - overall(a.player) ||
            b.player.potential - a.player.potential ||
            compareIds(a.player.id, b.player.id),
        )
        .slice(0, 3)
        .map((offer) => offer.player.id);
      expect(listed.map((entry) => entry.playerId)).toEqual(expected);
    }
    expect(shortlistOffers(w).map(({ offer }) => offer.player.id)).toEqual(
      w.shortlist!.entries.map((entry) => entry.playerId),
    );
    // The draw is a function of the world: drawn again, or in a twin, it is the same.
    const again = canonical(w.shortlist);
    drawShortlist(w);
    expect(canonical(w.shortlist)).toBe(again);
    const twin = owned();
    drawShortlist(twin);
    expect(canonical(twin.shortlist)).toBe(again);
    // A club is founded on the summer opening with its shortlist, and saves it.
    const founding = founded('shortlist');
    expect(founding.shortlist).toMatchObject({ year: founding.year, day: 0 });
    expect(founding.shortlist!.entries.length).toBeGreaterThan(0);
    expect(canonical(validateWorld(founding).shortlist)).toBe(canonical(founding.shortlist));
  });

  it('drops a listed player who joins us or leaves the market list', () => {
    const w = owned();
    drawShortlist(w);
    const [first] = shortlistOffers(w);
    operate(w, { type: 'recruit', candidate: first.index });
    expect(shortlistOffers(w).some(({ offer }) => offer.player.id === first.offer.player.id)).toBe(
      false,
    );
    expect(signingRequests(w).every((request) => request.pick !== first.offer.player.id)).toBe(
      true,
    );
    // Another recruitment row draws another list: none of the shortlist is on it.
    operate(w, { type: 'policy', key: 'recruitment', level: 5 });
    expect(shortlistOffers(w)).toEqual([]);
    // Last season's shortlist reads as empty.
    const old = owned();
    drawShortlist(old);
    old.shortlist!.year--;
    expect(shortlistOffers(old)).toEqual([]);
    expect(signingRequests(old)).toEqual([]);
  });

  it('asks for every short role, then the role a candidate upgrades most, at most three', () => {
    const w = owned();
    keep(w, 'GK', 1);
    keep(w, 'MF', 4);
    drawShortlist(w);
    expect(w.shortlist!.requests.slice(0, 2)).toMatchObject([
      { line: 'GK', kind: 'short' },
      { line: 'MF', kind: 'short' },
    ]);
    // Four short roles: three requests.
    const short = owned();
    for (const role of ROLES) keep(short, role, 1);
    drawShortlist(short);
    expect(short.shortlist!.requests.map((request) => request.line)).toEqual(['GK', 'DF', 'MF']);
    // A full squad of 99s needs nothing; weak defenders call for a defender.
    const strong = owned();
    for (const p of activePlayers(strong)) rate(p, 99);
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toEqual([]);
    for (const p of activePlayers(strong).filter((one) => lineOf(one.position) === 'DF'))
      rate(p, 10);
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toHaveLength(1);
    expect(strong.shortlist!.requests[0]).toMatchObject({ line: 'DF', kind: 'upgrade' });
    // Under the margin of 5 he asks for nothing.
    const best = Math.max(
      ...shortlistOffers(strong)
        .filter(({ offer }) => lineOf(offer.player.position) === 'DF')
        .map(({ offer }) => overall(offer.player)),
    );
    for (const p of activePlayers(strong).filter((one) => lineOf(one.position) === 'DF'))
      rate(p, best - 4);
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toEqual([]);
  });

  it('names the ablest as his pick; a 육성형 or youth-trait manager the best young prospect', () => {
    // 젊은 선수 위주 lists players aged 18–25, so young and older forwards meet on the list.
    const pick = (setup?: (w: World) => void, seed = 'staff-signings') => {
      const w = owned(seed);
      operate(w, { type: 'policy', key: 'recruitment', level: 2 });
      keep(w, 'FW', 2);
      setup?.(w);
      drawShortlist(w);
      const listed = shortlistOffers(w)
        .map(({ offer }) => offer.player)
        .filter((p) => lineOf(p.position) === 'FW');
      return { w, listed, pick: w.shortlist!.requests[0].pick };
    };
    const ablestOf = (listed: Player[]) =>
      [...listed].sort((a, b) => overall(b) - overall(a) || b.potential - a.potential)[0]!;
    const youngOf = (w: World, listed: Player[]) =>
      listed.filter((p) => w.year - p.born <= 23).sort((a, b) => b.potential - a.potential)[0];
    // A market where the best young prospect is not also the ablest forward.
    const seed = Array.from({ length: 40 }, (_, i) => `staff-signings-${i}`).find((one) => {
      const { w, listed } = pick(undefined, one);
      const young = youngOf(w, listed);
      return !!young && young.id !== ablestOf(listed).id;
    })!;
    const plain = pick(undefined, seed);
    const ablest = ablestOf(plain.listed);
    expect(plain.w.shortlist!.requests[0]).toEqual({ line: 'FW', kind: 'short', pick: ablest.id });
    const young = youngOf(plain.w, plain.listed)!;
    expect(young.id).not.toBe(ablest.id);
    expect(pick((w) => (w.manager.style = 'developer'), seed).pick).toBe(young.id);
    expect(pick((w) => (w.manager.trait = 'youth'), seed).pick).toBe(young.id);
  });

  it('an interim asks for nothing', () => {
    const w = owned();
    keep(w, 'GK', 1);
    w.manager.interim = true;
    openShortlistWindow(w);
    expect(w.shortlist!.requests).toEqual([]);
    expect(w.shortlist!.window).toBeUndefined();
  });

  it("the 단장 moves for the manager's pick before any other candidate", () => {
    const w = club();
    const role = lineOf(transferOffers(w)[0].player.position);
    keep(w, role, 1);
    openShortlistWindow(w);
    const request = w.shortlist!.requests.find((one) => one.line === role)!;
    expect(request.pick).toBeDefined();
    staffSignings(w);
    const moved =
      w.players.some((p) => p.id === request.pick) ||
      staffBids(w).some((bid) => bid.playerId === request.pick);
    expect(moved).toBe(true);
    expect(reports(w).at(-1)!.detail).toMatch(/^감독 요청 /);
    expect(reports(w).at(-1)!.detail).toContain('감독이 고른 선수');
  });

  it('costs the manager 3 trust when a window closes with none of his requests met', () => {
    const close = transferWindowDays(1951).winterClose;
    /** The winter window opens with a goalkeeper short; `during` acts inside it. */
    function window(during?: (w: World) => void) {
      const w = owned();
      // A squad of 99s wants no upgrade, so the goalkeeper is the one request.
      for (const p of activePlayers(w)) rate(p, 99);
      keep(w, 'GK', 1);
      openShortlistWindow(w);
      expect(w.shortlist!.window).toMatchObject({
        requests: [{ line: 'GK' }],
        manager: w.manager.id,
      });
      during?.(w);
      const trust = w.manager.trust;
      w.calendar = { day: transferWindowDays(w.year).winterClose + 1 };
      judgeRequests(w);
      expect(w.shortlist!.window).toBeUndefined();
      return { w, lost: trust - w.manager.trust };
    }
    expect(close).toBeGreaterThan(0);
    const unmet = window();
    expect(unmet.lost).toBe(3);
    expect(unmet.w.inbox!.at(-1)).toMatchObject({ kind: 'staff-report', attention: false });
    expect(unmet.w.inbox!.at(-1)!.title).toContain('영입 요청이 채워지지 않았어요');
    expect(unmet.w.inbox!.at(-1)!.detail).toContain('골키퍼');
    // The owner signing a goalkeeper meets it; a defender does not.
    const keeper = (w: World) =>
      transferOffers(w).findIndex((offer) => offer.available && offer.player.position === 'GK');
    expect(window((w) => operate(w, { type: 'recruit', candidate: keeper(w) })).lost).toBe(0);
    const defender = (w: World) =>
      transferOffers(w).findIndex(
        (offer) => offer.available && lineOf(offer.player.position) === 'DF',
      );
    expect(window((w) => operate(w, { type: 'recruit', candidate: defender(w) })).lost).toBe(3);
    // The 단장 signing for him at level 4 meets it too.
    expect(
      window((w) => {
        w.intervention = 4;
        w.settings = legacySettings(4);
        staffSignings(w);
        w.intervention = 2;
        w.settings = legacySettings(2);
      }).lost,
    ).toBe(0);
    // A new manager is not judged on his predecessor's requests; none asked costs nothing.
    expect(window((w) => (w.shortlist!.window!.manager = 'someone-else')).lost).toBe(0);
    const none = owned();
    for (const p of activePlayers(none)) rate(p, 99);
    openShortlistWindow(none);
    expect(none.shortlist!.window).toBeUndefined();
  });

  it('the daily market draws at each opening and judges the day after each close', () => {
    const w = owned('shortlist-days');
    for (const p of activePlayers(w)) rate(p, 99);
    keep(w, 'GK', 1);
    w.calendar = { day: seasonDayOf(w.year, 12, 31) };
    advanceDays(w, 1);
    expect(w.shortlist).toMatchObject({ day: seasonDayOf(w.year, 1, 1) });
    expect(w.shortlist!.window).toMatchObject({ requests: [{ line: 'GK' }] });
    const trust = w.manager.trust;
    w.calendar = { day: transferWindowDays(w.year).winterClose };
    advanceDays(w, 1);
    expect(w.shortlist!.window).toBeUndefined();
    expect(w.manager.trust).toBeLessThanOrEqual(trust - 3);
  });

  it('names the next draw: the winter opening, the next 4th round or the next season', () => {
    const w = owned('next-draw');
    const d = transferWindowDays(w.year);
    w.round = 0;
    w.calendar = { day: 0 };
    expect(nextShortlistDraw(w)).toEqual({ year: w.year, day: 28 });
    w.round = 17;
    w.calendar = { day: 120 };
    expect(nextShortlistDraw(w)).toEqual({ year: w.year, day: Math.min(d.winterOpen, 140) });
    w.round = 22;
    w.calendar = { day: d.winterOpen };
    expect(nextShortlistDraw(w)).toEqual({ year: w.year, day: 24 * 7 });
    w.round = 44;
    w.calendar = { day: 44 * 7 };
    expect(nextShortlistDraw(w)).toEqual({ year: w.year + 1, day: 0 });
  });
});

describe('requests by formation slot (→CLUB-33)', () => {
  const rate = (p: Player, level: number) => {
    for (const a of ATTRIBUTES) p.attrs[a] = level;
  };
  function owned(seed = 'slot-requests') {
    const w = club(undefined, seed);
    w.intervention = 2;
    w.settings = legacySettings(2);
    return w;
  }

  it('slot request names the weakest slot', () => {
    const w = owned();
    for (const p of activePlayers(w)) rate(p, 99);
    // The XI is kept in its slots, so the weakened starter stays where he plays.
    w.lineup = ownStarters(w).map((p) => p.id);
    drawShortlist(w);
    expect(w.shortlist!.requests).toEqual([]);
    const listed = shortlistOffers(w).map(({ offer }) => offer.player);
    const slots = formationOf(w.tactic);
    const k = slots.findIndex(
      (place, i) => i > 0 && listed.some((p) => (p.positions[place.position] ?? 0) >= 2),
    );
    expect(k).toBeGreaterThan(0);
    rate(ownStarters(w)[k]!, 10);
    drawShortlist(w);
    const position = slots[k]!.position;
    expect(w.shortlist!.requests).toEqual([
      expect.objectContaining({ kind: 'upgrade', slot: k, position, line: lineOf(position) }),
    ]);
    // His pick plays that position at 준수 or better.
    const pick = listed.find((p) => p.id === w.shortlist!.requests[0]!.pick)!;
    expect(pick.positions[position]).toBeGreaterThanOrEqual(2);
  });

  it('request met by a player of the position', () => {
    const w = owned('slot-met');
    drawShortlist(w);
    w.shortlist!.window = {
      year: w.year,
      opening: currentDay(w),
      manager: w.manager.id,
      requests: [{ line: 'DF', kind: 'upgrade', slot: 2, position: 'CB' }],
    };
    const base = transferOffers(w).find((offer) => offer.available)!.player;
    const joining = (positions: Player['positions'], id: string): Player => ({
      ...structuredClone(base),
      id,
      position: 'LB',
      positions,
    });
    // A left back who plays centre back only at 어색 does not meet it.
    noteSigning(w, joining({ LB: 3, CB: 1 }, 'lb-joins'));
    expect(w.shortlist!.window!.met).toBeUndefined();
    // One who plays it at 준수 does, whatever his main position.
    noteSigning(w, joining({ LB: 3, CB: 2 }, 'cb-joins'));
    expect(w.shortlist!.window!.met).toBe(true);
    // An unmet slot request is named by its position when the window closes.
    delete w.shortlist!.window!.met;
    w.calendar = { day: transferWindowDays(w.year).winterClose + 1 };
    judgeRequests(w);
    expect(w.inbox!.at(-1)!.detail).toContain(`${POSITION_LABEL.CB} 자리`);
  });
});
