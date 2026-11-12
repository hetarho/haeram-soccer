import { message as sourceMessage } from '../../contracts/src/messages';
import { eventsInSeason } from './season-index';
import { baseEffects, settleBases } from './bases';
import type { MatchRecord, World } from '../../contracts/src/types';
import { addEvent } from './events';
import { replanIfMoved } from './delegation';
import { clubOf } from './player-state';
import { footballQuote, quote } from './quotes';
import { random, ratio } from './primitives';
import {
  campaignEffectiveness,
  divisionLabel,
  EXPENSE_CONFIG,
  FINANCE_CONFIG,
  gateProjection,
  isLeagueMatch,
  lastSeasonTier,
  leagueMerit,
  leagueShare,
  matchBonus,
  moneyLabel,
  operatingCosts,
  operatingExpensesAt,
  ownLeagueGames,
  parachutePayment,
  roundShare,
  SPONSOR_SLOT_LABELS,
} from './finance';
import { currentDay, SEASON_ROUNDS } from './calendar';
import { driftFans, MIN_FANS } from './fans';
import { pushInbox } from './inbox';
import { marketingFanGain, policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { credit, debit } from './transactions';
import { CAMPAIGNS } from './ops-commercial';
import { EXCLUSIVE_MARKETING, exclusiveSponsor, sponsorAnnual } from './sponsors';

/**
 * A home gate's ledger detail: the crowd, the league scale when it is not 1 and the match. Saved
 * events and the news feed keep this text, so `readGateDetail` reads it back.
 */
export function gateDetail(attendance: number, scale: number, matchId: string) {
  return sourceMessage('copy.settlement.7346a03127', {
    p0: attendance,
    p1: scale !== 1 ? sourceMessage('copy.settlement.254b30dbca', { p0: scale.toFixed(2) }) : '',
    p2: matchId,
  });
}
const GATE_DETAIL = /^관중 (\d+)명 · 티켓과 구단 상품(?: · 시즌 46경기 기준 ×\d+\.\d{2})? · (.+)$/;
/** The crowd and match a `gateDetail` text names, or undefined for any other text. */
export function readGateDetail(
  detail: string,
): { attendance: number; matchId: string } | undefined {
  const match = GATE_DETAIL.exec(detail);
  return match ? { attendance: Number(match[1]), matchId: match[2]! } : undefined;
}
export function gate(w: World, m: MatchRecord) {
  if (m.home !== w.playerClub && m.away !== w.playerClub) return;
  const bonus = matchBonus(w, m);
  if (BigInt(bonus.amount) > 0n) {
    credit(w, bonus.amount);
    addEvent(
      w,
      'match-bonus',
      sourceMessage('copy.settlement.d2ee78853a', { p0: bonus.result }),
      sourceMessage('copy.settlement.8a8b52e6cd', { p0: m.id }),
      bonus.amount,
    );
  }
  if (isLeagueMatch(m.kind)) paySponsors(w, m, bonus.result, bonus.sponsored);
  if (m.home !== w.playerClub) return;
  const c = clubOf(w),
    r = random(`${w.seed}:gate:${m.id}`);
  const projection = gateProjection(w, m.id, m.away);
  const attendance = Math.round(
    projection.attendanceLow + r() * (projection.attendanceHigh - projection.attendanceLow),
  );
  const scale = isLeagueMatch(m.kind) ? projection.leagueFactor : 1;
  const income = footballQuote(c.country, w.year, attendance * projection.perFan * scale);
  credit(w, income);
  addEvent(
    w,
    'gate',
    sourceMessage('copy.settlement.340b7d0f98'),
    gateDetail(attendance, scale, m.id),
    income,
  );
  const cost = quote(
    c.country,
    w.year,
    FINANCE_CONFIG.homeMatchBaseCost + attendance * FINANCE_CONFIG.homeMatchCostPerFan,
  );
  debit(w, cost, true);
  addEvent(
    w,
    'match-cost',
    sourceMessage('copy.finance.aeee208c2a'),
    sourceMessage('copy.settlement.9fb6f87d64', { p0: attendance, p1: m.id }),
    cost,
  );
}
/**
 * Every sponsor contract's league payments (→ECON-14): a base installment per scheduled league
 * game played since signing, never for earlier ones, and the main sponsor's bonus for a win or a
 * draw, each on its slot's ledger line.
 */
function paySponsors(w: World, m: MatchRecord, result: string, resultBonus: string) {
  const played = w.tables[w.playerClub].played,
    games = ownLeagueGames(w);
  for (const contract of w.sponsors ?? []) {
    const label = SPONSOR_SLOT_LABELS[contract.slot];
    if (contract.lastPaid < w.year && contract.until > w.year) {
      accrue(
        w,
        `sponsor:${contract.slot}`,
        label,
        sourceMessage('copy.settlement.58ef9a4673', { p0: contract.name, p1: played, p2: games }),
        roundShare(sponsorAnnual(w, contract), played, games),
      );
      if (played === games) contract.lastPaid = w.year;
    }
    if (contract.slot === 'shirt')
      accrue(
        w,
        'sponsor:shirt',
        sourceMessage('copy.settlement.e5ceccab2f', { p0: label }),
        sourceMessage('copy.settlement.04f82c2495', { p0: contract.name, p1: result, p2: m.id }),
        resultBonus,
      );
  }
}
/**
 * One installment of a season-long payment. The season keeps one ledger entry per kind and title
 * that grows each round, so a century of rounds does not fill the save.
 */
function accrue(w: World, kind: string, title: string, detail: string, amount: string) {
  if (BigInt(amount) <= 0n) return;
  credit(w, amount);
  book(w, kind, title, detail, amount);
}
/** Adds an installment already paid or charged to the season's one ledger entry of its kind. */
function book(w: World, kind: string, title: string, detail: string, amount: string) {
  if (BigInt(amount) <= 0n) return;
  const entry = eventsInSeason(w, w.year).findLast(
    (event) =>
      event.kind === kind &&
      event.title === title &&
      event.year === w.year &&
      event.currency === w.currency,
  );
  if (entry) {
    entry.amount = (BigInt(entry.amount!) + BigInt(amount)).toString();
    entry.detail = detail;
  } else addEvent(w, kind, title, detail, amount);
}
/**
 * The league distribution's round installment (→ECON-28): the division's equal share, carrying
 * its broadcasting money, and in the season after a relegation the parachute.
 */
function settleDistribution(w: World) {
  const c = clubOf(w),
    division = divisionLabel(c.tier),
    paid = sourceMessage('copy.settlement.1008ffc9cb', { p0: w.round, p1: SEASON_ROUNDS });
  accrue(
    w,
    'league-share',
    sourceMessage('copy.finance.2d1ae295d1'),
    sourceMessage('copy.settlement.c272a9df11', { p0: division, p1: paid }),
    roundShare(leagueShare(w), w.round),
  );
  const parachute = roundShare(parachutePayment(w), w.round);
  if (parachute === '0') return;
  const from = divisionLabel(lastSeasonTier(w)!);
  accrue(
    w,
    'parachute',
    sourceMessage('copy.finance.28f00ca15d'),
    sourceMessage('copy.settlement.b76142a88c', { p0: from, p1: division, p2: paid }),
    parachute,
  );
}
/** Fixed-cost rounds left in cash below which the owner is warned, once per season. */
export const CASH_WARNING_ROUNDS = 13;
function cashWarning(w: World, perRound: string) {
  const cash = BigInt(w.cash),
    cost = BigInt(perRound);
  if (cash < 0n || cost <= 0n || cash >= cost * BigInt(CASH_WARNING_ROUNDS)) return;
  if (w.events.some((e) => e.year === w.year && e.kind === 'cash-warning')) return;
  const weeks = Number(cash / cost);
  addEvent(
    w,
    'cash-warning',
    sourceMessage('copy.settlement.ce5198ee5c'),
    sourceMessage('copy.settlement.4ce92703fd', { p0: weeks }),
  );
  pushInbox(w, {
    kind: 'finance',
    title: sourceMessage('copy.settlement.de51e84ed8', { p0: weeks }),
    detail: sourceMessage('copy.settlement.b6f2edcb75', {
      p0: moneyLabel(w, perRound),
      p1: BANKRUPTCY_ROUNDS,
    }),
    // A status, not a stop: the HUD and the warning band show it in red (→ECON-24).
    attention: false,
  });
}
/** The league's merit payment for the final rank, once at the close (→ECON-28). */
export function settleLeagueMerit(w: World, rank: number, clubs: number) {
  if (w.events.some((event) => event.year === w.year && event.kind === 'league-merit')) return;
  const amount = leagueMerit(w, rank, clubs);
  if (amount === '0') return;
  credit(w, amount);
  addEvent(
    w,
    'league-merit',
    sourceMessage('copy.finance.8873d9546b'),
    sourceMessage('copy.settlement.d3cebdd2e9', { p0: rank, p1: clubs }),
    amount,
  );
}
export function settleRound(w: World) {
  const cost = operatingCosts(w, w.round);
  debit(w, cost.nextRound, true);
  const club = clubOf(w),
    // An exclusive sponsor holds the merchandise rights and halves 해외 마케팅's fans (→ECON-14).
    fansGained = marketingFanGain(
      club.fans,
      policyEffects(policyOf(w)).fanGrowth *
        buildEffects(w).marketingFans *
        (exclusiveSponsor(w) ? EXCLUSIVE_MARKETING : 1),
    );
  // The bases move first (→ECON-34); supporters drift toward the following the club's
  // reputation commands, scaled by 글로벌 인지도, without a ceiling.
  settleBases(w);
  club.fans = driftFans(club.fans + fansGained, club.reputation, baseEffects(w).following);
  settleDistribution(w);
  const money = (amount: string) => moneyLabel(w, amount);
  addEvent(
    w,
    'operating-cost',
    sourceMessage('copy.settlement.ea3cdc1f20'),
    sourceMessage('copy.settlement.4742f582f8', {
      p0: money(cost.payments.playerWages),
      p1: money(cost.payments.managerWage),
      p2: money(cost.payments.maintenance),
      p3: cost.payments.investment
        ? sourceMessage('copy.settlement.df623448a6', { p0: money(cost.payments.investment) })
        : '',
      p4: cost.payments.academy
        ? sourceMessage('copy.settlement.4c2b7704f5', { p0: money(cost.payments.academy) })
        : '',
      p5: fansGained ? sourceMessage('copy.settlement.569eabd02c', { p0: fansGained }) : '',
    }),
    (
      BigInt(cost.nextRound) -
      BigInt(cost.payments.expenses) -
      BigInt(cost.payments.loan ?? '0')
    ).toString(),
  );
  // Operating expenses keep one ledger line a season, grown each round (→ECON-30, ECON-10); the
  // line says whether last season's turnover or the division's floor set them, and the squad
  // investment's factor this round when it is not the default ×1 (→ECON-16).
  const floor =
      BigInt(cost.seasonExpenses) <= BigInt(operatingExpensesAt(club.country, w.year, club.tier)),
    factor = `${cost.operatingFactor === 1 ? '' : sourceMessage('copy.settlement.0d9e7521ec', { p0: cost.operatingFactor })}${cost.politicianFactor === 1 ? '' : sourceMessage('copy.settlement.3971849ca5', { p0: cost.politicianFactor })}`;
  book(
    w,
    'operating-expenses',
    sourceMessage('copy.FinancialBreakdown.2d914c9be2'),
    sourceMessage('copy.settlement.804a02202f', {
      p0: floor
        ? sourceMessage('copy.settlement.4ae26c6e01', { p0: divisionLabel(club.tier) })
        : sourceMessage('copy.fan_mood.f85507dce3', { p0: Math.round(EXPENSE_CONFIG.share * 100) }),
      p1: factor,
      p2: w.round,
      p3: SEASON_ROUNDS,
    }),
    cost.payments.expenses,
  );
  // The takeover loan's installments keep one ledger line a season too (→ECON-38, ECON-10).
  if (cost.payments.loan)
    book(
      w,
      'loan-repayment',
      sourceMessage('copy.FinancialBreakdown.ddebd211b6'),
      sourceMessage('copy.settlement.6a49bdf3d1', {
        p0: money(cost.loan),
        p1: w.loan!.seasonsLeft,
        p2: w.round,
        p3: SEASON_ROUNDS,
      }),
      cost.payments.loan,
    );
  for (const c of w.campaigns) {
    c.remaining--;
    if (c.remaining > 0) continue;
    const offer = CAMPAIGNS.find((o) => o.kind === c.kind)!;
    const r = random(`${w.seed}:campaign:${c.id}`);
    const saturation = Math.max(0.2, 1 - clubOf(w).fans / 1000000);
    const fit = campaignEffectiveness(w, c.kind);
    const income = ratio(
      c.cost,
      BigInt(
        Math.round((0.25 + r() * 1.55) * fit * saturation * buildEffects(w).campaignIncome * 1000),
      ),
      1000n,
    );
    const fans = Math.round(clubOf(w).fans * offer.fans * (0.5 + r()) * fit * saturation);
    credit(w, income);
    clubOf(w).fans = Math.max(MIN_FANS, Math.round(clubOf(w).fans + fans));
    c.income = income;
    c.fans = fans;
    addEvent(
      w,
      'campaign-result',
      sourceMessage('copy.settlement.7c2aa96506', { p0: offer.label }),
      sourceMessage('copy.settlement.7922c5dcfb', {
        p0: fans,
        p1: money(c.cost),
        p2: money((BigInt(income) - BigInt(c.cost)).toString()),
      }),
      income,
    );
  }
  w.campaigns = w.campaigns.filter((c) => c.remaining > 0);
  cashWarning(w, cost.nextRound);
  if (
    BigInt(w.cash) < 0 &&
    !w.events.some((e) => e.year === w.year && e.kind === 'budget-warning')
  ) {
    addEvent(
      w,
      'budget-warning',
      sourceMessage('copy.settlement.ce5198ee5c'),
      sourceMessage('copy.settlement.ad22a9114c'),
    );
  }
  insolvency(w, cost.annual);
  // The 단장 plans again when the season's income or its sales moved a lot (→`replanIfMoved`).
  replanIfMoved(w);
}
/** League rounds in debt before the club goes bankrupt, or debt deeper than half a year's costs. */
export const BANKRUPTCY_ROUNDS = 8;
/**
 * Debt no longer freezes the club (→ECON-24): it plays on under a red warning, and after eight
 * settled rounds in a row below zero, or at once if the debt passes half a season's fixed costs,
 * it goes bankrupt and the career ends. Getting back above zero resets the count.
 */
function insolvency(w: World, annual: string) {
  if (BigInt(w.cash) >= 0n) {
    delete w.insolvent;
    return;
  }
  w.insolvent = (w.insolvent ?? 0) + 1;
  if (w.insolvent >= BANKRUPTCY_ROUNDS || BigInt(w.cash) * 2n < -BigInt(annual)) {
    w.bankrupt = { year: w.year, round: w.round, day: currentDay(w) };
    // A taken-over club's bankruptcy ends the owner's career by its cause (→OWNER-16).
    if (w.owner) w.ended = 'club';
    delete w.critical;
    addEvent(
      w,
      'bankruptcy',
      sourceMessage('copy.ownerFigures.f933e937de', { p0: clubOf(w).name }),
      sourceMessage('copy.settlement.31e9d41431', { p0: moneyLabel(w, w.cash), p1: w.insolvent }),
    );
    return;
  }
  if (w.insolvent === 1)
    pushInbox(w, {
      kind: 'finance',
      title: sourceMessage('copy.settlement.f40f997d11', { p0: BANKRUPTCY_ROUNDS }),
      detail: sourceMessage('copy.settlement.c67c099969', {
        p0: moneyLabel(w, w.cash),
        p1: BANKRUPTCY_ROUNDS,
      }),
      attention: false,
    });
}
