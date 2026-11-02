/**
 * The owner's own money and career (→OWNER): the business bet and living costs at each settlement,
 * injections, the season-close dividend, his bankruptcy and the end of a career. The day loop calls
 * these hooks; each returns at once in a career without an owner (a founded club), so founding
 * careers live exactly as before.
 */
import type { CareerDate, Command, OwnerTrait, World } from '../../contracts/src/types';
import { DIVIDEND_SHARES } from '../../contracts/src/owner';
import { COUNTRIES, currency } from '../../catalogs/src/index';
import { FFP, OWNER_BUSINESS, OWNER_LIVING, OWNER_TRAITS, TAKEOVER_DEBT } from './owner-config';
import { currentDay, SEASON_END_DAY, seasonDayLabel, seasonDayOf } from './calendar';
import { addEvent } from './events';
import { pushInbox } from './inbox';
import { clubOf } from './player-state';
import { quote } from './quotes';
import { random, ratio, scaleBy } from './primitives';
import { moneyLabel, seasonResult } from './finance';
import { credit, debit } from './transactions';
import { fanMoodDividend, fanMoodInjection } from './fan-mood';

/** Refusal of an owner command while the career has no owner state. */
export const OWNER_PENDING_MESSAGE = '구단주 기능은 아직 준비 중입니다';
/** Refusal of every command but reading the inbox once the career has ended (→OWNER-16). */
export const ENDED_MESSAGE = '구단 운영이 끝났어요. 기록을 내보내거나 새 게임을 시작하세요.';

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
/**
 * Whether the career is over (→OWNER-16, ECON-24): the club's bankruptcy, the owner's or 구단주
 * 퇴진. Nothing advances after it and only the inbox can be read.
 */
export function careerEnded(w: Pick<World, 'bankrupt' | 'ended'>) {
  return w.bankrupt !== undefined || w.ended !== undefined;
}

/** Whether the owner took this trait at the start (→OWNER-5). */
function holds(w: World, trait: OwnerTrait) {
  return w.owner?.traits.includes(trait) ?? false;
}
/** 1901 price units a living-cost or exchange-rate quote reads, enough for exact minor units. */
const PROBE = 100_000;

/**
 * The season days of the settlements on the three dates (→OWNER-7), in calendar order; the fourth,
 * the close's, settles in `ownerClose`.
 */
export function settlementDays(year: number) {
  return OWNER_BUSINESS.dates
    .map(({ month, date }) => seasonDayOf(year, month, date))
    .sort((a, b) => a - b);
}
/** The season close's day, the year's fourth settlement (→LEAGUE-9, OWNER-7). */
const CLOSE_DAY = SEASON_END_DAY + 1;
/** The next settlement after today: a date of this season, its close, or next season's first. */
export function nextSettlement(w: World): CareerDate {
  const today = currentDay(w),
    day = [...settlementDays(w.year), CLOSE_DAY].find((d) => d > today);
  return day === undefined
    ? { year: w.year + 1, day: settlementDays(w.year + 1)[0]! }
    : { year: w.year, day };
}
/** A settlement's chance of success: 50%, or 60% for 성공한 사업가 (→OWNER-7, OWNER-5). */
export function businessChance(w: World) {
  return holds(w, 'businessman') ? OWNER_TRAITS.businessman.success : OWNER_BUSINESS.chance;
}
/** What the next settlement wins or loses at today's fortune and stake; nothing below zero. */
export function stakeAmount(w: World) {
  const owner = w.owner;
  if (!owner || BigInt(owner.fortune) <= 0n) return '0';
  return ratio(owner.fortune, BigInt(owner.stake), 100n);
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
 * One settlement's living costs (→OWNER-8): OWNER_LIVING.rate of the tier's starting fortune, grown
 * with prices (→ECON-2) from the takeover to `year`, in the club's money of today.
 */
export function livingCost(w: World, year = w.year) {
  const owner = w.owner;
  if (!owner) return '0';
  const code = clubOf(w).country,
    { takeover } = owner,
    base = scaleBy(takeover.fortune, OWNER_LIVING.rate, 10000n),
    grown = ratio(
      base,
      BigInt(quote(code, year, PROBE)),
      BigInt(quote(code, takeover.year, PROBE)),
    );
  return carried(w, grown, year, w.year);
}

/**
 * One settlement of the owner's business (→OWNER-7/8) on `date`: the stake's share of a fortune
 * above zero is won or lost on one draw from the world's stream for that date, then living costs
 * are paid even below zero. Both are appended as events in the season in play; a settlement before
 * the close that leaves the fortune below zero opens 구단주 파산 위기 (→OWNER-14), which runs to the
 * season close.
 */
function settle(w: World, date: CareerDate, close = false) {
  const owner = w.owner!,
    when = `${seasonDayLabel(date.year, date.day)} 정산`,
    staked = stakeAmount(w);
  if (staked !== '0') {
    const chance = businessChance(w),
      won = random(`${w.seed}:owner:business:${date.year}:${date.day}`)() < chance,
      result = won ? staked : `-${staked}`;
    owner.fortune = (BigInt(owner.fortune) + BigInt(result)).toString();
    addEvent(
      w,
      'owner-business',
      won ? '사업 성공' : '사업 실패',
      `${when} · 자금의 ${owner.stake}% 투자 · 성공 확률 ${Math.round(chance * 100)}%`,
      result,
    );
  }
  const living = livingCost(w, date.year);
  owner.fortune = (BigInt(owner.fortune) - BigInt(living)).toString();
  addEvent(
    w,
    'owner-living',
    '구단주 생활비',
    `${when} · 시작 자산의 ${OWNER_LIVING.rate * 100}%, 물가 반영`,
    living,
  );
  if (close || owner.ownerCrisis || BigInt(owner.fortune) >= 0n) return;
  owner.ownerCrisis = { since: { ...date } };
  pushInbox(w, {
    kind: 'finance',
    title: '구단주 파산 위기 · 시즌 마감까지 자금을 회복하세요',
    detail: `구단주 자금이 ${moneyLabel(w, owner.fortune)}예요. 마이너스 자금은 사업에 걸 수 없어요. 시즌 마감의 배당과 생활비 뒤에도 마이너스면 구단주가 파산해 게임이 끝나요.`,
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
    '구단주 배당',
    `시즌 순이익 ${moneyLabel(w, result.toString())}의 ${owner.dividendShare}%${amount < share ? ' · 구단 잔고까지만' : ''}`,
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
    '구단주 파산',
    `구단주 자금 ${moneyLabel(w, owner.fortune)} · 시즌 마감의 배당과 생활비 뒤에도 빚이 남아 구단을 떠나요.`,
  );
}

/**
 * Every settlement on the days a calendar jump skips (the war, →WORLD-14), after `fromDay` up to
 * and including `toDay`, as each would have settled: the three dates and each skipped season's
 * close day, with that season's prices. No season closes in the gap, so no dividend is taken and a
 * crisis opened there runs to the next close; the facts are booked in the season in play.
 */
export function ownerSettleGap(w: World, fromDay: CareerDate, toDay: CareerDate) {
  if (!w.owner || careerEnded(w)) return;
  const after = (a: CareerDate, b: CareerDate) => a.year - b.year || a.day - b.day;
  for (let year = fromDay.year; year <= toDay.year; year++)
    for (const day of [...settlementDays(year), CLOSE_DAY]) {
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
  if (!/^\d{1,40}$/.test(raw) || BigInt(raw) <= 0n) throw new Error('투입할 금액을 확인하세요.');
  const amount = BigInt(raw),
    fortune = BigInt(owner.fortune);
  if (amount > fortune)
    throw new Error(
      fortune > 0n
        ? `구단주 자금 ${moneyLabel(w, owner.fortune)}보다 많이 투입할 수 없어요.`
        : '투입할 구단주 자금이 없어요.',
    );
  const room = ffpRoom(w);
  if (room !== undefined && amount > BigInt(room))
    throw new Error(
      `UEFA 재정적 페어플레이 한도를 넘어요. 최근 ${FFP.window}시즌 남은 한도는 ${moneyLabel(w, room)}예요.`,
    );
  owner.fortune = (fortune - amount).toString();
  credit(w, amount.toString());
  addEvent(
    w,
    'owner-injection',
    '구단주 자금 투입',
    `구단주 자금 → 구단 잔고 · 매출에 들지 않는 자본${room !== undefined ? ' · UEFA 재정적 페어플레이 한도 안' : ''}`,
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
        throw new Error(`사업 투자 비중은 ${min}~${max}% 사이의 정수로 정해요.`);
      owner.stake = cmd.percent;
      break;
    }
    case 'owner-inject':
      inject(w, cmd.amount);
      break;
    case 'owner-dividend':
      if (!DIVIDEND_SHARES.includes(cmd.share))
        throw new Error(`배당 비율은 ${DIVIDEND_SHARES.join('·')}% 중에서 골라요.`);
      owner.dividendShare = cmd.share;
      break;
  }
}
