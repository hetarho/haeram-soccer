import type { ContractTalk, ContractTerm, Player, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clamp, ratio } from './primitives';
import { activePlayers, addEvent, clubOf, footballQuote, overall, tierLevel } from './world';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { moraleOf } from './morale';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts } from './finance';
import { CASH_WARNING_ROUNDS } from './settlement';
import { contractSeason } from './ops-staff';
import { currentDay, seasonDayOf } from './calendar';

/**
 * Market wages and transfer values (→CLUB-25), in 1901 price units that the football index
 * carries to a country and year (→ECON-26). These are the first constants: T062 recalibrates
 * them against the career targets (→ECON-29).
 */
export const MARKET_CONFIG = {
  /**
   * Yearly wage of a top-flight player rated `pivot` in his prime at football index 1: about the
   * English maximum wage of 1950, £14 a week.
   */
  wage: 200,
  pivot: 70,
  /** Each ability point multiplies wage and value, so 80 earns 6.3× 60 (CLUB-25: 6–10×). */
  perPoint: 1.0965,
  /**
   * What a division pays for the same player, as a share of the top flight, by tier from the top
   * (the amateur league is the tier below the professional ones); the last entry holds below.
   * The second tier pays 42% (CLUB-25: 35–50%).
   */
  divisions: [1, 0.42, 0.35, 0.3, 0.25],
  /**
   * A young player is priced for a share of his headroom (potential − ability): the whole share
   * up to `full` years old, none from `none`; wages count `wage` of it, values `value`.
   */
  promise: { full: 18, none: 24, wage: 0.2, value: 0.4 },
  /** Ability points off for each year under `junior` and over `veteran`. */
  junior: 21,
  veteran: 30,
  /** A value is `years` of market wage up to age `peak`, one fewer each year after, at least `minYears`. */
  years: 6,
  peak: 28,
  minYears: 1,
  /** A season's loan costs this share of the player's value. */
  loan: 0.1,
};

/** A division's pay as a share of the top flight's; fractional divisions lie between two tiers. */
export function divisionShare(division: number) {
  const shares = MARKET_CONFIG.divisions,
    at = clamp(division, 0, shares.length - 1),
    low = Math.floor(at),
    high = Math.min(shares.length - 1, low + 1);
  return shares[low] + (shares[high] - shares[low]) * (at - low);
}

/**
 * The division a player's ability suits in a country, between tiers where it falls between their
 * levels: where a market player plays, so where his asking fee is set.
 */
export function divisionFor(code: string, ability: number) {
  const top = tierLevel(0);
  return clamp((top - ability) / (top - tierLevel(1)), 0, country(code).groups.length);
}

/** Ability with his promise and his age counted, the scale wages and values grow on. */
function marketPoints(ability: number, age: number, potential: number, promise: number) {
  const { full, none } = MARKET_CONFIG.promise;
  const youth = clamp((none - age) / (none - full), 0, 1);
  return (
    ability +
    Math.max(0, potential - ability) * youth * promise -
    Math.max(0, MARKET_CONFIG.junior - age) -
    Math.max(0, age - MARKET_CONFIG.veteran)
  );
}
function scaleUnits(points: number, division: number) {
  const c = MARKET_CONFIG;
  return c.wage * c.perPoint ** (points - c.pivot) * divisionShare(division);
}

/** Yearly market wage in 1901 units at football index 1. */
export function marketWageUnits(division: number, ability: number, age: number, potential: number) {
  return scaleUnits(marketPoints(ability, age, potential, MARKET_CONFIG.promise.wage), division);
}
/** Transfer value in 1901 units at football index 1: years of a wage that counts more promise. */
export function marketValueUnits(
  division: number,
  ability: number,
  age: number,
  potential: number,
) {
  const c = MARKET_CONFIG,
    years = clamp(c.years - Math.max(0, age - c.peak), c.minYears, c.years);
  return years * scaleUnits(marketPoints(ability, age, potential, c.promise.value), division);
}

/** A player's market wage in `code` and `year` money. */
export function marketWageAt(code: string, year: number, division: number, p: Player) {
  return footballQuote(
    code,
    year,
    marketWageUnits(division, overall(p), year - p.born, p.potential),
  );
}
/** A player's transfer value in `code` and `year` money. */
export function marketValueAt(code: string, year: number, division: number, p: Player) {
  return footballQuote(
    code,
    year,
    marketValueUnits(division, overall(p), year - p.born, p.potential),
  );
}

/**
 * What the market pays a player a year (→CLUB-25): steeply more for ability, more for a young
 * player's promise, less before 21 and after 30, by his club's division and the football index.
 */
export function marketWage(w: World, player: Player, division = clubOf(w).tier) {
  return marketWageAt(clubOf(w).country, w.year, division, player);
}
/** The fee the market considers fair for a player, on the same scale as his wage. */
export function marketValue(w: World, player: Player, division = clubOf(w).tier) {
  return marketValueAt(clubOf(w).country, w.year, division, player);
}

/** Contract talks (→CLUB-26). */
export const TALK_CONFIG = {
  /** A player paid this share of his market wage or less asks for a raise. */
  raiseBelow: 0.75,
  /** Goodwill, in percent of the demand, stays within these bounds. */
  goodwill: [-10, 30] as const,
  /** What the delegated staff offer: two seasons, one from `veteranAge`. */
  staffTerm: 2 as ContractTerm,
  veteranAge: 32,
  veteranTerm: 1 as ContractTerm,
};
/** One reason a player comes down from his demand (positive) or holds out above it (negative). */
export interface GoodwillPart {
  label: string;
  percent: number;
}
/**
 * How far below his demand a player settles (→CLUB-26), each source with its percent: squad
 * investment, the locker-room culture card, austerity and squad morale, within −10 to +30%.
 */
export function talkGoodwill(w: World, p: Player) {
  const build = w.build ?? {},
    parts: GoodwillPart[] = [
      { label: '선수단 투자', percent: policyEffects(policyOf(w)).goodwill },
    ];
  if (build.culture === 'family') parts.push({ label: '가족 같은 클럽', percent: 5 });
  if (build.culture === 'stars' && overall(p) >= 70)
    parts.push({ label: '스타 대우', percent: 10 });
  if (build.culture === 'meritocracy') parts.push({ label: '철저한 경쟁', percent: -5 });
  if (build.revenue === 'frugal') parts.push({ label: '긴축 재정', percent: -5 });
  parts.push({ label: '선수단 분위기', percent: (moraleOf(w) - 60) / 4 });
  const [low, high] = TALK_CONFIG.goodwill;
  return {
    parts,
    percent: clamp(
      parts.reduce((sum, part) => sum + part.percent, 0),
      low,
      high,
    ),
  };
}
/**
 * What a player asks now: his market wage times the build's player-wage effects (→ECON-22), and
 * the floor he accepts, demand × (1 − goodwill).
 */
export function talkTerms(w: World, p: Player) {
  const demand = ratio(marketWage(w, p), BigInt(Math.round(buildEffects(w).wage * 1000)), 1000n),
    goodwill = talkGoodwill(w, p);
  return {
    demand,
    floor: ratio(demand, BigInt(Math.round((100 - goodwill.percent) * 100)), 10000n),
    goodwill,
  };
}
/** The contract an agreement signs: the rest of this season and `term` seasons after it. */
export const talkUntil = (w: World, term: ContractTerm) => w.year + 1 + term;
/** Whether a player is paid 25% or more below his market wage. */
function underpaid(w: World, p: Player) {
  const share = BigInt(Math.round(TALK_CONFIG.raiseBelow * 1000));
  return BigInt(p.wage) * 1000n <= BigInt(marketWage(w, p)) * share;
}
const talkLabel = (talk: ContractTalk) => (talk.kind === 'renew' ? '재계약' : '연봉 인상');
function playerLine(w: World, p: Player) {
  return `${p.role} · ${w.year - p.born}세 · 능력 ${overall(p)} · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${contractSeason(p.until)} 시즌 끝까지`;
}
/** Settles the talk's inbox items once it is answered; other items about the player stay. */
function settleTalkItems(w: World, id: string) {
  if (w.inbox?.some((item) => item.kind === 'contract-talk' && item.ref === id && !item.read))
    w.inbox = w.inbox.map((item) =>
      item.kind === 'contract-talk' && item.ref === id ? { ...item, read: true } : item,
    );
}
/** The player asks: his demand and floor are fixed as he names them. */
function openTalk(w: World, p: Player, kind: ContractTalk['kind']) {
  const terms = talkTerms(w, p);
  p.talk = { kind, demand: terms.demand, floor: terms.floor, year: w.year, day: currentDay(w) };
  if (kind === 'raise') p.raiseAsked = w.year;
  settleTalkItems(w, p.id);
  if (w.delegation?.contracts) return;
  const goodwill = Math.round(terms.goodwill.percent * 10) / 10;
  pushInbox(w, {
    kind: 'contract-talk',
    title: `${p.name}, ${talkLabel(p.talk)} 협상 요청`,
    detail: `${playerLine(w, p)} · 요구 ${moneyLabel(w, terms.demand)} · 하한 ${moneyLabel(w, terms.floor)}(호감 ${goodwill > 0 ? '+' : ''}${goodwill}%) · 하한 이상으로 1–5시즌을 제시하거나 거절하세요.`,
    attention: true,
    ref: p.id,
  });
}
/** Signs the agreed wage, fixed until the term ends (→ECON-4). */
function signTalk(w: World, p: Player, wage: string, term: ContractTerm, staff: boolean) {
  const talk = p.talk!,
    before = p.wage;
  p.wage = wage;
  p.until = talkUntil(w, term);
  delete p.talk;
  settleTalkItems(w, p.id);
  const detail = `연봉 ${moneyLabel(w, before)} → ${moneyLabel(w, wage)} · ${term}시즌 · 계약 ${contractSeason(p.until)} 시즌 끝까지`;
  addEvent(
    w,
    'contract',
    `${p.name} ${talkLabel(talk)} 합의`,
    staff ? `스태프 합의 · ${detail}` : detail,
  );
  return detail;
}
/** Closes the talk without an agreement; what follows a refusal is CLUB-27's. */
function declineTalk(w: World, p: Player, reason: string) {
  const talk = p.talk!;
  delete p.talk;
  settleTalkItems(w, p.id);
  addEvent(w, 'contract-decline', `${p.name} ${talkLabel(talk)} 요구 거절`, reason);
}
/**
 * Delegated staff (→STAFF-13) offer the floor for two seasons (one from 32) when it is within the
 * squad investment's pay ceiling and cash still covers the warning runway after the raise;
 * otherwise they decline. Either way the talk's inbox item says why.
 */
export function staffTalkVerdict(w: World, p: Player) {
  const talk = p.talk!,
    { payCeiling } = policyEffects(policyOf(w)),
    ceiling = ratio(marketWage(w, p), BigInt(Math.round(payCeiling * 1000)), 1000n),
    raise = BigInt(talk.floor) - BigInt(p.wage),
    perRound = (BigInt(operatingCosts(w).annual) + raise) / 46n,
    term =
      w.year - p.born >= TALK_CONFIG.veteranAge ? TALK_CONFIG.veteranTerm : TALK_CONFIG.staffTerm;
  if (BigInt(talk.floor) > BigInt(ceiling))
    return {
      accept: false as const,
      reason: `하한 ${moneyLabel(w, talk.floor)}이 선수단 투자 연봉 상한(시장가 ×${payCeiling}, ${moneyLabel(w, ceiling)})을 넘어 거절했어요.`,
    };
  if (BigInt(w.cash) < perRound * BigInt(CASH_WARNING_ROUNDS))
    return {
      accept: false as const,
      reason: `인상하면 운영자금이 ${CASH_WARNING_ROUNDS}라운드 운영비에 못 미쳐 거절했어요.`,
    };
  return { accept: true as const, term };
}
function staffAnswer(w: World, p: Player) {
  const talk = p.talk!,
    verdict = staffTalkVerdict(w, p);
  let detail: string;
  if (verdict.accept)
    detail = `${signTalk(w, p, talk.floor, verdict.term, true)} · 하한으로 합의했어요.`;
  else {
    declineTalk(w, p, `스태프 · ${verdict.reason}`);
    detail = `${playerLine(w, p)} · ${verdict.reason}`;
  }
  pushInbox(w, {
    kind: 'contract-talk',
    title: `스태프가 ${p.name}의 ${talkLabel(talk)} 요구를 ${verdict.accept ? '받아들였어요' : '거절했어요'}`,
    detail,
    attention: false,
    ref: p.id,
  });
}
/**
 * Each day: on 1 January every player in his contract's final season asks to renew; any day a
 * player paid 25% or more below his market wage asks for a raise, once a season. Delegated staff
 * answer at once. Loan players and announced retirements do not negotiate.
 */
export function contractTalks(w: World) {
  const renewal = currentDay(w) === seasonDayOf(w.year, 1, 1);
  for (const p of activePlayers(w)) {
    if (p.loanUntil || p.retiring !== undefined) continue;
    if (renewal && p.until <= w.year + 1) openTalk(w, p, 'renew');
    else if (!p.talk && p.raiseAsked !== w.year && underpaid(w, p)) openTalk(w, p, 'raise');
  }
  if (w.delegation?.contracts) for (const p of activePlayers(w)) if (p.talk) staffAnswer(w, p);
}
function talkOf(w: World, id: string) {
  const p = w.players.find((x) => x.id === id && x.status === 'active');
  if (!p?.talk) throw new Error('계약 협상 중인 선수가 아닙니다.');
  return p as Player & { talk: ContractTalk };
}
/** The owner's own answer takes contract talks back from the staff (→STAFF-13). */
function takeBack(w: World) {
  if (w.delegation?.contracts) w.delegation = { ...w.delegation, contracts: false };
}
/**
 * The owner's offer (→CLUB-26): at or above his floor it signs for `term` seasons; below it is
 * refused with the floor stated.
 */
export function offerContract(w: World, id: string, wage: string, term: ContractTerm) {
  const p = talkOf(w, id);
  if (!/^\d+$/.test(wage)) throw new Error('제시 연봉을 확인하세요.');
  if (!Number.isInteger(term) || term < 1 || term > 5)
    throw new Error('계약 기간은 1–5시즌이어야 합니다.');
  if (BigInt(wage) < BigInt(p.talk.floor))
    throw new Error(`${p.name}은(는) ${moneyLabel(w, p.talk.floor)} 이상이어야 합의해요.`);
  takeBack(w);
  signTalk(w, p, wage, term, false);
}
/** The owner declines (→CLUB-27 handles what follows). */
export function declineContract(w: World, id: string) {
  const p = talkOf(w, id),
    reason = `구단주 결정 · 요구 ${moneyLabel(w, p.talk.demand)} · 하한 ${moneyLabel(w, p.talk.floor)}`;
  takeBack(w);
  declineTalk(w, p, reason);
}
