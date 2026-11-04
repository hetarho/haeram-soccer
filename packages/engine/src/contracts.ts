import { message as sourceMessage } from '../../contracts/src/messages';
import { endPlayingCoachForDeparture } from './playing-coach';
import { movePerson } from './npc-continuity';
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
import { clamp, random, ratio, scaleBy } from './primitives';
import { activePlayers, clubOf, overall, UNHAPPY_PENALTY } from './player-state';
import { addEvent } from './events';
import { marketValue, marketWage } from './market-prices';
export {
  MARKET_CONFIG,
  divisionShare,
  marketWageUnits,
  starWagePremium,
  marketValueUnits,
  transferPremium,
  marketWageAt,
  marketValueAt,
  marketWage,
  marketValue,
} from './market-prices';
import { ownStarters, tierLevel } from './world';
import { policyEffects, policyOf } from './policy';
import { trainingGroundTerms } from './facility-model';
import { talkRuleOf } from './hiring';
import { buildEffects } from './build';
import { wageDemandFactor } from './owner-traits';
import { moraleOf, UNHAPPY_MORALE } from './morale';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts, recentRevenue, wageBill } from './finance';
import {
  annualWageLimit,
  directionOption,
  financeOption,
  financeStance,
  wageWithinLimit,
} from './direction';
import { contractSeason } from './ops-staff';
import { currentDay, dayCountedFrom, SEASON_ROUNDS } from './calendar';
import { credit } from './transactions';
import { suitorFor } from './transfers';
import { transferWindowDays } from './transfer-window';
import { financeProjection } from './projection';
import { isDelegated } from './responsibilities';
import { AMBITION_UNHAPPY, GRADE_LABEL } from './player';
import { BALLON_DOR_CONFIG, ballonDorPremium } from './ballon-dor';

/**
 * The division a player's ability suits in a country, between tiers where it falls between their
 * levels: where a market player plays, so where his asking fee is set. Ability below the last
 * division's level reaches at most one step deeper, the price scale's floor (→CLUB-25).
 */
export function divisionFor(code: string, ability: number) {
  const top = tierLevel(0);
  return clamp((top - ability) / (top - tierLevel(1)), 0, country(code).groups.length);
}

/**
 * Player agents (→CLUB-30): rated 1–5, drawn once when the player is created, more often strong
 * for better players.
 */
export const AGENT_CONFIG = {
  /**
   * Each level above 1 raises the demand by this share (→CLUB-26), small enough that the default
   * talk rule's 110% cap still keeps a delegated squad at its market wage (→ECON-29).
   */
  premium: 0.01,
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
/** The demand multiplier his agent brings: 1% per level above 1 (→CLUB-26). */
export function agentPremium(agent: AgentRating) {
  return 1 + AGENT_CONFIG.premium * (agent - 1);
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
 * Contract clauses (→CLUB-29), within its ranges: a promotion rise in 30% (1-rated agent) to 60%
 * (5-rated) of contracts, +10–20% to +20–40%, larger with a stronger agent; a relegation cut in
 * 80% to 50% of them, 40–50% to 30–40%, smaller with a stronger agent. Measured with the economy
 * (→ECON-29): small rises and deep cuts keep a promoted squad affordable and a relegated one alive.
 */
export const CLAUSE_CONFIG: Record<'promotion' | 'relegation', ClauseOdds> = {
  promotion: { share: [0.3, 0.6], from: [10, 20], to: [20, 40] },
  relegation: { share: [0.8, 0.5], from: [40, 50], to: [30, 40] },
};
const between = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * The clauses of a contract `p` signs on season day `day` of `year`, from his stream for that
 * signing: six draws, whether each clause is in and its size, whatever the outcome. The Ballon
 * d'Or bonus draws last, so the promotion and relegation clauses are those of the four-draw
 * stream, and it is kept only for a `star` (→CLUB-29).
 */
export function settleClauses(
  seed: string,
  p: Player,
  agent: AgentRating,
  year: number,
  day: number,
  star = false,
): ContractClauses {
  const r = random(`${seed}:clauses:${p.id}:${year}:${day}`),
    t = (agent - 1) / 4;
  const draw = ({ share, from, to }: ClauseOdds) => {
    const has = r() < between(share[0], share[1], t),
      at = r(),
      low = between(from[0], to[0], t),
      high = between(from[1], to[1], t);
    return has ? Math.round(low + (high - low) * at) : 0;
  };
  const promotion = draw(CLAUSE_CONFIG.promotion),
    relegation = draw(CLAUSE_CONFIG.relegation),
    ballonDor = draw(BALLON_DOR_CONFIG.clause);
  return {
    ...(promotion ? { promotion } : {}),
    ...(relegation ? { relegation: -relegation } : {}),
    ...(star && ballonDor ? { ballonDor } : {}),
  };
}
/**
 * Whether a contract `p` signs today may carry the Ballon d'Or bonus (→CLUB-29): rated 80+, or on
 * a podium within the premium's seasons.
 */
export function ballonDorStar(w: World, p: Player) {
  return (
    overall(p) >= BALLON_DOR_CONFIG.clause.ability ||
    ballonDorPremium(w.history, w.year, p.id).factor > 1
  );
}
/** The clauses of a contract `p` signs today. */
export function signingClauses(w: World, p: Player) {
  return settleClauses(w.seed, p, agentOf(w, p), w.year, currentDay(w), ballonDorStar(w, p));
}
/** Clauses as the owner reads them: 승격 시 +25% · 강등 시 −40% · 발롱도르 보너스, or 없음. */
export function clausesLabel(clauses: ContractClauses | undefined) {
  const parts = [
    clauses?.promotion ? sourceMessage('copy.contracts.e8d612c8ec', { p0: clauses.promotion }) : '',
    clauses?.relegation
      ? sourceMessage('copy.contracts.dcaddf0479', { p0: -clauses.relegation })
      : '',
    clauses?.ballonDor ? sourceMessage('copy.contracts.c224b0d6b9', { p0: clauses.ballonDor }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : sourceMessage('copy.contracts.0e0f44bc7f');
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
  const label =
      move === 'promotion'
        ? sourceMessage('copy.AcademyPanel.8e70a8dda1')
        : sourceMessage('copy.CareerRecordBook.7e6e321ef0'),
    delta = after - before;
  pushInbox(w, {
    kind: 'finance',
    title: sourceMessage('copy.contracts.b239631068', {
      p0: label,
      p1: delta < 0n ? '−' : '+',
      p2: moneyLabel(w, (delta < 0n ? -delta : delta).toString()),
    }),
    detail: changed
      ? sourceMessage('copy.contracts.51e8adebd6', {
          p0: label,
          p1: changed,
          p2: moneyLabel(w, before.toString()),
          p3: moneyLabel(w, after.toString()),
        })
      : sourceMessage('copy.contracts.e3cabd42ec', {
          p0: label,
          p1: moneyLabel(w, before.toString()),
        }),
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
  /**
   * What the delegated staff offer: `staffSeasons` seasons past this one, `veteranSeasons` from
   * `veteranAge`, never ending before the running contract.
   */
  staffSeasons: 2,
  veteranAge: 32,
  veteranSeasons: 1,
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
  return window === 'summer'
    ? sourceMessage('copy.BallonDorView.3585c2642b', { p0: term })
    : sourceMessage('copy.contracts.e1326c3255', { p0: term || '' });
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
 * investment, the completed training ground, the locker-room culture card, austerity and squad
 * morale, within −10 to +30%.
 */
export function talkGoodwill(w: World, p: Player) {
  const build = w.build ?? {},
    parts: GoodwillPart[] = [
      {
        label: sourceMessage('copy.contracts.31d8ccedbf'),
        percent: policyEffects(policyOf(w)).goodwill,
      },
    ];
  const facilityGoodwill = trainingGroundTerms(w).goodwill;
  if (facilityGoodwill)
    parts.push({ label: sourceMessage('copy.outcome.e9dbbe23f3'), percent: facilityGoodwill });
  if (build.culture === 'family')
    parts.push({ label: sourceMessage('copy.build.df2852e45c'), percent: 5 });
  if (build.culture === 'stars' && overall(p) >= 70)
    parts.push({ label: sourceMessage('copy.build.e42fda7924'), percent: 10 });
  if (build.culture === 'meritocracy')
    parts.push({ label: sourceMessage('copy.build.b4b429047e'), percent: -5 });
  if (build.revenue === 'frugal')
    parts.push({ label: sourceMessage('copy.build.d4e31ebbfc'), percent: -5 });
  parts.push({
    label: sourceMessage('copy.contracts.3cba525c7f'),
    percent: (moraleOf(w) - 60) / 4,
  });
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
 * What a player is worth to a contract (→CLUB-26): his market wage times his Ballon d'Or premium,
 * the measure of his demand, of an improved contract and of 재계약 기조's caps.
 */
export function playerWorth(w: World, p: Player) {
  const { factor } = ballonDorPremium(w.history, w.year, p.id);
  return factor === 1 ? marketWage(w, p) : scaleBy(marketWage(w, p), factor, 1000n);
}
/**
 * What a player asks now: his worth times the build's player-wage effects (→ECON-22), his agent's
 * premium (→CLUB-30) and 협상의 달인's factor (→OWNER-5), and the floor he accepts, demand ×
 * (1 − goodwill).
 */
export function talkTerms(w: World, p: Player) {
  const multiplier = buildEffects(w).wage * agentPremium(agentOf(w, p)) * wageDemandFactor(w),
    demand = scaleBy(playerWorth(w, p), multiplier, 1000n),
    goodwill = talkGoodwill(w, p);
  return {
    demand,
    floor: ratio(demand, BigInt(Math.round((100 - goodwill.percent) * 100)), 10000n),
    goodwill,
  };
}
/**
 * The term the delegated staff offer `p` today (→CLUB-26): the contract runs two seasons past this
 * one (one from age 32) and never ends before the running one, in the window's terms — summer 3
 * (2 from 32), winter 2 (1 from 32), raised to the running contract's remaining seasons when longer.
 */
export function staffTerm(w: World, p: Player): TalkTerm {
  const past =
      w.year - p.born >= TALK_CONFIG.veteranAge
        ? TALK_CONFIG.veteranSeasons
        : TALK_CONFIG.staffSeasons,
    until = Math.max(p.until, w.year + 1 + past),
    terms = TALK_TERMS[talkWindow(w)],
    term = until - w.year - (talkWindow(w) === 'winter' ? 1 : 0);
  return clamp(term, terms[0], terms[terms.length - 1]) as TalkTerm;
}
/** Whether a player is paid 25% or more below his worth (→CLUB-26). */
function underpaid(w: World, p: Player) {
  const share = BigInt(Math.round(TALK_CONFIG.improveBelow * 1000));
  return BigInt(p.wage) * 1000n <= BigInt(playerWorth(w, p)) * share;
}
/** A renewal or an improved contract (계약 개선), as the talk is named. */
export const TALK_LABEL: Record<ContractTalk['kind'], string> = {
  renew: sourceMessage('copy.ClubStaff.a199caa699'),
  improve: sourceMessage('copy.contracts.43f2d219d8'),
};
const talkLabel = (talk: ContractTalk) => TALK_LABEL[talk.kind];
function playerLine(w: World, p: Player) {
  return sourceMessage('copy.contracts.192eb09ab7', {
    p0: p.position,
    p1: w.year - p.born,
    p2: overall(p),
    p3: moneyLabel(w, p.wage),
    p4: contractSeason(p.until),
  });
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
  if (isDelegated(w, 'contracts')) return;
  const goodwill = Math.round(terms.goodwill.percent * 10) / 10;
  pushInbox(w, {
    kind: 'contract-talk',
    title: sourceMessage('copy.contracts.95aa70fed1', { p0: p.name, p1: talkLabel(p.talk) }),
    detail: sourceMessage('copy.contracts.143cb28b64', {
      p0: playerLine(w, p),
      p1: agentOf(w, p),
      p2: moneyLabel(w, terms.demand),
      p3: moneyLabel(w, terms.floor),
      p4: goodwill > 0 ? '+' : '',
      p5: goodwill,
      p6: clausesLabel(p.talk.clauses),
      p7: termRange(talkWindow(w)),
    }),
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
  'renewal-declined': sourceMessage('copy.contracts.a0fcc170fb'),
  'improve-declined': sourceMessage('copy.contracts.f2c66d077d'),
  ambition: sourceMessage('copy.contracts.6c5f9649dd'),
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
  // Nothing he is paid ends an ambitious player's resentment (→CLUB-27).
  if (!p.unhappy || p.unhappy.reason === 'ambition' || p.loanUntil || p.retiring !== undefined)
    return undefined;
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
  return requested
    ? sourceMessage('copy.contracts.37ec60d79f')
    : sourceMessage('copy.contracts.83cfa1684f');
}
/**
 * A bigger club's offer of at least his value was declined (→CLUB-27, PLAYER-8): a player of 야망
 * 높음 turns unhappy 25% of the time and 매우 높음 50%, from his own stream for that offer, unless
 * the manager talks him round; either way the inbox says so. It ends with his sale or at the
 * next season's close.
 */
export function ambitionAfterDecline(w: World, p: Player, bidId: string, club: string) {
  const chance = AMBITION_UNHAPPY[p.personality.ambition - 1]!;
  if (!chance || p.unhappy || p.loanUntil || p.retiring !== undefined) return;
  const r = random(`${w.seed}:ambition:${bidId}`);
  if (r() >= chance) return;
  const talk = talkRoundChance(w),
    kept = r() < talk;
  const outcome = kept
    ? sourceMessage('copy.contracts.d6eb99292f', { p0: percentLabel(talk) })
    : sourceMessage('copy.contracts.63c58c0824', { p0: percentLabel(talk) });
  if (kept) {
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.contracts.8fc68af08c', { p0: p.name, p1: club }),
      detail: sourceMessage('copy.contracts.c8813e7362', {
        p0: playerLine(w, p),
        p1: GRADE_LABEL[p.personality.ambition],
        p2: outcome,
      }),
      attention: false,
      ref: p.id,
    });
    return;
  }
  p.unhappy = { reason: 'ambition', year: w.year, day: currentDay(w) };
  const weeks = UNHAPPY_CONFIG.requestDays / 7;
  pushInbox(w, {
    kind: 'unhappy',
    title: sourceMessage('copy.contracts.c2b1b0f474', { p0: p.name, p1: UNHAPPY_REASON.ambition }),
    detail: sourceMessage('copy.contracts.d4b3f37a9e', {
      p0: playerLine(w, p),
      p1: GRADE_LABEL[p.personality.ambition],
      p2: club,
      p3: outcome,
      p4: UNHAPPY_PENALTY,
      p5: UNHAPPY_MORALE,
      p6: weeks,
    }),
    attention: true,
    ref: p.id,
  });
}
/** The season's close ends every ambitious player's resentment (→CLUB-27). */
export function endAmbition(w: World) {
  for (const p of w.players) {
    if (p.unhappy?.reason !== 'ambition') continue;
    const ended = endUnhappiness(w, p);
    addEvent(
      w,
      'contract',
      sourceMessage('copy.contracts.7efd65275a', { p0: p.name }),
      sourceMessage('copy.contracts.b8d11d8e1d', { p0: ended }),
    );
  }
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
  const detail = sourceMessage('copy.contracts.8acd504eee', {
    p0: moneyLabel(w, before),
    p1: moneyLabel(w, wage),
    p2: termLabel(talkWindow(w), term),
    p3: contractSeason(p.until),
    p4: clausesLabel(p.clauses),
    p5: ended ? ` · ${ended}` : '',
  });
  addEvent(
    w,
    'contract',
    sourceMessage('copy.contracts.387189c7f5', { p0: p.name, p1: talkLabel(talk) }),
    staff ? sourceMessage('copy.contracts.9d9467661e', { p0: detail }) : detail,
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
    ? sourceMessage('copy.contracts.d6eb99292f', { p0: percentLabel(chance) })
    : sourceMessage('copy.contracts.63c58c0824', { p0: percentLabel(chance) });
  addEvent(
    w,
    'contract-decline',
    sourceMessage('copy.contracts.44e2a1605d', { p0: p.name, p1: talkLabel(talk) }),
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
      title: sourceMessage('copy.contracts.c2b1b0f474', {
        p0: p.name,
        p1: UNHAPPY_REASON[p.unhappy.reason],
      }),
      detail: sourceMessage('copy.contracts.74f04f01a3', {
        p0: playerLine(w, p),
        p1: outcome,
        p2: UNHAPPY_PENALTY,
        p3: UNHAPPY_MORALE,
        p4: weeks,
        p5: moneyLabel(w, talkTerms(w, p).floor),
      }),
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
 * Delegated staff (→STAFF-13) offer the floor for two seasons past this one (one from 32), never
 * ending before the running contract (→staffTerm), when 재계약 기조 keeps the player (the floor
 * within its wage cap, a starter when it keeps only the XI, younger than its age limit) and
 * 재정 기조 allows the raise (→ECON-33): cash after it keeps the runway, the yearly wage bill after
 * it, staff included, stays within the ceiling of the last 12 months' revenue, and the season's
 * cash projection with the new wage from the next round still ends the season keeping the runway;
 * otherwise they decline. Either way the talk's inbox item says why.
 */
export function staffTalkVerdict(w: World, p: Player) {
  const talk = p.talk!,
    rule = talkRuleOf(w),
    renewal = directionOption(w, 'renewal').name,
    stance = financeStance(w, 'contracts'),
    finance = financeOption(w, 'contracts').name,
    ceiling = scaleBy(playerWorth(w, p), rule.maxPay, 1000n),
    raise = BigInt(talk.floor) - BigInt(p.wage),
    perRound = (BigInt(operatingCosts(w).annual) + raise) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(stance.runway),
    term = staffTerm(w, p),
    age = w.year - p.born;
  if (!wageWithinLimit(w, 'contracts', talk.floor))
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.7733fb4416', {
        p0: moneyLabel(w, talk.floor),
        p1: moneyLabel(w, annualWageLimit(w, 'contracts')!),
      }),
    };
  if (BigInt(talk.floor) > BigInt(ceiling))
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.cc518e6d62', {
        p0: moneyLabel(w, talk.floor),
        p1:
          ballonDorPremium(w.history, w.year, p.id).factor > 1
            ? sourceMessage('copy.contracts.26a2cffc36')
            : '',
        p2: Math.round(rule.maxPay * 100),
        p3: moneyLabel(w, ceiling),
        p4: renewal,
      }),
    };
  if (rule.startersOnly && !ownStarters(w).some((starter) => starter.id === p.id))
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.462b606715', { p0: renewal }),
    };
  if (overall(p) < rule.minOvr)
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.5fb12c2f99', {
        p0: overall(p),
        p1: rule.minOvr,
        p2: renewal,
      }),
    };
  if (rule.maxAge !== undefined && age >= rule.maxAge)
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.129ed2f743', { p0: age, p1: renewal, p2: rule.maxAge }),
    };
  if (BigInt(w.cash) < runway)
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.41859e5c0d', { p0: stance.runway, p1: finance }),
    };
  const bill = BigInt(wageBill(w)) + raise,
    revenue = recentRevenue(w),
    share = Math.round(stance.wageShare * 100);
  if (bill * 100n > BigInt(revenue) * BigInt(share))
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.b1d7fee324', {
        p0: moneyLabel(w, bill.toString()),
        p1: moneyLabel(w, revenue),
        p2: share,
        p3: finance,
      }),
    };
  const seasonEnd = seasonEndWithWage(w, p, talk.floor);
  if (BigInt(seasonEnd) < runway)
    return {
      accept: false as const,
      reason: sourceMessage('copy.contracts.d9793e3ead', {
        p0: moneyLabel(w, seasonEnd),
        p1: stance.runway,
        p2: moneyLabel(w, runway.toString()),
        p3: finance,
      }),
    };
  return { accept: true as const, term };
}
function staffAnswer(w: World, p: Player) {
  const talk = p.talk!,
    verdict = staffTalkVerdict(w, p);
  let detail: string;
  if (verdict.accept)
    detail = sourceMessage('copy.contracts.341cbc23e8', {
      p0: signTalk(w, p, talk, talk.floor, verdict.term, true),
    });
  else {
    const { outcome } = declineTalk(
      w,
      p,
      sourceMessage('copy.contracts.83748a9d02', { p0: verdict.reason }),
    );
    detail = `${playerLine(w, p)} · ${verdict.reason} ${outcome}.`;
  }
  pushInbox(w, {
    kind: 'contract-talk',
    title: sourceMessage('copy.contracts.39744c8470', {
      p0: p.name,
      p1: talkLabel(talk),
      p2: verdict.accept
        ? sourceMessage('copy.contracts.5fe6ff27f1')
        : sourceMessage('copy.contracts.7cf83f2735'),
    }),
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
    if (w.playingCoachProposals?.[p.id]?.status === 'pending') continue;
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
  if (isDelegated(w, 'contracts')) answerPendingContracts(w);
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
    const why = sourceMessage('copy.contracts.c3df0a8d04', {
      p0: UNHAPPY_REASON[p.unhappy.reason],
      p1: UNHAPPY_CONFIG.requestDays / 7,
    });
    addEvent(
      w,
      'transfer-request',
      sourceMessage('copy.contracts.3da3aa6d88', { p0: p.name }),
      sourceMessage('copy.contracts.46fd5caf6a', { p0: why }),
    );
    pushInbox(w, {
      kind: 'transfer-request',
      title: sourceMessage('copy.contracts.8a2f3e4291', { p0: p.name }),
      detail: sourceMessage('copy.contracts.e8c1a83f4a', {
        p0: playerLine(w, p),
        p1: why,
        p2: moneyLabel(w, talkTerms(w, p).floor),
      }),
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
      where = club
        ? sourceMessage('copy.contracts.09184ea14a', { p0: club.name })
        : sourceMessage('copy.contracts.9a612830cc');
    endPlayingCoachForDeparture(w, p.id, true);
    p.status = 'sold';
    delete p.stance;
    leaveContract(w, p);
    movePerson(w, p, club?.id, true);
    if (w.year >= BOSMAN_YEAR || !club) {
      addEvent(
        w,
        'contract-expiry',
        sourceMessage('copy.contracts.41d78072fe', { p0: p.name }),
        `${where} · ${w.year >= BOSMAN_YEAR ? sourceMessage('copy.contracts.185bbfe3e3') : sourceMessage('copy.contracts.cd546d58a6')}`,
      );
      continue;
    }
    const value = marketValue(w, p, division),
      amount = ratio(value, BigInt(EXPIRY_COMPENSATION), 100n);
    credit(w, amount);
    addEvent(
      w,
      'free-transfer-compensation',
      sourceMessage('copy.contracts.721315c6c2', { p0: p.name }),
      sourceMessage('copy.contracts.d063824c2b', {
        p0: where,
        p1: moneyLabel(w, value),
        p2: EXPIRY_COMPENSATION,
      }),
      amount,
    );
  }
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
  if (!p || !talk) throw new Error(sourceMessage('copy.contracts.c8b7510d18'));
  if (!/^\d+$/.test(wage)) throw new Error(sourceMessage('copy.contracts.9a51987eee'));
  const window = talkWindow(w);
  if (!TALK_TERMS[window].includes(term))
    throw new Error(sourceMessage('copy.contracts.2997a870a1', { p0: termRange(window) }));
  if (BigInt(wage) < BigInt(talk.floor))
    throw new Error(
      sourceMessage('copy.contracts.aa91ac6b14', { p0: p.name, p1: moneyLabel(w, talk.floor) }),
    );
  signTalk(w, p, talk, wage, term, false);
}
/** The owner declines; the manager then tries to talk him round (→CLUB-27). */
export function declineContract(w: World, id: string) {
  const p = activePlayer(w, id);
  if (!p?.talk) throw new Error(sourceMessage('copy.contracts.c8b7510d18'));
  const reason = sourceMessage('copy.contracts.a113f53de1', {
    p0: moneyLabel(w, p.talk.demand),
    p1: moneyLabel(w, p.talk.floor),
  });
  const { kept, outcome } = declineTalk(w, p, reason);
  if (kept)
    pushInbox(w, {
      kind: 'contract-talk',
      title: sourceMessage('copy.contracts.a5b0b026b0', { p0: p.name }),
      detail: sourceMessage('copy.contracts.4c75531809', { p0: playerLine(w, p), p1: outcome }),
      attention: false,
      ref: p.id,
    });
}

/** Resolve only existing talks; changing authority must not open unrelated negotiations. */
export function answerPendingContracts(w: World) {
  for (const p of activePlayers(w))
    if (p.talk && w.playingCoachProposals?.[p.id]?.status !== 'pending') staffAnswer(w, p);
}
