import type {
  AgentRating,
  ContractClauses,
  ContractTalk,
  InboxKind,
  Player,
  TalkTerm,
  UnhappyReason,
  World,
} from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clamp, random, ratio } from './primitives';
import {
  activePlayers,
  addEvent,
  clubOf,
  footballQuote,
  overall,
  tierLevel,
  UNHAPPY_PENALTY,
} from './world';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { moraleOf, UNHAPPY_MORALE } from './morale';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts } from './finance';
import { CASH_WARNING_ROUNDS } from './settlement';
import { contractSeason } from './ops-staff';
import { currentDay, dayCountedFrom, SEASON_ROUNDS } from './calendar';
import { credit } from './operations';
import { suitorFor, transferWindowDays } from './transfers';
import { financeProjection } from './projection';

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

/**
 * Player agents (→CLUB-30): rated 1–5, drawn once when the player is created, more often strong
 * for better players.
 */
export const AGENT_CONFIG = {
  /** Each level above 1 raises the demand by this share (→CLUB-26). */
  premium: 0.03,
  /**
   * The draw is a uniform number cut into five even bands; a player rated `pivot` keeps it, every
   * point above or below moves it 1/`spread` toward 5 or 1, at most `shift`.
   */
  pivot: 60,
  spread: 100,
  shift: 0.3,
};
/** An agent from one uniform draw of `r`, tilted by the player's ability. */
export function drawAgent(r: () => number, ability: number): AgentRating {
  const { pivot, spread, shift } = AGENT_CONFIG,
    tilt = clamp((ability - pivot) / spread, -shift, shift),
    u = clamp(r() + tilt, 0, 0.999999);
  return (1 + Math.floor(u * 5)) as AgentRating;
}
/**
 * His agent: the one drawn when he was created, or for a player from before rules 1.16 the one
 * activation draws from his id (→SAVE-10), the same until then.
 */
export function agentOf(w: Pick<World, 'seed'>, p: Player): AgentRating {
  return p.agent ?? drawAgent(random(`${w.seed}:agent:${p.id}`), overall(p));
}
/** The demand multiplier his agent brings: 3% per level above 1 (→CLUB-26). */
export function agentPremium(agent: AgentRating) {
  return 1 + AGENT_CONFIG.premium * (agent - 1);
}
/**
 * Activation of rules 1.16 (→SAVE-10): every player without an agent — squad and history, academy
 * and the players pending bids were made for — gets the one drawn from his id; running contracts
 * keep no clauses until their next signing. Returns `w` itself when nobody lacks one.
 */
export function activateAgents(w: World): World {
  const missing = (p: Player) => p.agent === undefined;
  const bids = w.bids ?? [];
  if (
    !w.players.some(missing) &&
    !(w.academy?.players ?? []).some(missing) &&
    !bids.some((bid) => bid.offer && missing(bid.offer.player))
  )
    return w;
  const give = (p: Player): Player => (missing(p) ? { ...p, agent: agentOf(w, p) } : p);
  return {
    ...w,
    players: w.players.map(give),
    ...(w.academy ? { academy: { ...w.academy, players: w.academy.players.map(give) } } : {}),
    ...(w.bids
      ? {
          bids: w.bids.map((bid) =>
            bid.offer ? { ...bid, offer: { ...bid.offer, player: give(bid.offer.player) } } : bid,
          ),
        }
      : {}),
  };
}
/** One clause's odds and size, each interpolated linearly by the agent's level. */
interface ClauseOdds {
  /** Share of contracts carrying it with a 1-rated agent, and with a 5-rated one. */
  share: [number, number];
  /** The percent range its size is drawn from uniformly with a 1-rated agent… */
  from: [number, number];
  /** …and with a 5-rated one. */
  to: [number, number];
}
/**
 * Contract clauses (→CLUB-29): a promotion rise in 30–80% of contracts, +10% to +60%, larger with
 * a stronger agent; a relegation cut in 80–40%, 25% to 50%, smaller with a stronger agent. T062 may
 * tune them within CLUB-29's ranges.
 */
export const CLAUSE_CONFIG: Record<'promotion' | 'relegation', ClauseOdds> = {
  promotion: { share: [0.3, 0.8], from: [10, 35], to: [30, 60] },
  relegation: { share: [0.8, 0.4], from: [35, 50], to: [25, 35] },
};
const between = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * The clauses of a contract `p` signs on season day `day` of `year`, from his stream for that
 * signing: four draws, whether each clause is in and its size, whatever the outcome.
 */
export function settleClauses(
  seed: string,
  p: Player,
  agent: AgentRating,
  year: number,
  day: number,
): ContractClauses {
  const r = random(`${seed}:clauses:${p.id}:${year}:${day}`),
    t = (agent - 1) / 4;
  const draw = (clause: keyof typeof CLAUSE_CONFIG) => {
    const { share, from, to } = CLAUSE_CONFIG[clause],
      has = r() < between(share[0], share[1], t),
      at = r(),
      low = between(from[0], to[0], t),
      high = between(from[1], to[1], t);
    return has ? Math.round(low + (high - low) * at) : 0;
  };
  const promotion = draw('promotion'),
    relegation = draw('relegation');
  return {
    ...(promotion ? { promotion } : {}),
    ...(relegation ? { relegation: -relegation } : {}),
  };
}
/** The clauses of a contract `p` signs today. */
export function signingClauses(w: World, p: Player) {
  return settleClauses(w.seed, p, agentOf(w, p), w.year, currentDay(w));
}
/** Clauses as the owner reads them: 승격 시 +25% · 강등 시 −40%, or 없음. */
export function clausesLabel(clauses: ContractClauses | undefined) {
  const parts = [
    clauses?.promotion ? `승격 시 연봉 +${clauses.promotion}%` : '',
    clauses?.relegation ? `강등 시 연봉 −${-clauses.relegation}%` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '승격·강등 조항 없음';
}
/**
 * The close after the club went up or down (→CLUB-29): every running contract's promotion rise or
 * relegation cut applies once to its wage from the new season's first round, nothing else changes,
 * and the inbox reports the squad's total wage change. Loans carry no clauses.
 */
export function applyClauses(w: World, move: 'promotion' | 'relegation') {
  let before = 0n,
    after = 0n,
    changed = 0;
  for (const p of activePlayers(w)) {
    const percent = p.loanUntil ? undefined : p.clauses?.[move];
    before += BigInt(p.wage);
    if (percent) {
      p.wage = ratio(p.wage, BigInt(100 + percent), 100n);
      changed++;
    }
    after += BigInt(p.wage);
  }
  const label = move === 'promotion' ? '승격' : '강등',
    delta = after - before;
  pushInbox(w, {
    kind: 'finance',
    title: `${label} 조항: 선수단 연봉 ${delta < 0n ? '−' : '+'}${moneyLabel(w, (delta < 0n ? -delta : delta).toString())}`,
    detail: changed
      ? `${label} 조항이 있는 선수 ${changed}명의 연봉이 이번 시즌 첫 라운드부터 바뀌어요 · 선수단 연봉 ${moneyLabel(w, before.toString())} → ${moneyLabel(w, after.toString())}.`
      : `${label} 조항이 있는 계약이 없어 선수단 연봉 ${moneyLabel(w, before.toString())}은 그대로예요.`,
    attention: false,
  });
}
/** Contract talks (→CLUB-26). */
export const TALK_CONFIG = {
  /**
   * A player paid this share of his market wage or less asks for an improved contract, once a
   * season, while his contract has at most `improveSeasons` seasons left, this one included.
   */
  improveBelow: 0.75,
  improveSeasons: 3,
  /** Goodwill, in percent of the demand, stays within these bounds. */
  goodwill: [-10, 30] as const,
  /** What the delegated staff offer, in the window's terms: two seasons, one from `veteranAge`. */
  staffTerm: 2 as TalkTerm,
  veteranAge: 32,
  veteranTerm: 1 as TalkTerm,
};
/**
 * The terms a contract signed today takes (→CLUB-26): the summer window's whole seasons until
 * 1 January, the winter window's half seasons from it. An answer given after a window closes, or
 * an unhappy player's floor met later (→CLUB-27), signs on the terms of the window before it.
 */
export type TalkWindow = 'summer' | 'winter';
export function talkWindow(w: World, day = currentDay(w)): TalkWindow {
  return day >= transferWindowDays(w.year).winterOpen ? 'winter' : 'summer';
}
/** Summer: 1–5 seasons, this one included; winter: the rest of this season and 0–4 more. */
export const TALK_TERMS: Record<TalkWindow, readonly TalkTerm[]> = {
  summer: [1, 2, 3, 4, 5],
  winter: [0, 1, 2, 3, 4],
};
/** A term as the owner reads it: 2시즌 in the summer, 2½시즌 (the rest of this one and 2) in winter. */
export function termLabel(window: TalkWindow, term: TalkTerm) {
  return window === 'summer' ? `${term}시즌` : `${term || ''}½시즌`;
}
const termRange = (window: TalkWindow) => {
  const terms = TALK_TERMS[window];
  return `${termLabel(window, terms[0])}–${termLabel(window, terms[terms.length - 1])}`;
};
/**
 * The season year whose close ends a contract signed today for `term` (→CLUB-28): in the summer
 * `term` seasons, this one included; in winter the rest of this season and `term` more.
 */
export function talkUntil(w: World, term: TalkTerm) {
  return w.year + term + (talkWindow(w) === 'winter' ? 1 : 0);
}
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
 * What a player asks now: his market wage times the build's player-wage effects (→ECON-22) and his
 * agent's premium (→CLUB-30), and the floor he accepts, demand × (1 − goodwill).
 */
export function talkTerms(w: World, p: Player) {
  const multiplier = buildEffects(w).wage * agentPremium(agentOf(w, p)),
    demand = ratio(marketWage(w, p), BigInt(Math.round(multiplier * 1000)), 1000n),
    goodwill = talkGoodwill(w, p);
  return {
    demand,
    floor: ratio(demand, BigInt(Math.round((100 - goodwill.percent) * 100)), 10000n),
    goodwill,
  };
}
/** Whether a player is paid 25% or more below his market wage. */
function underpaid(w: World, p: Player) {
  const share = BigInt(Math.round(TALK_CONFIG.improveBelow * 1000));
  return BigInt(p.wage) * 1000n <= BigInt(marketWage(w, p)) * share;
}
/** A renewal or an improved contract (계약 개선), as the talk is named. */
export const TALK_LABEL: Record<ContractTalk['kind'], string> = {
  renew: '재계약',
  improve: '계약 개선',
};
const talkLabel = (talk: ContractTalk) => TALK_LABEL[talk.kind];
function playerLine(w: World, p: Player) {
  return `${p.role} · ${w.year - p.born}세 · 능력 ${overall(p)} · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${contractSeason(p.until)} 시즌 끝까지`;
}
const TALK_KINDS: readonly InboxKind[] = ['contract-talk'];
/** Every item about a player's contract: talks, his unhappiness and his transfer request. */
const PLAYER_KINDS: readonly InboxKind[] = ['contract-talk', 'unhappy', 'transfer-request'];
/** Settles the talk's inbox items once it is answered; other items about the player stay. */
function settleTalkItems(w: World, id: string, kinds = TALK_KINDS) {
  const settles = (item: NonNullable<World['inbox']>[number]) =>
    kinds.includes(item.kind) && item.ref === id;
  if (w.inbox?.some((item) => settles(item) && !item.read))
    w.inbox = w.inbox.map((item) => (settles(item) ? { ...item, read: true } : item));
}
/** The player asks: his demand and floor are fixed as he names them. */
function openTalk(w: World, p: Player, kind: ContractTalk['kind']) {
  const terms = talkTerms(w, p);
  p.talk = {
    kind,
    demand: terms.demand,
    floor: terms.floor,
    year: w.year,
    day: currentDay(w),
    clauses: signingClauses(w, p),
  };
  if (kind === 'improve') p.improveAsked = w.year;
  settleTalkItems(w, p.id);
  if (w.delegation?.contracts) return;
  const goodwill = Math.round(terms.goodwill.percent * 10) / 10;
  pushInbox(w, {
    kind: 'contract-talk',
    title: `${p.name}, ${talkLabel(p.talk)} 협상 요청`,
    detail: `${playerLine(w, p)} · 에이전트 ${agentOf(w, p)}등급 · 요구 ${moneyLabel(w, terms.demand)} · 하한 ${moneyLabel(w, terms.floor)}(호감 ${goodwill > 0 ? '+' : ''}${goodwill}%) · ${clausesLabel(p.talk.clauses)} · 하한 이상으로 ${termRange(talkWindow(w))}을 제시하거나 거절하세요.`,
    attention: true,
    ref: p.id,
  });
}
/** Unhappy players (→CLUB-27). */
export const UNHAPPY_CONFIG = {
  /**
   * The manager's chance of talking a declined player round: `base`, `motivator` more for a
   * 동기부여형 manager, plus (trust − 50)/200 and (flexibility − 50)/400, within `low`–`high`.
   */
  talkRound: { base: 0.15, motivator: 0.45, low: 0.05, high: 0.85 },
  /** Days unhappy before he hands in a transfer request: six weeks. */
  requestDays: 42,
};
export const UNHAPPY_REASON: Record<UnhappyReason, string> = {
  'renewal-declined': '재계약 거절',
  'improve-declined': '계약 개선 거절',
};
/** The manager's chance of talking a player round after his demand is declined (→CLUB-27). */
export function talkRoundChance(w: World) {
  const { base, motivator, low, high } = UNHAPPY_CONFIG.talkRound,
    m = w.manager;
  return clamp(
    base +
      (m.style === 'motivator' ? motivator : 0) +
      (m.trust - 50) / 200 +
      (m.flexibility - 50) / 400,
    low,
    high,
  );
}
/** Whether the manager talks him round after `talk` is declined, from his own stream for it. */
export function talksRound(w: World, p: Player, talk: ContractTalk) {
  return random(`${w.seed}:talk-round:${p.id}:${talk.year}:${talk.day}`)() < talkRoundChance(w);
}
const percentLabel = (chance: number) => `${Math.round(chance * 100)}%`;
/**
 * The talk an offer answers: his open talk or, for an unhappy player, the floor he holds out for
 * today (→CLUB-27). Loan players and announced retirements have none to answer.
 */
export function talkFor(w: World, p: Player): ContractTalk | undefined {
  if (p.talk) return p.talk;
  if (!p.unhappy || p.loanUntil || p.retiring !== undefined) return undefined;
  const terms = talkTerms(w, p);
  return {
    kind: p.unhappy.reason === 'improve-declined' ? 'improve' : 'renew',
    demand: terms.demand,
    floor: terms.floor,
    year: w.year,
    day: currentDay(w),
    clauses: signingClauses(w, p),
  };
}
/**
 * His floor met or his move ends it (→CLUB-27): the unhappiness, the transfer request with the
 * listing it made, and their items. Returns what ended, for the report.
 */
function endUnhappiness(w: World, p: Player) {
  if (!p.unhappy) return '';
  const requested = !!p.transferRequest;
  delete p.unhappy;
  delete p.transferRequest;
  if (requested && p.stance === 'listed') delete p.stance;
  settleTalkItems(w, p.id, PLAYER_KINDS);
  return requested ? '언해피 해소 · 이적 요청 철회' : '언해피 해소';
}
/** A player leaving the club takes his talk, unhappiness and transfer request with him. */
export function leaveContract(w: World, p: Player) {
  delete p.talk;
  delete p.unhappy;
  delete p.transferRequest;
  settleTalkItems(w, p.id, PLAYER_KINDS);
}
/**
 * Signs the agreed wage, fixed until the term ends (→ECON-4): the new contract replaces the
 * running one from today, never backdated.
 */
function signTalk(
  w: World,
  p: Player,
  talk: ContractTalk,
  wage: string,
  term: TalkTerm,
  staff: boolean,
) {
  const before = p.wage;
  p.wage = wage;
  p.until = talkUntil(w, term);
  p.clauses = talk.clauses ?? signingClauses(w, p);
  delete p.talk;
  settleTalkItems(w, p.id);
  const ended = endUnhappiness(w, p);
  const detail = `연봉 ${moneyLabel(w, before)} → ${moneyLabel(w, wage)} · ${termLabel(talkWindow(w), term)} · 계약 ${contractSeason(p.until)} 시즌 끝까지 · ${clausesLabel(p.clauses)}${ended ? ` · ${ended}` : ''}`;
  addEvent(
    w,
    'contract',
    `${p.name} ${talkLabel(talk)} 합의`,
    staff ? `스태프 합의 · ${detail}` : detail,
  );
  return detail;
}
/**
 * Closes the talk without an agreement (→CLUB-27): the manager tries to talk him round, from the
 * player's own stream for this talk; if he fails the player turns unhappy, which is an inbox item.
 * Returns the outcome for the decliner's report.
 */
function declineTalk(w: World, p: Player, reason: string) {
  const talk = p.talk!,
    chance = talkRoundChance(w),
    kept = talksRound(w, p, talk);
  delete p.talk;
  settleTalkItems(w, p.id);
  const outcome = kept
    ? `감독이 설득해 마음을 돌렸어요(설득 확률 ${percentLabel(chance)})`
    : `감독의 설득이 실패해 언해피가 됐어요(설득 확률 ${percentLabel(chance)})`;
  addEvent(
    w,
    'contract-decline',
    `${p.name} ${talkLabel(talk)} 요구 거절`,
    `${reason} · ${outcome}`,
  );
  if (!kept) {
    p.unhappy = {
      reason: talk.kind === 'renew' ? 'renewal-declined' : 'improve-declined',
      year: w.year,
      day: currentDay(w),
    };
    const weeks = UNHAPPY_CONFIG.requestDays / 7;
    pushInbox(w, {
      kind: 'unhappy',
      title: `${p.name} 언해피 · ${UNHAPPY_REASON[p.unhappy.reason]}`,
      detail: `${playerLine(w, p)} · ${outcome}. 능력보다 ${UNHAPPY_PENALTY} 낮게 뛰고, 선발로 뛴 라운드마다 선수단 분위기 −${UNHAPPY_MORALE}, 재계약을 거부하며 ${weeks}주 뒤 이적을 요청해요. 하한 ${moneyLabel(w, talkTerms(w, p).floor)} 이상을 제시하거나 매각하면 풀려요.`,
      attention: true,
      ref: p.id,
    });
  }
  return { kept, outcome };
}
/**
 * The cautious end of the season-end cash projection (→ECON-18) with `p` paid `wage` from the next
 * round, as the owner's projection would show it once agreed.
 */
export function seasonEndWithWage(w: World, p: Player, wage: string) {
  const before = p.wage;
  p.wage = wage;
  try {
    return financeProjection(w).seasonEnd.low;
  } finally {
    p.wage = before;
  }
}
/**
 * Delegated staff (→STAFF-13) offer the floor for two seasons (one from 32), in the window's terms,
 * when it is within the squad investment's pay ceiling, cash after the raise still covers 13 rounds
 * of costs and the season's cash projection with the new wage from the next round still ends the
 * season covering them; otherwise they decline. Either way the talk's inbox item says why.
 */
export function staffTalkVerdict(w: World, p: Player) {
  const talk = p.talk!,
    { payCeiling } = policyEffects(policyOf(w)),
    ceiling = ratio(marketWage(w, p), BigInt(Math.round(payCeiling * 1000)), 1000n),
    raise = BigInt(talk.floor) - BigInt(p.wage),
    perRound = (BigInt(operatingCosts(w).annual) + raise) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(CASH_WARNING_ROUNDS),
    term =
      w.year - p.born >= TALK_CONFIG.veteranAge ? TALK_CONFIG.veteranTerm : TALK_CONFIG.staffTerm;
  if (BigInt(talk.floor) > BigInt(ceiling))
    return {
      accept: false as const,
      reason: `하한 ${moneyLabel(w, talk.floor)}이 선수단 투자 연봉 상한(시장가 ×${payCeiling}, ${moneyLabel(w, ceiling)})을 넘어 거절했어요.`,
    };
  if (BigInt(w.cash) < runway)
    return {
      accept: false as const,
      reason: `인상하면 운영자금이 ${CASH_WARNING_ROUNDS}라운드 운영비에 못 미쳐 거절했어요.`,
    };
  const seasonEnd = seasonEndWithWage(w, p, talk.floor);
  if (BigInt(seasonEnd) < runway)
    return {
      accept: false as const,
      reason: `인상한 연봉으로 시즌 말 자금 전망(낮게 잡아 ${moneyLabel(w, seasonEnd)})이 ${CASH_WARNING_ROUNDS}라운드 운영비(${moneyLabel(w, runway.toString())})에 못 미쳐 거절했어요.`,
    };
  return { accept: true as const, term };
}
function staffAnswer(w: World, p: Player) {
  const talk = p.talk!,
    verdict = staffTalkVerdict(w, p);
  let detail: string;
  if (verdict.accept)
    detail = `${signTalk(w, p, talk, talk.floor, verdict.term, true)} · 하한으로 합의했어요.`;
  else {
    const { outcome } = declineTalk(w, p, `스태프 · ${verdict.reason}`);
    detail = `${playerLine(w, p)} · ${verdict.reason} ${outcome}.`;
  }
  pushInbox(w, {
    kind: 'contract-talk',
    title: `스태프가 ${p.name}의 ${talkLabel(talk)} 요구를 ${verdict.accept ? '받아들였어요' : '거절했어요'}`,
    detail,
    attention: false,
    ref: p.id,
  });
}
/** Whether a transfer window opens today (→CLUB-17): the season's first day or 1 January. */
export function talksOpen(w: World, day = currentDay(w)) {
  const d = transferWindowDays(w.year);
  return day === d.summerOpen || day === d.winterOpen;
}
/**
 * Each day, but players ask only when a transfer window opens (→CLUB-26): one in his contract's
 * final season asks to renew, at either opening until he has agreed or turned unhappy; one with
 * at most three seasons left, this one included, paid 25% or more below his market wage asks for
 * an improved contract, once a season. Nobody else asks, so a promotion or growth changes nothing
 * before the next opening. Delegated staff answer at once. Loan players do not negotiate, an
 * announced retirement needs no renewal (→CLUB-28) so his open talk closes, and an unhappy player
 * refuses to talk (→CLUB-27).
 */
export function contractTalks(w: World) {
  const opening = talksOpen(w);
  for (const p of activePlayers(w)) {
    if (p.loanUntil) continue;
    if (p.retiring !== undefined) {
      if (p.talk) {
        delete p.talk;
        settleTalkItems(w, p.id);
      }
      continue;
    }
    if (p.unhappy || !opening) continue;
    const left = p.until - w.year;
    if (left <= 1) openTalk(w, p, 'renew');
    else if (left <= TALK_CONFIG.improveSeasons && p.improveAsked !== w.year && underpaid(w, p))
      openTalk(w, p, 'improve');
  }
  if (w.delegation?.contracts) for (const p of activePlayers(w)) if (p.talk) staffAnswer(w, p);
}
/**
 * Each day: a player unhappy for six weeks hands in a transfer request (→CLUB-27). He goes on the
 * transfer list and cannot be made untouchable (→CLUB-22); an announced retirement no longer asks.
 */
export function transferRequests(w: World) {
  for (const p of activePlayers(w)) {
    if (!p.unhappy || p.transferRequest || p.loanUntil || p.retiring !== undefined) continue;
    if (dayCountedFrom(w, p.unhappy.year) - p.unhappy.day < UNHAPPY_CONFIG.requestDays) continue;
    p.transferRequest = { year: w.year, day: currentDay(w) };
    p.stance = 'listed';
    const why = `${UNHAPPY_REASON[p.unhappy.reason]} 뒤 ${UNHAPPY_CONFIG.requestDays / 7}주`;
    addEvent(w, 'transfer-request', `${p.name} 이적 요청`, `${why} · 이적 명단 등록`);
    pushInbox(w, {
      kind: 'transfer-request',
      title: `${p.name}, 이적 요청서 제출`,
      detail: `${playerLine(w, p)} · ${why}. 이적 명단에 올랐고 이적 불가로 바꿀 수 없어요. 이적시장에서 실제 구단의 제안을 받아요. 하한 ${moneyLabel(w, talkTerms(w, p).floor)} 이상을 제시하면 요청을 거둬요.`,
      attention: true,
      ref: p.id,
    });
  }
}
/** Before the 1995 Bosman ruling's first summer an expiring contract still earned a fee (→CLUB-28). */
export const BOSMAN_YEAR = 1996;
/** The share of his value, in percent, his new club pays for a player whose contract ran out. */
export const EXPIRY_COMPENSATION = 50;
/**
 * Season close, once the new season's books are open (→CLUB-28): every player whose contract has
 * run out leaves. From 1996 he leaves on a free; before, the club he joins pays 50% of his value,
 * at `division`, the one he played in, and one no club signs brings nothing. Loan players go back
 * when the loan ends, and announced retirements have already retired.
 */
export function expireContracts(w: World, division = clubOf(w).tier) {
  for (const p of activePlayers(w)) {
    if (p.loanUntil || p.until > w.year) continue;
    const club = suitorFor(w, p, random(`${w.seed}:expiry:${p.id}:${w.year}`)),
      where = club ? `${club.name} 입단` : '새 팀을 찾아 떠남';
    p.status = 'sold';
    delete p.stance;
    leaveContract(w, p);
    if (w.year >= BOSMAN_YEAR || !club) {
      addEvent(
        w,
        'contract-expiry',
        `${p.name} 계약 만료`,
        `${where} · ${w.year >= BOSMAN_YEAR ? '자유계약 이적, 보상금 없음' : '보상금을 낼 구단이 없음'}`,
      );
      continue;
    }
    const value = marketValue(w, p, division),
      amount = ratio(value, BigInt(EXPIRY_COMPENSATION), 100n);
    credit(w, amount);
    addEvent(
      w,
      'free-transfer-compensation',
      `${p.name} 계약 만료 보상금`,
      `${where} · 보스만 판례 이전 · 평가 가치 ${moneyLabel(w, value)}의 ${EXPIRY_COMPENSATION}%`,
      amount,
    );
  }
}
/** The owner's own answer takes contract talks back from the staff (→STAFF-13). */
function takeBack(w: World) {
  if (w.delegation?.contracts) w.delegation = { ...w.delegation, contracts: false };
}
function activePlayer(w: World, id: string) {
  return w.players.find((x) => x.id === id && x.status === 'active');
}
/**
 * The owner's offer (→CLUB-26): at or above his floor it signs for `term` in the window's terms;
 * below it is refused with the floor stated. An unhappy player takes his floor as it stands today
 * and the unhappiness ends (→CLUB-27).
 */
export function offerContract(w: World, id: string, wage: string, term: TalkTerm) {
  const p = activePlayer(w, id),
    talk = p && talkFor(w, p);
  if (!p || !talk) throw new Error('계약 협상 중인 선수가 아닙니다.');
  if (!/^\d+$/.test(wage)) throw new Error('제시 연봉을 확인하세요.');
  const window = talkWindow(w);
  if (!TALK_TERMS[window].includes(term))
    throw new Error(`계약 기간은 ${termRange(window)}이어야 합니다.`);
  if (BigInt(wage) < BigInt(talk.floor))
    throw new Error(`${p.name}은(는) ${moneyLabel(w, talk.floor)} 이상이어야 합의해요.`);
  takeBack(w);
  signTalk(w, p, talk, wage, term, false);
}
/** The owner declines; the manager then tries to talk him round (→CLUB-27). */
export function declineContract(w: World, id: string) {
  const p = activePlayer(w, id);
  if (!p?.talk) throw new Error('계약 협상 중인 선수가 아닙니다.');
  const reason = `구단주 결정 · 요구 ${moneyLabel(w, p.talk.demand)} · 하한 ${moneyLabel(w, p.talk.floor)}`;
  takeBack(w);
  const { kept, outcome } = declineTalk(w, p, reason);
  if (kept)
    pushInbox(w, {
      kind: 'contract-talk',
      title: `감독이 ${p.name}의 마음을 돌렸어요`,
      detail: `${playerLine(w, p)} · ${outcome}. 언해피 없이 지금 계약대로 뛰어요.`,
      attention: false,
      ref: p.id,
    });
}
