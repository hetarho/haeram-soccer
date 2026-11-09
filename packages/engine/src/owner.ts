import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The owner's own money and career (→OWNER): the business bet and living costs at each settlement,
 * injections, the season-close dividend, his bankruptcy and the end of a career. The day loop calls
 * these hooks; each returns at once in a career without an owner (a founded club), so founding
 * careers live exactly as before.
 */
import type { CareerDate, Command, World } from '../../contracts/src/types';
import { careerEnded, DIVIDEND_SHARES } from '../../contracts/src/owner';
import { COUNTRIES, currency } from '../../catalogs/src/index';
import {
  FFP,
  OWNER_BUSINESS,
  OWNER_LIVING,
  OWNER_SETTLEMENTS,
  OWNER_TRAITS,
  TAKEOVER_DEBT,
} from './owner-config';
import { hasTrait } from './owner-traits';
import { currentDay, SEASON_END_DAY, seasonDayLabel, seasonDayOf } from './calendar';
import { addEvent } from './events';
import { pushInbox } from './inbox';
import { clubOf } from './player-state';
import { quote } from './quotes';
import { random, ratio, scaleBy } from './primitives';
import { moneyLabel, roundShare, seasonResult } from './finance';
import { credit, debit } from './transactions';
import { fanMoodDividend, fanMoodInjection } from './fan-mood';

/** Refusal of an owner command while the career has no owner state. */
export const OWNER_PENDING_MESSAGE = sourceMessage('copy.owner.71f5af1271');
/** Refusal of every command but reading the inbox once the career has ended (→OWNER-16). */
export const ENDED_MESSAGE = sourceMessage('copy.owner.76e8ad26c8');

export type OwnerCommand = Extract<
  Command,
  { type: 'owner-stake' | 'owner-inject' | 'owner-dividend' }
>;

/**
 * Whether a club is anyone's yet: false only in the world before the takeover, which nobody owns
 * (→WORLD-13); true in every career, founded or taken over. Own-club branches check this, never
 * `w.playerClub` directly.
 */
export function hasOwner(w: Pick<World, 'playerClub'>) {
  return w.playerClub !== '';
}
/** Whether the career is over (→OWNER-16, ECON-24); the contracts' one predicate. */
export { careerEnded };

/** 1901 price units a living-cost or exchange-rate quote reads, enough for exact minor units. */
const PROBE = 100_000;

/**
 * The season days of the monthly settlements (→OWNER-7), in calendar order; the season's last, the
 * close's, settles in `ownerClose`.
 */
export function settlementDays(year: number) {
  return OWNER_BUSINESS.dates
    .map(({ month, date }) => seasonDayOf(year, month, date))
    .sort((a, b) => a - b);
}
/** The season close's day, the season's last settlement (→LEAGUE-9, OWNER-7). */
const CLOSE_DAY = SEASON_END_DAY + 1;
/** Every settlement day of a season in order, the close last. */
const seasonSettlementDays = (year: number) => [...settlementDays(year), CLOSE_DAY];
/** The next settlement after today: a date of this season, its close, or next season's first. */
export function nextSettlement(w: World): CareerDate {
  const today = currentDay(w),
    day = seasonSettlementDays(w.year).find((d) => d > today);
  return day === undefined
    ? { year: w.year + 1, day: settlementDays(w.year + 1)[0]! }
    : { year: w.year, day };
}
/** A settlement's chance of success: 60%, or 70% for 성공한 사업가 (→OWNER-7, OWNER-5). */
export function businessChance(w: World) {
  return hasTrait(w, 'businessman') ? OWNER_TRAITS.businessman.success : OWNER_BUSINESS.chance;
}
/**
 * What the next settlement wins or loses at today's fortune and stake: OWNER_BUSINESS.swing percent
 * of the staked share (→OWNER-7); nothing below zero.
 */
export function stakeAmount(w: World) {
  const owner = w.owner;
  if (!owner || BigInt(owner.fortune) <= 0n) return '0';
  return ratio(owner.fortune, BigInt(owner.stake * OWNER_BUSINESS.swing), 10000n);
}
/**
 * `amount` of `from` year's money in the club's money of `to` year: unchanged within one currency,
 * converted at the catalog's fixed rate across a change (→ECON-6).
 */
function carried(w: World, amount: string, from: number, to: number) {
  const code = clubOf(w).country,
    before = currency(code, from),
    after = currency(code, to);
  if (before.code === after.code) return amount;
  return ratio(
    amount,
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  );
}
/**
 * A season's living costs (→OWNER-8): OWNER_LIVING.season of the tier's starting fortune, grown
 * with prices (→ECON-2) from the takeover to `year`, in `year`'s money.
 */
function seasonLiving(w: World, year: number) {
  const { takeover } = w.owner!,
    code = clubOf(w).country,
    base = scaleBy(takeover.fortune, OWNER_LIVING.season, 10000n);
  return ratio(base, BigInt(quote(code, year, PROBE)), BigInt(quote(code, takeover.year, PROBE)));
}
/**
 * One settlement's living costs (→OWNER-8): its even share of `year`'s season living costs, the
 * remainders carried so the season's settlements pay the whole of it, in the club's money of
 * today. `day` names the settlement; without one, the season's first.
 */
export function livingCost(w: World, year = w.year, day?: number) {
  if (!w.owner) return '0';
  // A day off the calendar (a close moved past its day) pays the close's share.
  const at = day === undefined ? 0 : seasonSettlementDays(year).indexOf(day),
    index = at < 0 ? OWNER_SETTLEMENTS : at + 1;
  return carried(w, roundShare(seasonLiving(w, year), index, OWNER_SETTLEMENTS), year, w.year);
}
/** A whole season's living costs in the club's money of today (→OWNER-8). */
export function seasonLivingCost(w: World, year = w.year) {
  return w.owner ? carried(w, seasonLiving(w, year), year, w.year) : '0';
}

/**
 * One settlement of the owner's business (→OWNER-7/8) on `date`: OWNER_BUSINESS.swing percent of
 * the staked share of a fortune above zero is won or lost on one draw from the world's stream for
 * that date, then that settlement's living costs are paid even below zero. Both are appended as events in the season in play; a settlement before
 * the close that leaves the fortune below zero opens 구단주 파산 위기 (→OWNER-14), which runs to the
 * season close.
 */
function settle(w: World, date: CareerDate, close = false) {
  const owner = w.owner!,
    when = sourceMessage('copy.owner.dec290379c', { p0: seasonDayLabel(date.year, date.day) }),
    staked = stakeAmount(w);
  if (staked !== '0') {
    const chance = businessChance(w),
      won = random(`${w.seed}:owner:business:${date.year}:${date.day}`)() < chance,
      result = won ? staked : `-${staked}`;
    owner.fortune = (BigInt(owner.fortune) + BigInt(result)).toString();
    addEvent(
      w,
      'owner-business',
      won ? sourceMessage('copy.owner.ed2b47554e') : sourceMessage('copy.owner.6d7167145e'),
      sourceMessage('copy.owner.63176133cc', {
        p0: when,
        p1: owner.stake,
        p2: Math.round(chance * 100),
      }),
      result,
    );
  }
  const living = livingCost(w, date.year, date.day);
  owner.fortune = (BigInt(owner.fortune) - BigInt(living)).toString();
  addEvent(
    w,
    'owner-living',
    sourceMessage('copy.owner.232cfe2b08'),
    sourceMessage('copy.owner.bad96cce83', {
      p0: when,
      p1: OWNER_LIVING.season * 100,
      p2: OWNER_SETTLEMENTS,
    }),
    living,
  );
  if (close || owner.ownerCrisis || BigInt(owner.fortune) >= 0n) return;
  owner.ownerCrisis = { since: { ...date } };
  pushInbox(w, {
    kind: 'finance',
    title: sourceMessage('copy.owner.0cde9f23e6'),
    detail: sourceMessage('copy.owner.b7907d4f12', { p0: moneyLabel(w, owner.fortune) }),
    // A status, not a stop (→OWNER-15).
    attention: false,
  });
}

/** A day's owner business, from `clubDay`: a business settlement on its date (→OWNER-7/8). */
export function ownerDay(w: World) {
  if (!w.owner || careerEnded(w)) return;
  const day = currentDay(w);
  if (settlementDays(w.year).includes(day)) settle(w, { year: w.year, day });
}

/**
 * The dividend at the close (→OWNER-11): the dial's share of the season's net result when positive,
 * never more than the club's cash above zero, moves from the club's cash into the fortune, and
 * what is taken lowers 팬 민심 (→OWNER-12).
 */
function payDividend(w: World) {
  const owner = w.owner!,
    result = BigInt(seasonResult(w));
  if (owner.dividendShare === 0 || result <= 0n) return;
  const share = BigInt(ratio(result.toString(), BigInt(owner.dividendShare), 100n)),
    cash = BigInt(w.cash),
    amount = share < cash ? share : cash;
  if (amount <= 0n) return;
  debit(w, amount.toString(), true);
  owner.fortune = (BigInt(owner.fortune) + amount).toString();
  addEvent(
    w,
    'owner-dividend',
    sourceMessage('copy.fan_mood.eb9f33a674'),
    sourceMessage('copy.owner.137c121832', {
      p0: moneyLabel(w, result.toString()),
      p1: owner.dividendShare,
      p2: amount < share ? sourceMessage('copy.owner.624de6618b') : '',
    }),
    amount.toString(),
  );
  fanMoodDividend(w, amount);
}
/**
 * The takeover loan's season is paid (→ECON-38): its installments went out with the league rounds,
 * so the balance takes a year's interest less one installment, and the last season's ends it.
 */
function closeLoanSeason(w: World) {
  const loan = w.loan;
  if (!loan) return;
  loan.seasonsLeft--;
  if (loan.seasonsLeft <= 0) {
    delete w.loan;
    return;
  }
  const balance =
    BigInt(scaleBy(loan.balance, 1 + TAKEOVER_DEBT.rate, 10000n)) - BigInt(loan.installment);
  loan.balance = (balance > 0n ? balance : 0n).toString();
}
/**
 * The owner's season close, from `closeSeason` once the season's money is in and before its
 * archive (→OWNER-7/8/11/14): the dividend, the close-day business and living costs, the loan's
 * season, then the crisis check — an owner still below zero ends the career (구단주 파산).
 */
export function ownerClose(w: World) {
  if (!w.owner || careerEnded(w)) return;
  const owner = w.owner;
  payDividend(w);
  settle(w, { year: w.year, day: currentDay(w) }, true);
  closeLoanSeason(w);
  if (BigInt(owner.fortune) >= 0n) {
    delete owner.ownerCrisis;
    return;
  }
  w.ended = 'owner';
  delete w.critical;
  addEvent(
    w,
    'owner-bankruptcy',
    sourceMessage('copy.stories.ca78f66cf8'),
    sourceMessage('copy.owner.4385f75996', { p0: moneyLabel(w, owner.fortune) }),
  );
}

/**
 * Every settlement on the days a calendar jump skips (the war, →WORLD-14), after `fromDay` up to
 * and including `toDay`, as each would have settled: the monthly dates and each skipped season's
 * close day, with that season's prices. No season closes in the gap, so no dividend is taken and a
 * crisis opened there runs to the next close; the facts are booked in the season in play.
 */
export function ownerSettleGap(w: World, fromDay: CareerDate, toDay: CareerDate) {
  if (!w.owner || careerEnded(w)) return;
  const after = (a: CareerDate, b: CareerDate) => a.year - b.year || a.day - b.day;
  for (let year = fromDay.year; year <= toDay.year; year++)
    for (const day of seasonSettlementDays(year)) {
      const date = { year, day };
      if (after(date, fromDay) > 0 && after(date, toDay) <= 0) settle(w, date);
    }
}

/**
 * The FFP cap in force for `year` (→OWNER-10) in the club's money: nominal euros, converted for a
 * club outside the euro at the game's own rates (→ECON-35), the euro countries' averaged.
 */
function ffpCap(w: World, year: number) {
  const cap = FFP.caps.findLast((entry) => entry.from <= year)!,
    code = clubOf(w).country,
    money = currency(code, year),
    cents = (BigInt(cap.euros) * BigInt(money.units)).toString();
  if (money.code === 'EUR') return BigInt(cents);
  const euro = COUNTRIES.filter((c) => currency(c.code, year).code === 'EUR'),
    own = BigInt(quote(code, year, PROBE));
  const total = euro.reduce(
    (sum, c) => sum + BigInt(ratio(cents, own, BigInt(quote(c.code, year, PROBE)))),
    0n,
  );
  return total / BigInt(euro.length);
}
/** The seasons of the FFP window for `year`: the current and the two before (→OWNER-10). */
const inWindow = (season: number, year: number) => season > year - FFP.window && season <= year;
/**
 * What the owner may still put in under FFP this season, in the club's money (→OWNER-10), or
 * undefined while it does not apply: before its first season and outside the country's top flight.
 */
export function ffpRoom(w: World): string | undefined {
  if (!w.owner || w.year < FFP.start || clubOf(w).tier !== 0) return undefined;
  const used = w.owner.ffpInjections
      .filter((entry) => inWindow(entry.season, w.year))
      .reduce((sum, entry) => sum + BigInt(entry.amount), 0n),
    room = ffpCap(w, w.year) - used;
  return (room > 0n ? room : 0n).toString();
}
/**
 * An injection counted for FFP from its first season in any division, since a club promoted within
 * the window answers for it; seasons that left the window are dropped.
 */
function recordFfp(w: World, amount: bigint) {
  const owner = w.owner!;
  if (w.year < FFP.start) return;
  owner.ffpInjections = owner.ffpInjections.filter((entry) => inWindow(entry.season, w.year));
  const season = owner.ffpInjections.find((entry) => entry.season === w.year);
  if (season) season.amount = (BigInt(season.amount) + amount).toString();
  else owner.ffpInjections.push({ season: w.year, amount: amount.toString() });
}

/**
 * 자금 투입 (→OWNER-9/10): `amount` of the fortune above zero into the club's cash, owner capital
 * on its own ledger line outside turnover, within the FFP room when it applies; it raises 팬 민심.
 */
function inject(w: World, raw: string) {
  const owner = w.owner!;
  if (!/^\d{1,40}$/.test(raw) || BigInt(raw) <= 0n)
    throw new Error(sourceMessage('copy.owner.8b20759351'));
  const amount = BigInt(raw),
    fortune = BigInt(owner.fortune);
  if (amount > fortune)
    throw new Error(
      fortune > 0n
        ? sourceMessage('copy.owner.9bc778a358', { p0: moneyLabel(w, owner.fortune) })
        : sourceMessage('copy.owner.ae4f55fb9c'),
    );
  const room = ffpRoom(w);
  if (room !== undefined && amount > BigInt(room))
    throw new Error(
      sourceMessage('copy.owner.61e73d0f38', { p0: FFP.window, p1: moneyLabel(w, room) }),
    );
  owner.fortune = (fortune - amount).toString();
  credit(w, amount.toString());
  addEvent(
    w,
    'owner-injection',
    sourceMessage('copy.fan_mood.3881f2a2d6'),
    sourceMessage('copy.owner.93ebcff894', {
      p0: room !== undefined ? sourceMessage('copy.owner.8986617838') : '',
    }),
    amount.toString(),
  );
  recordFfp(w, amount);
  // Owner money put in raises 팬 민심 (→OWNER-12).
  fanMoodInjection(w, amount);
}

/** The owner's commands: the stake, an injection and the dividend dial (→OWNER-7/9/11). */
export function ownerCommand(w: World, cmd: OwnerCommand) {
  const owner = w.owner;
  if (!owner) throw new Error(OWNER_PENDING_MESSAGE);
  switch (cmd.type) {
    case 'owner-stake': {
      const { min, max } = OWNER_BUSINESS.stake;
      if (!Number.isInteger(cmd.percent) || cmd.percent < min || cmd.percent > max)
        throw new Error(sourceMessage('copy.owner.3be6ab2c0e', { p0: min, p1: max }));
      owner.stake = cmd.percent;
      break;
    }
    case 'owner-inject':
      inject(w, cmd.amount);
      break;
    case 'owner-dividend':
      if (!DIVIDEND_SHARES.includes(cmd.share))
        throw new Error(sourceMessage('copy.owner.8dfe4740fd', { p0: DIVIDEND_SHARES.join('·') }));
      owner.dividendShare = cmd.share;
      break;
  }
}
