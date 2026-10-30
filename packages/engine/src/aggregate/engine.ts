/**
 * One complete aggregate match (→MATCH-6, MATCH-22, MATCH-26, MATCH-27): a fixture's prepared
 * match, its matchday rosters and its participation plan condition the team kernel; extra time
 * extends the same facts when a tie is level, the shoot-out follows the ordered taker/keeper rule
 * and the player lines are allocated from the team facts. The result is a full-model record with
 * empty observation frames, checked by the shared validator before anything settles it.
 */
import {
  activeMatchModel,
  MATCH_MODEL_REVISION,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import type {
  Club,
  Fixture,
  Highlight,
  Incident,
  MatchPlayback,
  MatchRecord,
  Player,
  Score,
  World,
} from '../../../contracts/src/types';
import { injuryChance } from '../careers';
import { subPolicyFor } from '../grid/changes';
import { ADDED_CONFIG } from '../grid/engine';
import { SHOT_CONFIG } from '../grid/resolve';
import {
  DEFAULT_SUB_POLICY,
  eraRules,
  fixtureRosters,
  isLevel,
  type DecideRule,
  type EraRules,
} from '../grid/setup';
import { STRENGTH_CONFIG } from '../grid/state';
import {
  actionWeight,
  drainPerMinute,
  finishing,
  prepareMatch,
  slotSkill,
  targetChance,
  type Prepared,
} from '../match';
import { FORMATIONS, levelFactor, lineOf } from '../player';
import { clamp } from '../primitives';
import { slotOvr } from '../player-state';
import { buildAggregateInput } from './input';
import { AGGREGATE_CONFIG, AGGREGATE_PARTICIPATION_CONFIG as PC } from './config';
import { onPitchAt, planParticipation, rebalanceIssues, slotAt } from './participation';
import { attributePlayerFacts } from './players';
import { aggregateStreams, generateTeamFacts } from './team';
import type {
  AggregateAttribute,
  AggregateCandidate,
  AggregateInput,
  AggregateLength,
  AggregateParticipation,
  AggregatePlan,
  AggregatePlayerFacts,
  AggregateRebalanceDecisions,
  AggregateSide,
  AggregateSkillAccess,
  AggregateStint,
  AggregateStreams,
  AggregateTeamFacts,
} from './types';

/** The keeping attributes, told by comparison instead of a set on every skill read (T612). */
const isKeeping = (attribute: AggregateAttribute) =>
  attribute === 'reflexes' || attribute === 'handling';

/**
 * Effective skills of every matchday line, substitutes included (→MATCH-11): match.ts `slotSkill`
 * at the slot he holds then — his attribute × his level there × his side's multiplier, less
 * pre-match fatigue beyond fitness and an unhappy player's penalty — plus the day's shift, less
 * `drainPerMinute` for his minutes on the pitch: the chance model's own formula, read for the
 * line's actual slot and entry.
 */
export function aggregateSkillAccess(
  prepared: Prepared,
  rosters: readonly [readonly Player[], readonly Player[]],
  participation: AggregateParticipation,
): AggregateSkillAccess {
  const sides = ([0, 1] as const).map((side) => {
    const slots = FORMATIONS[prepared.tactics[side]].slots;
    const multiplier = prepared.multiplier[side]!;
    // Indexed by line (T326): the same stints, scales and drain, without a keyed lookup a read.
    const stints: (AggregateStint[] | undefined)[] = [];
    for (const s of participation.stints[side]) (stints[s.line] ??= []).push(s);
    for (const list of stints) list?.sort((a, b) => a.from - b.from);
    /** Per line and slot: the slot level times the multiplier, read once. */
    const scales: number[] = [];
    const scaleAt = (line: number, slot: number) => {
      const key = line * 16 + slot;
      let scale = scales[key];
      if (scale === undefined) {
        const p = rosters[side][line]!;
        scale = levelFactor(p.positions, slots[slot]!.position) * multiplier(p);
        scales[key] = scale;
      }
      return scale;
    };
    /** Per line: `drainPerMinute` of his stamina, read once. */
    const drains: number[] = [];
    const drainOf = (line: number) =>
      (drains[line] ??= drainPerMinute(prepared, side, rosters[side][line]!.attrs.stamina));
    return { stints, scaleAt, drainOf };
  });
  return {
    skill(side, line, attribute, minute) {
      const p = rosters[side][line]!;
      const own = sides[side]!;
      const list = own.stints[line];
      let slot = list?.[0]?.slot ?? Math.min(line, 10);
      if (list) for (const s of list) if (s.from < minute) slot = s.slot;
      const on = Math.max(0, minute - (list?.[0]?.from ?? 0));
      return (
        slotSkill(p, p.attrs[attribute], own.scaleAt(line, slot), isKeeping(attribute)) +
        prepared.shift[side]! -
        own.drainOf(line) * on
      );
    },
    own: (side, line, attribute) => rosters[side][line]!.attrs[attribute],
    finishing,
    targetChance,
  };
}

/**
 * Each side's matchday roster under the candidate model's one availability rule (grid/setup.ts
 * `fixtureRosters`, which the detailed engine shares): the prepared XI with an unavailable starter
 * replaced by the best available substitute for his slot, then the era's named substitutes, none
 * of them injured or banned for this fixture. The aggregate plan needs eleven different starters.
 */
export function matchdayRosters(
  w: World,
  f: Fixture,
  prepared: Prepared,
  era: EraRules,
): [Player[], Player[]] {
  for (const side of [0, 1] as const) {
    const club: Club = prepared.teams[side];
    if (new Set(prepared.squads[side].map((p) => p.id)).size !== 11)
      throw new Error(`집계 경기 선발 11명이 아닙니다: ${club.id} ${f.id}`);
  }
  return fixtureRosters(w, f, prepared, era);
}

/** What the participation plan reads of each matchday line and side. */
/**
 * A substitute's levels at the formation's `size` slots, each computed on its first read and
 * kept (T326): the same values as computing them all, for only the slots a change asks about.
 */
function lazySlotLevels(size: number, level: (slot: number) => number): readonly number[] {
  const levels: (number | undefined)[] = Array<number | undefined>(size).fill(undefined);
  return new Proxy(levels as number[], {
    get(target, key, receiver) {
      if (typeof key === 'string') {
        const slot = Number(key);
        if (Number.isInteger(slot) && slot >= 0 && slot < size)
          return (levels[slot] ??= level(slot));
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

export function aggregatePlan(
  w: World,
  prepared: Prepared,
  rosters: readonly [readonly Player[], readonly Player[]],
  era: EraRules,
): AggregatePlan {
  const side = (s: AggregateSide) => {
    const slots = FORMATIONS[prepared.tactics[s]].slots;
    const pressing = prepared.tactics[s] === 'press';
    const multiplier = prepared.multiplier[s]!;
    const candidates = rosters[s].map((p, index): AggregateCandidate => ({
      id: p.id,
      line: lineOf(p.position),
      born: p.born,
      fatigue: p.fatigue,
      stamina: p.attrs.stamina,
      injury: injuryChance(p, pressing),
      reflexes: p.attrs.reflexes,
      // Only the bench is chosen by slot level (→MATCH-20), each slot's read when first asked.
      slotLevel:
        index < 11 ? [] : lazySlotLevels(slots.length, (i) => slotOvr(p, slots[i]!, multiplier(p))),
      traits: p.traits,
    }));
    return {
      candidates,
      policy: s === prepared.ownSide ? subPolicyFor(w.manager) : { ...DEFAULT_SUB_POLICY },
      pressing,
      drain: prepared.drain[s]!,
      actionWeight: (line: number, slot: number, action: Parameters<typeof actionWeight>[2]) =>
        actionWeight(slots[slot]!.role, candidates[line]!.traits, action),
    };
  };
  return { era, sides: [side(0), side(1)] };
}

/**
 * A level tie's shoot-out (→MATCH-6), the detailed engine's rule (grid/shootout.ts): the players
 * on the pitch at the end kick, best 0.6 슈팅 + 0.4 침착성 first and the keeper last, the home side
 * first, five each until one side cannot be caught, then sudden death in pairs with the takers
 * coming round again; each kick goes in at the in-match penalty chance against the keeper's 선방.
 */
export function aggregateShootout(
  input: AggregateInput,
  participation: AggregateParticipation,
  streams: AggregateStreams,
): Score {
  const end = participation.length;
  const minute = end - 0.5;
  const skill = (side: AggregateSide, line: number, a: AggregateAttribute) =>
    input.access.skill(side, line, a, minute);
  const kicker = (side: AggregateSide, line: number) =>
    0.6 * skill(side, line, 'finishing') + 0.4 * skill(side, line, 'composure');
  const present = (side: AggregateSide) =>
    input.sides[side].lines
      .map((_, line) => line)
      .filter((line) => onPitchAt(participation, side, line, end));
  const keeperOf = (side: AggregateSide) =>
    present(side).find((line) => slotAt(participation, side, line, end) === 0) ?? present(side)[0]!;
  const order = ([0, 1] as const).map((side) => {
    const keeper = keeperOf(side);
    const outfield = present(side)
      .filter((line) => line !== keeper)
      .sort((a, b) => kicker(side, b) - kicker(side, a) || a - b);
    return [...outfield, keeper];
  });
  const P = SHOT_CONFIG.penalty;
  const chance = (side: AggregateSide, line: number) => {
    const foe: AggregateSide = side === 0 ? 1 : 0;
    const margin =
      (kicker(side, line) - skill(foe, keeperOf(foe), 'reflexes')) * STRENGTH_CONFIG.skillScale;
    return clamp(P.base + margin / 300, P.min, P.max);
  };
  const r = streams.draw('shootout');
  const scored = [0, 0],
    taken = [0, 0];
  const kick = (side: AggregateSide) => {
    const list = order[side]!;
    if (r() < chance(side, list[taken[side]! % list.length]!)) scored[side]!++;
    taken[side]!++;
  };
  const score = (): Score => ({ home: scored[0]!, away: scored[1]! });
  for (let round = 0; round < 5; round++)
    for (const side of [0, 1] as const) {
      kick(side);
      const left = (who: AggregateSide) => 5 - taken[who]!;
      if (scored[0]! + left(0) < scored[1]! || scored[1]! + left(1) < scored[0]!) return score();
    }
  while (scored[0] === scored[1]) {
    kick(0);
    kick(1);
  }
  return score();
}

/**
 * Added minutes of each period played (→MATCH-1): the time its goals, substitutions, injuries,
 * cards and penalties took, at the detailed engine's credits and bounds (grid/engine.ts).
 */
export function aggregateAddedTime(
  facts: AggregateTeamFacts,
  incidents: readonly Incident[],
): number[] {
  const periods = facts.length === 120 ? 4 : 2;
  const periodOf = (minute: number) =>
    minute <= 45 ? 0 : minute <= 90 ? 1 : minute <= 105 ? 2 : 3;
  const credits = [0, 0, 0, 0];
  const K = ADDED_CONFIG.credits;
  for (const side of facts.ledger.sides)
    for (const shot of side.shots) {
      if (shot.outcome === 'goal') credits[periodOf(shot.minute)]! += K.goal;
      if (shot.kind === 'penalty') credits[periodOf(shot.minute)]! += K.penalty;
    }
  for (const x of incidents)
    credits[periodOf(x.minute)]! +=
      x.kind === 'sub' ? K.sub : x.kind === 'injury' ? K.injury : K.card;
  return credits.slice(0, periods).map((credited, i) => {
    const seconds = credited + AGGREGATE_CONFIG.addedSeconds[i]!;
    const [lo, hi] = ADDED_CONFIG.bounds[i]!;
    return Math.min(hi, Math.max(lo, Math.ceil(seconds / 60)));
  });
}

/** Everything one aggregate match produced before it becomes a record. */
export interface AggregateMatch {
  input: AggregateInput;
  plan: AggregatePlan;
  participation: AggregateParticipation;
  facts: AggregateTeamFacts;
  players: AggregatePlayerFacts;
  shootout?: Score;
  decisions: AggregateRebalanceDecisions;
  /** Which of the fixture's retry streams settled it; 0 is its own streams. */
  retry: number;
  /**
   * The red cards (`side:reds`) whose answer disagrees with the score, present only when the
   * fixture exhausted its retries and settled on `playAggregate`'s fallback.
   */
  unreconciled?: readonly string[];
}

/**
 * The input's accessor before any participation exists. It refers to match.ts lazily, since the
 * dispatch there imports this module and a module-level reference would read it uninitialised.
 * Exported for scripts/match-model-baseline.ts, which times `playAggregate`'s stages one by one.
 */
export const UNPLANNED: AggregateSkillAccess = {
  skill: () => {
    throw new Error('집계 경기의 실효 능력은 출전 계획 뒤에 읽습니다');
  },
  finishing: (shooting, keeping) => finishing(shooting, keeping),
  targetChance: (goal, shooting) => targetChance(goal, shooting),
};

/** A planned and produced stretch of the match and the rebalance decisions it was planned with. */
export interface AggregateStretch {
  input: AggregateInput;
  participation: AggregateParticipation;
  facts: AggregateTeamFacts;
  decisions: AggregateRebalanceDecisions;
  /** The red cards whose answer disagrees with the score: only on a `settle` fallback. */
  unreconciled?: readonly string[];
}

/** How hard a fixture searches for red-card answers that agree with its score (→STAFF-45). */
export interface AggregateRebalanceLimits {
  /** Decision sets tried on one fixture's streams for one stretch. */
  rebalanceSearches: number;
  /** Further draws on the fixture's retry streams before the last one settles anyway. */
  rebalanceRetries: number;
}

/**
 * A planned and produced stretch of the match whose red-card answers agree with its score
 * (→STAFF-45): every rebalance made level or ahead, every withheld one trailing. The facts of a
 * period depend on the whole period's participation, so answering a red moves the goals before
 * it too; the decisions are searched on the same streams, from `prefer` and then flipping the
 * answers each plan reached, earliest first, until the score agrees with all of them. Undefined
 * when none of the `searches` agrees, for the caller to draw the match again — unless `settle`,
 * when the searched stretch with the fewest disagreeing answers is returned (the earliest searched
 * among equals, at least one searched) with those answers in `unreconciled`.
 */
export function settleParticipation(
  base: AggregateInput,
  plan: AggregatePlan,
  streams: AggregateStreams,
  length: AggregateLength,
  accessFor: (participation: AggregateParticipation) => AggregateSkillAccess,
  prefer: AggregateRebalanceDecisions = new Map(),
  {
    searches = PC.changes.rebalanceSearches,
    settle = false,
  }: { searches?: number; settle?: boolean } = {},
): AggregateStretch | undefined {
  const tried = new Set<string>();
  const queue: AggregateRebalanceDecisions[] = [prefer];
  let closest: AggregateStretch | undefined;
  const limit = settle ? Math.max(1, searches) : searches;
  for (let searched = 0; searched < limit && queue.length > 0;) {
    const decisions = queue.shift()!;
    const id = [...decisions]
      .map(([key, made]) => `${key}=${made}`)
      .sort()
      .join(',');
    if (tried.has(id)) continue;
    tried.add(id);
    searched++;
    const participation = planParticipation(base, plan, streams, length, decisions);
    const input = { ...base, access: accessFor(participation) };
    const facts = generateTeamFacts(input, streams, participation);
    const issues = rebalanceIssues(participation, facts);
    if (issues.length === 0) return { input, participation, facts, decisions };
    if (!closest || issues.length < closest.unreconciled!.length)
      closest = { input, participation, facts, decisions, unreconciled: issues };
    const reached = [...(participation.rebalances ?? [])].sort((a, b) => a.minute - b.minute);
    for (const x of reached) queue.push(new Map(decisions).set(x.key, !x.made));
  }
  return settle ? closest : undefined;
}

/**
 * Plans, plays and attributes one fixture: 90 minutes, then — when `decide` says the tie is still
 * level — the same match extended to 120 with its regulation facts and decisions unchanged, and a
 * shoot-out if it is level after extra time. A fixture whose red-card answers cannot agree with
 * its score on its streams is drawn again on its next retry streams (`<fixture>:retry<n>`), the
 * same for every call, so the settled record follows STAFF-45. A fixture never aborts the world:
 * when even its last retry finds no agreeing answers it settles there anyway, on the searched plan
 * with the fewest disagreeing answers (`unreconciled`) — deterministic and a valid full record;
 * how often and with what bias is T284's measurement.
 */
export function playAggregate(
  w: World,
  f: Fixture,
  prepared: Prepared,
  rosters: readonly [readonly Player[], readonly Player[]],
  decide?: DecideRule,
  limits: AggregateRebalanceLimits = PC.changes,
): AggregateMatch {
  const era = eraRules(f.year);
  const base = buildAggregateInput(prepared, UNPLANNED, rosters);
  const plan = aggregatePlan(w, prepared, rosters, era);
  const access = (participation: AggregateParticipation) =>
    aggregateSkillAccess(prepared, rosters, participation);
  const level = (facts: AggregateTeamFacts) =>
    !!decide && isLevel(decide, facts.score[0], facts.score[1]);
  const retries = Math.max(0, limits.rebalanceRetries);
  for (let retry = 0; ; retry++) {
    const search = { searches: limits.rebalanceSearches, settle: retry >= retries };
    const streams = aggregateStreams(w.seed, retry === 0 ? f.id : `${f.id}:retry${retry}`);
    let match = settleParticipation(base, plan, streams, 90, access, undefined, search);
    // The 120's plan holds every answer, the first 90's included, so its check covers them all.
    if (match && level(match.facts))
      match = settleParticipation(base, plan, streams, 120, access, match.decisions, search);
    if (!match) continue;
    const shootout =
      match.facts.length === 120 && level(match.facts)
        ? aggregateShootout(match.input, match.participation, streams)
        : undefined;
    const players = attributePlayerFacts(
      match.input,
      plan,
      match.participation,
      match.facts,
      streams,
    );
    return { ...match, plan, players, retry, ...(shootout && { shootout }) };
  }
}

/**
 * The full-model record of an aggregate match (→MATCH-26) under the revision that settles it;
 * `recordMatch` checks it before it settles (→MATCH-27).
 */
export function aggregateRecord(
  f: Fixture,
  rosters: readonly [readonly Player[], readonly Player[]],
  match: AggregateMatch,
  model: MatchModelRevision = MATCH_MODEL_REVISION,
): MatchRecord {
  const { facts, participation, players, input } = match;
  const highlights: Highlight[] = [];
  for (const credit of players.shots) {
    const shot = facts.ledger.sides[credit.side].shots[credit.shot]!;
    if (shot.outcome === 'goal')
      highlights.push({
        minute: shot.minute,
        side: credit.side,
        player: rosters[credit.side][credit.shooter]!.name,
        action: '골',
      });
  }
  highlights.sort((a, b) => a.minute - b.minute || a.side - b.side);
  if (match.shootout) {
    const side = match.shootout.home > match.shootout.away ? 0 : 1;
    highlights.push({
      minute: 120,
      side,
      player: '승부차기',
      action: `승부차기 ${side === 0 ? '홈' : '원정'} 승리`,
    });
  }
  const record: MatchRecord = {
    ...f,
    score: { home: facts.score[0], away: facts.score[1] },
    metrics: [facts.sides[0].metrics, facts.sides[1].metrics],
    players: players.sides.flatMap((lines, side) =>
      lines.map((l) => ({
        id: input.sides[side as AggregateSide].lines[l.line]!.id,
        metrics: l.metrics,
        detail: l.detail,
      })),
    ),
    highlights,
    tactics: [input.sides[0].tactic, input.sides[1].tactic],
    xg: [facts.sides[0].xg / 100, facts.sides[1].xg / 100],
    detail: [facts.sides[0].detail, facts.sides[1].detail],
    incidents: [...participation.incidents],
    lineCounts: [players.sides[0].length, players.sides[1].length],
    added: aggregateAddedTime(facts, participation.incidents),
    model,
    ...(facts.regulation && {
      regulation: { home: facts.regulation[0], away: facts.regulation[1] },
    }),
    ...(match.shootout && { shootout: match.shootout }),
  };
  return record;
}

/**
 * The aggregate path's complete result for a fixture (→MATCH-22, MATCH-26): the full record, no
 * observation frames and the matchday rosters (starters in slot order, then the bench). The same
 * fixture always returns the same facts; `decide` is a knockout tie's rule (→MATCH-6).
 */
export function simulateAggregate(w: World, f: Fixture, decide?: DecideRule): MatchPlayback {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const match = playAggregate(w, f, prepared, rosters, decide);
  const model = activeMatchModel(w) ?? MATCH_MODEL_REVISION;
  return { record: aggregateRecord(f, rosters, match, model), frames: [], squads: rosters };
}
