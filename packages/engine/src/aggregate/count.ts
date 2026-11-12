/** Counting only: the attribution draw and the detail recount use these same definitions. */
import { PD, PLAYER_DETAIL_SIZE } from '../../../contracts/src/detail';
import type { Incident } from '../../../contracts/src/types';
import { cellBand } from '../match/pitch';
import { COUNTER_ZONES, isCutBack, M, mirrorBand } from '../match/record';
import { zeroMetrics } from '../primitives';
import { inBoxCell, isPassKind, moveKindIndex, xtGain } from './ledger';
import { ADDED_CONFIG } from '../match/rules';
import { AGGREGATE_CONFIG } from './config';
import { AGGREGATE_MOVE_KINDS } from './types';
import type {
  AggregateAttributionTrace,
  AggregateLedger,
  AggregateLine,
  AggregateMove,
  AggregateParticipation,
  AggregatePlayerFacts,
  AggregateShot,
  AggregateShotCredit,
  AggregateSide,
  AggregateTeamFacts,
} from './types';

interface Row {
  metrics: number[];
  detail: number[];
}
const FINAL_THIRD_BAND = COUNTER_ZONES.finalThird;
const BIG_CHANCE = 30;
/** What MATCH-13 reads of a move group's kind and cells, worked out once per group. */
export interface MoveTraits {
  kind: AggregateMove['kind'];
  pass: boolean;
  fromBand: number;
  toBand: number;
  boxEntry: boolean;
  /** MATCH-13's cut-back by its cells (match/record.ts `isCutBack`), whatever the move's kind. */
  cutBack: boolean;
  xt: number;
}
/** The 40 grid cells a move runs between (`band * 5 + lane`). */
const CELLS = 40;
/**
 * Traits by kind and cells, worked out once a process (T326): they read nothing else. A flat
 * array indexed by the numeric key instead of a map (T612).
 */
const TRAITS: (MoveTraits | undefined)[] = Array<MoveTraits | undefined>(
  AGGREGATE_MOVE_KINDS.length * CELLS * CELLS,
).fill(undefined);
export function moveTraits(move: AggregateMove): MoveTraits {
  const key = (moveKindIndex(move.kind) * CELLS + move.from) * CELLS + move.to;
  let traits = TRAITS[key];
  if (!traits) TRAITS[key] = traits = traitsOf(move);
  return traits;
}
function traitsOf(move: AggregateMove): MoveTraits {
  return {
    kind: move.kind,
    pass: isPassKind(move.kind),
    fromBand: cellBand(move.from),
    toBand: cellBand(move.to),
    boxEntry: inBoxCell(move.to) && !inBoxCell(move.from),
    cutBack: isPassKind(move.kind) && isCutBack(move.from, move.to),
    xt: xtGain(move.from, move.to),
  };
}

/** Counters a line's attempts and completions of one move group earn (→MATCH-13). */
export function creditMove(
  row: Row,
  move: MoveTraits,
  attempts: number,
  done: number,
  broke: number,
) {
  const m = row.metrics,
    d = row.detail;
  const { fromBand, toBand } = move;
  if (move.pass) {
    m[M.passes]! += attempts;
    m[M.completed]! += done;
    if (fromBand >= FINAL_THIRD_BAND) {
      d[PD.finalThirdPasses]! += attempts;
      d[PD.finalThirdCompleted]! += done;
    }
    if (toBand > fromBand) d[PD.progressivePasses]! += done;
    d[PD.lineBreakingPasses]! += broke;
    if (move.kind === 'cross') {
      d[PD.crosses]! += attempts;
      d[PD.crossesCompleted]! += done;
    }
    if (move.kind === 'through') {
      d[PD.throughBalls]! += attempts;
      d[PD.throughBallsCompleted]! += done;
    }
    if (move.cutBack) d[PD.cutBacks]! += done;
  } else {
    if (toBand > fromBand) d[PD.progressiveCarries]! += done;
    if (move.kind === 'takeOn') {
      d[PD.takeOns]! += attempts;
      m[M.dribbles]! += done;
    }
  }
  if (move.boxEntry) d[PD.boxEntries]! += done;
  if (toBand === FINAL_THIRD_BAND && fromBand < FINAL_THIRD_BAND) d[PD.frontOfBoxEntries]! += done;
  d[PD.xtAdded]! += done * move.xt;
}

/** A shot, its last pass and the save it causes, under MATCH-11/13. */
export function creditShot(
  shooter: Row,
  passer: Row | undefined,
  keeper: Row | undefined,
  shot: AggregateShot,
) {
  const goal = shot.outcome === 'goal';
  shooter.metrics[M.shots]!++;
  if (goal || shot.outcome === 'save') shooter.metrics[M.onTarget]!++;
  if (goal) shooter.metrics[M.goals]!++;
  shooter.detail[PD.xg]! += shot.xg;
  if (passer) {
    passer.detail[PD.keyPasses]!++;
    passer.detail[PD.xa]! += shot.xg;
    if (shot.xg >= BIG_CHANCE) passer.detail[PD.bigChancesCreated]!++;
    if (goal) passer.metrics[M.assists]!++;
  }
  if (shot.outcome === 'save') keeper!.metrics[M.saves]!++;
}

/** A ball won from an opposing move, whose band is in the acting side's frame. */
export function creditWin(row: Row, pass: boolean, band: number, count: number) {
  row.metrics[pass ? M.interceptions : M.tackles]! += count;
  if (mirrorBand(band) >= COUNTER_ZONES.highTurnover) row.detail[PD.highTurnovers]! += count;
}
export function creditCard(detail: number[], kind: Incident['kind']) {
  if (kind === 'yellow' || kind === 'secondYellow') detail[PD.yellowCards]!++;
  if (kind === 'red' || kind === 'secondYellow') detail[PD.redCards]!++;
}

/** The keeper present in a stamped minute, falling back to the first present line as attribution does. */
export function keeperLine(
  participation: AggregateParticipation,
  side: AggregateSide,
  minute: number,
) {
  const here = participation.stints[side]
    .filter((s) => s.from < minute && s.to >= minute)
    .sort((a, b) => a.line - b.line);
  return (here.find((s) => s.slot === 0) ?? here[0])?.line ?? -1;
}

/** Count fixed per-line ledger splits; no accessor, world, randomness or attribution draw. */
export function countPlayerFacts(
  ledger: AggregateLedger,
  participation: AggregateParticipation,
  trace: AggregateAttributionTrace,
  credits: readonly (AggregateShotCredit & { keeper?: number })[],
  lines: readonly [readonly { id: string }[], readonly { id: string }[]],
): AggregatePlayerFacts {
  const rows = lines.map((side) =>
    side.map((): Row => ({
      metrics: zeroMetrics(),
      detail: Array<number>(PLAYER_DETAIL_SIZE).fill(0),
    })),
  );
  for (const side of [0, 1] as const) {
    const own = rows[side]!,
      opp = rows[1 - side]!;
    ledger.sides[side].moves.forEach((move, i) => {
      const split = trace.moves[side][i]!;
      const traits = moveTraits(move);
      own.forEach((row, line) => {
        creditMove(
          row,
          traits,
          split.attempts[line] ?? 0,
          split.completed[line] ?? 0,
          split.broke[line] ?? 0,
        );
        row.detail[PD.offsides]! += split.offside[line] ?? 0;
      });
      opp.forEach((row, line) => {
        creditWin(
          row,
          traits.pass,
          traits.pass ? traits.toBand : traits.fromBand,
          split.won[line] ?? 0,
        );
        row.detail[PD.highTurnovers]! += split.recovered[line] ?? 0;
      });
    });
    ledger.sides[side].fouled.forEach((_, i) => {
      const split = trace.fouls[side][i]!;
      own.forEach((row, line) => (row.detail[PD.foulsWon]! += split.fouled[line] ?? 0));
      opp.forEach((row, line) => (row.detail[PD.fouls]! += split.fouler[line] ?? 0));
      for (const b of split.booked) {
        own[b.fouled]!.detail[PD.foulsWon]!++;
        opp[b.fouler]!.detail[PD.fouls]!++;
      }
    });
    for (const [line, minutes] of playedMinutes(participation, side))
      own[line]!.metrics[M.minutes] = minutes;
  }
  for (const c of credits) {
    const shot = ledger.sides[c.side].shots[c.shot]!;
    const foe = c.side === 0 ? 1 : 0;
    creditShot(
      rows[c.side]![c.shooter]!,
      c.passer === undefined ? undefined : rows[c.side]![c.passer]!,
      rows[foe]![c.keeper ?? keeperLine(participation, foe, shot.minute)]!,
      shot,
    );
  }
  for (const x of participation.incidents) {
    const line = lines[x.side].findIndex((l) => l.id === x.player);
    creditCard(rows[x.side]![line]!.detail, x.kind);
  }
  const sides = rows.map((side) =>
    side.map((row, line): AggregateLine => ({ line, ...row })),
  ) as AggregatePlayerFacts['sides'];
  return { sides, shots: [...credits] };
}

/**
 * Added minutes of each period played (→MATCH-1): the time its goals, substitutions, injuries,
 * cards and penalties took, at the credits and bounds the removed detailed engine used (T845).
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

/** Whole minutes each line played, by line index; lines that never played are absent. */
export function playedMinutes(
  participation: AggregateParticipation,
  side: AggregateSide,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of participation.stints[side])
    out.set(s.line, (out.get(s.line) ?? 0) + s.to - s.from);
  return out;
}
