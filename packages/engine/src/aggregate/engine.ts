/**
 * One complete aggregate match (→MATCH-6, MATCH-22, MATCH-26, MATCH-27): a fixture's prepared
 * match, its matchday rosters and its participation plan condition the team kernel; extra time
 * extends the same facts when a tie is level, the shoot-out follows the ordered taker/keeper rule
 * and the player lines are allocated from the team facts. The result is a full-model record with
 * empty observation frames, checked by the shared validator before anything settles it.
 */
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
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
import { isUnavailable } from '../discipline';
import { subPolicyFor } from '../grid/changes';
import { ADDED_CONFIG } from '../grid/engine';
import { SHOT_CONFIG } from '../grid/resolve';
import {
  benchFor,
  DEFAULT_SUB_POLICY,
  eraRules,
  isLevel,
  type DecideRule,
  type EraRules,
} from '../grid/setup';
import { STRENGTH_CONFIG } from '../grid/state';
import {
  actionWeight,
  finishing,
  MATCH_DUEL_CONFIG,
  prepareMatch,
  targetChance,
  type Prepared,
} from '../match';
import { assertFullMatchRecord } from '../match-model';
import { FORMATIONS, levelFactor, lineOf } from '../player';
import { clamp } from '../primitives';
import { fatigueLoad, slotOvr, unhappyPenalty } from '../world';
import { buildAggregateInput } from './input';
import { onPitchAt, planParticipation, slotAt, withheldRebalances } from './participation';
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
  AggregateSide,
  AggregateSkillAccess,
  AggregateStint,
  AggregateStreams,
  AggregateTeamFacts,
} from './types';

const KEEPING: ReadonlySet<AggregateAttribute> = new Set(['reflexes', 'handling']);

/**
 * Effective skills of every matchday line, substitutes included (→MATCH-11): his attribute at the
 * slot he holds then × his level there × his side's multiplier, less pre-match fatigue beyond
 * fitness and an unhappy player's penalty, plus the day's shift, less what his minutes on the
 * pitch have drained — match.ts `matchSkills`' formula, read for the line's actual slot and entry.
 */
export function aggregateSkillAccess(
  prepared: Prepared,
  rosters: readonly [readonly Player[], readonly Player[]],
  participation: AggregateParticipation,
): AggregateSkillAccess {
  const C = MATCH_DUEL_CONFIG;
  const sides = ([0, 1] as const).map((side) => {
    const slots = FORMATIONS[prepared.tactics[side]].slots;
    const multiplier = prepared.multiplier[side]!;
    const drain =
      (C.drainPerStamina *
        (prepared.tactics[side] === 'press' ? C.pressDrain : 1) *
        prepared.drain[side]!) /
      90;
    const stints = new Map<number, AggregateStint[]>();
    for (const s of participation.stints[side])
      stints.set(s.line, [...(stints.get(s.line) ?? []), s]);
    for (const list of stints.values()) list.sort((a, b) => a.from - b.from);
    /** Per line and slot: the slot level times the multiplier, read once. */
    const scales = new Map<number, number>();
    const scaleAt = (line: number, slot: number) => {
      const key = line * 16 + slot;
      let scale = scales.get(key);
      if (scale === undefined) {
        const p = rosters[side][line]!;
        scale = levelFactor(p.positions, slots[slot]!.position) * multiplier(p);
        scales.set(key, scale);
      }
      return scale;
    };
    return { stints, scaleAt, drain };
  });
  return {
    skill(side, line, attribute, minute) {
      const p = rosters[side][line]!;
      const own = sides[side]!;
      const list = own.stints.get(line);
      let slot = list?.[0]?.slot ?? Math.min(line, 10);
      if (list) for (const s of list) if (s.from < minute) slot = s.slot;
      const load = fatigueLoad(p.fatigue) / (KEEPING.has(attribute) ? 10 : 8);
      const on = Math.max(0, minute - (list?.[0]?.from ?? 0));
      return (
        p.attrs[attribute] * own.scaleAt(line, slot) -
        load -
        unhappyPenalty(p) +
        prepared.shift[side]! -
        (100 - p.attrs.stamina) * own.drain * on
      );
    },
    finishing,
    targetChance,
  };
}

/**
 * Each side's matchday roster (→MATCH-19, MATCH-20, LEAGUE-15): the prepared XI, an unavailable
 * starter replaced by the best available bench player for his slot, then the era's named
 * substitutes, none of them injured or banned for this fixture.
 */
export function matchdayRosters(
  w: World,
  f: Fixture,
  prepared: Prepared,
  era: EraRules,
): [Player[], Player[]] {
  return ([0, 1] as const).map((side) => {
    const club: Club = prepared.teams[side];
    const out = (p: Player) => isUnavailable(w, p, club.id, f);
    const xi = [...prepared.squads[side]];
    if (new Set(xi.map((p) => p.id)).size !== 11)
      throw new Error(`집계 경기 선발 11명이 아닙니다: ${club.id} ${f.id}`);
    const bench = benchFor(w, club, xi, era, out);
    const slots = FORMATIONS[prepared.tactics[side]].slots;
    xi.forEach((p, slot) => {
      if (!out(p) || bench.length === 0) return;
      let best = 0;
      for (let i = 1; i < bench.length; i++)
        if (slotOvr(bench[i]!, slots[slot]!) > slotOvr(bench[best]!, slots[slot]!)) best = i;
      xi[slot] = bench.splice(best, 1)[0]!;
    });
    return [...xi, ...bench];
  }) as [Player[], Player[]];
}

/** What the participation plan reads of each matchday line and side. */
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
      // Only the bench is chosen by slot level (→MATCH-20).
      slotLevel: index < 11 ? [] : slots.map((slot) => slotOvr(p, slot, multiplier(p))),
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
  return credits.slice(0, periods).map((seconds, i) => {
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
}

const UNPLANNED: AggregateSkillAccess = {
  skill: () => {
    throw new Error('집계 경기의 실효 능력은 출전 계획 뒤에 읽습니다');
  },
  finishing,
  targetChance,
};

/**
 * A planned and produced stretch of the match whose red-card rebalances agree with its score
 * (→STAFF-45): a rebalance the facts show was made while the side trailed joins `withheld`, and
 * the match is planned and produced again on the same streams. `withheld` only grows and every
 * replay adds a red card to it, so the replays end; a rebalance is never left trailing.
 */
export function settleParticipation(
  base: AggregateInput,
  plan: AggregatePlan,
  streams: AggregateStreams,
  length: AggregateLength,
  withheld: Set<string>,
  accessFor: (participation: AggregateParticipation) => AggregateSkillAccess,
): { input: AggregateInput; participation: AggregateParticipation; facts: AggregateTeamFacts } {
  for (;;) {
    const participation = planParticipation(base, plan, streams, length, withheld);
    const input = { ...base, access: accessFor(participation) };
    const facts = generateTeamFacts(input, streams, participation);
    const trailing = withheldRebalances(participation, facts);
    if (trailing.length === 0) return { input, participation, facts };
    for (const key of trailing) withheld.add(key);
  }
}

/**
 * Plans, plays and attributes one fixture: 90 minutes, then — when `decide` says the tie is still
 * level — the same match extended to 120 with its regulation facts unchanged, and a shoot-out if
 * it is level after extra time. Rebalances withheld in the 90 stay withheld in the 120.
 */
export function playAggregate(
  w: World,
  f: Fixture,
  prepared: Prepared,
  rosters: readonly [readonly Player[], readonly Player[]],
  decide?: DecideRule,
): AggregateMatch {
  const era = eraRules(f.year);
  const streams = aggregateStreams(w.seed, f.id);
  const base = buildAggregateInput(prepared, UNPLANNED, rosters);
  const plan = aggregatePlan(w, prepared, rosters, era);
  const withheld = new Set<string>();
  const play = (length: AggregateLength) =>
    settleParticipation(base, plan, streams, length, withheld, (participation) =>
      aggregateSkillAccess(prepared, rosters, participation),
    );
  let match = play(90);
  const level = (facts: AggregateTeamFacts) =>
    !!decide && isLevel(decide, facts.score[0], facts.score[1]);
  if (level(match.facts)) match = play(120);
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
  return { ...match, plan, players, ...(shootout && { shootout }) };
}

/** The full-model record of an aggregate match (→MATCH-26), validated before it is returned. */
export function aggregateRecord(
  f: Fixture,
  rosters: readonly [readonly Player[], readonly Player[]],
  match: AggregateMatch,
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
    model: MATCH_MODEL_REVISION,
    ...(facts.regulation && {
      regulation: { home: facts.regulation[0], away: facts.regulation[1] },
    }),
    ...(match.shootout && { shootout: match.shootout }),
  };
  assertFullMatchRecord(record);
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
  return { record: aggregateRecord(f, rosters, match), frames: [], squads: rosters };
}
