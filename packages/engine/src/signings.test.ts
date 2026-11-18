import { ATTRIBUTES, POSITIONS } from '../../contracts/src/player';
import { lineOf, POSITION_LABEL } from './player';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type {
  SpendRequest,
  SigningRequest,
  FreeAgent,
  Line,
  Player,
  TransferBid,
  World,
} from '../../contracts/src/types';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  activePlayers,
  advanceDays,
  compareIds,
  currentDay,
  dailyMarket,
  drawShortlist,
  formationOf,
  noteSigning,
  ownStarters,
  judgeRequests,
  makePlayer,
  nextShortlistDraw,
  openShortlistWindow,
  operate,
  operatingCosts,
  overall,
  placeBid,
  ratio,
  seasonDayOf,
  shortlistOffers,
  joinedThisWindow,
  shortLines,
  signingRequests,
  signingVerdict,
  pendingLimit,
  SIGNING_CONFIG,
  staffSignings,
  transferOffers,
  transferWindowDays,
  UPGRADE_MEASURE,
  upgradeNeeds,
  moneyBar,
  belowBar,
  upgradeCap,
  makeRoom,
  slotsBelowBar,
  windowBar,
} from './index';
import { addEvent } from './events';
import { recordTransfer } from './transfer-records';
import { delegatePlan, spendingStance } from './delegation';
import { playerRecord } from './player-records';
import { marketWageAt } from './market-prices';
import { clubOf, slotOvr } from './player-state';
import type { SigningNeed } from './signings';
import { handTo, holdRows, staffAuthority } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
import { holdTemperament, projectCashTo } from './delegation.testkit';
import { reachOffers, scoutReach } from './scout-search';
import { joinFreeAgents } from './free-agents';
import { retainPerson, openEmployment } from './person-careers';
import { movePerson } from './npc-continuity';
import { registration } from './registration';
import * as catalogs from '../../catalogs/src/index';
import { bidOutlook, transferStance } from './transfers';
import * as personalTerms from './personal-terms';
import { termsChance, termsContext, WAGE_STEPS } from './personal-terms';
import { pursueRequest, requestCandidates, wageCeiling, wageOffer } from './signings';
import { random } from './primitives';
import { staffBidShare } from './director-bidding';
import { openNeed, openNeeds } from './replacements';

/** Release the actual listed club player, keeping his identity and unchanged sporting quality. */
function releaseListed(w: World, line?: Line) {
  const listed = transferOffers(w).find(
    (offer) =>
      offer.available && !offer.freeAgent && (!line || lineOf(offer.player.position) === line),
  )!;
  expect(listed).toBeDefined();
  expect(listed.source.kind).toBe('club');
  const origin = listed.source.kind === 'club' ? listed.source.club : '';
  const player = w.squads![origin].find((one) => one.id === listed.player.id)!;
  expect(player).toBeDefined();
  // Persisted players below the coaching threshold need not yet have a retained person row.
  const person = retainPerson(w, player, origin);
  openEmployment(w, person.id, 'player', origin);
  expect(person.club).toBe(origin);
  expect(joinFreeAgents(w, player, w.year)).toBe(true);
  const free = transferOffers(w).find(
    (offer) => offer.available && offer.freeAgent && offer.player.id === player.id,
  )!;
  expect(free).toBeDefined();
  return free;
}
/** A distinct registered test person competes freely against an unchanged equal-quality paid row. */
function equalQualityFree(w: World) {
  const paid = transferOffers(w).find(
    (offer) => offer.available && !offer.freeAgent && !offer.foreign,
  )!;
  expect(paid).toBeDefined();
  expect(paid.source.kind).toBe('club');
  const origin = paid.source.kind === 'club' ? paid.source.club : '';
  const club = w.clubs.find((one) => one.id === origin)!;
  const id = 'fixture:signings:equal-quality-free';
  expect(w.people?.[id]).toBeUndefined();
  const player = makePlayer(
    club.country,
    w.seed,
    id,
    w.year,
    overall(paid.player),
    paid.player.position,
    w.year - paid.player.born,
    club.tier,
  );
  player.attrs = { ...paid.player.attrs };
  player.positions = { ...paid.player.positions };
  player.potential = paid.player.potential;
  movePerson(w, player, origin);
  expect(w.people![id].origin).toBeUndefined();
  expect(joinFreeAgents(w, player, w.year)).toBe(true);
  const offers = transferOffers(w),
    free = offers.find((offer) => offer.available && offer.freeAgent && offer.player.id === id)!;
  expect(free).toBeDefined();
  expect(
    offers.find(
      (offer) => offer.available && !offer.freeAgent && offer.player.id === paid.player.id,
    ),
  ).toBeDefined();
  expect(free.player.id).not.toBe(paid.player.id);
  expect(free.player.attrs).toEqual(paid.player.attrs);
  expect(overall(free.player)).toBe(overall(paid.player));
  expect(free.player.potential).toBe(paid.player.potential);
  return free;
}
/**
 * The owner signs a candidate at the highest wage step (→CLUB-53), so the player's own seeded answer
 * is likeliest yes: a free agent answers at once; another club's player is bid for at his asking
 * fee, which his club always accepts (→CLUB-52), and the bid is closed at once as `buyOffer` closes
 * it. Returns whether he joined: he can still refuse our terms.
 */
function signCandidate(w: World, candidate: number) {
  const offer = transferOffers(w)[candidate]!;
  if (offer.freeAgent) operate(w, { type: 'recruit', candidate, wage: 2 });
  else {
    operate(w, { type: 'bid', candidate, fee: offer.fee, wage: 2 });
    const bid = w.bids!.findLast((one) => one.playerId === offer.player.id)!;
    if (bid.status === 'pending') {
      bid.status = 'countered';
      bid.counterFee = offer.fee;
      operate(w, { type: 'respond-bid', id: bid.id, accept: true });
    }
  }
  return activePlayers(w).some((p) => p.id === offer.player.id);
}

/**
 * A rich level-4 club on the winter window's opening day, half its season played with revenue far
 * beyond its wage bill, so only the rule under test holds the chief scout back.
 */
function club(request?: SpendRequest, seed = 'staff-signings') {
  const w = founded(seed);
  w.settings = staffAuthority(4);
  w.cash = '999999999999';
  w.round = 23;
  w.income = '999999999999';
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  holdTemperament(w, 'director', 'balanced');
  if (request) w.delegationRequests = { recruitment: request };
  return w;
}
/**
 * Every player joined this season or last, outside the takeover's: the money bar lists none of
 * them (→CLUB-33), so only the 24-player room is read.
 */
function settled(w: World) {
  const year = [w.year, w.year - 1].find((one) => one !== w.owner?.takeover?.year)!;
  for (const p of w.players) p.joined = year;
}
/** The club as founded, built once per seed, on the released model: signings are the subject. */
const founded = (seed: string) => cachedWorld(`founded:${seed}`, () => careerWorld({ seed }));
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
/** Marks every free agent within the scout's reach as tried: each move is then a pending bid. */
function passReachFree(w: World) {
  for (const offer of reachOffers(w)) if (offer.freeAgent) tried(w, offer.player.id);
}
/** The player of a bid joins as a completed move joins him (`noteSigning`), the fee aside. */
function arrive(w: World, bid: TransferBid) {
  const player = structuredClone(bid.offer!.player);
  bid.status = 'completed';
  w.players.push(player);
  noteSigning(w, player, bid.club);
}
/** A bid for the first available club player of `line` on the list, waiting for its answer. */
function pendingFor(w: World, line: Line, staff?: TransferBid['staff']) {
  const offers = transferOffers(w),
    index = offers.findIndex(
      (offer) => offer.available && !offer.freeAgent && lineOf(offer.player.position) === line,
    );
  expect(index).toBeGreaterThanOrEqual(0);
  placeBid(w, index, offers[index]!.fee, false, staff);
  const bid = w.bids!.at(-1)!;
  bid.due = currentDay(w) + 20;
  return bid;
}
/** Marks every free agent the scout lists as tried, so the 단장 moves for a fee-bearing player. */
function passFree(w: World) {
  for (const offer of transferOffers(w).filter((one) => one.freeAgent)) tried(w, offer.player.id);
}
/**
 * Every player is keen on our terms (→CLUB-53): these cases test which move the 단장 makes, not
 * the player's answer, so his chance is certain at his demand and he always agrees.
 */
function willing() {
  const certain = { chance: 1, logOdds: 9, lines: [] };
  const chance = vi.spyOn(personalTerms, 'termsChance').mockReturnValue(certain),
    answer = vi.spyOn(personalTerms, 'termsAnswer').mockReturnValue({ ...certain, accept: true });
  onTestFinished(() => {
    chance.mockRestore();
    answer.mockRestore();
  });
}
/** The first of another club's players on the scout's list. */
const clubIndex = (w: World) => transferOffers(w).findIndex((offer) => !offer.freeAgent);

describe('the chief scout signs players at level 4 (→CLUB-33)', () => {
  it('fills a short role with a free agent on equal sporting quality', () => {
    const w = club(2);
    const free = equalQualityFree(w);
    expect(free.freeAgent).toBe(true);
    keep(w, lineOf(free.player.position), 1);
    expect(shortLines(w)[0]).toMatchObject({
      kind: 'short',
      line: lineOf(free.player.position),
      count: 1,
    });
    // A previously drawn manager shortlist would give its paid member priority over this tie.
    delete w.shortlist;
    expect(signingRequests(w)).toEqual([]);
    expect(transferOffers(w).find((offer) => offer.player.id === free.player.id)?.available).toBe(
      true,
    );
    expect(signingVerdict(w, free.player, '0', 'short').ok).toBe(true);
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
    expect(shortLines(w)[0]).toBeUndefined();
    // The free agents are passed by, so the upgrade goes to a fee-bearing player.
    passFree(w);
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
    const bold = club(5);
    passFree(bold);
    staffSignings(bold);
    const [high] = staffBids(bold);
    const asked = transferOffers(bold).find((one) => one.player.id === high.playerId)!.fee;
    expect(high.fee).toBe(ratio(asked, 110n, 100n));
    for (const request of [2, 1] as const) {
      const quiet = club(request);
      staffSignings(quiet);
      expect(staffBids(quiet)).toEqual([]);
      expect(quiet.players).toHaveLength(w.players.length);
    }
  });

  it("keeps the 단장's money checks", () => {
    const w = club();
    const offer = transferOffers(w)[clubIndex(w)]!;
    // With the same projected closing cash the half-season floor refuses what stage 1's line allows.
    const annual = BigInt(operatingCosts(w).annual),
      fee = BigInt(offer.fee),
      wage = BigInt(offer.player.wage),
      planned = { year: w.year, revenue: (annual + wage).toString(), sales: '0' };
    w.budgetPlan = planned;
    projectCashTo(w, fee + wage * 2n);
    expect(signingVerdict(w, offer.player, offer.fee).ok).toBe(false);
    w.delegationRequests = { recruitment: 5 };
    expect(signingVerdict(w, offer.player, offer.fee).ok).toBe(true);
    // Whatever the plan allows, the plain stop keeps a month of fixed costs in cash: income past
    // every cost with his wage, and cash for the fee alone.
    w.budgetPlan = { ...planned, revenue: (annual + wage * 2n).toString() };
    w.cash = BigInt(offer.fee).toString();
    expect(signingVerdict(w, offer.player, offer.fee).reason).toContain('현금이 바닥나지');
    // A projection below the floor leaves no room.
    const poor = club();
    projectCashTo(poor, -annual);
    poor.budgetPlan = { ...planned, revenue: '0' };
    expect(signingVerdict(poor, offer.player, offer.fee).reason).toContain('현금 하한');
    passFree(poor);
    staffSignings(poor);
    expect(staffBids(poor)).toEqual([]);
    // At step 3, cash above the floor can fund a commitment even with no planned income.
    const funded = club();
    funded.budgetPlan = { ...planned, revenue: '0' };
    expect(signingVerdict(funded, offer.player, offer.fee).ok).toBe(true);
  });

  it("answers its own counters, never the owner's", () => {
    // Only a bid below the asking fee draws a counter (→CLUB-52): a negotiator's first bid, 80% of
    // it (→CLUB-41), for a club candidate whose club surely counters it; the rest are passed by.
    // The staff fill the 단장's post first, so he is the one who answers (→STAFF-15): a negotiator
    // of low ability, so the clubs he bids at hold out (→STAFF-20).
    const w = handTo(club(), 4);
    const director = w.staff?.find((member) => member.role === 'director');
    expect(director).toBeDefined();
    director!.trait = 'negotiator';
    director!.ability = 30;
    passFree(w);
    transferOffers(w).forEach((offer, index) => {
      if (!offer.freeAgent && bidOutlook(w, index, ratio(offer.fee, 80n, 100n)).counter < 1)
        tried(w, offer.player.id);
    });
    staffSignings(w);
    const [bid] = staffBids(w);
    expect(bid).toBeDefined();
    expect(bid).toMatchObject({ status: 'pending', fee: ratio(bid.offer!.fee, 80n, 100n) });
    const late = structuredClone(w);
    // While he haggles he declines the counter himself, to bid 5 points more the next day.
    advanceDays(w, 4);
    expect(bid).toMatchObject({ status: 'rejected' });
    expect(BigInt(bid.counterFee!)).toBeGreaterThan(BigInt(bid.fee));
    const declined = w.inbox!.find((item) => item.ref === bid.id && /역제안/.test(item.title))!;
    expect(declined.title).toContain('단장이 거절');
    expect(declined.attention).toBe(false);
    expect(declined.detail).toContain('단장');
    // Answered six days before the deadline, when he haggles no more, he takes the counter, which
    // passes the money checks; the player then answers our terms (→CLUB-53), and either way the
    // report asks nothing of the owner.
    late.calendar = { day: transferWindowDays(late.year).winterClose - 7 };
    advanceDays(late, 1);
    const taken = late.bids!.find((one) => one.id === bid.id)!;
    expect(BigInt(taken.counterFee!)).toBeGreaterThan(BigInt(bid.fee));
    const report = late.inbox!.findLast((item) => item.ref === bid.id)!;
    expect(report.attention).toBe(false);
    if (taken.status === 'completed') {
      expect(late.players.some((p) => p.id === bid.playerId)).toBe(true);
      expect(report.title).toContain('단장이 수락');
    } else {
      expect(taken).toMatchObject({ status: 'rejected', refusedBy: 'player' });
      expect(report.title).toContain('개인 조건 거절');
    }
  });

  it("leaves the owner's countered bid to the owner", () => {
    // The owner bids below the asking fee, at a fee the selling club surely counters (→CLUB-52),
    // then hands recruitment to the 단장: the counter still waits for the owner. The staff fill
    // their posts first, so the 단장 the answer reads stays the same (→STAFF-15).
    const w = handTo(club(), 3);
    const index = clubIndex(w),
      asking = transferOffers(w)[index]!.fee;
    const fee = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40]
      .map((percent) => ratio(asking, BigInt(percent), 100n))
      .find((one) => bidOutlook(w, index, one).counter === 1);
    expect(fee).toBeDefined();
    placeBid(w, index, fee!);
    w.settings = staffAuthority(4);
    advanceDays(w, 4);
    const own = (w.bids || []).find((bid) => !bid.staff && bid.direction === 'out')!;
    expect(own).toMatchObject({ status: 'countered', fee });
    expect(BigInt(own.counterFee!)).toBeGreaterThan(BigInt(fee!));
    const counter = w.inbox!.find((item) => item.ref === own.id)!;
    expect(counter.attention).toBe(true);
    expect(counter.title).not.toContain('단장');
    // The owner answers it himself.
    operate(w, { type: 'respond-bid', id: own.id, accept: false });
    expect(own.status).toBe('rejected');
  });

  it("looks on the opening day and every 3rd day after, keeping up to the step's count of bids pending", () => {
    const w = club();
    passFree(w);
    const opening = currentDay(w);
    w.calendar = { day: opening + 1 };
    staffSignings(w);
    expect(staffBids(w)).toEqual([]);
    w.calendar = { day: opening + 3 };
    staffSignings(w);
    // 적당히: one bid pending at most.
    expect(pendingLimit(w)).toBe(1);
    expect(staffBids(w)).toHaveLength(1);
    // Three days later his bid is still open: he waits.
    staffBids(w)[0].due = opening + 20;
    w.calendar = { day: opening + 6 };
    staffSignings(w);
    expect(staffBids(w)).toHaveLength(1);
    // 넉넉히 keeps two pending and 아낌없이 three, each fee reserved from the capital.
    expect(pendingLimit(club(4))).toBe(2);
    const rich = club(5);
    passFree(rich);
    expect(pendingLimit(rich)).toBe(3);
    rich.calendar = { day: opening + 3 };
    const capital = BigInt(delegatePlan(rich, 'recruitment').spendable);
    staffSignings(rich);
    const pending = staffBids(rich).filter((bid) => bid.status === 'pending');
    expect(pending.length).toBeGreaterThan(1);
    expect(pending.length).toBeLessThanOrEqual(3);
    const reserved = pending.reduce((sum, bid) => sum + BigInt(bid.fee), 0n);
    expect(BigInt(delegatePlan(rich, 'recruitment').spendable)).toBe(capital - reserved);
    // A second call on the same day makes no move.
    const count = staffBids(rich).length;
    staffSignings(rich);
    expect(staffBids(rich)).toHaveLength(count);
  });

  it('makes no signings below level 4 or outside windows', () => {
    // Every player is keen (→CLUB-53): the listed players of the divisions above ours would refuse
    // our terms, and only the window, the level and the pick are under test.
    willing();
    const below = club();
    below.settings = staffAuthority(3);
    staffSignings(below);
    expect(staffBids(below)).toEqual([]);
    const closed = club();
    closed.calendar = { day: seasonDayOf(closed.year, 3, 1) };
    staffSignings(closed);
    expect(staffBids(closed)).toEqual([]);
    // Over a whole window at level 4 the daily market makes the looks itself: the window opens
    // with the short role requested, and the 단장 moves for the manager's pick first.
    const daily = club();
    const free = releaseListed(daily);
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
    w.settings = staffAuthority(2);
    return w;
  }

  it('lists the reach count per role by ability, potential, free status and id', () => {
    const w = owned();
    drawShortlist(w);
    expect(w.shortlist).toMatchObject({ year: w.year, day: currentDay(w) });
    const market = transferOffers(w).filter((offer) => offer.available);
    const count = scoutReach(w).perLine;
    for (const role of ROLES) {
      const listed = w.shortlist!.entries.filter((entry) => entry.line === role);
      const expected = market
        .filter((offer) => lineOf(offer.player.position) === role)
        .sort(
          (a, b) =>
            overall(b.player) - overall(a.player) ||
            b.player.potential - a.player.potential ||
            Number(b.freeAgent) - Number(a.freeAgent) ||
            compareIds(a.player.id, b.player.id),
        )
        .slice(0, count)
        .map((offer) => offer.player.id);
      expect(listed.map((entry) => entry.playerId)).toEqual(expected);
      expect(listed).toHaveLength(count);
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
    willing();
    // A shortlist some of whose players recruitment level 5's search (ages 26–33, →ECON-16) does
    // not find, so changing the row takes them off the list; a player both searches find stays.
    const seed = ['shortlist', ...Array.from({ length: 40 }, (_, i) => `shortlist-${i}`)].find(
      (one) => {
        const trial = owned(one);
        drawShortlist(trial);
        holdRows(trial, { policy: { recruitment: 5 } });
        const listed = new Set(transferOffers(trial).map((offer) => offer.player.id));
        return trial.shortlist!.entries.some((entry) => !listed.has(entry.playerId));
      },
    );
    if (!seed) throw new Error('every shortlist in 41 markets is found by recruitment 5 too');
    const w = owned(seed);
    drawShortlist(w);
    // He joins only when he agrees to our terms too (→CLUB-53), on his own seeded answer: the first
    // listed player who does.
    const first = shortlistOffers(w).find(({ index }) => signCandidate(structuredClone(w), index))!;
    expect(first).toBeDefined();
    expect(signCandidate(w, first.index)).toBe(true);
    expect(shortlistOffers(w).some(({ offer }) => offer.player.id === first.offer.player.id)).toBe(
      false,
    );
    expect(signingRequests(w).every((request) => request.pick !== first.offer.player.id)).toBe(
      true,
    );
    // Another recruitment row draws another list: the shortlisted players it does not find drop off.
    holdRows(w, { policy: { recruitment: 5 } });
    const listed = new Set(transferOffers(w).map((offer) => offer.player.id)),
      gone = w.shortlist!.entries.filter((entry) => !listed.has(entry.playerId));
    expect(gone.length).toBeGreaterThan(0);
    expect(shortlistOffers(w).map(({ offer }) => offer.player.id)).toEqual(
      w
        .shortlist!.entries.filter(
          (entry) => listed.has(entry.playerId) && entry.playerId !== first.offer.player.id,
        )
        .map((entry) => entry.playerId),
    );
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
    // A full squad of 99s needs nothing; weak defenders call for a defender. An 80+ chief scout
    // searches the whole country, its top flight's defenders among them (→CLUB-51), and every
    // outfielder plays his line's positions, so only the defence's slots can fall short.
    const strong = owned();
    strong.staff = strong.staff!.map((member) =>
      member.role === 'scout' ? { ...member, ability: 85 } : member,
    );
    for (const p of activePlayers(strong)) {
      rate(p, 99);
      const line = lineOf(p.position);
      const natural = POSITIONS.filter(
        (one) =>
          line !== 'GK' && lineOf(one) !== 'GK' && (lineOf(one) === 'DF') === (line === 'DF'),
      );
      for (const position of natural) p.positions[position] = 3;
    }
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toEqual([]);
    for (const p of activePlayers(strong).filter((one) => lineOf(one.position) === 'DF'))
      rate(p, 10);
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toHaveLength(1);
    expect(strong.shortlist!.requests[0]).toMatchObject({ line: 'DF', kind: 'upgrade' });
    // Under the margin of 5 he asks for nothing: no listed player who plays a defensive slot's
    // position beats its starter there by 5 (OVR at the slot × level).
    const slots = formationOf(strong.tactic).filter((slot) => lineOf(slot.position) === 'DF'),
      best = Math.max(
        ...shortlistOffers(strong).flatMap(({ offer }) =>
          slots
            .filter((slot) => (offer.player.positions[slot.position] ?? 0) >= 2)
            .map((slot) => slotOvr(offer.player, slot)),
        ),
      );
    for (const p of activePlayers(strong).filter((one) => lineOf(one.position) === 'DF'))
      rate(p, Math.ceil(best) - 4);
    drawShortlist(strong);
    expect(strong.shortlist!.requests).toEqual([]);
  });

  it('names the ablest as his pick; a 육성형 or youth-trait manager the best young prospect', () => {
    // 젊은 선수 위주 lists players aged 18–25, so young and older forwards meet on the list.
    const pick = (setup?: (w: World) => void, seed = 'staff-signings') => {
      const w = owned(seed);
      holdRows(w, { policy: { recruitment: 2 } });
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
    willing();
    const w = club();
    const role = lineOf(releaseListed(w).player.position);
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
    // Every player is keen (→CLUB-53): the released top-flight goalkeeper would refuse a lower
    // division's terms, and the requests, not his answer, are under test.
    willing();
    const close = transferWindowDays(1951).winterClose;
    /** The winter window opens with a goalkeeper short; `during` acts inside it. */
    function window(during?: (w: World) => void) {
      const w = owned();
      // A squad of 99s wants no upgrade, so the goalkeeper is the one request.
      for (const p of activePlayers(w)) rate(p, 99);
      keep(w, 'GK', 1);
      releaseListed(w, 'GK');
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
    expect(window((w) => signCandidate(w, keeper(w))).lost).toBe(0);
    const defender = (w: World) =>
      transferOffers(w).findIndex(
        (offer) => offer.available && lineOf(offer.player.position) === 'DF',
      );
    expect(window((w) => signCandidate(w, defender(w))).lost).toBe(3);
    // The 단장 signing for him at level 4 meets it too.
    expect(
      window((w) => {
        w.settings = staffAuthority(4);
        staffSignings(w);
        w.settings = staffAuthority(2);
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
    w.settings = staffAuthority(2);
    return w;
  }

  it('slot request names the weakest slot', () => {
    const w = owned();
    for (const p of activePlayers(w)) rate(p, 99);
    drawShortlist(w);
    expect(w.shortlist!.requests).toEqual([]);
    const listed = shortlistOffers(w).map(({ offer }) => offer.player);
    const slots = formationOf(w.tactic);
    const xi = ownStarters(w);
    // A slot no other starter plays at his best, so none moves into it once it weakens.
    const k = slots.findIndex(
      (place, i) =>
        i > 0 &&
        xi.every((p, j) => j === i || (p.positions[place.position] ?? 0) < 3) &&
        listed.some((p) => (p.positions[place.position] ?? 0) >= 2),
    );
    expect(k).toBeGreaterThan(0);
    // The starter there and the bench weaken alike, so the manager's XI keeps a weak slot.
    for (const p of activePlayers(w)) if (p === xi[k] || !xi.includes(p)) rate(p, 10);
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

describe('a signing still settling in closes the slot he was bought for (→CLUB-33)', () => {
  const rate = (p: Player, level: number) => {
    for (const a of ATTRIBUTES) p.attrs[a] = level;
  };
  /** A free-agent keeper rated `level` everywhere, built from a keeper the scout lists. */
  function keeper(w: World, id: string, level: number): FreeAgent {
    const base = transferOffers(w).find((offer) => offer.player.position === 'GK')!.player;
    const p: FreeAgent = {
      ...structuredClone(base),
      id,
      name: id,
      positions: { GK: 3 },
      freeSince: w.year,
    };
    rate(p, level);
    p.potential = 99;
    return p;
  }
  /**
   * A 공격적 club (margin 2, three upgrades a window) on the winter opening whose keepers, rated
   * `starter`, are its one upgrade need: every other player is rated 99. The free agents are the
   * keepers given; other clubs' keepers on the list are passed by, so the moves are the test's.
   */
  function keeperNeed(starter: number, ...pool: [string, number][]) {
    willing();
    const w = club(5);
    for (const p of activePlayers(w)) {
      const goal = p.position === 'GK';
      rate(p, goal ? starter : 99);
      p.fatigue = 0;
      // A settled keeper: a newcomer, still settling in (→PLAYER-11), does not start ahead of him.
      if (goal) p.adaptation = 1;
    }
    w.freeAgents = pool.map(([id, level]) => keeper(w, id, level));
    return w;
  }
  /** Marks other clubs' keepers within the reach as tried, then lets the 단장 look. */
  function look(w: World) {
    for (const offer of reachOffers(w))
      if (offer.player.position === 'GK' && !offer.freeAgent) tried(w, offer.player.id);
    staffSignings(w);
  }
  const upgradeBids = (w: World) => staffBids(w).filter((bid) => bid.staff === 'upgrade');
  const nextLook = (w: World) => (w.calendar = { day: currentDay(w) + SIGNING_CONFIG.lookDays });

  it('a keeper bought for the keeper slot closes it: no second upgrade bid there while he settles', () => {
    expect(UPGRADE_MEASURE.inForce).toBe('signed');
    const w = keeperNeed(80, ['settling:a', 85], ['settling:b', 84]);
    const slot = formationOf(w.tactic).findIndex((one) => one.position === 'GK');
    look(w);
    expect(upgradeBids(w)).toMatchObject([{ status: 'completed', playerId: 'settling:a' }]);
    // He joined this window and does not start yet; he stands as the slot's measure.
    expect(joinedThisWindow(w).map((p) => p.id)).toEqual(['settling:a']);
    expect(ownStarters(w).map((p) => p.id)).not.toContain('settling:a');
    const need = upgradeNeeds(w, 2, joinedThisWindow(w)).find(
      (one) => one.kind === 'upgrade' && one.slot === slot,
    )!;
    expect(need).toMatchObject({ kind: 'upgrade', level: 85 });
    expect(need.kind === 'upgrade' && need.measure.id).toBe('settling:a');
    // A week later the second keeper, better than the starter but not than him, is left alone.
    nextLook(w);
    look(w);
    expect(upgradeBids(w)).toHaveLength(1);
    expect(w.players.some((p) => p.id === 'settling:b')).toBe(false);
  });

  it('the released `starter` reading, kept for measurement, bought for the same slot again', () => {
    const w = keeperNeed(80, ['settling:a', 85], ['settling:b', 84]);
    look(w);
    nextLook(w);
    try {
      UPGRADE_MEASURE.inForce = 'starter';
      look(w);
    } finally {
      UPGRADE_MEASURE.inForce = 'signed';
    }
    expect(upgradeBids(w).map((bid) => bid.playerId)).toEqual(['settling:a', 'settling:b']);
  });

  it('a keeper who beats the settling signing by the margin is still bought, named against him', () => {
    const w = keeperNeed(80, ['settling:a', 82]);
    look(w);
    expect(upgradeBids(w)).toMatchObject([{ status: 'completed', playerId: 'settling:a' }]);
    w.freeAgents = [...(w.freeAgents ?? []), keeper(w, 'settling:b', 85)];
    nextLook(w);
    look(w);
    expect(upgradeBids(w).map((bid) => bid.playerId)).toEqual(['settling:a', 'settling:b']);
    // The report names the measure behind the need: the settling signing at his value there.
    expect(reports(w).at(-1)!.detail).toContain('settling:a(그 자리 OVR 82)');
  });

  it('a newcomer who plays another position does not close the slot', () => {
    const w = keeperNeed(80, ['settling:a', 85]);
    const base = transferOffers(w).find((offer) => lineOf(offer.player.position) === 'DF')!.player;
    const defender: Player = {
      ...structuredClone(base),
      id: 'settling:df',
      position: 'CB',
      positions: { CB: 3 },
    };
    rate(defender, 99);
    w.players.push(defender);
    noteSigning(w, defender);
    expect(joinedThisWindow(w).map((p) => p.id)).toEqual(['settling:df']);
    look(w);
    expect(upgradeBids(w)).toMatchObject([{ status: 'completed', playerId: 'settling:a' }]);
  });

  it('one newcomer closes at most one slot, the weakest he beats', () => {
    const w = club(5);
    const needs = upgradeNeeds(w, 2);
    const everywhere = (id: string): Player => {
      const p = {
        ...structuredClone(activePlayers(w)[0]!),
        id,
        positions: Object.fromEntries(
          POSITIONS.map((position) => [position, 3]),
        ) as Player['positions'],
      };
      rate(p, 99);
      return p;
    };
    const closed = (joined: Player[]) =>
      upgradeNeeds(w, 2, joined)
        .filter((need) => need.kind === 'upgrade' && need.measure.id.startsWith('settling:'))
        .map((need) => (need.kind === 'upgrade' ? need.slot : -1));
    const slots = needs.map((need) => (need.kind === 'upgrade' ? need.slot : -1));
    // He plays every position at its best and beats every starter, yet stands at one slot.
    expect(closed([everywhere('settling:one')])).toEqual(slots.slice(0, 1));
    expect(closed([everywhere('settling:one'), everywhere('settling:two')])).toEqual(
      slots.slice(0, 2),
    );
  });

  it('a short line and a replacement need are met as under the released reading', () => {
    willing();
    const moves = (open: (w: World) => void) =>
      (['signed', 'starter'] as const).map((reading) => {
        const w = keeperNeed(80, ['settling:a', 85], ['settling:b', 84]);
        look(w);
        open(w);
        nextLook(w);
        try {
          UPGRADE_MEASURE.inForce = reading;
          look(w);
        } finally {
          UPGRADE_MEASURE.inForce = 'signed';
        }
        // The same look may go on to the keeper slot, which the readings measure apart.
        return staffBids(w)
          .slice(1)
          .filter((bid) => bid.staff !== 'upgrade')
          .map((bid) => ({ staff: bid.staff, playerId: bid.playerId }));
      });
    const short = moves((w) => keep(w, 'FW', 3));
    expect(short[0]).toEqual(short[1]);
    expect(short[0]).toMatchObject([{ staff: 'short' }]);
    // A forward's departure opened a replacement need for his line (→CLUB-42).
    const replacement = moves(
      (w) =>
        (w.replacementNeeds = [
          {
            line: 'FW',
            playerId: 'settling:gone',
            year: w.year,
            window: 'winter',
            day: currentDay(w),
          },
        ]),
    );
    expect(replacement[0]).toEqual(replacement[1]);
    expect(replacement[0]).toMatchObject([{ staff: 'replacement' }]);
  });
});

describe('the 단장 keeps room to upgrade a large squad (→CLUB-33, CLUB-22)', () => {
  const listed = (w: World) => activePlayers(w).filter((p) => transferStance(p) === 'listed');
  const roomReports = (w: World) =>
    (w.inbox || []).filter((item) => item.title.endsWith('이적 명단에 올렸어요'));
  /** Pads the squad to `size` with copies of its weakest non-starter, five points less able. */
  function pad(w: World, size: number) {
    const starters = new Set(ownStarters(w).map((p) => p.id)),
      base = activePlayers(w)
        .filter((p) => !starters.has(p.id))
        .sort((a, b) => overall(a) - overall(b))[0]!;
    const weaker = Object.fromEntries(
      Object.entries(base.attrs).map(([key, value]) => [key, Math.max(1, value - 5)]),
    ) as Player['attrs'];
    const added: Player[] = [];
    const count = size - activePlayers(w).length;
    for (let i = 0; i < count; i++) {
      const p = { ...structuredClone(base), id: `pad:${String(i).padStart(2, '0')}` };
      p.attrs = { ...weaker };
      p.born = w.year - 26;
      delete p.stance;
      w.players.push(p);
      added.push(p);
    }
    return added;
  }

  it('upgrades a 30-player squad at 아낌없이, at 적당히 only once the listed leave it 24', () => {
    const generous = club(5);
    pad(generous, 30);
    expect(activePlayers(generous).length).toBeLessThan(registration(generous).ceiling);
    passFree(generous);
    staffSignings(generous);
    // 아낌없이 keeps up to three bids pending, every one an upgrade.
    const moves = staffBids(generous);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(3);
    for (const bid of moves) expect(bid).toMatchObject({ staff: 'upgrade', status: 'pending' });

    const moderate = club(3);
    pad(moderate, 30);
    passFree(moderate);
    staffSignings(moderate);
    expect(staffBids(moderate)).toEqual([]);
    // Listed players do not count: six listed leave 24.
    const starters = new Set(ownStarters(moderate).map((p) => p.id));
    for (const p of activePlayers(moderate)
      .filter((one) => !starters.has(one.id))
      .slice(0, 6))
      p.stance = 'listed';
    staffSignings(moderate);
    expect(staffBids(moderate)).toMatchObject([{ staff: 'upgrade', status: 'pending' }]);
    // 적당히 lists nobody to make room.
    expect(roomReports(moderate)).toEqual([]);
  });

  it('lists the least able non-starters aged 24+ down to 24 at a regular look, in one report', () => {
    const w = club(5);
    settled(w);
    const [, older, youth, loaned, retiring] = pad(w, 30);
    older!.born = w.year - 31;
    // Even less able, but never listed: aged 23, on loan, or retiring.
    for (const p of [youth!, loaned!, retiring!])
      p.attrs = Object.fromEntries(
        Object.entries(p.attrs).map(([key, value]) => [key, Math.max(1, value - 5)]),
      ) as Player['attrs'];
    youth!.born = w.year - 23;
    loaned!.loanUntil = w.year + 1;
    retiring!.retiring = w.year;
    staffSignings(w);
    const starters = new Set(ownStarters(w).map((p) => p.id)),
      chosen = listed(w);
    expect(chosen).toHaveLength(6);
    expect(chosen.map((p) => p.id)).toContain(older!.id);
    for (const p of [youth!, loaned!, retiring!]) expect(transferStance(p)).toBe('open');
    for (const p of chosen) {
      expect(starters.has(p.id)).toBe(false);
      expect(w.year - p.born).toBeGreaterThanOrEqual(24);
    }
    // The least able go first: every eligible player left is at least as able as any listed.
    const left = activePlayers(w).filter(
      (p) =>
        transferStance(p) === 'open' &&
        !p.loanUntil &&
        p.retiring === undefined &&
        !starters.has(p.id) &&
        w.year - p.born >= 24,
    );
    expect(Math.min(...left.map((p) => overall(p)))).toBeGreaterThanOrEqual(
      Math.max(...chosen.map((p) => overall(p))),
    );
    expect(roomReports(w)).toHaveLength(1);
    expect(roomReports(w)[0]).toMatchObject({
      kind: 'staff-report',
      title: '단장이 6명을 이적 명단에 올렸어요',
    });
    expect(roomReports(w)[0]!.detail).toContain('30명이 24명을 넘어');
    expect(roomReports(w)[0]!.detail).toContain(older!.name);
    // Not on a day between regular looks.
    const listedIds = listed(w).map((p) => p.id);
    w.calendar = { day: currentDay(w) + 1 };
    staffSignings(w);
    expect(listed(w).map((p) => p.id)).toEqual(listedIds);
  });

  it("reads the step's room and the registration ceiling with the window's pending players in", () => {
    willing();
    /** A look three days after the opening, with and without a bid placed at the opening. */
    const look = (w: World, size: number) => {
      const opening = currentDay(w);
      w.settings!.responsibilities.sales = 'direct';
      w.shortlist = { ...w.shortlist!, requests: [] };
      pad(w, size);
      passReachFree(w);
      const alone = structuredClone(w);
      pendingFor(w, 'MF', 'upgrade');
      for (const one of [w, alone]) {
        one.calendar = { day: opening + SIGNING_CONFIG.lookDays };
        staffSignings(one);
      }
      return { pending: staffBids(w), alone: staffBids(alone) };
    };
    // 넉넉히's room is 28 players less the listed: 28 can take an upgrade, 28 and one pending not.
    const ample = look(club(4), 28);
    expect(ample.alone).toEqual([expect.objectContaining({ staff: 'upgrade' })]);
    expect(ample.pending).toHaveLength(1);
    // 아낌없이 reads the 40-player ceiling: 39 can take one more, 39 and one pending not.
    const generous = look(club(5), 39);
    expect(generous.alone.length).toBeGreaterThan(0);
    expect(generous.pending).toHaveLength(1);
  });

  it('lists nobody with sales direct, at 적당히 or with 24 left', () => {
    const direct = club(5);
    direct.settings!.responsibilities.sales = 'direct';
    pad(direct, 30);
    staffSignings(direct);
    expect(listed(direct)).toEqual([]);

    const moderate = club(3);
    pad(moderate, 30);
    staffSignings(moderate);
    expect(listed(moderate)).toEqual([]);

    const trimmed = club(5);
    settled(trimmed);
    pad(trimmed, 25);
    const starters = new Set(ownStarters(trimmed).map((p) => p.id));
    activePlayers(trimmed).find((p) => !starters.has(p.id))!.stance = 'listed';
    staffSignings(trimmed);
    expect(listed(trimmed)).toHaveLength(1);
    expect(roomReports(trimmed)).toEqual([]);
  });
});

describe('the money bar: a rich club replaces its weak players (→CLUB-33, ECON-33)', () => {
  const listed = (w: World) => activePlayers(w).filter((p) => transferStance(p) === 'listed');
  const roomReports = (w: World) =>
    (w.inbox || []).filter((item) => item.title.endsWith('이적 명단에 올렸어요'));
  /** A far abler copy of `base` who joins in this window. */
  function joinAble(w: World, base: Player, id: string) {
    const p: Player = { ...structuredClone(base), id, status: 'active' };
    p.attrs = Object.fromEntries(ATTRIBUTES.map((key) => [key, 99])) as Player['attrs'];
    delete p.stance;
    w.players.push(p);
    noteSigning(w, p);
    return p;
  }
  /** Records the 단장's completed upgrade signing of `playerId` in this window. */
  function upgradeSigned(w: World, playerId: string) {
    const day = currentDay(w);
    w.bids = [
      ...(w.bids || []),
      {
        id: `out:test:up:${playerId}`,
        direction: 'out',
        playerId,
        fee: '1',
        year: w.year,
        day,
        due: day,
        status: 'completed',
        staff: 'upgrade',
      },
    ];
  }
  /** A plan resting on `revenue` with no cash to draw on. */
  function poor(w: World, revenue: bigint) {
    w.cash = '0';
    w.budgetPlan = { year: w.year, revenue: revenue.toString(), sales: '0' };
  }
  const wageAt = (w: World, ovr: number) => {
    const c = clubOf(w),
      regular = { ...activePlayers(w)[0]!, born: w.year - 27, potential: 0 };
    return BigInt(marketWageAt(c.country, w.year, c.tier, regular, ovr));
  };

  it('is the highest OVR whose 27-year-old wage for two seasons fits spendable money; higher when richer, none at 1–3', () => {
    const rich = club(5),
      modest = club(5);
    // Income past every fixed cost: no planned loss, and the cash is the money for signings.
    poor(modest, BigInt(operatingCosts(modest).annual) * 2n);
    projectCashTo(modest, wageAt(modest, 70) * 2n - BigInt(operatingCosts(modest).annual) / 4n);
    const high = moneyBar(rich)!,
      low = moneyBar(modest)!;
    expect(high).toBeGreaterThan(low);
    // The bar uses two full seasons of wages within live spendable money (→CLUB-33).
    const plan = delegatePlan(modest, 'recruitment'),
      money = BigInt(plan.left),
      seasons = 2n;
    expect(low).toBe(70);
    expect(wageAt(modest, low) * seasons).toBeLessThanOrEqual(money);
    expect(wageAt(modest, low + 1) * seasons).toBeGreaterThan(money);
    // 넉넉히 has one too; 적당히, 아껴서 and 최소한만 none.
    expect(moneyBar(club(4))).toBe(high);
    for (const step of [1, 2, 3] as const) expect(moneyBar(club(step))).toBeUndefined();
    // A 안정 지향 단장 asked 넉넉히 acts on 적당히: no bar.
    const cautious = club(4);
    holdTemperament(cautious, 'director', 'cautious');
    expect(moneyBar(cautious)).toBeUndefined();
  });

  it('reads the money left for signings: none while the loss is uncovered, raised by sales and capital', () => {
    const wages = BigInt(operatingCosts(club(5)).playerWages),
      annual = BigInt(operatingCosts(club(5)).annual);
    // Income that pays only the wages and no cash: the planned loss is uncovered.
    const spent = club(5);
    poor(spent, wages);
    projectCashTo(spent, -annual);
    expect(BigInt(delegatePlan(spent, 'recruitment').left)).toBe(0n);
    expect(moneyBar(spent)).toBeUndefined();
    // A player sale reaches cash and the live closing projection.
    const loss = annual - wages,
      sold = club(5);
    poor(sold, wages);
    addEvent(sold, 'transfer-out', 'sale', 'sale', (loss + wageAt(sold, 70) * 2n).toString());
    projectCashTo(sold, wageAt(sold, 70) * 2n - annual / 4n);
    expect(BigInt(delegatePlan(sold, 'recruitment').left)).toBeGreaterThan(0n);
    const fromSales = moneyBar(sold)!;
    expect(fromSales).toBe(70);
    // More cash above the same floor buys more.
    const funded = club(5);
    poor(funded, wages);
    projectCashTo(funded, wageAt(funded, 85) * 2n - annual / 4n);
    expect(moneyBar(funded)!).toBeGreaterThan(fromSales);
    // A fee paid leaves the cash, and the money for signings with it.
    const bought = club(5);
    poor(bought, wages);
    addEvent(bought, 'transfer-out', 'sale', 'sale', (loss + wageAt(bought, 70) * 2n).toString());
    addEvent(bought, 'transfer-in', 'buy', 'buy', wages.toString());
    bought.cash = (BigInt(sold.cash) - wages).toString();
    expect(BigInt(delegatePlan(bought, 'recruitment').left)).toBeLessThan(
      BigInt(delegatePlan(sold, 'recruitment').left),
    );
    // Less money buys a lower bar, or none once nothing is left.
    expect(moneyBar(bought) ?? 0).toBeLessThanOrEqual(fromSales);
  });

  it('puts every slot more than the margin below the bar first, the weakest first', () => {
    const w = club(5);
    const plain = upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[];
    const levels = [...new Set(plain.map((need) => need.level))].sort((a, b) => a - b);
    expect(levels.length).toBeGreaterThan(1);
    // A bar that leaves the weaker slots more than 2 below it, between two measures.
    const mid = Math.floor((levels.length - 1) / 2),
      bar = (levels[mid]! + levels[mid + 1]!) / 2 + 2;
    const barred = upgradeNeeds(w, 2, [], bar) as typeof plain;
    const below = plain.filter((need) => bar - need.level > 2);
    expect(below.length).toBeGreaterThan(0);
    expect(below.length).toBeLessThan(plain.length);
    expect(barred.slice(0, below.length).map((need) => need.slot)).toEqual(
      [...below].sort((a, b) => a.level - b.level || a.slot - b.slot).map((need) => need.slot),
    );
    for (const need of barred.slice(0, below.length)) expect(belowBar(need, bar)).toBe(true);
    for (const need of barred.slice(below.length)) expect(belowBar(need, bar)).toBe(false);
    // The same slots, measures and margins: the bar orders the needs, never adds a measure.
    expect([...barred].sort((a, b) => a.slot - b.slot)).toEqual(
      [...plain].sort((a, b) => a.slot - b.slot),
    );
    expect(upgradeNeeds(w, 2, [], undefined)).toEqual(plain);
  });

  it('at 아낌없이 the window cap is the larger of 3 and the slots below the bar', () => {
    const generous = { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true },
      ample = { margin: 3, upgrades: 2, room: 28, makeRoom: true, bar: true };
    expect(upgradeCap(generous, 11)).toBe(11);
    expect(upgradeCap(generous, 1)).toBe(3);
    expect(upgradeCap(generous, 0)).toBe(3);
    expect(upgradeCap(ample, 11)).toBe(2);
  });

  it('counts each slot below the bar once, however many signings the window makes', () => {
    const w = club(5);
    const plain = upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[];
    const levels = [...new Set(plain.map((need) => need.level))].sort((a, b) => a - b);
    expect(levels.length).toBeGreaterThan(1);
    // A bar that leaves only the weakest measure more than 2 below it.
    const bar = (levels[0]! + levels[1]!) / 2 + 2,
      below = plain.filter((need) => bar - need.level > 2);
    expect(below.length).toBeGreaterThan(0);
    expect(below.length).toBeLessThan(3);
    expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
    expect(slotsBelowBar(w, 2, undefined)).toBe(0);
    /** A far abler copy of a slot's starter whom the 단장 signs for an upgrade in this window. */
    const arrive = (slot: number, id: string) => {
      const p = joinAble(w, ownStarters(w)[slot]!, id);
      upgradeSigned(w, id);
      return p;
    };
    // A signing for the weak slot, then another for it, then one for a slot never below the bar.
    arrive(below[0]!.slot, 'cap:weak:1');
    arrive(below[0]!.slot, 'cap:weak:2');
    const strong = plain.find((need) => !below.includes(need))!;
    arrive(strong.slot, 'cap:strong');
    expect(joinedThisWindow(w).map((p) => p.id)).toEqual([
      'cap:weak:1',
      'cap:weak:2',
      'cap:strong',
    ]);
    // The newcomers start or stand as measures: the weak slot they fill still counts once, and
    // neither the repeat nor the signing for a slot never below the bar adds one.
    expect(ownStarters(w).some((p) => p.id.startsWith('cap:'))).toBe(true);
    expect(
      upgradeNeeds(w, 2, joinedThisWindow(w)).filter((need) => belowBar(need, bar)).length,
    ).toBeLessThan(below.length);
    expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
    const generous = { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true };
    expect(upgradeCap(generous, slotsBelowBar(w, 2, bar))).toBe(3);
  });

  it('does not count slots departures weakened and upgrades filled again beside a weak slot', () => {
    const w = club(5);
    const plain = upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[];
    const levels = [...new Set(plain.map((need) => need.level))].sort((a, b) => a - b);
    // A bar that leaves only the weakest measure more than 2 below it.
    const bar = (levels[0]! + levels[1]!) / 2 + 2,
      below = plain.filter((need) => bar - need.level > 2);
    expect(below.length).toBeGreaterThan(0);
    expect(below.length).toBeLessThan(3);
    expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
    // The three ablest starters leave: the bench now holds their slots, weak while it does.
    const sold = [...ownStarters(w)].sort((a, b) => overall(b) - overall(a)).slice(0, 3);
    const buyer = w.clubs.find((c) => c.id !== w.playerClub)!.id;
    for (const p of sold) {
      p.status = 'sold';
      playerRecord(w, p.id).moves.push({
        year: w.year,
        day: currentDay(w),
        from: w.playerClub,
        to: buyer,
        fee: '1',
      });
    }
    expect(upgradeNeeds(w, 2).filter((need) => belowBar(need, bar)).length).toBeGreaterThan(
      below.length,
    );
    expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
    // Three upgrade signings, far abler, take those slots in the same window.
    for (const [i, p] of sold.entries()) {
      joinAble(w, p, `cap:back:${i}`);
      upgradeSigned(w, `cap:back:${i}`);
    }
    expect(joinedThisWindow(w)).toHaveLength(3);
    // Only the slot weak when the window opened counts: the cap stays 3, so a fourth upgrade waits.
    expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
    const generous = { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true };
    expect(upgradeCap(generous, slotsBelowBar(w, 2, bar))).toBe(3);
  });

  it('a window opening with more than three weak slots keeps its cap through successive upgrades', () => {
    const w = club(5);
    const plain = upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[];
    const levels = [...new Set(plain.map((need) => need.level))].sort((a, b) => a - b);
    // A bar between two measures that leaves at least five slots more than 2 below it.
    const at = levels.findIndex(
      (_, i) => plain.filter((need) => need.level <= levels[i]!).length >= 5,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(levels.length - 1);
    const bar = (levels[at]! + levels[at + 1]!) / 2 + 2,
      below = plain
        .filter((need) => bar - need.level > 2)
        .sort((a, b) => a.level - b.level || a.slot - b.slot);
    expect(below.length).toBeGreaterThanOrEqual(5);
    expect(below.length).toBeLessThan(plain.length);
    const generous = { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true };
    const capNow = () => upgradeCap(generous, slotsBelowBar(w, 2, bar));
    expect(capNow()).toBe(below.length);
    // The 단장 fills the weak slots one by one, each with a far abler signing who starts there.
    for (const [i, need] of below.entries()) {
      const p = joinAble(w, need.measure, `cap:many:${i}`);
      upgradeSigned(w, p.id);
      expect(ownStarters(w).some((starter) => starter.id === p.id)).toBe(true);
      const done = (w.bids || []).filter((bid) => bid.staff === 'upgrade').length;
      // Every slot weak at the opening still counts, so the next weak slot stays open to him.
      expect(slotsBelowBar(w, 2, bar)).toBe(below.length);
      expect(done < capNow()).toBe(i < below.length - 1);
    }
    // Every weak slot is lifted now: none of them is still below the bar.
    expect(upgradeNeeds(w, 2, joinedThisWindow(w)).filter((need) => belowBar(need, bar))).toEqual(
      [],
    );
  });

  it('keeps the window cap while its own signings, accepted counters included, spend the money the bar reads', () => {
    const w = club(5);
    const wages = BigInt(operatingCosts(w).playerWages);
    // Income past every fixed cost: no planned loss, the plan's money is the cash.
    poor(w, BigInt(operatingCosts(w).annual) * 2n + wages * 10n);
    const plain = (upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[]).sort(
      (a, b) => a.level - b.level || a.slot - b.slot,
    );
    w.cash = (wageAt(w, Math.floor(plain[4]!.level) + 3) * 2n).toString();
    const bar = moneyBar(w)!,
      below = plain.filter((need) => bar - need.level > 2);
    expect(below.length).toBeGreaterThanOrEqual(5);
    expect(windowBar(w)).toBe(bar);
    const generous = { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true };
    const capNow = () => upgradeCap(generous, slotsBelowBar(w, 2, windowBar(w)));
    expect(capNow()).toBe(below.length);
    let fell = false;
    // The 단장 fills the weak slots one by one, each signing paying a fee and a star's wage; every
    // other one is a counter he accepted, paid at `counterFee` above the bid he made, as
    // `completeSigning` pays it: cash debited, a transfer-in line and a transfer fact.
    for (const [i, need] of below.entries()) {
      const left = BigInt(delegatePlan(w, 'recruitment').left),
        fee = left / 4n,
        p = joinAble(w, need.measure, `cap:paid:${i}`);
      p.wage = wageAt(w, bar).toString();
      w.cash = (BigInt(w.cash) - fee).toString();
      recordTransfer(w, { direction: 'in', loan: false, player: p, fee: fee.toString() });
      addEvent(w, 'transfer-in', 'buy', 'buy', fee.toString());
      upgradeSigned(w, p.id);
      const bid = w.bids!.at(-1)!;
      if (i % 2) {
        bid.fee = ((fee * 8n) / 10n).toString();
        bid.counterFee = fee.toString();
      } else bid.fee = fee.toString();
      // The plan's money falls with every signing until none is left, and the bar now with it.
      if (left > 0n) expect(BigInt(delegatePlan(w, 'recruitment').left)).toBeLessThan(left);
      const now = moneyBar(w);
      if (now === undefined || slotsBelowBar(w, 2, now) < below.length) fell = true;
      // The window's bar undoes its own signings: every slot weak at the opening still counts.
      expect(windowBar(w)).toBe(bar);
      expect(slotsBelowBar(w, 2, windowBar(w))).toBe(below.length);
      const done = (w.bids || []).filter((bid) => bid.staff === 'upgrade').length;
      expect(done < capNow()).toBe(i < below.length - 1);
    }
    // Read against the bar now, the cap would have fallen before the weak slots were filled.
    expect(fell).toBe(true);
  });

  it('at 넉넉히 and 아낌없이 ranks everyone within the reach by slot gain for an upgrade', () => {
    // At 넉넉히 the slots below the bar lift the window's cap as at 아낌없이 (→CLUB-33).
    expect(upgradeCap(spendingStance(club(4), 'recruitment').signing, 5)).toBe(5);
    expect(upgradeCap(spendingStance(club(3), 'recruitment').signing, 5)).toBe(1);
    const w = club(5);
    passFree(w);
    // No manager's pick: everyone within the reach competes on slot gain alone.
    w.shortlist = { ...w.shortlist!, requests: [] };
    const bar = moneyBar(w)!,
      need = upgradeNeeds(w, 2, [], bar)[0]!,
      slots = formationOf(w.tactic);
    expect(need.kind).toBe('upgrade');
    if (need.kind !== 'upgrade') return;
    const reach = reachOffers(w),
      listed = new Set(transferOffers(w).map((offer) => offer.player.id)),
      // Ranked by the actual slot value, not a rounded gain: 55.73 and 56.27 must not tie.
      gain = (p: Player) => slotOvr(p, slots[need.slot]!) - need.level,
      fitting = reach.filter(
        (offer) =>
          offer.available &&
          !offer.player.loanUntil &&
          (offer.player.positions[need.position] ?? 0) >= 2 &&
          slotOvr(offer.player, slots[need.slot]!) >= need.level + need.margin,
      );
    // The reach holds more players for the slot than the list.
    expect(fitting.some((offer) => !listed.has(offer.player.id))).toBe(true);
    staffSignings(w);
    const bid = staffBids(w).find((one) => one.staff === 'upgrade')!;
    expect(bid).toBeDefined();
    const chosen = fitting.find((offer) => offer.player.id === bid.playerId)!;
    expect(chosen).toBeDefined();
    // Nobody fitting the slot who would sign within his money beats the chosen one there.
    const bidFor = new Set(staffBids(w).map((one) => one.playerId));
    for (const offer of fitting) {
      if (gain(offer.player) <= gain(chosen.player) || bidFor.has(offer.player.id)) continue;
      const fee = offer.freeAgent ? '0' : ratio(offer.fee, BigInt(staffBidShare(w)), 100n);
      expect(wageOffer(w, offer, fee, 'upgrade').ok).toBe(false);
    }
  });

  /** A free agent of our country made for the case, at the OVR, position and age given. */
  function freeAgent(w: World, id: string, ovr: number, position: Player['position'], age: number) {
    const own = clubOf(w),
      origin = w.clubs.find((one) => one.country === own.country && one.id !== own.id)!;
    const player = makePlayer(own.country, w.seed, id, w.year, ovr, position, age, own.tier);
    movePerson(w, player, origin.id);
    expect(joinFreeAgents(w, player, w.year)).toBe(true);
    return player;
  }

  it("reaches past the search's age and ability bands: they shape the list alone (→ECON-16)", () => {
    willing();
    const w = club(5);
    passFree(w);
    w.shortlist = { ...w.shortlist!, requests: [] };
    const reach = scoutReach(w),
      need = upgradeNeeds(w, 2, [], moneyBar(w))[0]!;
    expect(need.kind).toBe('upgrade');
    if (need.kind !== 'upgrade') return;
    // Younger than the search's ages and above its ability ceiling, the ablest at the slot.
    const id = 'fixture:signings:outside-bands',
      player = freeAgent(w, id, 99, need.position, reach.age[0] - 1);
    expect(w.year - player.born).toBeLessThan(reach.age[0]);
    expect(overall(player)).toBeGreaterThan(reach.ability[1]);
    expect(transferOffers(w).some((offer) => offer.player.id === id)).toBe(false);
    expect(reachOffers(w).some((offer) => offer.player.id === id)).toBe(true);
    staffSignings(w);
    expect(staffBids(w).find((bid) => bid.playerId === id)).toMatchObject({
      status: 'completed',
      fee: '0',
    });
  });

  it('a look moves on past more than eight free agents refusing at once, up to its pending bids', () => {
    const certain = { chance: 1, logOdds: 9, lines: [] };
    const chance = vi.spyOn(personalTerms, 'termsChance').mockReturnValue(certain),
      answer = vi
        .spyOn(personalTerms, 'termsAnswer')
        .mockReturnValue({ ...certain, accept: false });
    onTestFinished(() => {
      chance.mockRestore();
      answer.mockRestore();
    });
    const w = club(5);
    keep(w, 'FW', 1);
    delete w.shortlist;
    // Ten free forwards abler than anyone else within the reach are asked first; all refuse.
    const free = Array.from({ length: 10 }, (_, i) =>
      freeAgent(w, `fixture:signings:refusing-${i}`, 97, 'ST', 27),
    ).map((player) => player.id);
    staffSignings(w);
    const bids = staffBids(w);
    for (const id of free)
      expect(bids.find((bid) => bid.playerId === id)).toMatchObject({
        status: 'rejected',
        refusedBy: 'player',
      });
    // The same look goes on to bid for other clubs' forwards until its pending count is reached.
    const pending = bids.filter((bid) => bid.status === 'pending');
    expect(pending).toHaveLength(pendingLimit(w));
    expect(pending.every((bid) => !free.includes(bid.playerId))).toBe(true);
  });

  it('a funded 3-5-2 short of two forwards bids for both before any upgrade', () => {
    willing();
    const w = club(5);
    w.tactic = 'balanced';
    w.shortlist = { ...w.shortlist!, requests: [] };
    keep(w, 'FW', 2);
    // Every free agent within the reach is passed by: each forward stays a bid until answered.
    for (const offer of reachOffers(w)) if (offer.freeAgent) tried(w, offer.player.id);
    expect(formationOf(w.tactic).filter((slot) => lineOf(slot.position) === 'FW')).toHaveLength(2);
    expect(shortLines(w)).toEqual([
      expect.objectContaining({ kind: 'short', line: 'FW', count: 2, minimum: 4 }),
    ]);
    staffSignings(w);
    // One pending forward covers one of the two places the line lacks (→CLUB-33).
    const pending = staffBids(w).filter((bid) => bid.status === 'pending');
    expect(pending).toHaveLength(pendingLimit(w));
    expect(pending.map((bid) => bid.staff)).toEqual(['short', 'short', 'upgrade']);
    for (const bid of pending.slice(0, 2)) expect(lineOf(bid.offer!.player.position)).toBe('FW');
  });

  it('a rich 아낌없이 club bids for a fourth upgrade in a window; 넉넉히 stops at its two', () => {
    const upgraded = (w: World, count: number) => {
      const day = currentDay(w);
      for (let i = 0; i < count; i++)
        w.bids = [
          ...(w.bids || []),
          {
            id: `out:test:upgrade:${i}`,
            direction: 'out',
            playerId: `test:upgrade:${i}`,
            fee: '1',
            year: w.year,
            day,
            due: day,
            status: 'completed',
            staff: 'upgrade',
          },
        ];
      w.calendar = { day: day + SIGNING_CONFIG.lookDays };
    };
    const generous = club(5);
    upgraded(generous, 3);
    passFree(generous);
    const bar = moneyBar(generous)!;
    staffSignings(generous);
    const bid = staffBids(generous).at(-1)!;
    expect(bid).toMatchObject({ staff: 'upgrade', status: 'pending' });
    // A slot below the bar he fits, and he still beats its measure there by the margin.
    const player = reachOffers(generous).find((offer) => offer.player.id === bid.playerId)!.player,
      slots = formationOf(generous.tactic);
    expect(
      upgradeNeeds(generous, 2, [], bar).some(
        (need) =>
          need.kind === 'upgrade' &&
          belowBar(need, bar) &&
          (player.positions[need.position] ?? 0) >= 2 &&
          slotOvr(player, slots[need.slot]!) >= need.level + need.margin,
      ),
    ).toBe(true);

    // 넉넉히 stops at its two unless more XI slots stand below its bar (→CLUB-33).
    const ample = club(4);
    upgraded(ample, 2);
    passFree(ample);
    const below = slotsBelowBar(ample, 3, windowBar(ample));
    staffSignings(ample);
    const more = staffBids(ample).filter(
      (one) => one.staff === 'upgrade' && !one.id.startsWith('out:test:'),
    );
    if (below <= 2) expect(more).toEqual([]);
    else expect(more.length).toBeGreaterThan(0);
    expect(upgradeCap(spendingStance(ample, 'recruitment').signing, below)).toBe(
      Math.max(2, below),
    );
  });

  it('lists non-starters aged 24+ more than 8 below the bar even at 24 or fewer, in one report', () => {
    const w = club(5);
    const players = activePlayers(w);
    expect(players.length).toBeLessThanOrEqual(24);
    const bar = moneyBar(w)!;
    const starters = new Set(ownStarters(w).map((p) => p.id));
    const bench = players
      .filter((p) => !starters.has(p.id) && overall(p) < bar - 8)
      .sort((a, b) => overall(a) - overall(b));
    expect(bench.length).toBeGreaterThanOrEqual(3);
    // Aged 24+, but signed last season or this one: never listed.
    const [signedLast, joinedNow, youth] = bench;
    for (const p of [signedLast!, joinedNow!]) p.born = Math.min(p.born, w.year - 26);
    w.recruitmentArrivals = [
      ...(w.recruitmentArrivals ?? []),
      {
        player: signedLast!.id,
        name: signedLast!.name,
        position: signedLast!.position,
        positions: { ...signedLast!.positions },
        at: { year: w.year - 1, day: 40 },
      },
    ];
    // Joined in a recent season other than the takeover's (the squad bought then was already here).
    joinedNow!.joined = [w.year, w.year - 1].find((year) => year !== w.owner?.takeover?.year)!;
    youth!.born = w.year - 23;
    // Before any signing for their line has joined in this window, the bar lists nobody.
    makeRoom(w);
    expect(listed(w)).toEqual([]);
    // A signing in every line joined in this window: the weak non-starters behind them go.
    for (const line of ['GK', 'DF', 'MF', 'FW'] as const) {
      const arrival = [...starters]
        .map((id) => players.find((p) => p.id === id)!)
        .find((p) => lineOf(p.position) === line)!;
      w.recruitmentArrivals = [
        ...(w.recruitmentArrivals ?? []),
        {
          player: arrival.id,
          name: arrival.name,
          position: arrival.position,
          positions: { ...arrival.positions },
          at: { year: w.year, day: currentDay(w) },
        },
      ];
    }
    staffSignings(w);
    const chosen = listed(w);
    expect(chosen.length).toBeGreaterThan(0);
    for (const p of [signedLast!, joinedNow!, youth!]) expect(transferStance(p)).toBe('open');
    for (const p of chosen) {
      expect(starters.has(p.id)).toBe(false);
      expect(w.year - p.born).toBeGreaterThanOrEqual(24);
      expect(overall(p)).toBeLessThan(bar - 8);
    }
    // No line's unlisted players fall below its minimum.
    for (const line of ['GK', 'DF', 'MF', 'FW'] as const)
      expect(
        activePlayers(w).filter(
          (p) => transferStance(p) !== 'listed' && lineOf(p.position) === line,
        ).length,
      ).toBeGreaterThanOrEqual(
        Math.min(
          { GK: 2, DF: 6, MF: 6, FW: 4 }[line],
          players.filter((p) => lineOf(p.position) === line).length,
        ),
      );
    // Every other eligible non-starter is blocked by his line's minimum.
    const left = activePlayers(w).filter(
      (p) =>
        transferStance(p) === 'open' &&
        !starters.has(p.id) &&
        !p.loanUntil &&
        p.retiring === undefined &&
        w.year - p.born >= 24 &&
        overall(p) < bar - 8 &&
        ![signedLast!.id, joinedNow!.id].includes(p.id),
    );
    for (const p of left) {
      const line = lineOf(p.position);
      expect(
        activePlayers(w).filter(
          (one) => transferStance(one) !== 'listed' && lineOf(one.position) === line,
        ).length,
      ).toBeLessThanOrEqual({ GK: 2, DF: 6, MF: 6, FW: 4 }[line]);
    }
    expect(roomReports(w)).toHaveLength(1);
    expect(roomReports(w)[0]!.title).toBe(`단장이 ${chosen.length}명을 이적 명단에 올렸어요`);
    for (const p of chosen) expect(roomReports(w)[0]!.detail).toContain(p.name);
  });

  it('lists nobody for the bar at 적당히, with sales direct, or without money', () => {
    const moderate = club(3);
    staffSignings(moderate);
    expect(listed(moderate)).toEqual([]);
    const direct = club(5);
    direct.settings!.responsibilities.sales = 'direct';
    staffSignings(direct);
    expect(listed(direct)).toEqual([]);
    const broke = club(5);
    broke.cash = '0';
    broke.budgetPlan = { year: broke.year, revenue: '0', sales: '0' };
    expect(moneyBar(broke)).toBeUndefined();
    makeRoom(broke);
    expect(listed(broke)).toEqual([]);
  });
});

describe('a pending player covers what his arrival would meet (→CLUB-33, CLUB-42)', () => {
  /** A rich 아낌없이 club with three forwards, the fourth gone on the opening day. */
  function forwardGone() {
    const w = club(5),
      opening = currentDay(w),
      forwards = activePlayers(w).filter((p) => lineOf(p.position) === 'FW');
    w.shortlist = { ...w.shortlist!, requests: [] };
    expect(forwards).toHaveLength(4);
    keep(w, 'FW', 3);
    // His departure opened a replacement need for his line, now below its minimum too.
    expect(openNeed(w, forwards[3]!, opening)).toBeDefined();
    passReachFree(w);
    return { w, look: opening + SIGNING_CONFIG.lookDays };
  }

  it('one forward covers the short line and the replacement need a departure opened', () => {
    willing();
    const { w, look } = forwardGone();
    w.calendar = { day: look };
    expect(shortLines(w)).toEqual([expect.objectContaining({ line: 'FW', count: 3, minimum: 4 })]);
    expect(openNeeds(w)).toEqual([expect.objectContaining({ line: 'FW' })]);
    staffSignings(w);
    const forward = staffBids(w).filter((bid) => bid.staff !== 'upgrade');
    expect(forward).toEqual([expect.objectContaining({ staff: 'short', status: 'pending' })]);
    // His arrival clears both, as the look read it.
    arrive(w, forward[0]!);
    expect(shortLines(w)).toEqual([]);
    expect(openNeeds(w)).toEqual([]);
  });

  it('a look with a forward pending moves as it would once he had joined', () => {
    willing();
    // The same club twice: a forward bid for at the opening still pending, or already joined. The
    // look reads the pending one as joined, in his line, the replacement need and the XI alike.
    const { w, look } = forwardGone(),
      bid = pendingFor(w, 'FW', 'short'),
      joined = structuredClone(w);
    arrive(
      joined,
      joined.bids!.find((one) => one.id === bid.id)!,
    );
    const moves = (one: World) => {
      const before = new Set(one.bids!.map((b) => b.id));
      one.calendar = { day: look };
      staffSignings(one);
      return staffBids(one)
        .filter((b) => !before.has(b.id))
        .map((b) => [b.playerId, b.staff]);
    };
    // The pending bid holds one of his three places, so its look makes one move fewer.
    const pending = moves(w);
    expect(pending.length).toBeGreaterThan(0);
    expect(moves(joined).slice(0, pending.length)).toEqual(pending);
  });

  it('looks between regular days only while a replacement need is left uncovered', () => {
    willing();
    const { w, look } = forwardGone(),
      after = look - SIGNING_CONFIG.lookDays + 1,
      open = structuredClone(w);
    // With the need open the day after the departure is a look day (→CLUB-42) ...
    open.calendar = { day: after };
    staffSignings(open);
    expect(staffBids(open)).toContainEqual(expect.objectContaining({ staff: 'short' }));
    // ... but not once a forward is pending, whose arrival would close it.
    pendingFor(w, 'FW', 'short');
    const count = w.bids!.length;
    w.calendar = { day: after };
    staffSignings(w);
    expect(w.bids!.slice(count)).toEqual([]);
  });

  it('a squad short of 20 counts a pending player of any line toward it', () => {
    willing();
    const w = club(5),
      opening = currentDay(w);
    w.shortlist = { ...w.shortlist!, requests: [] };
    // Every line at its minimum but one defender over: 19 players, the keepers asked for first.
    for (const [line, count] of [
      ['GK', 2],
      ['DF', 7],
      ['MF', 6],
      ['FW', 4],
    ] as const)
      keep(w, line, count);
    expect(shortLines(w)).toEqual([expect.objectContaining({ line: 'GK', squad: 19 })]);
    passReachFree(w);
    const defender = pendingFor(w, 'DF', 'upgrade');
    w.calendar = { day: opening + SIGNING_CONFIG.lookDays };
    staffSignings(w);
    expect(staffBids(w).filter((bid) => bid.staff === 'short')).toEqual([]);
    arrive(w, defender);
    expect(shortLines(w)).toEqual([]);
  });

  it("an owner's pending bid counts as the arrival it would be", () => {
    willing();
    const w = club(5),
      opening = currentDay(w);
    w.shortlist = { ...w.shortlist!, requests: [] };
    keep(w, 'FW', 3);
    passReachFree(w);
    const owner = pendingFor(w, 'FW');
    expect(owner.staff).toBeUndefined();
    w.calendar = { day: opening + SIGNING_CONFIG.lookDays };
    staffSignings(w);
    expect(staffBids(w).filter((bid) => bid.staff === 'short')).toEqual([]);
    arrive(w, owner);
    expect(shortLines(w)).toEqual([]);
  });

  it("an owner's pending deal leaves a look the money, wage bill and squad his arrival would", () => {
    willing();
    // Income just meets the fixed costs, so every wage added is a planned loss (→ECON-33), and the
    // cash is tight: the look with the owner's midfielder pending moves as it does once he joined
    // and his fee was paid, its own bids' wages counted move by move. A countered bid of his pays the
    // counter when he accepts it (→CLUB-52), and the look reads that.
    for (const [cash, countered] of [
      ['200000', false],
      ['250000', false],
      ['200000', true],
      ['250000', true],
    ] as const) {
      const w = club(5),
        look = currentDay(w) + SIGNING_CONFIG.lookDays;
      w.shortlist = { ...w.shortlist!, requests: [] };
      passReachFree(w);
      w.cash = cash;
      w.budgetPlan = { year: w.year, revenue: operatingCosts(w).annual, sales: '0' };
      const owner = pendingFor(w, 'MF');
      if (countered)
        Object.assign(owner, { status: 'countered', counterFee: ratio(owner.fee, 125n, 100n) });
      const joined = structuredClone(w);
      arrive(
        joined,
        joined.bids!.find((bid) => bid.id === owner.id)!,
      );
      joined.cash = (BigInt(joined.cash) - BigInt(owner.counterFee ?? owner.fee)).toString();
      const moves = (one: World) => {
        const before = new Set(one.bids!.map((bid) => bid.id));
        one.calendar = { day: look };
        staffSignings(one);
        return staffBids(one)
          .filter((bid) => !before.has(bid.id))
          .map((bid) => [bid.playerId, bid.staff, bid.fee]);
      };
      const pending = moves(w);
      expect(pending.length).toBeGreaterThan(0);
      expect(pending).toEqual(moves(joined));
    }
  });

  it("keeps the window's refusals past the closed-bid history: nobody is asked twice in it", () => {
    willing();
    const w = club(5),
      opening = currentDay(w);
    w.shortlist = { ...w.shortlist!, requests: [] };
    keep(w, 'FW', 3);
    // Every free agent within the reach refused at the opening, then 61 more refusals at once.
    passReachFree(w);
    for (let i = 0; i < 61; i++)
      w.bids!.push({
        id: `out:test:refused:${i}`,
        direction: 'out',
        playerId: `test:refused:${i}`,
        fee: '0',
        year: w.year,
        day: opening,
        due: opening,
        status: 'rejected',
        staff: 'short',
        refusedBy: 'player',
      });
    const asked = new Set(w.bids!.map((bid) => bid.playerId));
    expect(w.bids!.length).toBeLessThanOrEqual(200);
    // The daily market keeps them through its pruning, so the next look asks none of them again.
    for (const day of [opening + 1, opening + SIGNING_CONFIG.lookDays]) {
      w.calendar = { day };
      dailyMarket(w, false);
    }
    for (const id of asked) expect(w.bids!.some((bid) => bid.playerId === id)).toBe(true);
    expect(
      w.bids!.filter((bid) => bid.staff && bid.day > opening && asked.has(bid.playerId)),
    ).toEqual([]);
    expect(staffBids(w).some((bid) => bid.day > opening)).toBe(true);
  });

  it("registers each candidate against the squad the window's bids will leave (→CLUB-44)", () => {
    willing();
    // A 25-player limit with those aged 21 or under exempt, as the English top flight registers.
    const rule = vi.spyOn(catalogs, 'registrationRule').mockReturnValue({
      max: 25,
      ceiling: 40,
      exempt: { ageAtMost: 21 },
      status: 'observed',
      sources: [],
    });
    onTestFinished(() => rule.mockRestore());
    const w = club(5);
    w.shortlist = { ...w.shortlist!, requests: [] };
    // 24 counted players: room for one adult more.
    const adult = activePlayers(w).find((p) => w.year - p.born > 21)!;
    for (let i = 0; registration(w).counted < 24; i++)
      w.players.push({ ...structuredClone(adult), id: `fixture:signings:counted:${i}` });
    expect(registration(w)).toMatchObject({ counted: 24, allowed: 25 });
    passReachFree(w);
    staffSignings(w);
    const pending = staffBids(w).filter((bid) => bid.status === 'pending'),
      counted = pending.filter((bid) => w.year - bid.offer!.player.born > 21);
    // One adult takes the last place; any other move is for a player the limit exempts.
    expect(pending.length).toBeGreaterThan(0);
    expect(counted).toHaveLength(1);
  });
});

describe("the 단장's wage offer (→CLUB-41, CLUB-53)", () => {
  type Offer = ReturnType<typeof transferOffers>[number];
  /** The player's chance at each wage step of his pinned demand, as his answer reads it. */
  function chances(w: World, offer: Offer) {
    const club = offer.source.kind === 'club' ? offer.source.club : undefined,
      context = termsContext(w, {
        playerId: offer.player.id,
        ...(club ? { clubId: club } : {}),
        step: 1,
      })!,
      demand = offer.player.wage;
    return WAGE_STEPS.map(
      (step) =>
        termsChance({
          ...context,
          demand,
          offer: ((BigInt(demand) * BigInt(step * 100)) / 100n).toString(),
        }).chance,
    );
  }
  /**
   * Another club's player on the list whose first step reaching 60% is `step` (none: no step does),
   * our reputation moved until one is found: the stage factor shifts every step's chance alike.
   */
  function candidate(w: World, step: number | undefined) {
    const at = (c: number[]) => WAGE_STEPS.find((_, i) => c[i]! >= 0.6);
    for (let reputation = 0; reputation <= 100; reputation += 2) {
      clubOf(w).reputation = reputation;
      const found = transferOffers(w).find(
        (offer) => offer.available && !offer.freeAgent && at(chances(w, offer)) === step,
      );
      if (found) return found;
    }
    throw new Error(`no candidate first reaching 60% at ${step}`);
  }

  it('a rich 아낌없이 club offers above 100%: the smallest step his chance reaches 60% at', () => {
    const w = club(5);
    expect(wageCeiling(w)).toBe(2);
    const offer = candidate(w, 2),
      read = wageOffer(w, offer, offer.fee);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.offer.step).toBe(2);
    expect(read.offer.wage).toBe((BigInt(offer.player.wage) * 2n).toString());
    expect(read.offer.chance).toBeGreaterThanOrEqual(0.6);
    // One already keen at his demand is offered no more.
    const keen = candidate(w, 1),
      plain = wageOffer(w, keen, keen.fee);
    expect(plain.ok && plain.offer.step).toBe(1);
    // A step the money checks refuse with that wage is not offered (→ECON-33).
    const poor = club(5);
    poor.cash = '0';
    expect(wageOffer(poor, offer, offer.fee).ok).toBe(false);
  });

  it('a 적당히 club stops at 125%: a player who needs more is passed over', () => {
    const w = club(3);
    expect(wageCeiling(w)).toBe(1.25);
    const reach = candidate(w, 1.25),
      read = wageOffer(w, reach, reach.fee);
    expect(read.ok && read.offer.step).toBe(1.25);
    const dear = candidate(w, 1.5),
      capped = wageOffer(w, dear, dear.fee);
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).toContain('125%');
    // His bids carry the step he chose; a 1–2 step 단장 offers the demand at most.
    expect(wageCeiling(club(2))).toBe(1);
  });

  it('bids at the chosen step: every staff bid offers the smallest step reaching 60%', () => {
    const w = club(5);
    passFree(w);
    staffSignings(w);
    const [bid] = staffBids(w);
    expect(bid).toBeDefined();
    const offer = reachOffers(w).find((one) => one.player.id === bid!.playerId)!,
      c = chances(w, offer),
      step = bid!.wage ?? 1,
      index = WAGE_STEPS.indexOf(step);
    expect(step).toBeLessThanOrEqual(2);
    expect(c[index]!).toBeGreaterThanOrEqual(0.6);
    if (index > 0) expect(c[index - 1]!).toBeLessThan(0.6);
    // A look makes several moves: the report is the one this bid refers to.
    expect(reports(w).find((item) => item.ref === bid!.id)!.detail).toContain(
      `요구의 ${Math.round(step * 100)}%`,
    );
  });

  it("a free agent refusing at once leaves the day open for a mediation's next alternative (→CLUB-39)", () => {
    const w = club(5);
    const first = equalQualityFree(w),
      line = lineOf(first.player.position),
      second = releaseListed(w, line);
    const request: SigningRequest = { kind: 'short', line };
    const free = requestCandidates(w, request)
      .filter(({ offer }) => offer.freeAgent)
      .map(({ offer }) => offer.player.id);
    expect(free).toEqual(expect.arrayContaining([first.player.id, second.player.id]));
    // The first answers no, the second yes: the 단장's chance is certain, the answers are set.
    const certain = { chance: 1, logOdds: 9, lines: [] };
    const chance = vi.spyOn(personalTerms, 'termsChance').mockReturnValue(certain),
      answer = vi
        .spyOn(personalTerms, 'termsAnswer')
        .mockReturnValueOnce({ ...certain, accept: false })
        .mockReturnValue({ ...certain, accept: true });
    onTestFinished(() => {
      chance.mockRestore();
      answer.mockRestore();
    });
    const [a, b] =
      free.indexOf(first.player.id) < free.indexOf(second.player.id)
        ? [first, second]
        : [second, first];
    expect(pursueRequest(w, request, a.player.id, 'delegated')).toBeUndefined();
    expect(w.players.some((p) => p.id === a.player.id && p.status === 'active')).toBe(false);
    expect(staffBids(w).find((bid) => bid.playerId === a.player.id)).toMatchObject({
      status: 'rejected',
      refusedBy: 'player',
    });
    // The refusal is kept, and the next alternative can still be pursued that day.
    expect(pursueRequest(w, request, b.player.id, 'delegated')).toBeUndefined();
    expect(w.players.some((p) => p.id === b.player.id && p.status === 'active')).toBe(true);
  });

  it('asks a free agent at once on the same rule: he signs on that wage or refuses', () => {
    const outcomes = new Set<string>();
    for (let k = 0; k < 40 && outcomes.size < 2; k++) {
      const w = club(5);
      w.seed = `${w.seed}:free-terms:${k}`;
      const free = equalQualityFree(w);
      keep(w, lineOf(free.player.position), 1);
      delete w.shortlist;
      const read = wageOffer(w, free, '0', 'short');
      if (!read.ok) continue;
      const id = free.player.id,
        draw = random(`${w.seed}:terms:free:${w.year}:${currentDay(w)}:${id}`)();
      staffSignings(w);
      const signedRow = w.players.find((p) => p.id === id && p.status === 'active');
      const bid = staffBids(w).find((one) => one.playerId === id);
      if (!bid) continue;
      if (draw < read.offer.chance) {
        expect(signedRow?.wage).toBe(read.offer.wage);
        expect(bid).toMatchObject({ status: 'completed', fee: '0' });
        expect(reports(w).find((item) => item.title.includes(signedRow!.name))!.detail).toContain(
          `요구의 ${Math.round(read.offer.step * 100)}%`,
        );
        outcomes.add('signed');
      } else {
        expect(signedRow).toBeUndefined();
        expect(bid).toMatchObject({ status: 'rejected', refusedBy: 'player', fee: '0' });
        expect(
          (w.inbox || []).some(
            (item) => item.title.includes('자유계약 조건 거절') && !item.attention,
          ),
        ).toBe(true);
        // He is not asked again in the window, nor haggled with over a fee.
        const before = staffBids(w).length;
        staffSignings(w);
        expect(staffBids(w).filter((one) => one.playerId === id)).toHaveLength(1);
        expect(staffBids(w).length).toBeGreaterThanOrEqual(before);
        outcomes.add('refused');
      }
    }
    expect([...outcomes].sort()).toEqual(['refused', 'signed']);
  });
});
