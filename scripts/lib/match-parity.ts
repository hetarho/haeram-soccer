/**
 * Match-model measurement registry (→MATCH-2/3/4/13/23/27/28, ARCH-31, docs/MATCH-MODEL-CONTRACT.md).
 *
 * One place for what a match result is measured by: every recorded counter with its level and
 * units, the intended target bands, the exact record invariants, the comparison settings, the corpus
 * conditions and seed partitions and the performance budgets, plus the report builders that read
 * them. Later tasks import these names instead of copying thresholds or corpus sizes. Measurement
 * tooling only: nothing under apps/ or packages/ imports this file.
 */
import { PD, PLAYER_DETAIL_SIZE, TD, TEAM_DETAIL_SIZE } from '../../packages/contracts/src/detail';
import type { Incident, MatchRecord, Tactic } from '../../packages/contracts/src/types';
import { inBoxCell, inGoalAreaCell } from '../../packages/engine/src/aggregate/ledger';
import { BAND_EDGES, goalDistance, inBox, inGoalArea } from '../../packages/engine/src/grid/pitch';
import {
  M,
  type GridDiagnostics,
  type ShotDiagnostic,
} from '../../packages/engine/src/grid/record';
import { eraRules, isLevel, type DecideRule } from '../../packages/engine/src/grid/setup';
import { random, zeroMetrics } from '../../packages/engine/src/primitives';
import { CHECKPOINT_LIMIT, TOTAL_LIMIT } from '../../apps/web/src/adapters/repository';

/** Changes whenever an entry, unit, band, condition, partition, size or tolerance changes (→MATCH-28). */
export const MATCH_PARITY_VERSION = 'match-parity-5';

export type Side = 0 | 1;
const sides = [0, 1] as const;
/** Units as stored in a record, and the canonical units reports compare in. */
export type Unit =
  | 'count'
  | 'minutes'
  | 'xg'
  | 'xg-hundredths'
  | 'xt'
  | 'xt-thousandths'
  | 'percent'
  | 'share'
  | 'ratio'
  | 'metres'
  | 'points-per-match';
export type MetricFamily =
  | 'team-metric'
  | 'team-detail'
  | 'team-xg'
  | 'player-metric'
  | 'player-detail'
  | 'participation'
  | 'incident'
  | 'outcome'
  | 'derived'
  | 'season';
/** How two paths' values of a metric are compared (→MATCH-28). */
export type Comparison = 'mean-cdf' | 'rate-ratio' | 'proportion';

export interface MetricDefinition {
  id: string;
  label: string;
  family: MetricFamily;
  /** The index-map key (M, TD, PD), field or incident kind it reads. */
  key: string;
  /** Index in its record row for the indexed families. */
  index?: number;
  stored: Unit;
  /** Canonical unit: the stored value times `scale`. */
  unit: Unit;
  scale: number;
  comparison: Comparison;
  /** Rare events take the dedicated relative-rate comparison (→MATCH-28). */
  rare: boolean;
  /** False when the slot exists at this level but carries no measurement. */
  applies: boolean;
  /** Player rows add up to this team metric: exactly, within per-shot rounding, or at most. */
  reconcile?: { team: string; side: 'own' | 'opponent'; kind: 'exact' | 'rounded' | 'at-most' };
  /** Derived ratios read recorded numerators and denominators (→MATCH-4). */
  ratio?: {
    numerator: string;
    denominator: string;
    denominatorSide: 'own' | 'opponent' | 'both';
    scale: number;
  };
  source: string;
}

interface CounterMeta {
  label: string;
  stored?: Unit;
  unit?: Unit;
  scale?: number;
  rare?: boolean;
  source: string;
}

const TEAM_METRIC_META: Record<keyof typeof M, CounterMeta> = {
  goals: { label: 'goals', source: 'MATCH-3' },
  assists: { label: 'assists', source: 'MATCH-3' },
  passes: { label: 'passes attempted', source: 'MATCH-3' },
  completed: { label: 'passes completed', source: 'MATCH-3' },
  shots: { label: 'shots', source: 'MATCH-3' },
  onTarget: { label: 'shots on target', source: 'MATCH-3' },
  tackles: { label: 'tackles', source: 'MATCH-3' },
  interceptions: { label: 'interceptions', source: 'MATCH-3' },
  dribbles: { label: 'successful take-ons', source: 'MATCH-3' },
  saves: { label: 'saves', source: 'MATCH-3' },
  minutes: { label: 'match length', stored: 'minutes', source: 'MATCH-3' },
  // MATCH-3 r19: the share of both sides' attempted passes, recorded as a part of 90.
  possession: { label: 'possession (pass share of 90)', stored: 'minutes', source: 'MATCH-3' },
};

const TEAM_DETAIL_META: Record<keyof typeof TD, CounterMeta> = {
  keyPasses: { label: 'key passes', source: 'MATCH-13' },
  bigChances: { label: 'big chances', source: 'MATCH-13' },
  bigChancesScored: { label: 'big chances scored', source: 'MATCH-13' },
  boxShots: { label: 'box shots', source: 'MATCH-13' },
  finalThirdPasses: { label: 'final-third passes', source: 'MATCH-13' },
  finalThirdCompleted: { label: 'final-third passes completed', source: 'MATCH-13' },
  progressivePasses: { label: 'progressive passes', source: 'MATCH-13' },
  takeOns: { label: 'take-ons attempted', source: 'MATCH-13' },
  highTurnovers: { label: 'high turnovers', source: 'MATCH-13' },
  buildUpPasses: { label: 'build-up pass attempts (opponent PPDA numerator)', source: 'MATCH-13' },
  pressActions: {
    label: 'press tackles, interceptions, challenges and fouls (PPDA denominator)',
    source: 'MATCH-13',
  },
  boxEntries: { label: 'box entries', source: 'MATCH-13' },
  frontOfBoxEntries: { label: 'front-of-box entries', source: 'MATCH-13' },
  lineBreakingPasses: { label: 'line-breaking passes', source: 'MATCH-13' },
  xtAdded: {
    label: 'xT added',
    stored: 'xt-thousandths',
    unit: 'xt',
    scale: 0.001,
    source: 'MATCH-13',
  },
  crosses: { label: 'crosses attempted', source: 'MATCH-13' },
  crossesCompleted: { label: 'crosses completed', source: 'MATCH-13' },
  cutBacks: { label: 'cut-backs', source: 'MATCH-13' },
  throughBalls: { label: 'through balls attempted', source: 'MATCH-13' },
  throughBallsCompleted: { label: 'through balls completed', source: 'MATCH-13' },
  progressiveCarries: { label: 'progressive carries', source: 'MATCH-13' },
  fouls: { label: 'fouls', source: 'MATCH-3' },
  yellowCards: { label: 'yellow cards', source: 'MATCH-19' },
  redCards: { label: 'red cards', rare: true, source: 'MATCH-19' },
  corners: { label: 'corners', source: 'MATCH-3' },
  offsides: { label: 'offsides', source: 'MATCH-3' },
  throwIns: { label: 'throw-ins', source: 'MATCH-18' },
  goalKicks: { label: 'goal kicks', source: 'MATCH-18' },
  freeKicks: { label: 'free kicks', source: 'MATCH-18' },
  penalties: { label: 'penalties awarded', rare: true, source: 'MATCH-18' },
  penaltiesScored: { label: 'penalties scored', rare: true, source: 'MATCH-18' },
};

type Reconcile = NonNullable<MetricDefinition['reconcile']>;
const PLAYER_DETAIL_META: Record<keyof typeof PD, CounterMeta & { reconcile?: Reconcile }> = {
  xg: {
    label: 'xG',
    stored: 'xg-hundredths',
    unit: 'xg',
    scale: 0.01,
    reconcile: { team: 'team.xg', side: 'own', kind: 'rounded' },
    source: 'MATCH-11',
  },
  xa: { label: 'xA', stored: 'xg-hundredths', unit: 'xg', scale: 0.01, source: 'MATCH-13' },
  keyPasses: { label: 'key passes', source: 'MATCH-13' },
  bigChancesCreated: {
    label: 'big chances created',
    reconcile: { team: 'td.bigChances', side: 'own', kind: 'at-most' },
    source: 'MATCH-13',
  },
  finalThirdPasses: { label: 'final-third passes', source: 'MATCH-13' },
  finalThirdCompleted: { label: 'final-third passes completed', source: 'MATCH-13' },
  progressivePasses: { label: 'progressive passes', source: 'MATCH-13' },
  takeOns: { label: 'take-ons attempted', source: 'MATCH-13' },
  highTurnovers: { label: 'high turnovers', source: 'MATCH-13' },
  boxEntries: { label: 'box entries', source: 'MATCH-13' },
  frontOfBoxEntries: { label: 'front-of-box entries', source: 'MATCH-13' },
  lineBreakingPasses: { label: 'line-breaking passes', source: 'MATCH-13' },
  xtAdded: {
    label: 'xT added',
    stored: 'xt-thousandths',
    unit: 'xt',
    scale: 0.001,
    source: 'MATCH-13',
  },
  crosses: { label: 'crosses attempted', source: 'MATCH-13' },
  crossesCompleted: { label: 'crosses completed', source: 'MATCH-13' },
  cutBacks: { label: 'cut-backs', source: 'MATCH-13' },
  throughBalls: { label: 'through balls attempted', source: 'MATCH-13' },
  throughBallsCompleted: { label: 'through balls completed', source: 'MATCH-13' },
  progressiveCarries: { label: 'progressive carries', source: 'MATCH-13' },
  fouls: { label: 'fouls', source: 'MATCH-3' },
  foulsWon: {
    label: 'fouls won',
    reconcile: { team: 'td.fouls', side: 'opponent', kind: 'exact' },
    source: 'MATCH-11',
  },
  yellowCards: { label: 'yellow cards', source: 'MATCH-19' },
  redCards: { label: 'red cards', rare: true, source: 'MATCH-19' },
  offsides: { label: 'offsides', source: 'MATCH-3' },
};

/** Every incident kind once; a new kind fails the type check below until it has an entry. */
export const INCIDENT_KINDS = ['yellow', 'secondYellow', 'red', 'sub', 'injury'] as const;
type MissingIncidentKind = Exclude<Incident['kind'], (typeof INCIDENT_KINDS)[number]>;
const incidentKindsComplete: [MissingIncidentKind] extends [never] ? true : never = true;
void incidentKindsComplete;
const RARE_INCIDENTS = new Set<string>(['secondYellow', 'red', 'injury']);

function counter(
  family: MetricFamily,
  prefix: string,
  key: string,
  index: number,
  meta: CounterMeta,
  extra: Partial<MetricDefinition> = {},
): MetricDefinition {
  const rare = meta.rare ?? false;
  return {
    id: `${prefix}.${key}`,
    label: meta.label,
    family,
    key,
    index,
    stored: meta.stored ?? 'count',
    unit: meta.unit ?? meta.stored ?? 'count',
    scale: meta.scale ?? 1,
    comparison: rare ? 'rate-ratio' : 'mean-cdf',
    rare,
    applies: true,
    source: meta.source,
    ...extra,
  };
}

function plain(
  id: string,
  family: MetricFamily,
  key: string,
  label: string,
  source: string,
  extra: Partial<MetricDefinition> = {},
): MetricDefinition {
  const rare = extra.rare ?? false;
  return {
    id,
    label,
    family,
    key,
    stored: 'count',
    unit: extra.stored ?? 'count',
    scale: 1,
    comparison: rare ? 'rate-ratio' : 'mean-cdf',
    rare,
    applies: true,
    source,
    ...extra,
  };
}

function ratioOf(
  key: string,
  label: string,
  numerator: string,
  denominator: string,
  denominatorSide: 'own' | 'opponent' | 'both' = 'own',
  unit: Unit = 'percent',
): MetricDefinition {
  const scale = unit === 'percent' ? 100 : 1;
  return plain(`ratio.${key}`, 'derived', key, label, 'MATCH-4', {
    stored: 'ratio',
    unit,
    ratio: { numerator, denominator, denominatorSide, scale },
  });
}

/**
 * Every measured quantity of a match result: the Metrics/TD/PD indexes at team and player level,
 * team xG, participation, each incident kind, outcomes, ratios with their recorded denominators and
 * the season-level measures. Indexes come from the contracts; a new index without an entry fails
 * `validateRegistry`.
 */
export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  ...Object.entries(M).map(([key, index]) =>
    counter('team-metric', 'team', key, index, TEAM_METRIC_META[key as keyof typeof M]),
  ),
  plain('team.xg', 'team-xg', 'xg', 'xG', 'MATCH-11', { stored: 'xg' }),
  ...Object.entries(TD).map(([key, index]) =>
    counter('team-detail', 'td', key, index, TEAM_DETAIL_META[key as keyof typeof TD]),
  ),
  ...Object.entries(M).map(([key, index]) => {
    const meta = TEAM_METRIC_META[key as keyof typeof M];
    if (key === 'minutes')
      return counter('player-metric', 'player', key, index, { ...meta, label: 'minutes played' });
    // Player lines leave the possession slot unused: the team row holds possession.
    if (key === 'possession')
      return counter('player-metric', 'player', key, index, meta, { applies: false });
    return counter('player-metric', 'player', key, index, meta, {
      reconcile: { team: `team.${key}`, side: 'own', kind: 'exact' },
    });
  }),
  ...Object.entries(PD).map(([key, index]) => {
    const { reconcile, ...meta } = PLAYER_DETAIL_META[key as keyof typeof PD];
    // A player counter named like a team counter adds up to it exactly.
    return counter('player-detail', 'pd', key, index, meta, {
      reconcile:
        reconcile ?? (key in TD ? { team: `td.${key}`, side: 'own', kind: 'exact' } : undefined),
    });
  }),
  plain('participation.lines', 'participation', 'lines', 'players who took part', 'MATCH-27'),
  plain('participation.minutes', 'participation', 'minutes', 'player minutes', 'MATCH-27', {
    stored: 'minutes',
  }),
  ...INCIDENT_KINDS.map((kind) =>
    plain(`incident.${kind}`, 'incident', kind, `${kind} incidents`, 'MATCH-19', {
      rare: RARE_INCIDENTS.has(kind),
    }),
  ),
  plain('outcome.homeWin', 'outcome', 'homeWin', '90-minute home win', 'MATCH-2', {
    comparison: 'proportion',
  }),
  plain('outcome.draw', 'outcome', 'draw', '90-minute draw', 'MATCH-2', {
    comparison: 'proportion',
  }),
  plain('outcome.awayWin', 'outcome', 'awayWin', '90-minute away win', 'MATCH-2', {
    comparison: 'proportion',
  }),
  plain('outcome.goals', 'outcome', 'goals', 'goals (both sides)', 'MATCH-23'),
  plain('outcome.goalDifference', 'outcome', 'goalDifference', 'home minus away goals', 'MATCH-2'),
  plain('outcome.extraTime', 'outcome', 'extraTime', 'extra time played', 'MATCH-6', {
    rare: true,
  }),
  plain('outcome.shootout', 'outcome', 'shootout', 'shoot-out played', 'MATCH-6', { rare: true }),
  plain('outcome.addedMinutes', 'outcome', 'addedMinutes', 'added time', 'MATCH-1', {
    stored: 'minutes',
  }),
  ratioOf('passCompletion', 'pass completion', 'team.completed', 'team.passes'),
  ratioOf('shotAccuracy', 'shots on target', 'team.onTarget', 'team.shots'),
  ratioOf('conversion', 'goals per shot', 'team.goals', 'team.shots'),
  ratioOf('xgPerShot', 'xG per shot', 'team.xg', 'team.shots', 'own', 'xg'),
  ratioOf(
    'finalThirdAccuracy',
    'final-third accuracy',
    'td.finalThirdCompleted',
    'td.finalThirdPasses',
  ),
  ratioOf('crossCompletion', 'cross completion', 'td.crossesCompleted', 'td.crosses'),
  ratioOf(
    'throughBallCompletion',
    'through-ball completion',
    'td.throughBallsCompleted',
    'td.throughBalls',
  ),
  ratioOf('takeOnSuccess', 'take-on success', 'team.dribbles', 'td.takeOns'),
  ratioOf('bigChanceConversion', 'big-chance conversion', 'td.bigChancesScored', 'td.bigChances'),
  ratioOf('penaltyConversion', 'penalty conversion', 'td.penaltiesScored', 'td.penalties'),
  ratioOf('ppda', 'PPDA', 'td.buildUpPasses', 'td.pressActions', 'opponent', 'ratio'),
  ratioOf('fieldTilt', 'field tilt', 'td.finalThirdPasses', 'td.finalThirdPasses', 'both'),
  ratioOf('possessionShare', 'possession', 'team.possession', 'team.possession', 'both'),
  plain('season.championPpg', 'season', 'championPpg', 'champion points per match', 'MATCH-28', {
    stored: 'points-per-match',
  }),
  plain('season.bottomPpg', 'season', 'bottomPpg', 'bottom club points per match', 'MATCH-28', {
    stored: 'points-per-match',
  }),
  plain('season.goalsPerMatch', 'season', 'goalsPerMatch', 'league goals per match', 'MATCH-28'),
  plain('season.topScorerGoals', 'season', 'topScorerGoals', 'leading scorer goals', 'MATCH-28'),
  plain(
    'career.topScorerGoals',
    'season',
    'careerTopScorerGoals',
    'career scoring leader goals',
    'MATCH-28',
  ),
];

export const METRIC_BY_ID: ReadonlyMap<string, MetricDefinition> = new Map(
  METRIC_REGISTRY.map((d) => [d.id, d]),
);

/** The authoritative index maps the registry must cover exactly once. */
export const COUNTER_INDEXES = {
  'team-metric': M as Record<string, number>,
  'team-detail': TD as Record<string, number>,
  'player-metric': M as Record<string, number>,
  'player-detail': PD as Record<string, number>,
};
const ROW_WIDTHS = {
  'team-metric': zeroMetrics().length,
  'team-detail': TEAM_DETAIL_SIZE,
  'player-metric': zeroMetrics().length,
  'player-detail': PLAYER_DETAIL_SIZE,
};

/**
 * Coverage errors: an index without an entry, an entry twice, an entry outside its index map or
 * row width, an unknown incident kind, or a reference to an unregistered metric.
 */
export function validateRegistry(
  registry: readonly MetricDefinition[] = METRIC_REGISTRY,
  indexes: Record<keyof typeof COUNTER_INDEXES, Record<string, number>> = COUNTER_INDEXES,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const d of registry) {
    if (ids.has(d.id)) errors.push(`${d.id} is registered twice`);
    ids.add(d.id);
  }
  for (const family of Object.keys(indexes) as (keyof typeof COUNTER_INDEXES)[]) {
    const entries = registry.filter((d) => d.family === family);
    const seen = new Map<number, string>();
    for (const d of entries) {
      if (d.index === undefined || indexes[family][d.key] !== d.index)
        errors.push(`${d.id} is not ${family} index ${d.key}`);
      else if (seen.has(d.index))
        errors.push(`${family} index ${d.index} is covered by ${seen.get(d.index)} and ${d.id}`);
      else seen.set(d.index, d.id);
    }
    for (const [key, index] of Object.entries(indexes[family])) {
      if (!seen.has(index)) errors.push(`${family} index ${index} (${key}) has no registry entry`);
      if (index >= ROW_WIDTHS[family])
        errors.push(`${family} index ${index} (${key}) lies outside the row width`);
    }
  }
  const kinds = registry.filter((d) => d.family === 'incident').map((d) => d.key);
  for (const kind of INCIDENT_KINDS)
    if (kinds.filter((k) => k === kind).length !== 1)
      errors.push(`incident ${kind} must be registered exactly once`);
  for (const kind of kinds)
    if (!(INCIDENT_KINDS as readonly string[]).includes(kind))
      errors.push(`incident ${kind} is not an incident kind`);
  for (const d of registry) {
    for (const ref of [d.reconcile?.team, d.ratio?.numerator, d.ratio?.denominator])
      if (ref !== undefined && !ids.has(ref)) errors.push(`${d.id} refers to unknown ${ref}`);
  }
  return errors;
}

// ---- Intended targets ---------------------------------------------------------------------------

/**
 * MATCH-2's outcome target as scripts/calibrate.ts defines it: 16 Elo per rating point, saturating
 * at a 25-point gap, with long-run top-league draw shares by the favourite's expected score.
 */
export const OUTCOME_TARGET = {
  eloPerPoint: 16,
  saturation: 25,
  drawShare: [
    [0.5, 0.28],
    [0.7, 0.22],
    [0.8, 0.15],
    [0.88, 0.1],
    [0.93, 0.08],
    [1, 0],
  ] as readonly (readonly [number, number])[],
  /** Each engine holds the curve across these home-minus-away gaps. */
  gaps: [-10, 40] as const,
};
/** Target home win, draw and away win shares for a home-minus-away match-strength gap. */
export function outcomeTarget(gap: number) {
  const capped = Math.sign(gap) * Math.min(Math.abs(gap), OUTCOME_TARGET.saturation);
  const e = 1 / (1 + 10 ** ((-OUTCOME_TARGET.eloPerPoint * capped) / 400));
  const x = Math.max(e, 1 - e);
  const table = OUTCOME_TARGET.drawShare;
  let draw = 0;
  for (let i = 1; i < table.length; i++)
    if (x <= table[i]![0]) {
      const [x0, d0] = table[i - 1]!,
        [x1, d1] = table[i]!;
      draw = d0 + ((d1 - d0) * (x - x0)) / (x1 - x0);
      break;
    }
  return { homeWin: e - draw / 2, draw, awayWin: 1 - e - draw / 2 };
}
/** scripts/calibrate.ts's bucket of a home-minus-away gap: 5-point steps, ends clamped. */
export const gapBucket = (gap: number) =>
  Math.max(GAP_BUCKETS[0]!, Math.min(GAP_BUCKETS.at(-1)!, Math.round(gap / 5) * 5)) + 0;

/** One match as a report reads it. */
export interface MatchSample {
  record: MatchRecord;
  /** Grid-only measurements: pass directions, possessions, shot places and ball in play. */
  diagnostics?: GridDiagnostics;
  /** The path records incidents, so an absent list means none happened rather than untracked. */
  incidentsTracked: boolean;
  /** A CORPUS_CONFIG condition id. */
  condition: string;
  /**
   * The corpus fixture id, which is also its seed: both paths play the same id, so their samples
   * of one fixture pair (MATCH-29's paired parity, T396).
   */
  fixture?: string;
  /** Home-minus-away match strength before form (MATCH-2), for the outcome curve. */
  gap?: number;
  /**
   * Each side's freshness at the final whistle (→MATCH-29): 100 minus the in-match fatigue its
   * engine holds for the players then on the pitch. No recorded counter carries it, so the adapter
   * reads it from the path's own result; absent when the path does not expose it.
   */
  freshness?: readonly [number, number];
  /**
   * The aggregate path's ledger readings for the rows its cells resolve (T284): open-play pass
   * directions by band, each shot's cell, kind and shooter's line, and ball in play. Rows that need
   * a point or a possession sequence (shot distance, possessions) have no ledger reading.
   */
  ledger?: LedgerDiagnostics;
}
/** One aggregate shot as the target bands read it: its cell (the shooting side's attack frame). */
export interface LedgerShot {
  side: Side;
  cell: number;
  header: boolean;
  /** A corner or a free kick, delivered or shot directly (penalties apart). */
  setPiece: boolean;
  penalty: boolean;
  goal: boolean;
  /** The shooter's line at his slot then. */
  line: string;
}
export interface LedgerDiagnostics {
  /** Seconds the ball was in play. */
  ballInPlay: number;
  /** Open-play pass attempts per side into a higher band, the same band and a lower band. */
  directions: [number[], number[]];
  shots: LedgerShot[];
}
/** Season-level values keyed by `season`-family metric id. */
export type SeasonSample = Readonly<Record<string, number>>;

type Contribution = readonly [numerator: number, denominator: number];
export interface TargetBand {
  id: string;
  label: string;
  band: readonly [number, number];
  unit: Unit;
  source: string;
  /**
   * Read from the record alone, from the grid's diagnostics or the aggregate ledger's cells
   * (`cells`), or from the grid's diagnostics only (a point or a possession sequence).
   */
  reads: 'record' | 'cells' | 'diagnostics';
  /** A ratio of sums over matches, or the median of pooled values. */
  estimator: 'ratio' | 'median';
  /** Per match: numerator and denominator (ratio) or the values (median); undefined when absent. */
  contribution: (s: MatchSample) => Contribution | readonly number[] | undefined;
  scale: number;
  /**
   * A count or a duration over the whole match: a match with extra time is read per 90 minutes
   * played, so knockout conditions meet the 90-minute bands on the same footing.
   */
  perNinety: boolean;
}

const both = (s: MatchSample, read: (side: Side) => number | undefined) => {
  const a = read(0),
    b = read(1);
  return a === undefined || b === undefined ? undefined : a + b;
};
const metric = (s: MatchSample, index: number) =>
  both(s, (side) => s.record.metrics[side]?.[index]);
const detail = (s: MatchSample, index: number) =>
  both(s, (side) => s.record.detail?.[side]?.[index]);
const perTeam = (value: number | undefined): Contribution | undefined =>
  value === undefined ? undefined : [value, 2];
const share = (num: number | undefined, den: number | undefined): Contribution | undefined =>
  num === undefined || den === undefined ? undefined : [num, den];
/** The match's incidents: none when the path tracks them and recorded none, undefined when untracked. */
export function incidentsOf(s: MatchSample): readonly Incident[] | undefined {
  return s.record.incidents ?? (s.incidentsTracked ? [] : undefined);
}
/** Minutes of play a match ran: 90, or 120 with extra time (→MATCH-6). */
const matchMinutes = (r: MatchRecord) => (r.regulation ? 120 : 90);
const shotsOf = (s: MatchSample) => s.diagnostics?.shots;
const shotShare = (s: MatchSample, keep: (x: ShotDiagnostic) => boolean) => {
  const shots = shotsOf(s);
  return shots && share(shots.filter(keep).length, shots.length);
};
type ShotPlace = 'goalArea' | 'box' | 'outside';
/** Each shot's place: the grid's point, or the aggregate cell (cells follow the markings, MATCH-14). */
const placesOf = (s: MatchSample): ShotPlace[] | undefined =>
  s.diagnostics
    ? s.diagnostics.shots.map((x) =>
        inGoalArea(point(x)) ? 'goalArea' : inBox(point(x)) ? 'box' : 'outside',
      )
    : s.ledger?.shots.map((x) =>
        inGoalAreaCell(x.cell) ? 'goalArea' : inBoxCell(x.cell) ? 'box' : 'outside',
      );
const placeShare = (s: MatchSample, place: ShotPlace) => {
  const places = placesOf(s);
  return places && share(places.filter((p) => p === place).length, places.length);
};
const goalShare = (s: MatchSample, keep: (g: ShotDiagnostic | LedgerShot) => boolean) => {
  const goals = (shotsOf(s) ?? s.ledger?.shots)?.filter((g) => g.goal);
  return goals && share(goals.filter(keep).length, goals.length);
};
const direction = (s: MatchSample, d: number) => {
  const dirs = s.diagnostics?.directions ?? s.ledger?.directions;
  return (
    dirs &&
    share(
      dirs[0][d]! + dirs[1][d]!,
      dirs[0].reduce((a, b) => a + b, 0) + dirs[1].reduce((a, b) => a + b, 0),
    )
  );
};
const point = (shot: { x: number; y: number }) => [shot.x, shot.y] as const;

function band(
  id: string,
  label: string,
  range: readonly [number, number],
  unit: Unit,
  reads: TargetBand['reads'],
  contribution: TargetBand['contribution'],
  options: { estimator?: TargetBand['estimator']; source?: string } = {},
): TargetBand {
  const estimator = options.estimator ?? 'ratio';
  return {
    id,
    label,
    band: range,
    unit,
    source: options.source ?? 'MATCH-23',
    reads,
    estimator,
    contribution,
    scale: unit === 'percent' ? 100 : 1,
    perNinety: estimator === 'ratio' && (unit === 'count' || unit === 'minutes'),
  };
}

/** MATCH-23's intended bands for equal top-tier sides (and MATCH-1's added time), authoritative. */
export const TARGET_BANDS: readonly TargetBand[] = [
  band('passes', 'passes attempted (team)', [430, 520], 'count', 'record', (s) =>
    perTeam(metric(s, M.passes)),
  ),
  band('passCompletion', 'pass completion', [76, 84], 'percent', 'record', (s) =>
    share(metric(s, M.completed), metric(s, M.passes)),
  ),
  band('passForward', 'passes forward', [30, 40], 'percent', 'cells', (s) => direction(s, 0)),
  band('passLateral', 'passes lateral', [45, 55], 'percent', 'cells', (s) => direction(s, 1)),
  band('passBack', 'passes back', [12, 18], 'percent', 'cells', (s) => direction(s, 2)),
  band('possessions', 'possessions (team)', [85, 105], 'count', 'diagnostics', (s) =>
    perTeam(s.diagnostics?.possessions.length),
  ),
  band(
    'passesPerPossession',
    'median passes in a possession',
    [2, 4],
    'count',
    'diagnostics',
    (s) => s.diagnostics?.possessions.map((p) => p.passes),
    { estimator: 'median' },
  ),
  band(
    'possessionShots',
    'possessions ending in a shot',
    [10, 15],
    'percent',
    'diagnostics',
    (s) => {
      const spells = s.diagnostics?.possessions;
      return spells && share(spells.filter((p) => p.shot).length, spells.length);
    },
  ),
  band('shots', 'shots (team)', [11, 14], 'count', 'record', (s) => perTeam(metric(s, M.shots))),
  band('onTarget', 'shots on target', [30, 37], 'percent', 'record', (s) =>
    share(metric(s, M.onTarget), metric(s, M.shots)),
  ),
  band('xgPerShot', 'xG per shot', [0.09, 0.12], 'xg', 'record', (s) =>
    share(
      both(s, (side) => s.record.xg?.[side]),
      metric(s, M.shots),
    ),
  ),
  band('shotsGoalArea', 'shots from the goal area', [6, 9], 'percent', 'cells', (s) =>
    placeShare(s, 'goalArea'),
  ),
  band('shotsBox', 'shots from the rest of the box', [48, 58], 'percent', 'cells', (s) =>
    placeShare(s, 'box'),
  ),
  band('shotsOutside', 'shots from outside the box', [32, 42], 'percent', 'cells', (s) =>
    placeShare(s, 'outside'),
  ),
  band('shotDistance', 'mean shot distance', [15, 18], 'metres', 'diagnostics', (s) => {
    const shots = shotsOf(s);
    return (
      shots &&
      share(
        shots.reduce((a, x) => a + goalDistance(point(x)), 0),
        shots.length,
      )
    );
  }),
  band('shotsFar', 'shots from 30 m or more', [0, 10], 'percent', 'diagnostics', (s) =>
    shotShare(s, (x) => goalDistance(point(x)) >= 30),
  ),
  band('shotsOwnHalf', 'shots from the own half', [0, 0.5], 'percent', 'diagnostics', (s) =>
    shotShare(s, (x) => x.x < BAND_EDGES[4]),
  ),
  band('crosses', 'crosses (team)', [13, 20], 'count', 'record', (s) =>
    perTeam(detail(s, TD.crosses)),
  ),
  band('crossCompletion', 'crosses completed', [20, 30], 'percent', 'record', (s) =>
    share(detail(s, TD.crossesCompleted), detail(s, TD.crosses)),
  ),
  band('takeOns', 'take-ons (team)', [14, 20], 'count', 'record', (s) =>
    perTeam(detail(s, TD.takeOns)),
  ),
  band('takeOnSuccess', 'take-ons successful', [40, 60], 'percent', 'record', (s) =>
    share(metric(s, M.dribbles), detail(s, TD.takeOns)),
  ),
  band(
    'tacklesInterceptions',
    'tackles + interceptions (team)',
    [22, 30],
    'count',
    'record',
    (s) => {
      const tackles = metric(s, M.tackles),
        interceptions = metric(s, M.interceptions);
      return perTeam(
        tackles === undefined || interceptions === undefined ? undefined : tackles + interceptions,
      );
    },
  ),
  band('throwIns', 'throw-ins (team)', [17, 23], 'count', 'record', (s) =>
    perTeam(detail(s, TD.throwIns)),
  ),
  band('corners', 'corners (team)', [4, 6], 'count', 'record', (s) =>
    perTeam(detail(s, TD.corners)),
  ),
  band('goalKicks', 'goal kicks (team)', [7, 9], 'count', 'record', (s) =>
    perTeam(detail(s, TD.goalKicks)),
  ),
  band('fouls', 'fouls (team)', [10, 13], 'count', 'record', (s) => perTeam(detail(s, TD.fouls))),
  band('offsides', 'offsides (team)', [1.7, 1.9], 'count', 'record', (s) =>
    perTeam(detail(s, TD.offsides)),
  ),
  band('yellowCards', 'yellow cards (match)', [3.3, 4.3], 'count', 'record', (s) => {
    const list = incidentsOf(s);
    return list && [list.filter((x) => x.kind === 'yellow' || x.kind === 'secondYellow').length, 1];
  }),
  band('redCards', 'red cards (match)', [0.08, 0.15], 'count', 'record', (s) => {
    const list = incidentsOf(s);
    return list && [list.filter((x) => x.kind === 'red' || x.kind === 'secondYellow').length, 1];
  }),
  band('goals', 'goals (match)', [2.6, 2.9], 'count', 'record', (s) => [
    s.record.score.home + s.record.score.away,
    1,
  ]),
  band(
    'setPieceGoals',
    'goals from set pieces without penalties',
    [20, 28],
    'percent',
    'cells',
    (s) => goalShare(s, (g) => g.setPiece),
  ),
  band('penaltyGoals', 'goals from penalties', [6, 9], 'percent', 'record', (s) =>
    share(detail(s, TD.penaltiesScored), s.record.score.home + s.record.score.away),
  ),
  band('headedGoals', 'headed goals', [14, 20], 'percent', 'cells', (s) =>
    goalShare(s, (g) => g.header),
  ),
  band('goalsFW', 'goals by forwards', [50, 60], 'percent', 'cells', (s) =>
    goalShare(s, (g) => g.line === 'FW'),
  ),
  band('goalsMF', 'goals by midfielders', [27, 37], 'percent', 'cells', (s) =>
    goalShare(s, (g) => g.line === 'MF'),
  ),
  band('goalsDF', 'goals by defenders', [8, 15], 'percent', 'cells', (s) =>
    goalShare(s, (g) => g.line === 'DF'),
  ),
  band('ballInPlay', 'ball in play (match)', [54, 58], 'minutes', 'cells', (s) => {
    const seconds = s.diagnostics?.ballInPlay ?? s.ledger?.ballInPlay;
    return seconds === undefined ? undefined : [seconds / 60, 1];
  }),
  band(
    'addedTime',
    'added time (match)',
    [6, 12],
    'minutes',
    'record',
    (s) => s.record.added && [s.record.added.reduce((a, b) => a + b, 0), 1],
    { source: 'MATCH-1' },
  ),
];

const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
/** A per-tactic measure of MATCH-29, read for each side of a match. */
export type PairingMeasure = 'possession' | 'xgConceded' | 'highRegains' | 'freshness';
/**
 * An ordering of one measure among the four tactics, each measured against the other three: the
 * highest, the lowest, or at most the mean of the other three.
 */
export interface PairingOrdering {
  measure: PairingMeasure;
  highest?: Tactic;
  lowest?: Tactic;
  atMostOthersMean?: Tactic;
}

/**
 * MATCH-29's tactic-pairing bands for equal top-tier sides (→MATCH-8), authoritative. A pairing is
 * unordered and its venues are the two home/away orders, pooled with equal weight (a mirror pairing
 * has one venue); a tactic's measure is pooled over its three other opponents and both venues the
 * same way. Results are 90-minute results and per-match counts are per 90 minutes played. A band
 * holds only when its 95% interval lies inside it; an ordering only when each of its differences
 * lies beyond its interval.
 */
export const TACTIC_PAIRING_TARGET = {
  version: 1,
  source: 'MATCH-29',
  tactics: TACTICS,
  /** Draw share in each pairing, mirror pairings included. */
  draws: [0.2, 0.3] as readonly [number, number],
  /** Largest gap between the two tactics' win shares in a pairing of two tactics. */
  winShareGap: 0.12,
  /** Head to head, the first tactic's win share at least the second's. */
  atLeast: [['counter', 'press']] as readonly (readonly [Tactic, Tactic])[],
  /** League points for a 90-minute win and draw. */
  points: { win: 3, draw: 1 },
  /** Each tactic's points a match against the other three lie within this of the four's mean. */
  pointsFromMean: 0.15,
  /**
   * What each measure reads of a side: a registered metric of its own or its opponent's side, or
   * the sample's end-of-match freshness, which no recorded counter carries. A count over the match
   * is read per 90 minutes played.
   */
  measures: {
    possession: {
      label: 'possession share',
      reads: 'ratio.possessionShare',
      side: 'own',
      perNinety: false,
    },
    xgConceded: {
      label: 'xG conceded a match',
      reads: 'team.xg',
      side: 'opponent',
      perNinety: true,
    },
    highRegains: {
      label: 'high regains a match',
      reads: 'td.highTurnovers',
      side: 'own',
      perNinety: true,
    },
    freshness: {
      label: 'end-of-match freshness',
      reads: 'freshness',
      side: 'own',
      perNinety: false,
    },
  } as Readonly<
    Record<
      PairingMeasure,
      { label: string; reads: string; side: 'own' | 'opponent'; perNinety: boolean }
    >
  >,
  orderings: [
    { measure: 'possession', highest: 'possession', lowest: 'counter' },
    { measure: 'xgConceded', atMostOthersMean: 'balanced' },
    { measure: 'highRegains', highest: 'press' },
    { measure: 'freshness', lowest: 'press' },
  ] as readonly PairingOrdering[],
};

/** A season-level measure of MATCH-23's scoring concentration. */
export type ScoringRow = 'clubTopScorerShare' | 'leagueTopScorerGoals' | 'hatTricksPerMatch';
/**
 * MATCH-23's scoring concentration of a top-tier 38-round league season, authoritative (ratified
 * from T284's proposal; its source, Premier League 2013/14–2023/24, is in docs/MATCH-BASELINES.md
 * "시즌 득점 집중도"). Readings get verdicts like any band.
 */
export const SCORING_CONCENTRATION_TARGET = {
  version: 2,
  source: 'MATCH-23',
  rows: {
    clubTopScorerShare: {
      label: "club top scorer's share of its league goals (mean over clubs)",
      band: [0.2, 0.3],
      unit: 'share',
    },
    leagueTopScorerGoals: {
      label: "the league top scorer's goals in a 38-round season",
      band: [22, 32],
      unit: 'count',
    },
    hatTricksPerMatch: { label: 'hat-tricks a match', band: [0.02, 0.05], unit: 'count' },
  } as Readonly<Record<ScoringRow, { label: string; band: readonly [number, number]; unit: Unit }>>,
};
/** A reading of a measure: its estimate, 95% interval and the observations behind it. */
export interface MeasureReading {
  value: number;
  interval: readonly [number, number];
  n: number;
}
/** A Poisson rate's reading: events a match with its 95% log interval (none seen: rule of three). */
export function poissonReading(events: number, matches: number): MeasureReading {
  const value = events / Math.max(1, matches);
  const z = zInterval();
  return {
    value,
    interval:
      events > 0
        ? [value * Math.exp(-z / Math.sqrt(events)), value * Math.exp(z / Math.sqrt(events))]
        : [0, 3 / Math.max(1, matches)],
    n: matches,
  };
}
export interface ScoringVerdict {
  id: ScoringRow;
  label: string;
  band: readonly [number, number];
  status: 'inside' | 'outside' | 'unresolved' | 'underpowered' | 'missing' | 'context';
  value?: number;
  interval?: readonly [number, number];
  n: number;
  /** Why a reading is context rather than a verdict. */
  note?: string;
}
/** Why a hat-trick rate outside the core condition is no verdict. */
export const HAT_TRICK_CONTEXT =
  "context: MATCH-23 states the hat-trick rate for a top-tier league season, which only the core condition's equal top-tier sides sample";
/**
 * MATCH-23's hat-trick row read from one condition's matches: a verdict on the core condition (the
 * row's own setting, equal top-tier sides in league fixtures), context on any other condition
 * (another gap, tier, era, tactic, fatigue or knockout rule).
 */
export function hatTrickReading(
  hatTricks: number,
  matches: number,
  condition: Pick<ParityCondition, 'family'>,
): ScoringVerdict {
  const verdict = scoringConcentrationVerdicts({
    hatTricksPerMatch: poissonReading(hatTricks, matches),
  }).find((v) => v.id === 'hatTricksPerMatch')!;
  return condition.family === 'core'
    ? verdict
    : { ...verdict, status: 'context', note: HAT_TRICK_CONTEXT };
}
/**
 * MATCH-23's verdicts on scoring concentration, like any band: inside only when the 95% interval
 * lies inside it, a measure without a reading missing, fewer than PARITY_CONFIG.minimumSamples
 * observations underpowered.
 */
export function scoringConcentrationVerdicts(
  readings: Partial<Record<ScoringRow, MeasureReading>>,
): ScoringVerdict[] {
  return (Object.keys(SCORING_CONCENTRATION_TARGET.rows) as ScoringRow[]).map((id) => {
    const { label, band } = SCORING_CONCENTRATION_TARGET.rows[id];
    const r = readings[id];
    if (!r) return { id, label, band, status: 'missing', n: 0 };
    const [lo, hi] = band;
    const status =
      r.n < PARITY_CONFIG.minimumSamples
        ? 'underpowered'
        : r.interval[0] >= lo && r.interval[1] <= hi
          ? 'inside'
          : r.interval[1] < lo || r.interval[0] > hi
            ? 'outside'
            : 'unresolved';
    return { id, label, band, status, value: r.value, interval: r.interval, n: r.n };
  });
}

// ---- Comparison, corpus and performance settings -----------------------------------------------

/** MATCH-28's comparison settings, defined once. */
export const PARITY_CONFIG = {
  version: 1,
  /** Two-sided uncertainty intervals at this level. */
  confidence: 0.95,
  /** Power the predeclared validation and rare-event sizes aim for. */
  power: 0.8,
  /** Outcome-rate differences: percentage points as a share. */
  outcomeRateMargin: 0.03,
  /** Mean differences: the larger of this share of the reference mean magnitude… */
  meanRelativeMargin: 0.05,
  /** …or this many reference standard deviations. */
  meanSdMargin: 0.1,
  /** Distribution CDF differences (Kolmogorov distance). */
  cdfMargin: 0.08,
  /** Supported pairwise correlation differences. */
  correlationMargin: 0.1,
  /** Rare events: relative rate margin. */
  rareRelativeMargin: 0.2,
  /** Fewer observations (clusters) than this per side are underpowered for any interval. */
  minimumSamples: 30,
  /**
   * Interval procedures, all deterministic: cluster-robust (match) normal intervals for means,
   * DKW bounds for the CDF distance, Newcombe for proportion differences, Poisson log intervals for
   * rate ratios, Zou with Fisher z for correlations, delta-method ratio-of-sums and order-statistic
   * medians for target bands.
   */
  intervals: 'cluster-normal|dkw|newcombe|poisson-log|zou-fisher|delta-ratio|order-median',
  /** Important relationships compared as Pearson correlations of team-match values. */
  relationships: [
    ['team.shots', 'team.goals'],
    ['team.xg', 'team.goals'],
    ['team.possession', 'team.passes'],
    ['td.finalThirdPasses', 'team.shots'],
    ['td.boxEntries', 'td.boxShots'],
    ['td.keyPasses', 'team.assists'],
    ['td.fouls', 'incident.yellow'],
  ] as readonly (readonly [string, string])[],
} as const;

export type ConditionFamily =
  'core' | 'gap' | 'tactics' | 'tier' | 'fatigue' | 'era' | 'knockout' | 'rare' | 'season';
export interface ParityCondition {
  id: string;
  family: ConditionFamily;
  label: string;
  rare: boolean;
  /** Fixture conditions compare match metrics; season conditions compare the season measures. */
  level: 'match' | 'season';
  /** Metrics the condition's own rules make impossible, each with its rule (→MATCH-28). */
  notApplicable: Readonly<Record<string, string>>;
  params: Readonly<Record<string, unknown>>;
}
/** Home-minus-away match-strength buckets scripts/calibrate.ts prints (5-point steps, ends clamped). */
const GAP_BUCKETS = Array.from({ length: 16 }, (_, i) => -35 + 5 * i);
/** Tier strength bands scripts/calibrate.ts samples. */
const TIER_BANDS: readonly (readonly [string, number, number])[] = [
  ['tier1', 72, 82],
  ['tier2', 61, 71],
  ['tier3', 50, 60],
  ['tier4', 39, 49],
  ['amateur', 35, 52],
];
/** Rule seasons where substitutions or cards change (→MATCH-19/20), and the modern core year. */
const ERA_YEARS = [1950, 1965, 1967, 1970, 1987, 1995, 1996, 2008, 2022, 2024];
/** The core condition's fixture; every family but era and knockout varies one factor around it. */
const CORE_FIXTURE = { year: 2024, round: 1, kind: 'league' } as const;
/** A tie's fixture: a cup match, since a league fixture never has to produce a winner. */
const TIE_FIXTURE = { ...CORE_FIXTURE, kind: 'cup' } as const;

/**
 * Metrics a condition's own rules make impossible (→MATCH-28): extra time and shoot-outs outside a
 * tie that must produce a winner (→MATCH-6), substitutions in an era that allows none (→MATCH-20).
 * Read from the condition's rules only, never from what a sample happened to record.
 */
export function ruleExclusions(rules: { year: number; decide?: unknown }): Record<string, string> {
  const out: Record<string, string> = {};
  if (rules.decide === undefined) {
    out['outcome.extraTime'] = 'no tie that must produce a winner (MATCH-6)';
    out['outcome.shootout'] = 'no tie that must produce a winner (MATCH-6)';
  }
  if (eraRules(rules.year).maxSubs === 0)
    out['incident.sub'] = `no substitutions in ${rules.year} (MATCH-20)`;
  return out;
}
const condition = (
  family: ConditionFamily,
  key: string,
  label: string,
  params: Record<string, unknown>,
  rare = false,
): ParityCondition => {
  const fixture = params.fixture as { year: number } | undefined;
  const year = (params.year as number | undefined) ?? fixture?.year ?? CORE_FIXTURE.year;
  return {
    id: `${family}:${key}`,
    family,
    label,
    rare,
    level: family === 'season' ? 'season' : 'match',
    notApplicable: ruleExclusions({ year, decide: params.decide }),
    params,
  };
};

/**
 * The pre-match squad fatigue both sides of a forced tactic pairing start from: what a club nobody
 * owns carries when it does not press (world.ts `npcSquad`), and within ordinary match fitness
 * (FRESH_FATIGUE), so neither side pays a weekly press load for a tactic it is only made to play.
 */
export const NEUTRAL_SQUAD_FATIGUE = 0;

/**
 * Corpus sizes, the condition matrix and the seed partitions. Families vary one factor around the
 * core condition; no unmeasured combination of families is claimed.
 */
export const CORPUS_CONFIG = {
  /**
   * 2: tactic pairings declare their neutral squad fatigue (T284). 3: a forced pairing fields
   * squads built for the forced formation in both runners (T321), and its sample's `gap` rates
   * those rosters at the formation played (`forcedGap`, T322).
   */
  version: 3,
  /** Fixture ids carry the partition, so every named match stream of a fixture differs by partition. */
  partitions: {
    calibration: { prefix: 'parity-calibration' },
    validation: { prefix: 'parity-validation' },
  },
  calibrationPerCondition: 600,
  /** Validation size per condition comes from pilot variance, clamped to these bounds. */
  validation: { minimum: 4000, maximum: 100000 },
  rarePerCondition: 10000,
  seasonsPerCondition: { calibration: 20, validation: 200 },
  /** A smoke run's matches per path: exercises the reports, proves nothing. */
  smokePerCondition: 40,
  conditions: [
    condition('core', 'equal-top-tier', 'equal top-tier sides, modern era (MATCH-23)', {
      worldSeeds: ['grid-bands-1', 'grid-bands-2', 'grid-bands-3', 'grid-bands-4'],
      /** Founding input of each world besides its seed. */
      world: { country: 'ENG', name: 'Parity Pilot', color: '#2a5d8f', level: 'normal' },
      countries: ['ENG', 'ESP', 'GER', 'ITA'],
      maxRatingGap: 2,
      /**
       * Pairs in world, country, then roster order (i < j) of the top-tier clubs nobody owns whose
       * ratings differ by at most maxRatingGap; fixture i plays pair i mod pairs, the first at home.
       */
      pairing: 'world-country-roster',
      /**
       * Each club plays its own tactic, the only assignment both existing paths support (the
       * summary path takes no override). scripts/grid-bands.ts rotates all four tactics by override
       * instead, so its band readings are not this condition's.
       */
      tactics: 'club',
      fixture: CORE_FIXTURE,
    }),
    ...GAP_BUCKETS.map((gap) =>
      condition('gap', String(gap), `home-minus-away gap ${gap} (home/away by sign)`, {
        bucket: gap,
        width: 5,
      }),
    ),
    // Both sides of a forced pairing start from the same pre-match squad fatigue (T320's decision),
    // so a tactic changes only in-match behaviour and its in-match cost.
    ...TACTICS.flatMap((home) =>
      TACTICS.map((away) =>
        condition('tactics', `${home}-${away}`, `${home} at home to ${away}`, {
          home,
          away,
          fatigue: NEUTRAL_SQUAD_FATIGUE,
        }),
      ),
    ),
    ...TIER_BANDS.map(([key, low, high]) =>
      condition('tier', key, `both sides ${low}–${high}`, { low, high }),
    ),
    ...[0, 20, 32, 50].map((fatigue) =>
      condition('fatigue', String(fatigue), `pre-match fatigue ${fatigue}`, { fatigue }),
    ),
    ...ERA_YEARS.map((year) =>
      condition('era', String(year), `rules of ${year}`, { year, maxSubs: eraRules(year).maxSubs }),
    ),
    condition('knockout', 'single-match', 'one match that needs a winner', {
      decide: { awayGoals: false },
      fixture: TIE_FIXTURE,
    }),
    condition('knockout', 'second-leg', 'second leg level on aggregate', {
      decide: { first: { home: 1, away: 1 }, awayGoals: false },
      fixture: TIE_FIXTURE,
    }),
    condition('knockout', 'second-leg-away-goals', 'second leg under the away-goals rule', {
      decide: { first: { home: 1, away: 1 }, awayGoals: true },
      fixture: TIE_FIXTURE,
    }),
    condition('rare', 'discipline', 'red cards and second yellows', {}, true),
    condition('rare', 'penalties', 'penalties awarded and scored', {}, true),
    condition('rare', 'injuries', 'in-match injuries', {}, true),
    condition(
      'rare',
      'extra-time',
      'extra time and shoot-outs',
      { decide: { awayGoals: false }, fixture: TIE_FIXTURE },
      true,
    ),
    condition('season', 'league-20', '20-club double round robins', { clubs: 20 }),
    condition('season', 'century', 'century careers (scoring leaders, career totals)', {
      seasons: 100,
    }),
  ] as readonly ParityCondition[],
} as const;
export type Partition = keyof typeof CORPUS_CONFIG.partitions;

/**
 * A corpus fixture id. `round` > 0 draws fresh held-out seeds for a later evaluation after the
 * validation sample of an earlier round has been read.
 */
export function corpusFixtureId(
  partition: Partition,
  conditionId: string,
  index: number,
  round = 0,
  config: { partitions: Record<Partition, { prefix: string }> } = CORPUS_CONFIG,
) {
  return `${config.partitions[partition].prefix}:r${round}:${conditionId}:${index}`;
}
export function corpusFixtureIds(
  partition: Partition,
  conditionId: string,
  count: number,
  round = 0,
) {
  return Array.from({ length: count }, (_, i) => corpusFixtureId(partition, conditionId, i, round));
}

/**
 * Ids shared by two seed sets, and how many of their match streams start in the same state for a
 * world seed (the engine names a fixture's match stream `${worldSeed}:match:${fixtureId}`).
 */
export function seedOverlap(a: readonly string[], b: readonly string[], worldSeed = '') {
  const ids = new Set(a);
  const state = (id: string) => random(`${worldSeed}:match:${id}`)();
  const states = new Set(a.map(state));
  return {
    ids: b.filter((id) => ids.has(id)),
    streams: b.filter((id) => !ids.has(id) && states.has(state(id))).length,
  };
}

export function validateCorpusConfig(config: {
  partitions: Record<Partition, { prefix: string }>;
  calibrationPerCondition: number;
  validation: { minimum: number; maximum: number };
  rarePerCondition: number;
  conditions: readonly { id: string; notApplicable: Readonly<Record<string, string>> }[];
}): string[] {
  const errors: string[] = [];
  const [a, b] = [config.partitions.calibration.prefix, config.partitions.validation.prefix];
  if (!a || !b || a === b || `${a}:`.startsWith(`${b}:`) || `${b}:`.startsWith(`${a}:`))
    errors.push('calibration and validation partitions must have distinct prefixes');
  if (a.includes(':') || b.includes(':')) errors.push('partition prefixes may not contain ":"');
  if (config.calibrationPerCondition <= 0) errors.push('calibration size must be positive');
  if (config.validation.minimum <= 0 || config.validation.minimum > config.validation.maximum)
    errors.push('validation bounds must be positive and ordered');
  if (config.rarePerCondition <= 0) errors.push('rare-event size must be positive');
  const ids = config.conditions.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push('condition ids must be unique');
  for (const c of config.conditions)
    for (const id of Object.keys(c.notApplicable))
      if (!METRIC_BY_ID.has(id)) errors.push(`${c.id} excludes unknown metric ${id}`);
  return errors;
}
/** A declared condition by id. */
export function conditionOf(id: string): ParityCondition {
  const found = CORPUS_CONFIG.conditions.find((c) => c.id === id);
  if (!found) throw new Error(`unknown parity condition ${id}`);
  return found;
}

/** Standard normal quantile (Acklam's rational approximation). */
export function normalQuantile(p: number): number {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p > 0.5) return -normalQuantile(1 - p);
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
/** Standard normal CDF (Abramowitz–Stegun 7.1.26 erf, absolute error below 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const tail =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t *
    Math.exp(-(x * x) / 2);
  return x >= 0 ? 1 - tail / 2 : tail / 2;
}
const zInterval = () => normalQuantile(1 - (1 - PARITY_CONFIG.confidence) / 2);
/**
 * At a true difference of 0 the interval must clear both margin edges, so the power term is the
 * two-sided quantile at (1 + power) / 2, not the one-sided superiority quantile.
 */
const zPower = () => normalQuantile((1 + PARITY_CONFIG.power) / 2);

/**
 * Probability that the interval of a difference with standard error `se` fits the margin
 * [−below, above] when the paths agree exactly.
 */
export function equivalencePower(se: number, below: number, above = below) {
  const z = zInterval();
  return Math.max(0, normalCdf(above / se - z) + normalCdf(below / se - z) - 1);
}

/**
 * Spread of a metric's per-match means (a match's values are averaged first, so several values a
 * match carry their design effect): the standard deviation `validationSize` reads from a pilot.
 */
export function clusterSpread(o: Observations) {
  return clusterSe(o) * Math.sqrt(clusterCount(o));
}

/**
 * The predeclared validation size in matches per path for a pilot's `clusterSpread` and the
 * metric's margin: the fewest matches for which the interval fits the margin with probability
 * PARITY_CONFIG.power when the paths agree, clamped to CORPUS_CONFIG. `power` is what the clamped
 * size achieves; `sufficient` is false when even the maximum falls short, and such a condition
 * stays insufficient.
 */
export function validationSize(pilotSd: number, margin: number) {
  const { minimum, maximum } = CORPUS_CONFIG.validation;
  const needed =
    margin > 0 ? Math.ceil(2 * (((zInterval() + zPower()) * pilotSd) / margin) ** 2) : Infinity;
  const size = Math.min(maximum, Math.max(minimum, needed));
  return {
    needed,
    size,
    sufficient: needed <= maximum,
    power: margin > 0 ? equivalencePower(pilotSd * Math.sqrt(2 / size), margin) : 0,
  };
}
/**
 * The rare-event verdict: the rate ratio (candidate over reference, per match), its Poisson log
 * interval and where that interval lies against [1 − m, 1 + m]. compareDistributions and
 * rareComparisonPower both use it, so the sizes predict the verdict actually given.
 */
function rateVerdict(events: readonly [number, number], matches: readonly [number, number]) {
  const ratio = events[1] / matches[1] / (events[0] / matches[0]);
  const half = zInterval() * Math.sqrt(1 / events[0] + 1 / events[1]);
  const interval: [number, number] = [ratio * Math.exp(-half), ratio * Math.exp(half)];
  const m = PARITY_CONFIG.rareRelativeMargin;
  return { ratio, interval, status: verdict(interval, 1 - m, 1 + m) };
}
/**
 * Probability that the rare-event comparison says `equivalent` when both paths play the same
 * number of matches at the same rate and expect `expected` events each. The counts are Poisson,
 * and the verdict is compareDistributions' own; counts of zero, which carry no rate, are left out.
 */
export function rareComparisonPower(expected: number) {
  const reach = 8 * Math.sqrt(expected);
  const low = Math.max(1, Math.floor(expected - reach)),
    high = Math.ceil(expected + reach);
  let logFactorial = 0;
  for (let k = 2; k < low; k++) logFactorial += Math.log(k);
  const mass: number[] = [];
  for (let k = low; k <= high; k++) {
    logFactorial += Math.log(k);
    mass.push(Math.exp(k * Math.log(expected) - expected - logFactorial));
  }
  let power = 0;
  for (let a = low; a <= high; a++)
    for (let b = low; b <= high; b++)
      if (rateVerdict([a, b], [1, 1]).status === 'equivalent')
        power += mass[a - low]! * mass[b - low]!;
  return power;
}
let rareEvents: number | undefined;
/**
 * The fewest events each path must expect for the rare-event comparison to say `equivalent` with
 * probability PARITY_CONFIG.power when the paths agree, Poisson variation in the counts included.
 */
export function requiredRareEvents() {
  if (rareEvents === undefined) {
    const m = PARITY_CONFIG.rareRelativeMargin;
    // Start from the fixed-count normal approximation, then settle on the exact Poisson power.
    let events = 1;
    while (
      equivalencePower(Math.sqrt(2 / events), -Math.log(1 - m), Math.log(1 + m)) <
      PARITY_CONFIG.power
    )
      events++;
    while (rareComparisonPower(events) < PARITY_CONFIG.power) events++;
    while (events > 1 && rareComparisonPower(events - 1) >= PARITY_CONFIG.power) events--;
    rareEvents = events;
  }
  return rareEvents;
}

/** The calibration sample a condition starts with: a rare-event condition begins larger. */
export function calibrationSize(condition: Pick<ParityCondition, 'rare'>) {
  return condition.rare ? CORPUS_CONFIG.rarePerCondition : CORPUS_CONFIG.calibrationPerCondition;
}

export interface PilotNeeds {
  /** Judged means and proportions: per-match spread and margin, in canonical units. */
  means: { id: string; spread: number; margin: number }[];
  /** Judged rare metrics: events per match. */
  rates: { id: string; perMatch: number }[];
}
/**
 * What a match condition's metrics need, read from its reference pilot: the spread and margin of
 * every judged mean or proportion and the events per match of every judged rare metric. Metrics
 * the condition rules out, and metrics the pilot lacks, are left out.
 */
export function pilotNeeds(samples: readonly MatchSample[], condition: ParityCondition) {
  const needs: PilotNeeds = { means: [], rates: [] };
  for (const d of METRIC_REGISTRY) {
    if (!d.applies || d.family === 'season' || d.id in condition.notApplicable) continue;
    const o = observe(samples, d);
    if (o.missing || !o.values.length) continue;
    if (d.comparison === 'rate-ratio')
      needs.rates.push({ id: d.id, perMatch: sum(o.values) / clusterCount(o) });
    else
      needs.means.push({
        id: d.id,
        spread: clusterSpread(o),
        margin:
          d.comparison === 'proportion' ? PARITY_CONFIG.outcomeRateMargin : meanMargin(describe(o)),
      });
  }
  return needs;
}
/**
 * One condition's predeclared validation size in matches a path: the largest need among every
 * metric it judges, so each metric alone reaches PARITY_CONFIG.power at the pilot's spread or rate
 * when the paths agree. A mean or proportion needs its `validationSize`. A rare metric needs
 * requiredRareEvents() expected events, which is requiredRareEvents() over its events per match.
 * Sizes are clamped to CORPUS_CONFIG. A pilot constant needs no sample, because the equal-constant
 * rule judges it. A rare metric without pilot events has no statable need and is listed
 * `unsized`. `sufficient` is false when any need exceeds the maximum, and the condition stays
 * insufficient.
 */
export function conditionValidationSize(needs: PilotNeeds) {
  const all = [
    ...needs.means.map((m) => ({
      id: m.id,
      matches: m.spread === 0 ? 0 : validationSize(m.spread, m.margin).needed,
    })),
    ...needs.rates
      .filter((r) => r.perMatch > 0)
      .map((r) => ({ id: r.id, matches: Math.ceil(requiredRareEvents() / r.perMatch) })),
  ];
  const limiting = all.reduce<(typeof all)[number] | undefined>(
    (a, b) => (!a || b.matches > a.matches ? b : a),
    undefined,
  );
  const { minimum, maximum } = CORPUS_CONFIG.validation;
  return {
    size: Math.min(maximum, Math.max(minimum, limiting?.matches ?? 0)),
    sufficient: all.every((n) => n.matches <= maximum),
    limiting: limiting?.id ?? null,
    unsized: needs.rates.filter((r) => !(r.perMatch > 0)).map((r) => r.id),
    needs: all,
  };
}

export type PerformanceCategory =
  'preparation' | 'computation' | 'observation' | 'settlement' | 'season' | 'codec';
/**
 * ARCH-31's paired budgets and the unchanged browser/storage limits (→ARCH-28, SAVE-4). Fixture
 * components time whole processing including preparation; `preparation.*` times it alone.
 */
export const PERFORMANCE_CONFIG = {
  /** 2: the candidate aggregate stages, own candidate fixtures and candidate settlement (T285). */
  version: 2,
  /** Fixtures without the own club: candidate median over the baseline summary median. */
  npcFixtureBudget: 0.5,
  /** Complete-season engine time over the baseline, for each century workload profile. */
  seasonBudget: 0.8,
  profiles: {
    baseline: 'release-century-baseline',
    'active-management': 'release-century-active-management',
  },
  fixtures: {
    default: 200,
    smoke: 12,
    warmup: 10,
    smokeWarmup: 2,
    repetitions: 3,
    smokeRepetitions: 2,
  },
  seasons: { release: 100, smoke: 1 },
  components: {
    'preparation.summary': 'preparation',
    'preparation.grid': 'preparation',
    'fixture.summary': 'computation',
    'fixture.summary-lines': 'computation',
    'fixture.grid': 'computation',
    'fixture.candidate': 'computation',
    /** The candidate aggregate fixture's stages, timed one by one on the same fixtures. */
    'candidate.preparation': 'preparation',
    'candidate.generation': 'computation',
    'candidate.attribution': 'computation',
    'candidate.record': 'computation',
    /** Own fixtures through the candidate dispatch: the detailed engine and the full record check. */
    'fixture.own-candidate': 'computation',
    'observation.grid': 'observation',
    'observation.frames': 'observation',
    'settlement.npc': 'settlement',
    'settlement.own': 'settlement',
    /** Candidate records settled on a candidate world: every existing effect plus the ledger. */
    'settlement.candidate': 'settlement',
    'season.baseline': 'season',
    'season.active-management': 'season',
    'codec.encode': 'codec',
    'codec.decode': 'codec',
  } satisfies Record<string, PerformanceCategory>,
  /** Paired evidence needs the same machine, toolchain and worlds; other runs are context only. */
  pairing: ['machine', 'toolchain', 'worlds'] as const,
  storage: {
    checkpointBytes: CHECKPOINT_LIMIT,
    totalBytes: TOTAL_LIMIT,
    /** SAVE-4's import caps, enforced in apps/web/src/adapters (persistence.ts, compression.ts). */
    importFileBytes: 8 * 1024 * 1024,
    decompressedBytes: 32 * 1024 * 1024,
  },
  /**
   * ARCH-28's budgets as scripts/first-play.mjs enforces them on a served production build;
   * declared here for T286's gate, not checked by the match-model runner, which builds nothing.
   */
  browser: { entryGzipBytes: 250 * 1024, initializationMs: 5000, inputP95Ms: 100, minimumFps: 30 },
} as const;
export type PerformanceComponent = keyof typeof PERFORMANCE_CONFIG.components;

// ---- Reading samples ----------------------------------------------------------------------------

/** A ratio whose denominator is zero: no attempts, no defined percentage (→MATCH-4). */
const NO_DENOMINATOR = null;
type Reading = number | undefined | typeof NO_DENOMINATOR;

/** The player lines of one side; undefined when the record does not split them by side. */
export function sideLines(r: MatchRecord, side: Side) {
  if (!r.lineCounts) return undefined;
  const [home, away] = r.lineCounts;
  return side === 0 ? r.players.slice(0, home) : r.players.slice(home, home + away);
}

function teamReading(s: MatchSample, d: MetricDefinition, side: Side): Reading {
  const r = s.record;
  switch (d.family) {
    case 'team-metric':
      return r.metrics[side]?.[d.index!];
    case 'team-detail':
      return r.detail?.[side]?.[d.index!];
    case 'team-xg':
      return r.xg?.[side];
    case 'participation': {
      const lines = sideLines(r, side);
      if (!lines) return undefined;
      return d.key === 'lines'
        ? lines.length
        : lines.reduce((a, l) => a + l.metrics[M.minutes]!, 0);
    }
    case 'incident':
      return incidentsOf(s)?.filter((x) => x.side === side && x.kind === d.key).length;
    case 'derived': {
      const { numerator, denominator, denominatorSide, scale } = d.ratio!;
      const value = (id: string, at: Side) => canonical(s, METRIC_BY_ID.get(id)!, at);
      const num = value(numerator, side);
      const other: Side = side === 0 ? 1 : 0;
      const den =
        denominatorSide === 'own'
          ? value(denominator, side)
          : denominatorSide === 'opponent'
            ? value(denominator, other)
            : add(value(denominator, 0), value(denominator, 1));
      if (num === undefined || den === undefined || num === null || den === null) return undefined;
      return den === 0 ? NO_DENOMINATOR : (num / den) * scale;
    }
    default:
      return undefined;
  }
}
const add = (a: Reading, b: Reading) =>
  a === undefined || b === undefined || a === null || b === null ? undefined : a + b;
function canonical(s: MatchSample, d: MetricDefinition, side: Side): Reading {
  const raw = teamReading(s, d, side);
  return typeof raw === 'number' && d.family !== 'derived' ? raw * d.scale : raw;
}

function outcomeReading(s: MatchSample, key: string): Reading {
  const r = s.record,
    ninety = r.regulation ?? r.score;
  switch (key) {
    case 'homeWin':
      return ninety.home > ninety.away ? 1 : 0;
    case 'draw':
      return ninety.home === ninety.away ? 1 : 0;
    case 'awayWin':
      return ninety.home < ninety.away ? 1 : 0;
    case 'goals':
      return r.score.home + r.score.away;
    case 'goalDifference':
      return r.score.home - r.score.away;
    case 'extraTime':
      return r.regulation ? 1 : 0;
    case 'shootout':
      return r.shootout ? 1 : 0;
    case 'addedMinutes':
      return r.added?.reduce((a, b) => a + b, 0);
    default:
      return undefined;
  }
}

/** Values of one metric over samples, with the samples that lacked it kept apart from zeros. */
export interface Observations {
  values: number[];
  /** The match each value came from: values of one match are not independent. */
  clusters: number[];
  /** Samples that lack the field; never read as zero. */
  missing: number;
  /** Ratios whose denominator was zero. */
  undefinedRatios: number;
  zeros: number;
}
export function observe(samples: readonly MatchSample[], d: MetricDefinition): Observations {
  const out: Observations = { values: [], clusters: [], missing: 0, undefinedRatios: 0, zeros: 0 };
  samples.forEach((s, cluster) => {
    const readings: Reading[] = [];
    if (d.family === 'season') readings.push(undefined);
    else if (d.family === 'outcome') readings.push(outcomeReading(s, d.key));
    else if (d.family === 'player-metric' || d.family === 'player-detail')
      for (const side of sides) {
        const lines = sideLines(s.record, side);
        if (!lines) readings.push(undefined);
        for (const line of lines ?? []) {
          const row = d.family === 'player-metric' ? line.metrics : line.detail;
          const raw = row?.[d.index!];
          readings.push(raw === undefined ? undefined : raw * d.scale);
        }
      }
    else for (const side of sides) readings.push(canonical(s, d, side));
    if (readings.some((v) => v === undefined)) {
      out.missing++;
      return;
    }
    for (const v of readings) {
      if (v === NO_DENOMINATOR) out.undefinedRatios++;
      else if (v !== undefined) {
        out.values.push(v);
        out.clusters.push(cluster);
        if (v === 0) out.zeros++;
      }
    }
  });
  return out;
}
export function observeSeasons(
  seasons: readonly SeasonSample[],
  d: MetricDefinition,
): Observations {
  const out: Observations = { values: [], clusters: [], missing: 0, undefinedRatios: 0, zeros: 0 };
  seasons.forEach((season, cluster) => {
    const v = season[d.id];
    if (v === undefined) out.missing++;
    else {
      out.values.push(v);
      out.clusters.push(cluster);
      if (v === 0) out.zeros++;
    }
  });
  return out;
}

// ---- Statistics ---------------------------------------------------------------------------------

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const meanOf = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : NaN);
function sdOf(xs: readonly number[]) {
  if (xs.length < 2) return 0;
  const m = meanOf(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
function quantile(sorted: readonly number[], q: number) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!;
}
const clusterCount = (o: Observations) => new Set(o.clusters).size;
/** MATCH-28's mean margin: the larger of 5% of the reference mean or 0.1 reference sd. */
const meanMargin = (reference: { mean: number; sd: number }) =>
  Math.max(
    PARITY_CONFIG.meanRelativeMargin * Math.abs(reference.mean),
    PARITY_CONFIG.meanSdMargin * reference.sd,
  );
/** Matches with a non-zero value: how often a path recorded the metric at all. */
const recordedMatches = (o: Observations) =>
  new Set(o.clusters.filter((_, i) => o.values[i] !== 0)).size;
/** Standard error of a mean with values grouped by match (cluster-robust). */
function clusterSe(o: Observations) {
  const n = o.values.length,
    m = meanOf(o.values);
  const residual = new Map<number, number>();
  o.values.forEach((v, i) =>
    residual.set(o.clusters[i]!, (residual.get(o.clusters[i]!) ?? 0) + v - m),
  );
  const c = residual.size;
  if (c < 2) return Infinity;
  return Math.sqrt((c / (c - 1)) * sum([...residual.values()].map((r) => r * r))) / n;
}
/** Kolmogorov distance between two samples' empirical CDFs. */
export function cdfDistance(a: readonly number[], b: readonly number[]) {
  const x = [...a].sort((p, q) => p - q),
    y = [...b].sort((p, q) => p - q);
  let i = 0,
    j = 0,
    best = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i]!, y[j]!);
    while (i < x.length && x[i]! <= v) i++;
    while (j < y.length && y[j]! <= v) j++;
    best = Math.max(best, Math.abs(i / x.length - j / y.length));
  }
  return best;
}
/** DKW half-width for one sample, with the error rate split between the two samples. */
const dkw = (n: number) => Math.sqrt(Math.log(4 / (1 - PARITY_CONFIG.confidence)) / (2 * n));
function wilson(p: number, n: number): [number, number] {
  const z = zInterval(),
    z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [centre - half, centre + half];
}
function pearson(x: readonly number[], y: readonly number[]) {
  const mx = meanOf(x),
    my = meanOf(y);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? undefined : sxy / Math.sqrt(sxx * syy);
}
function fisher(r: number, n: number): [number, number] {
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))),
    se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - zInterval() * se), Math.tanh(z + zInterval() * se)];
}
/** Where an interval lies against the margin [low, high]. */
function verdict(interval: readonly [number, number], low: number, high: number) {
  if (interval[0] >= low && interval[1] <= high) return 'equivalent' as const;
  if (interval[1] < low || interval[0] > high) return 'different' as const;
  return 'insufficient' as const;
}

export interface Distribution {
  n: number;
  clusters: number;
  missing: number;
  undefinedRatios: number;
  zeros: number;
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
  p99: number;
}
function describe(o: Observations): Distribution {
  const sorted = [...o.values].sort((a, b) => a - b);
  return {
    n: o.values.length,
    clusters: clusterCount(o),
    missing: o.missing,
    undefinedRatios: o.undefinedRatios,
    zeros: o.zeros,
    mean: meanOf(o.values),
    sd: sdOf(o.values),
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
  };
}

/**
 * Only `equivalent` passes and `not-applicable` stays outside a verdict; every other status is
 * reported as what it is. `violated` is a metric the condition's rules rule out that a path
 * recorded anyway.
 */
export type ComparisonStatus =
  | 'equivalent'
  | 'different'
  | 'violated'
  | 'insufficient'
  | 'underpowered'
  | 'unidentifiable'
  | 'missing'
  | 'not-applicable';
export interface MetricComparison {
  id: string;
  status: ComparisonStatus;
  /** Both paths held the same value: equivalent by the zero difference, listed as constant. */
  constant?: true;
  comparison: Comparison;
  reference: Distribution;
  candidate: Distribution;
  /** Mean or proportion difference (candidate − reference), its interval and margin. */
  difference?: { estimate: number; interval: [number, number]; margin: number; status: string };
  cdf?: { distance: number; interval: [number, number]; margin: number; status: string };
  rate?: {
    events: [reference: number, candidate: number];
    ratio: number;
    interval: [number, number];
    requiredEvents: number;
    status: string;
  };
  reason?: string;
}

/**
 * MATCH-28's comparison of one metric between a reference (detailed play) and a candidate path.
 * Equivalence needs the whole uncertainty interval inside the margin; an interval that merely
 * overlaps zero is insufficient, not a pass.
 */
export function compareDistributions(
  d: Pick<MetricDefinition, 'id' | 'comparison' | 'applies'>,
  reference: Observations,
  candidate: Observations,
): MetricComparison {
  const base = {
    id: d.id,
    comparison: d.comparison,
    reference: describe(reference),
    candidate: describe(candidate),
  };
  if (!d.applies) return { ...base, status: 'not-applicable' };
  if (reference.missing || candidate.missing)
    return {
      ...base,
      status: 'missing',
      reason: `missing in ${reference.missing} reference and ${candidate.missing} candidate samples`,
    };
  const tooFew =
    clusterCount(reference) < PARITY_CONFIG.minimumSamples ||
    clusterCount(candidate) < PARITY_CONFIG.minimumSamples;
  if (d.comparison === 'rate-ratio') {
    const events: [number, number] = [sum(reference.values), sum(candidate.values)];
    const required = requiredRareEvents();
    // Both paths at 0 is an equal constant like any other (→MATCH-28): equivalent by the zero
    // difference once each path has its minimum sample. Applicability never follows from it.
    if (events[0] === 0 && events[1] === 0)
      return tooFew
        ? {
            ...base,
            status: 'underpowered',
            reason: `fewer than ${PARITY_CONFIG.minimumSamples} matches on a path`,
          }
        : { ...base, status: 'equivalent', constant: true, reason: 'no events on either path' };
    if (events[0] === 0 || events[1] === 0)
      return { ...base, status: 'underpowered', reason: 'one path has no events' };
    // Rates per match: player lines a match differ between paths that substitute differently.
    // The interval decides; requiredRareEvents() sizes the sample and only names the shortfall
    // of an interval that has not resolved.
    const {
      ratio,
      interval,
      status: resolved,
    } = rateVerdict(events, [clusterCount(reference), clusterCount(candidate)]);
    const short = resolved === 'insufficient' && Math.min(...events) < required;
    const status: ComparisonStatus = short ? 'underpowered' : resolved;
    return {
      ...base,
      status,
      rate: { events, ratio, interval, requiredEvents: required, status },
      ...(short && {
        reason: `${Math.min(...events)} events on a path, ${required} expected at the planned size`,
      }),
    };
  }
  const nRef = clusterCount(reference),
    nCand = clusterCount(candidate);
  if (tooFew)
    return {
      ...base,
      status: 'underpowered',
      reason: `fewer than ${PARITY_CONFIG.minimumSamples} matches on a path`,
    };
  // Both paths held at one value: equivalent by that zero difference, and listed as constant.
  if (
    base.reference.sd === 0 &&
    base.candidate.sd === 0 &&
    base.candidate.mean === base.reference.mean
  )
    return {
      ...base,
      status: 'equivalent',
      constant: true,
      reason: 'both paths constant and equal',
    };
  if (d.comparison === 'proportion') {
    const p = [base.reference.mean, base.candidate.mean];
    const [lr, ur] = wilson(p[0]!, reference.values.length);
    const [lc, uc] = wilson(p[1]!, candidate.values.length);
    const estimate = p[1]! - p[0]!;
    const interval: [number, number] = [
      estimate - Math.sqrt((p[1]! - lc) ** 2 + (ur - p[0]!) ** 2),
      estimate + Math.sqrt((uc - p[1]!) ** 2 + (p[0]! - lr) ** 2),
    ];
    const margin = PARITY_CONFIG.outcomeRateMargin;
    const status = verdict(interval, -margin, margin);
    return { ...base, status, difference: { estimate, interval, margin, status } };
  }
  const estimate = base.candidate.mean - base.reference.mean;
  const half = zInterval() * Math.hypot(clusterSe(reference), clusterSe(candidate));
  const margin = meanMargin(base.reference);
  const meanStatus = verdict([estimate - half, estimate + half], -margin, margin);
  const distance = cdfDistance(reference.values, candidate.values);
  const width = dkw(nRef) + dkw(nCand);
  const cdfInterval: [number, number] = [
    Math.max(0, distance - width),
    Math.min(1, distance + width),
  ];
  const cdfStatus = verdict(cdfInterval, 0, PARITY_CONFIG.cdfMargin);
  const resolved: ComparisonStatus =
    meanStatus === 'different' || cdfStatus === 'different'
      ? 'different'
      : meanStatus === 'equivalent' && cdfStatus === 'equivalent'
        ? 'equivalent'
        : 'insufficient';
  // A reference constant elsewhere keeps its 5% margin, so a candidate held at another value or
  // outside that margin is different. One constant at 0 leaves a margin of 0 (5% of nothing, 0.1
  // of no spread) that no interval fits: only a difference can be resolved.
  const noMargin = margin === 0 && resolved !== 'different';
  return {
    ...base,
    status: resolved,
    ...(noMargin && { reason: 'reference constant at 0: no margin' }),
    difference: {
      estimate,
      interval: [estimate - half, estimate + half],
      margin,
      status: meanStatus,
    },
    cdf: { distance, interval: cdfInterval, margin: PARITY_CONFIG.cdfMargin, status: cdfStatus },
  };
}

export interface RelationshipComparison {
  pair: readonly [string, string];
  status: ComparisonStatus;
  reference?: number;
  candidate?: number;
  interval?: [number, number];
  reason?: string;
}
/** Pairs of team-match values present for both metrics; samples lacking either count as missing. */
function pairs(samples: readonly MatchSample[], x: MetricDefinition, y: MetricDefinition) {
  const xs: number[] = [],
    ys: number[] = [];
  let missing = 0;
  for (const s of samples)
    for (const side of sides) {
      const a = canonical(s, x, side),
        b = canonical(s, y, side);
      if (typeof a === 'number' && typeof b === 'number') {
        xs.push(a);
        ys.push(b);
      } else missing++;
    }
  return { xs, ys, missing, matches: samples.length };
}
/** A supported correlation compared between paths (Zou's interval for a difference of two r). */
export function compareRelationship(
  pair: readonly [string, string],
  reference: readonly MatchSample[],
  candidate: readonly MatchSample[],
): RelationshipComparison {
  const [x, y] = pair.map((id) => METRIC_BY_ID.get(id)!);
  const ref = pairs(reference, x!, y!),
    cand = pairs(candidate, x!, y!);
  if (ref.missing || cand.missing)
    return { pair, status: 'missing', reason: 'a metric is missing' };
  if (ref.matches < PARITY_CONFIG.minimumSamples || cand.matches < PARITY_CONFIG.minimumSamples)
    return { pair, status: 'underpowered', reason: 'too few matches' };
  const r1 = pearson(ref.xs, ref.ys),
    r2 = pearson(cand.xs, cand.ys);
  if (r1 === undefined || r2 === undefined)
    return { pair, status: 'unidentifiable', reason: 'a variable is constant on a path' };
  // Match count, not team-match count: the two sides of one match are not independent.
  const [l1, u1] = fisher(r1, ref.matches),
    [l2, u2] = fisher(r2, cand.matches);
  const estimate = r2 - r1;
  const interval: [number, number] = [
    estimate - Math.sqrt((r2 - l2) ** 2 + (u1 - r1) ** 2),
    estimate + Math.sqrt((u2 - r2) ** 2 + (r1 - l1) ** 2),
  ];
  const m = PARITY_CONFIG.correlationMargin;
  return { pair, status: verdict(interval, -m, m), reference: r1, candidate: r2, interval };
}

// ---- Reports ------------------------------------------------------------------------------------

export interface CoverageRow {
  id: string;
  family: MetricFamily;
  applies: boolean;
  present: number;
  missing: number;
  zeros: number;
  undefinedRatios: number;
}
/** Which metrics each sample set carries: absent fields apart from actual zeros. */
export function buildCoverageReport(
  samples: readonly MatchSample[],
  seasons: readonly SeasonSample[] = [],
) {
  const rows: CoverageRow[] = METRIC_REGISTRY.map((d) => {
    const o = d.family === 'season' ? observeSeasons(seasons, d) : observe(samples, d);
    const total = d.family === 'season' ? seasons.length : samples.length;
    return {
      id: d.id,
      family: d.family,
      applies: d.applies,
      present: total - o.missing,
      missing: o.missing,
      zeros: o.zeros,
      undefinedRatios: o.undefinedRatios,
    };
  });
  return {
    samples: samples.length,
    seasons: seasons.length,
    complete: rows.filter((r) => r.applies && r.missing === 0 && r.present > 0).map((r) => r.id),
    missing: rows.filter((r) => r.applies && (r.missing > 0 || r.present === 0)).map((r) => r.id),
    notApplicable: rows.filter((r) => !r.applies).map((r) => r.id),
    rows,
  };
}

export type TargetStatus =
  'inside' | 'outside' | 'unresolved' | 'underpowered' | 'missing' | 'undefined' | 'detailed-only';
export interface TargetResult {
  id: string;
  label: string;
  band: readonly [number, number];
  unit: Unit;
  status: TargetStatus;
  value?: number;
  interval?: [number, number];
  /** Distance of the point estimate outside the band; 0 inside. */
  error?: number;
  matches: number;
  missing: number;
}
/** Which engine a report reads: the aggregate path records no shot points or sequences (MATCH-23). */
export type ReportPath = 'detailed' | 'aggregate';
/**
 * MATCH-23's rows that read ball positions or possession sequences bind the detailed engine only
 * (→MATCH-26): on the aggregate path they are listed as detailed-only, never missing or failed.
 */
export const DETAILED_ONLY_REASON =
  'MATCH-23: reads ball positions or possession sequences, which bind the detailed engine only (MATCH-26)';
/**
 * Absolute target errors against the intended bands (→MATCH-23): only `inside` passes. Counts and
 * durations of a match that played extra time are read per 90 minutes (`perNinety`). On the
 * aggregate path the rows that read the detailed engine's diagnostics are `detailed-only`.
 */
export function buildTargetReport(
  samples: readonly MatchSample[],
  path: ReportPath = 'detailed',
): TargetResult[] {
  return TARGET_BANDS.map((t) =>
    path === 'aggregate' && t.reads === 'diagnostics'
      ? {
          id: t.id,
          label: t.label,
          band: t.band,
          unit: t.unit,
          matches: samples.length,
          status: 'detailed-only' as const,
          missing: 0,
        }
      : evaluateTarget(t, samples),
  );
}

/** One band's estimate over the samples and its verdict (`buildTargetReport`'s rule). */
function evaluateTarget(t: TargetBand, samples: readonly MatchSample[]): TargetResult {
  const base = { id: t.id, label: t.label, band: t.band, unit: t.unit, matches: samples.length };
  const parts = samples.map((s) => t.contribution(s));
  const missing = parts.filter((p) => p === undefined).length;
  if (missing || !samples.length) return { ...base, status: 'missing' as const, missing };
  let value: number, interval: [number, number];
  if (t.estimator === 'median') {
    const sorted = (parts as (readonly number[])[]).flat().sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return { ...base, status: 'undefined' as const, missing };
    const half = (zInterval() * Math.sqrt(n)) / 2;
    value = quantile(sorted, 0.5);
    interval = [
      sorted[Math.max(0, Math.floor(n / 2 - half))]!,
      sorted[Math.min(n - 1, Math.ceil(n / 2 + half))]!,
    ];
  } else {
    const pairs = (parts as Contribution[]).map(([n, d], i): Contribution =>
      t.perNinety ? [n, (d * matchMinutes(samples[i]!.record)) / 90] : [n, d],
    );
    const num = sum(pairs.map((p) => p[0])),
      den = sum(pairs.map((p) => p[1]));
    if (den === 0) return { ...base, status: 'undefined' as const, missing };
    const ratio = num / den;
    const c = pairs.length;
    const variance =
      c > 1
        ? ((c / (c - 1)) * sum(pairs.map(([n, d]) => (n - ratio * d) ** 2))) / den ** 2
        : Infinity;
    const half = zInterval() * Math.sqrt(variance);
    value = ratio * t.scale;
    interval = [(ratio - half) * t.scale, (ratio + half) * t.scale];
  }
  const [lo, hi] = t.band;
  const error = Math.max(lo - value, 0, value - hi);
  if (samples.length < PARITY_CONFIG.minimumSamples)
    return { ...base, status: 'underpowered' as const, value, interval, error, missing };
  const status: TargetStatus =
    interval[0] >= lo && interval[1] <= hi
      ? 'inside'
      : interval[1] < lo || interval[0] > hi
        ? 'outside'
        : 'unresolved';
  return { ...base, status, value, interval, error, missing };
}

// ---- Advanced counters (MATCH-30) --------------------------------------------------------------

/** Why a MATCH-13 counter stays unbanded (MATCH-30: held to MATCH-28 parity only). */
export type AdvancedCounterBand =
  | { band: readonly [number, number]; source: string }
  | { matchTarget: string }
  | { unbanded: string };
export type AdvancedCounter = {
  id: string;
  /** MATCH-13's row. */
  counter: string;
  label: string;
  /** The registry metric it reads (team rows; `pd.xa` is the sum of the side's player lines). */
  reads: string;
  unit: Unit;
} & AdvancedCounterBand;

const SB = 'StatsBomb open data 2015/16 (Premier League, La Liga, Serie A, Ligue 1), computed';
const OPTA = 'FBref (Opta) squad tables 2017/18–2023/24, five leagues';
const OPTA_SEQUENCES =
  'Opta via The Analyst team sequence stats 2024/25–2025/26, five leagues (league totals: high turnovers per team-match, PPDA as opposition passes ÷ defensive actions)';
/**
 * MATCH-30's real-football level of every MATCH-13 advanced counter for equal top-tier sides, per
 * team per match (docs/MATCH-BASELINES.md "MATCH-13 고급 지표 기준값", which holds each band's
 * sources, league-seasons and mapping): a band is the span of the cited league-season means
 * rounded outward, never an engine's output. Counters MATCH-23 already bands point at that row;
 * a counter without a comparable public source is listed as unbanded with its reason and held to
 * MATCH-28 parity only. Counts are read per 90 minutes played, like MATCH-23's. v2 (T327): high
 * turnovers and PPDA count under MATCH-13 r18's published conventions and are banded from Opta's
 * league-season figures under those conventions.
 */
export const ADVANCED_COUNTER_TARGET = {
  version: 2,
  source: 'MATCH-30',
  counters: [
    {
      id: 'keyPasses',
      counter: 'key pass',
      label: 'key passes (team)',
      reads: 'td.keyPasses',
      unit: 'count',
      band: [8.2, 10.7],
      source: `${SB}; ${OPTA} (assisted shots)`,
    },
    {
      id: 'xa',
      counter: 'xA',
      label: 'xA (team)',
      reads: 'pd.xa',
      unit: 'xg',
      band: [0.75, 1.15],
      source: `${SB}; ${OPTA} (xAG)`,
    },
    {
      id: 'bigChances',
      counter: 'big chance',
      label: 'big chances (team)',
      reads: 'td.bigChances',
      unit: 'count',
      band: [0.8, 1.05],
      source: SB,
    },
    {
      id: 'bigChancesScored',
      counter: 'big chance',
      label: 'big chances scored (team)',
      reads: 'td.bigChancesScored',
      unit: 'count',
      band: [0.4, 0.55],
      source: SB,
    },
    {
      id: 'boxShots',
      counter: 'box shot',
      label: 'box shots (team)',
      reads: 'td.boxShots',
      unit: 'count',
      band: [6.8, 7.7],
      source: SB,
    },
    {
      id: 'finalThirdPasses',
      counter: 'final-third pass',
      label: 'final-third passes (team)',
      reads: 'td.finalThirdPasses',
      unit: 'count',
      band: [100, 121],
      source: SB,
    },
    {
      id: 'finalThirdCompleted',
      counter: 'final-third pass',
      label: 'final-third passes completed (team)',
      reads: 'td.finalThirdCompleted',
      unit: 'count',
      band: [65, 85],
      source: SB,
    },
    {
      id: 'progressivePasses',
      counter: 'progressive pass',
      label: 'progressive passes (team)',
      reads: 'td.progressivePasses',
      unit: 'count',
      band: [116, 124],
      source: SB,
    },
    {
      id: 'takeOns',
      counter: 'take-on',
      label: 'take-ons (team)',
      reads: 'td.takeOns',
      unit: 'count',
      matchTarget: 'takeOns',
    },
    {
      id: 'takeOnSuccess',
      counter: 'take-on',
      label: 'take-ons successful',
      reads: 'ratio.takeOnSuccess',
      unit: 'percent',
      matchTarget: 'takeOnSuccess',
    },
    {
      id: 'highTurnovers',
      counter: 'high turnover',
      label: 'high turnovers (team)',
      reads: 'td.highTurnovers',
      unit: 'count',
      band: [5.7, 7.5],
      source: OPTA_SEQUENCES,
    },
    {
      id: 'ppda',
      counter: 'PPDA',
      label: 'PPDA',
      reads: 'ratio.ppda',
      unit: 'ratio',
      band: [12, 14],
      source: OPTA_SEQUENCES,
    },
    {
      id: 'fieldTilt',
      counter: 'field tilt',
      label: 'field tilt (home side)',
      reads: 'ratio.fieldTilt',
      unit: 'percent',
      unbanded:
        "between equal sides it is 50% by construction (each side's share of both sides' final-third passes), so a level band says nothing; held to parity",
    },
    {
      id: 'boxEntries',
      counter: 'box entry',
      label: 'box entries (team)',
      reads: 'td.boxEntries',
      unit: 'count',
      band: [13, 16],
      source: SB,
    },
    {
      id: 'frontOfBoxEntries',
      counter: 'front-of-box entry',
      label: 'front-of-box entries (team)',
      reads: 'td.frontOfBoxEntries',
      unit: 'count',
      band: [42.5, 45.5],
      source: SB,
    },
    {
      id: 'lineBreakingPasses',
      counter: 'line-breaking pass',
      label: 'line-breaking passes (team)',
      reads: 'td.lineBreakingPasses',
      unit: 'count',
      unbanded:
        "needs every opponent line's deepest player at each pass: public event data (StatsBomb, Wyscout) carries no line membership or full positions, and FIFA's published line breaks are tournament counts under its own line set; held to parity",
    },
    {
      id: 'xtAdded',
      counter: 'xT added',
      label: 'xT added (team)',
      reads: 'td.xtAdded',
      unit: 'xt',
      band: [2, 2.3],
      source: `${SB} on the 40 cells' xT`,
    },
    {
      id: 'cutBacks',
      counter: 'cut-back',
      label: 'cut-backs (team)',
      reads: 'td.cutBacks',
      unit: 'count',
      band: [0.35, 0.6],
      source: SB,
    },
    {
      id: 'crosses',
      counter: 'cross',
      label: 'crosses (team)',
      reads: 'td.crosses',
      unit: 'count',
      matchTarget: 'crosses',
    },
    {
      id: 'crossCompletion',
      counter: 'cross',
      label: 'crosses completed',
      reads: 'ratio.crossCompletion',
      unit: 'percent',
      matchTarget: 'crossCompletion',
    },
    {
      id: 'throughBalls',
      counter: 'through ball',
      label: 'through balls (team)',
      reads: 'td.throughBalls',
      unit: 'count',
      band: [2, 2.2],
      source: SB,
    },
    {
      id: 'throughBallsCompleted',
      counter: 'through ball',
      label: 'through balls completed (team)',
      reads: 'td.throughBallsCompleted',
      unit: 'count',
      band: [0.6, 0.85],
      source: SB,
    },
    {
      id: 'progressiveCarries',
      counter: 'progressive carry',
      label: 'progressive carries (team)',
      reads: 'td.progressiveCarries',
      unit: 'count',
      band: [58.5, 63],
      source: SB,
    },
  ] as readonly AdvancedCounter[],
};

/** A side's team-row reading of an advanced counter in canonical units; undefined when absent. */
function counterReading(
  s: MatchSample,
  d: MetricDefinition | undefined,
  side: Side,
): number | undefined {
  if (!d || d.index === undefined) return undefined;
  if (d.family === 'player-detail') {
    const lines = sideLines(s.record, side);
    return lines?.length ? sum(lines.map((l) => l.detail?.[d.index!] ?? 0)) * d.scale : undefined;
  }
  const row = d.family === 'team-detail' ? s.record.detail?.[side] : s.record.metrics[side];
  const v = row?.[d.index];
  return v === undefined ? undefined : v * d.scale;
}
/** An advanced counter's estimate as a target band (its own, or a wide one for context). */
function counterBand(c: AdvancedCounter, range: readonly [number, number]): TargetBand {
  const metric = METRIC_BY_ID.get(c.reads);
  const ratio = metric?.ratio;
  const contribution = (s: MatchSample): Contribution | undefined => {
    if (ratio) {
      const n = METRIC_BY_ID.get(ratio.numerator),
        d = METRIC_BY_ID.get(ratio.denominator);
      // Field tilt is the home side's share; PPDA and the success rates pool both sides.
      if (ratio.denominatorSide === 'both') {
        const own = counterReading(s, n, 0),
          a = counterReading(s, d, 0),
          b = counterReading(s, d, 1);
        return own === undefined || a === undefined || b === undefined ? undefined : [own, a + b];
      }
      return share(
        both(s, (side) => counterReading(s, n, side)),
        both(s, (side) => counterReading(s, d, side)),
      );
    }
    return perTeam(both(s, (side) => counterReading(s, metric, side)));
  };
  return {
    id: c.id,
    label: c.label,
    band: range,
    unit: c.unit,
    source: 'MATCH-30',
    reads: 'record',
    estimator: 'ratio',
    contribution,
    scale: c.unit === 'percent' ? 100 : 1,
    // Counts and sums over the match are read per 90 minutes played; ratios are not.
    perNinety: !ratio,
  };
}

export type AdvancedCounterStatus = TargetStatus | 'unbanded';
export interface AdvancedCounterResult extends Omit<TargetResult, 'status' | 'band'> {
  counter: string;
  status: AdvancedCounterStatus;
  band?: readonly [number, number];
  /** The MATCH-23 row that bands it, or why it has no band. */
  matchTarget?: string;
  reason?: string;
}
/**
 * MATCH-30's verdict on every advanced counter: a banded counter by its 95% interval like a
 * MATCH-23 row (only `inside` passes), a counter MATCH-23 bands by that row, and an unbanded one
 * listed with its reason and its measured level for the MATCH-28 parity it is held to.
 */
export function advancedCounterVerdicts(samples: readonly MatchSample[]): AdvancedCounterResult[] {
  return ADVANCED_COUNTER_TARGET.counters.map((c): AdvancedCounterResult => {
    if ('matchTarget' in c) {
      const row = TARGET_BANDS.find((t) => t.id === c.matchTarget)!;
      return { ...evaluateTarget(row, samples), counter: c.counter, matchTarget: row.id };
    }
    if ('unbanded' in c) {
      const measured = evaluateTarget(counterBand(c, [-Infinity, Infinity]), samples);
      return {
        id: c.id,
        label: c.label,
        unit: c.unit,
        counter: c.counter,
        status: 'unbanded',
        reason: c.unbanded,
        matches: measured.matches,
        missing: measured.missing,
        ...(measured.value !== undefined && { value: measured.value, interval: measured.interval }),
      };
    }
    return { ...evaluateTarget(counterBand(c, c.band), samples), counter: c.counter };
  });
}

/** One line per advanced counter, printed the same by both runners. */
export function describeAdvancedCounters(
  rows: readonly Pick<
    AdvancedCounterResult,
    'id' | 'status' | 'band' | 'value' | 'interval' | 'matchTarget'
  >[],
): string[] {
  const n = (x: number | undefined) => (x === undefined ? '—' : x.toFixed(x < 10 ? 2 : 1));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return [
    `MATCH-30 advanced counters (target v${ADVANCED_COUNTER_TARGET.version}, ${MATCH_PARITY_VERSION}): ${[...counts].map(([k, v]) => `${v} ${k}`).join(', ')}`,
    ...rows.map(
      (r) =>
        `  ${r.id}: ${r.status}${r.band ? ` [${r.band[0]}, ${r.band[1]}]` : ''} ${n(r.value)}${r.interval ? ` (${n(r.interval[0])}–${n(r.interval[1])})` : ''}${r.matchTarget ? ` (MATCH-23 ${r.matchTarget})` : ''}`,
    ),
  ];
}

type Outcomes = { homeWin: number; draw: number; awayWin: number };
export interface OutcomeCurveRow {
  bucket: number;
  matches: number;
  meanGap: number;
  target: Outcomes;
  /** 90-minute result shares and their Wilson intervals. */
  observed: Outcomes;
  intervals: Record<keyof Outcomes, [number, number]>;
  /** |observed − target| summed over the three shares. */
  error: number;
}
/**
 * MATCH-2's outcome curve: 90-minute results per gap bucket against OUTCOME_TARGET, and the mean
 * absolute W/D/L error over the buckets inside OUTCOME_TARGET.gaps as scripts/calibrate.ts prints
 * it. MATCH-2 asks each calibration to record that error and sets no tolerance, so the report
 * measures and never passes; any sample without a gap makes it missing.
 */
export function buildOutcomeTargetReport(samples: readonly MatchSample[]) {
  const buckets = new Map<number, MatchSample[]>();
  const missing = samples.filter((s) => s.gap === undefined).length;
  for (const s of samples) {
    if (s.gap === undefined) continue;
    const bucket = gapBucket(s.gap);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(s);
  }
  const keys = ['homeWin', 'draw', 'awayWin'] as const;
  const rows = [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([bucket, list]): OutcomeCurveRow => {
      const n = list.length;
      const shares = keys.map((key) => list.filter((s) => outcomeReading(s, key) === 1).length / n);
      const meanGap = sum(list.map((s) => s.gap!)) / n;
      const target = outcomeTarget(meanGap);
      const [homeWin, draw, awayWin] = shares as [number, number, number];
      return {
        bucket,
        matches: n,
        meanGap,
        target,
        observed: { homeWin, draw, awayWin },
        intervals: {
          homeWin: wilson(homeWin, n),
          draw: wilson(draw, n),
          awayWin: wilson(awayWin, n),
        },
        error: sum(keys.map((key, i) => Math.abs(shares[i]! - target[key]))),
      };
    });
  const [low, high] = OUTCOME_TARGET.gaps;
  const scored = rows.filter((r) => r.bucket >= low && r.bucket <= high);
  return {
    status: missing || !rows.length ? ('missing' as const) : ('measured' as const),
    missing,
    rows,
    meanAbsoluteError: scored.length ? sum(scored.map((r) => r.error)) / (3 * scored.length) : null,
  };
}

// ---- Tactic pairings (MATCH-29) ------------------------------------------------------------------

/** A venue of a pairing: the first tactic at home to the second. */
const venueOf = (home: Tactic, away: Tactic) => `${home}-${away}`;
const venueLabel = (venue: string) => venue.replace('-', ' at home to ');
/**
 * One term of a pooled estimate: `weight` times a per-match reading, averaged over its venue. A
 * reading is of one sample, or of one fixture's pair of samples in the two-path comparison.
 */
interface PairingTerm<T = MatchSample> {
  venue: string;
  weight: number;
  read: (s: T) => Reading;
}
export interface PairingEstimate {
  value: number;
  interval: [number, number];
  matches: number;
}
/** A pooled estimate, or why there is none: a venue short of samples or a match lacking a reading. */
export type PairingReadout = PairingEstimate | { matches: number; reason: string };

/**
 * A sum of venue means of per-match readings weighted as its terms say, with its 95% normal
 * interval (PARITY_CONFIG.confidence). A match's terms are added first, so one match is one
 * cluster, and venues are independent samples, so the variance is the sum of each venue's mean
 * variance. A venue short of PARITY_CONFIG.minimumSamples matches, or a match without a reading,
 * leaves the estimate insufficient.
 */
function pairingEstimate<T>(
  venues: ReadonlyMap<string, readonly T[]>,
  terms: readonly PairingTerm<T>[],
): PairingReadout {
  const byVenue = new Map<string, PairingTerm<T>[]>();
  for (const t of terms) {
    if (!byVenue.has(t.venue)) byVenue.set(t.venue, []);
    byVenue.get(t.venue)!.push(t);
  }
  const matches = sum([...byVenue.keys()].map((v) => venues.get(v)?.length ?? 0));
  let value = 0,
    variance = 0;
  for (const [venue, list] of byVenue) {
    const samples = venues.get(venue) ?? [];
    if (samples.length < PARITY_CONFIG.minimumSamples)
      return {
        matches,
        reason: `${samples.length} matches with ${venueLabel(venue)}, fewer than ${PARITY_CONFIG.minimumSamples}`,
      };
    const values: number[] = [];
    for (const s of samples) {
      const readings = list.map((t) => t.read(s));
      if (readings.every((v): v is number => typeof v === 'number'))
        values.push(sum(readings.map((v, i) => list[i]!.weight * v)));
    }
    const missing = samples.length - values.length;
    if (missing)
      return { matches, reason: `${missing} matches with ${venueLabel(venue)} lack a reading` };
    value += meanOf(values);
    variance += sdOf(values) ** 2 / values.length;
  }
  const half = zInterval() * Math.sqrt(variance);
  return { value, interval: [value - half, value + half], matches };
}
const scaled = (terms: readonly PairingTerm[], factor: number) =>
  terms.map((t) => ({ ...t, weight: t.weight * factor }));

type SideReader = (side: Side) => (s: MatchSample) => Reading;
const PT = TACTIC_PAIRING_TARGET;
const drawOf: SideReader = () => (s) => outcomeReading(s, 'draw');
const winOf: SideReader = (side) => (s) => outcomeReading(s, side === 0 ? 'homeWin' : 'awayWin');
const pointsOf: SideReader = (side) => (s) =>
  winOf(side)(s)! * PT.points.win + drawOf(side)(s)! * PT.points.draw;
/** A side's reading of a MATCH-29 measure, per 90 minutes played when it counts over the match. */
const measureOf =
  (measure: PairingMeasure): SideReader =>
  (side) => {
    const m = PT.measures[measure];
    const of: Side = m.side === 'own' ? side : side === 0 ? 1 : 0;
    const d = m.reads === 'freshness' ? undefined : METRIC_BY_ID.get(m.reads);
    if (m.reads !== 'freshness' && !d) throw new Error(`${measure} reads unknown ${m.reads}`);
    return (s) => {
      const raw = d ? canonical(s, d, of) : s.freshness?.[of];
      return typeof raw === 'number' && m.perNinety ? (raw * 90) / matchMinutes(s.record) : raw;
    };
  };
/** A tactic's reading in one pairing, both venues weighted equally (a mirror's two sides alike). */
const inPairing = (tactic: Tactic, opponent: Tactic, read: SideReader): PairingTerm[] => [
  { venue: venueOf(tactic, opponent), weight: 1 / 2, read: read(0) },
  { venue: venueOf(opponent, tactic), weight: 1 / 2, read: read(1) },
];
/** A tactic's reading against the other three, each opponent and venue weighted equally. */
const againstOthers = (tactic: Tactic, read: SideReader): PairingTerm[] => {
  const others = TACTICS.filter((t) => t !== tactic);
  return others.flatMap((other) => scaled(inPairing(tactic, other, read), 1 / others.length));
};

export type PairingStatus = 'inside' | 'outside' | 'insufficient';
/** One difference of an ordering: `higher` minus `lower`, which must lie above zero. */
export interface PairingDifference {
  higher: string;
  lower: string;
  /** Above zero beyond its interval (an ordering), or at least zero (at least, at most). */
  strict: boolean;
  status: 'holds' | 'fails' | 'unresolved' | 'insufficient';
  value?: number;
  interval?: [number, number];
  /** Matches in the venues it reads. */
  matches: number;
  reason?: string;
}
export interface TacticPairingVerdict {
  id: string;
  label: string;
  kind: 'band' | 'ordering';
  status: PairingStatus;
  band?: readonly [number, number];
  value?: number;
  interval?: [number, number];
  differences?: PairingDifference[];
  /** Matches in the venues the row reads. */
  matches: number;
  reason?: string;
}
export interface TacticPairingReport {
  /** The library's version and TACTIC_PAIRING_TARGET's. */
  version: string;
  target: number;
  source: string;
  /** Forced pairings (the tactics family) or each club on its own tactic (any other condition). */
  assignment: 'forced' | 'club';
  matches: number;
  /** Matches per venue, `home-away`. */
  venues: Record<string, number>;
  /** Each tactic's points and measures against the other three. */
  tactics: Record<string, Record<'points' | PairingMeasure, PairingReadout>>;
  rows: TacticPairingVerdict[];
  summary: Record<PairingStatus, number>;
}

function bandRow(
  id: string,
  label: string,
  band: readonly [number, number],
  r: PairingReadout,
): TacticPairingVerdict {
  const base = { id, label, kind: 'band' as const, band, matches: r.matches };
  if ('reason' in r) return { ...base, status: 'insufficient', reason: r.reason };
  const v = verdict(r.interval, band[0], band[1]);
  return {
    ...base,
    status: v === 'equivalent' ? 'inside' : v === 'different' ? 'outside' : 'insufficient',
    value: r.value,
    interval: r.interval,
    ...(v === 'insufficient' && { reason: 'the interval crosses a band edge' }),
  };
}
function difference(
  higher: string,
  lower: string,
  strict: boolean,
  r: PairingReadout,
): PairingDifference {
  const base = { higher, lower, strict, matches: r.matches };
  if ('reason' in r) return { ...base, status: 'insufficient', reason: r.reason };
  const [lo, hi] = r.interval;
  const holds = strict ? lo > 0 : lo >= 0,
    fails = strict ? hi <= 0 : hi < 0;
  const status = holds ? 'holds' : fails ? 'fails' : 'unresolved';
  return { ...base, status, value: r.value, interval: r.interval };
}
function orderingRow(id: string, label: string, list: PairingDifference[]): TacticPairingVerdict {
  const status: PairingStatus = list.every((d) => d.status === 'holds')
    ? 'inside'
    : list.some((d) => d.status === 'fails')
      ? 'outside'
      : 'insufficient';
  return {
    id,
    label,
    kind: 'ordering',
    status,
    differences: list,
    matches: Math.max(0, ...list.map((d) => d.matches)),
    ...(status === 'insufficient' && {
      reason: list.find((d) => d.reason)?.reason ?? 'a difference lies within its interval',
    }),
  };
}

/**
 * How a sample set's tactics were assigned: every sample from the tactics family (forced, and each
 * playing its condition's two tactics) or none of them (each club on its own tactic). One call
 * never mixes the two: own tactics come with each club's own squad fatigue (T320 review).
 */
export function pairingAssignment(samples: readonly MatchSample[]): 'forced' | 'club' {
  const forced = samples.filter((s) => conditionOf(s.condition).family === 'tactics');
  if (forced.length && forced.length !== samples.length)
    throw new Error(
      `MATCH-29 reads one tactic assignment at a time: ${forced.length} forced and ${samples.length - forced.length} own-tactic samples`,
    );
  for (const s of forced) {
    const { home, away } = conditionOf(s.condition).params as { home: Tactic; away: Tactic };
    if (s.record.tactics[0] !== home || s.record.tactics[1] !== away)
      throw new Error(`${s.record.id} played ${s.record.tactics.join('-')} under ${s.condition}`);
  }
  return forced.length ? 'forced' : 'club';
}

/**
 * MATCH-29's verdicts over samples of equal top-tier sides. Samples are grouped by their sides'
 * tactics (`record.tactics`, home first) into venues, and each pairing pools its two venues. Every
 * row is inside, outside or insufficient: a band by its 95% interval, an ordering by each of its
 * differences; a venue short of samples or a match lacking a measure is insufficient, never a
 * pass. Draws and wins are 90-minute results; per-match counts are per 90 minutes played.
 */
/** One estimate a MATCH-29 row reads: a band row's value, or one difference of an ordering. */
interface PairingPart {
  higher?: string;
  lower?: string;
  strict?: boolean;
  terms: PairingTerm[];
}
/**
 * One MATCH-29 row as estimates over venues, shared by the verdicts on one path and the paired
 * comparison of two (T396). `scale` is what sets the row's MATCH-28 margin in that comparison: an
 * outcome rate, or the per-side reading whose reference mean and spread do.
 */
interface PairingRowSpec {
  id: string;
  label: string;
  kind: 'band' | 'ordering';
  band?: readonly [number, number];
  parts: PairingPart[];
  scale: { kind: 'rate' } | { kind: 'mean'; read: SideReader };
  /** Freshness reads forced pairings only (T320 review). */
  forcedOnly?: boolean;
}
const FORCED_ONLY_REASON =
  "own-tactic samples start from each club's own squad fatigue; freshness reads forced pairings only";

/** MATCH-29's rows in report order: draws, win-share gaps, head to head, points, orderings. */
function pairingRowSpecs(): PairingRowSpec[] {
  const specs: PairingRowSpec[] = [];
  const rate = { kind: 'rate' } as const;
  const pairings = TACTICS.flatMap((a, i) => TACTICS.slice(i).map((b) => [a, b] as const));
  for (const [a, b] of pairings)
    specs.push({
      id: `draws:${a}-${b}`,
      label: `draws, ${a} v ${b}`,
      kind: 'band',
      band: PT.draws,
      parts: [{ terms: inPairing(a, b, drawOf) }],
      scale: rate,
    });
  const winGap = (a: Tactic, b: Tactic) => [
    ...inPairing(a, b, winOf),
    ...scaled(inPairing(b, a, winOf), -1),
  ];
  for (const [a, b] of pairings.filter(([a, b]) => a !== b))
    specs.push({
      id: `winShareGap:${a}-${b}`,
      label: `${a} win share minus ${b}'s, ${a} v ${b}`,
      kind: 'band',
      band: [-PT.winShareGap, PT.winShareGap],
      parts: [{ terms: winGap(a, b) }],
      scale: rate,
    });
  for (const [a, b] of PT.atLeast)
    specs.push({
      id: `atLeast:${a}-${b}`,
      label: `${a} win share at least ${b}'s, head to head`,
      kind: 'ordering',
      parts: [{ higher: a, lower: b, strict: false, terms: winGap(a, b) }],
      scale: rate,
    });
  const fourMean = TACTICS.flatMap((t) => scaled(againstOthers(t, pointsOf), -1 / TACTICS.length));
  for (const t of TACTICS)
    specs.push({
      id: `points:${t}`,
      label: `${t} points a match against the other three, minus the four's mean`,
      kind: 'band',
      band: [-PT.pointsFromMean, PT.pointsFromMean],
      parts: [{ terms: [...againstOthers(t, pointsOf), ...fourMean] }],
      scale: { kind: 'mean', read: pointsOf },
    });
  for (const o of PT.orderings) {
    const of = (t: Tactic) => againstOthers(t, measureOf(o.measure));
    const parts: PairingPart[] = [];
    const above = (high: Tactic, low: Tactic) => {
      if (high !== low && !parts.some((d) => d.higher === high && d.lower === low))
        parts.push({
          higher: high,
          lower: low,
          strict: true,
          terms: [...of(high), ...scaled(of(low), -1)],
        });
    };
    const words: string[] = [];
    if (o.highest) words.push(`${o.highest} highest`);
    if (o.lowest) words.push(`${o.lowest} lowest`);
    for (const t of TACTICS) if (o.highest) above(o.highest, t);
    for (const t of TACTICS) if (o.lowest) above(t, o.lowest);
    if (o.atMostOthersMean) {
      const b = o.atMostOthersMean,
        others = TACTICS.filter((t) => t !== b);
      words.push(`${b} at most the mean of the other three`);
      const mean = others.flatMap((t) => scaled(of(t), 1 / others.length));
      parts.push({
        higher: `mean of ${others.join(', ')}`,
        lower: b,
        strict: false,
        terms: [...mean, ...scaled(of(b), -1)],
      });
    }
    specs.push({
      id: `ordering:${o.measure}`,
      label: `${PT.measures[o.measure].label}: ${words.join(', ')}`,
      kind: 'ordering',
      parts,
      scale: { kind: 'mean', read: measureOf(o.measure) },
      ...(o.measure === 'freshness' && { forcedOnly: true }),
    });
  }
  return specs;
}

/** Samples grouped into venues by their sides' tactics, home first. */
function pairingVenues<T>(items: readonly T[], tacticsOf: (x: T) => readonly [Tactic, Tactic]) {
  const venues = new Map<string, T[]>();
  for (const x of items) {
    const [home, away] = tacticsOf(x);
    const key = venueOf(home, away);
    if (!venues.has(key)) venues.set(key, []);
    venues.get(key)!.push(x);
  }
  return venues;
}

export function tacticPairingVerdicts(samples: readonly MatchSample[]): TacticPairingReport {
  const assignment = pairingAssignment(samples);
  const venues = pairingVenues(samples, (s) => s.record.tactics);
  const estimate = (terms: readonly PairingTerm[]) => pairingEstimate(venues, terms);
  const rows: TacticPairingVerdict[] = [];
  for (const spec of pairingRowSpecs()) {
    const row =
      spec.kind === 'band'
        ? bandRow(spec.id, spec.label, spec.band!, estimate(spec.parts[0]!.terms))
        : orderingRow(
            spec.id,
            spec.label,
            spec.parts.map((p) => difference(p.higher!, p.lower!, p.strict!, estimate(p.terms))),
          );
    // Own tactics carry the weekly press load into the match (MATCH-2), so freshness there reads
    // the squads' pre-match fatigue, not the tactic's in-match cost: never a pass (T320 review).
    rows.push(
      spec.forcedOnly && assignment === 'club'
        ? { ...row, status: 'insufficient', reason: FORCED_ONLY_REASON }
        : row,
    );
  }
  const measures = Object.keys(PT.measures) as PairingMeasure[];
  const tactics = Object.fromEntries(
    TACTICS.map((t) => [
      t,
      Object.fromEntries([
        ['points', estimate(againstOthers(t, pointsOf))],
        ...measures.map((m) => [m, estimate(againstOthers(t, measureOf(m)))]),
      ]) as Record<'points' | PairingMeasure, PairingReadout>,
    ]),
  );
  const count = (status: PairingStatus) => rows.filter((r) => r.status === status).length;
  return {
    version: MATCH_PARITY_VERSION,
    target: PT.version,
    source: PT.source,
    assignment,
    matches: samples.length,
    venues: Object.fromEntries([...venues].map(([k, v]) => [k, v.length])),
    tactics,
    rows,
    summary: {
      inside: count('inside'),
      outside: count('outside'),
      insufficient: count('insufficient'),
    },
  };
}

const fixed = (x: number) => (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(3));
const span = (i: readonly [number, number]) => `[${fixed(i[0])}, ${fixed(i[1])}]`;
/** The verdicts as printed lines, the same for every runner. */
export function describeTacticPairings(report: TacticPairingReport): string[] {
  const { inside, outside, insufficient } = report.summary;
  const lines = [
    `${report.source} tactic pairings (target v${report.target}, ${report.version}, ${report.matches} matches): ${inside} inside, ${outside} outside, ${insufficient} insufficient of ${report.rows.length}`,
  ];
  for (const r of report.rows) {
    const reading =
      r.kind === 'band'
        ? r.value === undefined
          ? ''
          : `${fixed(r.value)} ${span(r.interval!)} against ${span(r.band!)}`
        : r
            .differences!.map(
              (d) =>
                `${d.higher} − ${d.lower}${d.value === undefined ? '' : ` ${fixed(d.value)} ${span(d.interval!)}`} ${d.status}`,
            )
            .join('; ');
    const parts = [reading, r.reason && `(${r.reason})`].filter(Boolean).join(' ');
    lines.push(`  ${r.status.padEnd(12)} ${r.label}: ${parts}`);
  }
  return lines;
}

// ---- MATCH-29 parity of the two paths (MATCH-28) ---------------------------------------------------

/** One fixture played on both paths. */
interface FixturePair {
  aggregate: MatchSample;
  detailed: MatchSample;
}
export type PairingParityVerdict = 'equivalent' | 'different' | 'insufficient';
/** One paired difference (aggregate − detailed) of a row's estimate against its MATCH-28 margin. */
export interface PairingParityPart {
  /** An ordering's difference: the tactic (or mean) that should be higher, and the lower one. */
  higher?: string;
  lower?: string;
  verdict: PairingParityVerdict;
  difference?: number;
  interval?: [number, number];
  /** Paired fixtures in the venues it reads. */
  pairs: number;
  reason?: string;
}
export interface TacticPairingParityRow {
  id: string;
  label: string;
  kind: 'band' | 'ordering';
  /** The row's MATCH-29 status on each path, from that path's own verdicts. */
  aggregate: PairingStatus;
  detailed: PairingStatus;
  verdict: PairingParityVerdict;
  /** MATCH-28's margin for this row: 3 points of a rate, or the reference measure's mean margin. */
  margin: number;
  /** A band row's paired difference; an ordering's are in `differences`. */
  difference?: number;
  interval?: [number, number];
  differences?: PairingParityPart[];
  pairs: number;
  reason?: string;
}
export interface TacticPairingParityReport {
  note: string;
  version: string;
  target: number;
  matches: { aggregate: number; detailed: number; paired: number };
  /** Rows with the same MATCH-29 status on both paths (context, not a verdict). */
  agreeing: number;
  rows: TacticPairingParityRow[];
  counts: Record<PairingParityVerdict, number>;
}

/** A row's reading on one fixture pair: the aggregate's minus the detailed path's. */
const pairedTerms = (terms: readonly PairingTerm[]): PairingTerm<FixturePair>[] =>
  terms.map((t) => ({
    venue: t.venue,
    weight: t.weight,
    read: (p) => {
      const a = t.read(p.aggregate),
        d = t.read(p.detailed);
      return typeof a === 'number' && typeof d === 'number' ? a - d : undefined;
    },
  }));
/**
 * MATCH-28's mean margin for a row reading `read`: the larger of 5% of the detailed reference's
 * mean or 0.1 of its per-match spread, over both sides of every reference match.
 */
function pairingMeanMargin(detailed: readonly MatchSample[], read: SideReader) {
  const values = detailed.flatMap((s) =>
    ([0, 1] as const)
      .map((side) => read(side)(s))
      .filter((v): v is number => typeof v === 'number'),
  );
  return values.length ? meanMargin({ mean: meanOf(values), sd: sdOf(values) }) : 0;
}
function parityPart(
  readout: PairingReadout,
  margin: number,
  ends: { higher?: string; lower?: string },
): PairingParityPart {
  const base = {
    ...(ends.higher !== undefined && { higher: ends.higher, lower: ends.lower }),
    pairs: readout.matches,
  };
  if ('reason' in readout) return { ...base, verdict: 'insufficient', reason: readout.reason };
  const verdictOf = verdict(readout.interval, -margin, margin);
  return {
    ...base,
    verdict: verdictOf,
    difference: readout.value,
    interval: readout.interval,
    ...(verdictOf === 'insufficient' && { reason: 'the interval crosses a margin edge' }),
  };
}

/**
 * MATCH-29 parity as a MATCH-28 verdict (T396): each row's aggregate − detailed difference over
 * the same forced fixtures, paired fixture by fixture (`fixture`, else the record id), with a 95%
 * interval from the paired differences pooled over venues as `tacticPairingVerdicts` pools one
 * path. Outcome-rate rows (draws, win shares and their gap) take MATCH-28's 3 points; points and
 * the orderings' measures take the larger of 5% of the detailed mean or 0.1 of its spread. A row is
 * equivalent only when every interval it reads fits the margin, different when any lies beyond
 * it, and insufficient otherwise: a straddling interval, a short venue or a missing reading is
 * never a pass. Fixtures played on one path only are left out.
 */
export function tacticPairingParity(
  aggregate: readonly MatchSample[],
  detailed: readonly MatchSample[],
): TacticPairingParityReport {
  const onAggregate = tacticPairingVerdicts(aggregate),
    onDetailed = tacticPairingVerdicts(detailed);
  const keyOf = (s: MatchSample) => s.fixture ?? s.record.id;
  const reference = new Map(detailed.map((s) => [keyOf(s), s]));
  const pairs: FixturePair[] = [];
  for (const a of aggregate) {
    const d = reference.get(keyOf(a));
    if (!d) continue;
    if (a.record.tactics[0] !== d.record.tactics[0] || a.record.tactics[1] !== d.record.tactics[1])
      throw new Error(
        `${keyOf(a)} played ${a.record.tactics.join('-')} on the aggregate path and ${d.record.tactics.join('-')} on the detailed one`,
      );
    pairs.push({ aggregate: a, detailed: d });
  }
  const club = onAggregate.assignment === 'club' || onDetailed.assignment === 'club';
  const venues = pairingVenues(pairs, (p) => p.aggregate.record.tactics);
  const statusOf = (report: TacticPairingReport, id: string) =>
    report.rows.find((r) => r.id === id)!.status;
  const rows = pairingRowSpecs().map((spec): TacticPairingParityRow => {
    const margin =
      spec.scale.kind === 'rate'
        ? PARITY_CONFIG.outcomeRateMargin
        : pairingMeanMargin(detailed, spec.scale.read);
    const parts = spec.parts.map((p) =>
      parityPart(pairingEstimate(venues, pairedTerms(p.terms)), margin, p),
    );
    const verdictOf: PairingParityVerdict = parts.every((p) => p.verdict === 'equivalent')
      ? 'equivalent'
      : parts.some((p) => p.verdict === 'different')
        ? 'different'
        : 'insufficient';
    const base = {
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      aggregate: statusOf(onAggregate, spec.id),
      detailed: statusOf(onDetailed, spec.id),
      margin,
      pairs: Math.max(0, ...parts.map((p) => p.pairs)),
    };
    if (spec.forcedOnly && club)
      return { ...base, verdict: 'insufficient', reason: FORCED_ONLY_REASON };
    const reason = verdictOf === 'insufficient' ? parts.find((p) => p.reason)?.reason : undefined;
    return spec.kind === 'band'
      ? {
          ...base,
          verdict: verdictOf,
          ...(parts[0]!.difference !== undefined && {
            difference: parts[0]!.difference,
            interval: parts[0]!.interval,
          }),
          ...(reason && { reason }),
        }
      : { ...base, verdict: verdictOf, differences: parts, ...(reason && { reason }) };
  });
  const count = (v: PairingParityVerdict) => rows.filter((r) => r.verdict === v).length;
  return {
    note: 'Each MATCH-29 row as aggregate − detailed over the same forced fixtures, paired by fixture, with a 95% interval against MATCH-28’s margin (T396).',
    version: MATCH_PARITY_VERSION,
    target: PT.version,
    matches: { aggregate: aggregate.length, detailed: detailed.length, paired: pairs.length },
    agreeing: rows.filter((r) => r.aggregate === r.detailed).length,
    rows,
    counts: {
      equivalent: count('equivalent'),
      different: count('different'),
      insufficient: count('insufficient'),
    },
  };
}

/** The paired MATCH-29 parity as printed lines. */
export function describeTacticPairingParity(report: TacticPairingParityReport): string[] {
  const { equivalent, different, insufficient } = report.counts;
  const lines = [
    `MATCH-29 parity (aggregate − detailed, ${report.matches.paired} paired fixtures): ${equivalent} equivalent, ${different} different, ${insufficient} insufficient of ${report.rows.length}; ${report.agreeing} rows share a status`,
  ];
  const reading = (p: { difference?: number; interval?: [number, number] }) =>
    p.difference === undefined ? '' : `${fixed(p.difference)} ${span(p.interval!)}`;
  for (const r of report.rows) {
    const body =
      r.kind === 'band'
        ? reading(r)
        : r
            .differences!.map((d) => `${d.higher} − ${d.lower} ${reading(d)} ${d.verdict}`)
            .join('; ');
    const parts = [body, `±${fixed(r.margin)}`, r.reason && `(${r.reason})`]
      .filter(Boolean)
      .join(' ');
    lines.push(`  ${r.verdict.padEnd(12)} ${r.label} [${r.aggregate} / ${r.detailed}]: ${parts}`);
  }
  return lines;
}

/** An exact record invariant: no statistical tolerance (→MATCH-27). */
export interface Invariant {
  id: string;
  source: string;
  /** Failure descriptions; `unsupported` when the record lacks what it checks. */
  check: (s: MatchSample) => string[] | 'unsupported';
}
function atMost(out: string[], what: string, part: number | undefined, whole: number | undefined) {
  if (part !== undefined && whole !== undefined && part > whole)
    out.push(`${what}: ${part} > ${whole}`);
}
function linesOf(s: MatchSample) {
  const lines = sides.map((side) => sideLines(s.record, side));
  return lines[0] && lines[1]
    ? (lines as [MatchRecord['players'], MatchRecord['players']])
    : undefined;
}

export const INVARIANTS: readonly Invariant[] = [
  {
    id: 'score-goals',
    source: 'MATCH-27',
    check: ({ record: r }) =>
      r.score.home === r.metrics[0][M.goals] && r.score.away === r.metrics[1][M.goals]
        ? []
        : [
            `score ${r.score.home}-${r.score.away} ≠ goals ${r.metrics[0][M.goals]}-${r.metrics[1][M.goals]}`,
          ],
  },
  {
    id: 'row-widths',
    source: 'MATCH-13',
    check: ({ record: r }) => {
      const out: string[] = [];
      const width = zeroMetrics().length;
      for (const side of sides) {
        if (r.metrics[side]?.length !== width) out.push(`team metrics ${side} width`);
        if (r.detail && r.detail[side]?.length !== TEAM_DETAIL_SIZE)
          out.push(`team detail ${side} width`);
      }
      const details = r.players.filter((p) => p.detail).length;
      if (details && details !== r.players.length) out.push('detail for some players only');
      for (const p of r.players) {
        if (p.metrics.length !== width) out.push(`${p.id} metrics width`);
        if (p.detail && p.detail.length !== PLAYER_DETAIL_SIZE) out.push(`${p.id} detail width`);
      }
      return out;
    },
  },
  {
    id: 'attempts',
    source: 'MATCH-27',
    check: ({ record: r }) => {
      const out: string[] = [];
      const rows = [
        ...sides.map((side) => ({ who: `side ${side}`, m: r.metrics[side]! })),
        ...r.players.map((p) => ({ who: p.id, m: p.metrics })),
      ];
      for (const { who, m } of rows) {
        atMost(out, `${who} completed passes`, m[M.completed], m[M.passes]);
        atMost(out, `${who} goals`, m[M.goals], m[M.onTarget]);
        atMost(out, `${who} shots on target`, m[M.onTarget], m[M.shots]);
      }
      for (const side of sides)
        atMost(out, `side ${side} assists`, r.metrics[side]![M.assists], r.metrics[side]![M.goals]);
      return out;
    },
  },
  {
    id: 'detail-attempts',
    source: 'MATCH-13',
    check: ({ record: r }) => {
      if (!r.detail) return 'unsupported';
      const out: string[] = [];
      for (const side of sides) {
        const t = r.detail[side]!,
          m = r.metrics[side]!,
          who = `side ${side}`;
        atMost(
          out,
          `${who} final-third completions`,
          t[TD.finalThirdCompleted],
          t[TD.finalThirdPasses],
        );
        atMost(out, `${who} crosses completed`, t[TD.crossesCompleted], t[TD.crosses]);
        atMost(
          out,
          `${who} through balls completed`,
          t[TD.throughBallsCompleted],
          t[TD.throughBalls],
        );
        atMost(out, `${who} penalties scored`, t[TD.penaltiesScored], t[TD.penalties]);
        atMost(out, `${who} dribbles`, m[M.dribbles], t[TD.takeOns]);
        atMost(out, `${who} key passes`, t[TD.keyPasses], m[M.shots]);
        atMost(out, `${who} assists`, m[M.assists], t[TD.keyPasses]);
        atMost(out, `${who} big chances scored`, t[TD.bigChancesScored], t[TD.bigChances]);
        atMost(out, `${who} big chances`, t[TD.bigChances], t[TD.boxShots]);
        atMost(out, `${who} box shots`, t[TD.boxShots], m[M.shots]);
      }
      for (const p of r.players) {
        const d = p.detail;
        if (!d) continue;
        atMost(
          out,
          `${p.id} final-third completions`,
          d[PD.finalThirdCompleted],
          d[PD.finalThirdPasses],
        );
        atMost(out, `${p.id} crosses completed`, d[PD.crossesCompleted], d[PD.crosses]);
        atMost(
          out,
          `${p.id} through balls completed`,
          d[PD.throughBallsCompleted],
          d[PD.throughBalls],
        );
        atMost(out, `${p.id} dribbles`, p.metrics[M.dribbles], d[PD.takeOns]);
        atMost(out, `${p.id} big chances created`, d[PD.bigChancesCreated], d[PD.keyPasses]);
      }
      return out;
    },
  },
  {
    id: 'reconcile',
    source: 'MATCH-27',
    check: (s) => {
      const lines = linesOf(s);
      if (!lines) return 'unsupported';
      const out: string[] = [];
      for (const d of METRIC_REGISTRY) {
        if (!d.reconcile) continue;
        const team = METRIC_BY_ID.get(d.reconcile.team)!;
        for (const side of sides) {
          const rows = lines[side].map((l) =>
            d.family === 'player-metric' ? l.metrics : l.detail,
          );
          if (rows.some((row) => !row)) continue;
          const total = sum(rows.map((row) => row![d.index!]!));
          const at: Side = d.reconcile.side === 'own' ? side : side === 0 ? 1 : 0;
          const recorded = teamReading(s, team, at);
          if (typeof recorded !== 'number') continue;
          // Compared in the player row's stored unit, the team value rounded into it.
          const expected = Math.round((recorded * team.scale) / d.scale);
          const tolerance =
            d.reconcile.kind === 'rounded' ? 0.5 + 0.5 * s.record.metrics[side]![M.shots]! : 0;
          const bad =
            d.reconcile.kind === 'at-most'
              ? total > expected
              : Math.abs(total - expected) > tolerance;
          if (bad) out.push(`${d.id} side ${side}: players ${total}, team ${expected}`);
        }
      }
      return out;
    },
  },
  {
    id: 'minutes',
    source: 'MATCH-27',
    check: (s) => {
      const r = s.record,
        length = matchMinutes(r),
        out: string[] = [];
      for (const side of sides)
        if (r.metrics[side]![M.minutes] !== length)
          out.push(`side ${side} match length ${r.metrics[side]![M.minutes]} ≠ ${length}`);
      const lines = linesOf(s);
      if (!lines) return out;
      for (const side of sides) {
        let total = 0;
        for (const l of lines[side]) {
          const minutes = l.metrics[M.minutes]!;
          total += minutes;
          if (minutes < 1 || minutes > length) out.push(`${l.id} minutes ${minutes}`);
        }
        if (total > 11 * length) out.push(`side ${side} minutes ${total} > ${11 * length}`);
      }
      const ids = r.players.map((p) => p.id);
      if (new Set(ids).size !== ids.length) out.push('a player has two lines');
      return out;
    },
  },
  {
    id: 'xg-shots',
    source: 'MATCH-27',
    check: ({ record: r }) => {
      if (!r.xg) return 'unsupported';
      const out: string[] = [];
      for (const side of sides) {
        const xg = r.xg[side]!;
        if (!(xg >= 0)) out.push(`side ${side} xG ${xg}`);
        if (r.metrics[side]![M.shots] === 0 && xg !== 0) out.push(`side ${side} xG without shots`);
      }
      return out;
    },
  },
  {
    id: 'incidents',
    source: 'MATCH-19/20/27',
    check: (s) => {
      const list = incidentsOf(s);
      if (!list) return 'unsupported';
      const r = s.record,
        out: string[] = [];
      const lines = linesOf(s);
      const roster = lines && lines.map((ls) => new Set(ls.map((l) => l.id)));
      const era = eraRules(r.year);
      const booked = new Set<string>(),
        off = new Set<string>(),
        hurt = new Set<string>();
      const subs = [0, 0];
      let last = 0;
      for (const x of list) {
        if (x.minute < 1 || x.minute > matchMinutes(r)) out.push(`${x.kind} at minute ${x.minute}`);
        if (x.minute < last) out.push(`incidents out of order at minute ${x.minute}`);
        last = x.minute;
        const named = x.kind === 'sub' ? [x.player, x.other] : [x.player];
        if (roster)
          for (const id of named)
            if (!id || !roster[x.side]!.has(id))
              out.push(`${x.kind} names ${id} outside side ${x.side}`);
        if (x.kind === 'yellow') booked.add(x.player);
        if (x.kind === 'secondYellow' && !booked.has(x.player))
          out.push(`${x.player} second yellow without a first`);
        if (x.kind === 'red' || x.kind === 'secondYellow') {
          if (off.has(x.player)) out.push(`${x.player} sent off twice`);
          off.add(x.player);
        }
        if (x.kind === 'injury') hurt.add(x.player);
        if (x.kind === 'sub') {
          subs[x.side]!++;
          if (!x.other) out.push(`sub at minute ${x.minute} names no substitute`);
          if (era.injuryOnly && !hurt.has(x.player))
            out.push(`${x.player} replaced without an injury`);
        }
      }
      for (const side of sides)
        if (subs[side]! > era.maxSubs)
          out.push(`side ${side} made ${subs[side]} substitutions > ${era.maxSubs}`);
      return out;
    },
  },
  {
    id: 'cards-detail',
    source: 'MATCH-19/27',
    check: (s) => {
      const list = incidentsOf(s),
        r = s.record;
      if (!list || !r.detail) return 'unsupported';
      const out: string[] = [];
      for (const side of sides) {
        const count = (...kinds: Incident['kind'][]) =>
          list.filter((x) => x.side === side && kinds.includes(x.kind)).length;
        if (r.detail[side]![TD.yellowCards] !== count('yellow', 'secondYellow'))
          out.push(`side ${side} yellow cards disagree with incidents`);
        if (r.detail[side]![TD.redCards] !== count('red', 'secondYellow'))
          out.push(`side ${side} red cards disagree with incidents`);
      }
      return out;
    },
  },
  {
    id: 'periods',
    source: 'MATCH-1/6',
    check: ({ record: r }) => {
      const out: string[] = [];
      if (r.shootout) {
        if (!r.regulation) out.push('shoot-out without extra time');
        if (r.shootout.home === r.shootout.away) out.push('level shoot-out');
      }
      if (r.regulation && (r.regulation.home > r.score.home || r.regulation.away > r.score.away))
        out.push('regulation score above the final score');
      if (r.added) {
        if (r.added.length !== (r.regulation ? 4 : 2))
          out.push(`${r.added.length} added-time periods`);
        if (r.added.some((a) => !(a >= 0))) out.push('negative added time');
      }
      return out;
    },
  },
  {
    id: 'condition-rules',
    source: 'MATCH-6/20/27',
    check: (s) => {
      const r = s.record,
        out: string[] = [];
      const condition = conditionOf(s.condition);
      // A league fixture never has to produce a winner (→MATCH-6).
      if ((r.kind === 'league' || r.kind === 'lower') && (r.regulation || r.shootout))
        out.push(`extra time or a shoot-out in a ${r.kind} fixture (MATCH-6)`);
      // A tie that must produce a winner plays extra time exactly when it is level after 90
      // minutes, and a shoot-out exactly when it is still level after extra time (→MATCH-6).
      const decide = condition.params.decide as DecideRule | undefined;
      if (decide) {
        const ninety = r.regulation ?? r.score;
        const level = isLevel(decide, ninety.home, ninety.away);
        if (level && !r.regulation) out.push('a tie level after 90 minutes played no extra time');
        if (!level && r.regulation) out.push('extra time after a decided 90 minutes');
        if (r.regulation) {
          const stillLevel = isLevel(decide, r.score.home, r.score.away);
          if (stillLevel && !r.shootout) out.push('a tie level after extra time had no shoot-out');
          if (!stillLevel && r.shootout) out.push('a shoot-out after extra time decided the tie');
        }
      }
      // What the condition rules out must not be recorded at all; unreadable is not a pass.
      let unread = false;
      for (const [id, rule] of Object.entries(condition.notApplicable)) {
        const o = observe([s], METRIC_BY_ID.get(id)!);
        if (o.missing) unread = true;
        else if (recordedMatches(o)) out.push(`${id} recorded under ${s.condition}: ${rule}`);
      }
      return out.length || !unread ? out : 'unsupported';
    },
  },
];

export interface InvariantResult {
  id: string;
  source: string;
  passed: number;
  failed: number;
  unsupported: number;
  examples: { fixture: string; failures: string[] }[];
}
/** Exact invariant failures per rule; `unsupported` records are neither passes nor failures. */
export function buildInvariantReport(samples: readonly MatchSample[]): InvariantResult[] {
  return INVARIANTS.map((inv) => {
    const result: InvariantResult = {
      id: inv.id,
      source: inv.source,
      passed: 0,
      failed: 0,
      unsupported: 0,
      examples: [],
    };
    for (const s of samples) {
      const outcome = inv.check(s);
      if (outcome === 'unsupported') result.unsupported++;
      else if (outcome.length) {
        result.failed++;
        if (result.examples.length < 5)
          result.examples.push({ fixture: s.record.id, failures: outcome.slice(0, 5) });
      } else result.passed++;
    }
    return result;
  });
}

const tally = <T extends { status: string }>(rows: readonly T[]) =>
  rows.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {},
  );

/**
 * Path equivalence of one condition's metrics and relationships (→MATCH-28): a fixture condition
 * compares the match metrics, a season condition the season measures. Metrics the condition's
 * rules make impossible are not applicable: listed with their rule and left out of the verdict,
 * unless a path records them, which is `violated` and blocks. Equal constants pass by their zero
 * difference and are listed; every other status blocks.
 */
export function buildEquivalenceReport(input: {
  condition: string;
  reference: readonly MatchSample[];
  candidate: readonly MatchSample[];
  referenceSeasons?: readonly SeasonSample[];
  candidateSeasons?: readonly SeasonSample[];
}) {
  const condition = conditionOf(input.condition);
  for (const s of [...input.reference, ...input.candidate])
    if (s.condition !== condition.id)
      throw new Error(`${s.record.id} was drawn under ${s.condition}, not ${condition.id}`);
  const seasonLevel = condition.level === 'season';
  const metrics = METRIC_REGISTRY.filter((d) => (d.family === 'season') === seasonLevel).map(
    (d): MetricComparison => {
      const [reference, candidate] =
        d.family === 'season'
          ? [
              observeSeasons(input.referenceSeasons ?? [], d),
              observeSeasons(input.candidateSeasons ?? [], d),
            ]
          : [observe(input.reference, d), observe(input.candidate, d)];
      const rule = condition.notApplicable[d.id];
      if (rule) {
        const c = compareDistributions({ ...d, applies: false }, reference, candidate);
        // Ruled out, yet recorded: an exact violation of the rule, never a quiet exclusion.
        const seen = [recordedMatches(reference), recordedMatches(candidate)];
        return seen[0] || seen[1]
          ? {
              ...c,
              status: 'violated',
              reason: `${rule}, yet recorded in ${seen[0]} reference and ${seen[1]} candidate matches`,
            }
          : { ...c, reason: rule };
      }
      const c = compareDistributions(d, reference, candidate);
      // A season measure without season samples is unmeasured.
      return d.family === 'season' && !c.reference.n && !c.candidate.n
        ? { ...c, status: 'missing', reason: 'no season samples' }
        : c;
    },
  );
  const relationships = seasonLevel
    ? []
    : PARITY_CONFIG.relationships.map((pair): RelationshipComparison => {
        const rule = pair.map((id) => condition.notApplicable[id]).find(Boolean);
        return rule
          ? { pair, status: 'not-applicable', reason: rule }
          : compareRelationship(pair, input.reference, input.candidate);
      });
  const blocks = (status: ComparisonStatus) =>
    status !== 'equivalent' && status !== 'not-applicable';
  const blocking = [
    ...metrics.filter((m) => blocks(m.status)).map((m) => m.id),
    ...relationships.filter((r) => blocks(r.status)).map((r) => r.pair.join(' ~ ')),
  ];
  return {
    condition: condition.id,
    level: condition.level,
    metrics,
    relationships,
    summary: { metrics: tally(metrics), relationships: tally(relationships) },
    constants: metrics.filter((m) => m.constant).map((m) => m.id),
    notApplicable: metrics
      .filter((m) => m.status === 'not-applicable' || m.status === 'violated')
      .map((m) => ({ id: m.id, reason: m.reason ?? 'not measured at this level' })),
    blocking,
    passed: blocking.length === 0,
  };
}

/** Where, on what and from which seeds a measurement ran. */
export interface Provenance {
  date: string;
  source: {
    gitHead: string;
    gitDirty: boolean;
    /** Content hash of the tracked and untracked files under `scope` (git pathspecs). */
    fingerprint: { algorithm: 'sha256'; sha256: string; files: number; scope: readonly string[] };
  };
  toolchain: Readonly<Record<string, string>>;
  machine: {
    platform: string;
    arch: string;
    cpu: string;
    logicalCpus: number;
    memoryBytes: number;
  };
  seeds: Readonly<Record<string, unknown>>;
  conditions: readonly string[];
  partitions: Readonly<Record<string, string>>;
}

interface ParitySide {
  path: string;
  engine: ReportPath;
  samples: readonly MatchSample[];
  seasons?: readonly SeasonSample[];
}
/** The comparison sections kept apart: target errors, path equivalence and exact invariants. */
export function buildParityReport(input: {
  provenance: Provenance;
  partition: Partition;
  condition: string;
  /** `engine`: which engine played the samples (MATCH-23's trace-only rows bind the detailed one). */
  reference: ParitySide;
  candidate: ParitySide;
}) {
  const errors = validateCorpusConfig(CORPUS_CONFIG);
  if (errors.length) throw new Error(errors.join('; '));
  const equivalence = buildEquivalenceReport({
    condition: input.condition,
    reference: input.reference.samples,
    candidate: input.candidate.samples,
    referenceSeasons: input.reference.seasons,
    candidateSeasons: input.candidate.seasons,
  });
  return {
    version: MATCH_PARITY_VERSION,
    configs: {
      parity: PARITY_CONFIG.version,
      corpus: CORPUS_CONFIG.version,
      performance: PERFORMANCE_CONFIG.version,
    },
    provenance: input.provenance,
    partition: input.partition,
    partitions: CORPUS_CONFIG.partitions,
    paths: { reference: input.reference.path, candidate: input.candidate.path },
    coverage: {
      reference: buildCoverageReport(input.reference.samples, input.reference.seasons),
      candidate: buildCoverageReport(input.candidate.samples, input.candidate.seasons),
    },
    targets: {
      reference: buildTargetReport(input.reference.samples, input.reference.engine),
      candidate: buildTargetReport(input.candidate.samples, input.candidate.engine),
    },
    outcomeCurve: {
      reference: buildOutcomeTargetReport(input.reference.samples),
      candidate: buildOutcomeTargetReport(input.candidate.samples),
    },
    invariants: {
      reference: buildInvariantReport(input.reference.samples),
      candidate: buildInvariantReport(input.candidate.samples),
    },
    equivalence,
  };
}

// ---- Performance --------------------------------------------------------------------------------

export interface TimingInput {
  id: PerformanceComponent;
  /** One value per measured item (fixture, season or checkpoint), each a median of repetitions. */
  samplesMs: readonly number[];
  warmup: number;
  repetitions: number;
}
export interface ComponentSummary {
  id: PerformanceComponent;
  category: PerformanceCategory;
  samples: number;
  warmup: number;
  repetitions: number;
  medianMs: number;
  meanMs: number;
  p90Ms: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
}
export interface PerformanceReport {
  version: number;
  provisional: boolean;
  components: ComponentSummary[];
  /** Totals per category: codec time never enters computation, season or settlement time. */
  categories: Record<PerformanceCategory, { components: PerformanceComponent[]; totalMs: number }>;
}
export const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
export function buildPerformanceReport(input: {
  components: readonly TimingInput[];
  provisional: boolean;
}): PerformanceReport {
  const seen = new Set<string>();
  const categories = Object.fromEntries(
    (['preparation', 'computation', 'observation', 'settlement', 'season', 'codec'] as const).map(
      (c) => [c, { components: [] as PerformanceComponent[], totalMs: 0 }],
    ),
  ) as PerformanceReport['categories'];
  const components = input.components.map((c): ComponentSummary => {
    const category = PERFORMANCE_CONFIG.components[c.id] as PerformanceCategory | undefined;
    if (!category) throw new Error(`unknown performance component ${c.id}`);
    if (seen.has(c.id)) throw new Error(`performance component ${c.id} measured twice`);
    if (!c.samplesMs.length) throw new Error(`performance component ${c.id} has no samples`);
    seen.add(c.id);
    const sorted = [...c.samplesMs].sort((a, b) => a - b);
    const total = sum(sorted);
    categories[category].components.push(c.id);
    categories[category].totalMs += total;
    return {
      id: c.id,
      category,
      samples: sorted.length,
      warmup: c.warmup,
      repetitions: c.repetitions,
      medianMs: median(sorted),
      meanMs: total / sorted.length,
      p90Ms: quantile(sorted, 0.9),
      minMs: sorted[0]!,
      maxMs: sorted.at(-1)!,
      totalMs: total,
    };
  });
  return {
    version: PERFORMANCE_CONFIG.version,
    provisional: input.provisional,
    components,
    categories,
  };
}

export interface GateResult {
  id: string;
  budget: number;
  status: 'pass' | 'fail' | 'missing' | 'unpaired';
  ratio?: number;
  baselineMs?: number;
  candidateMs?: number;
}
/**
 * ARCH-31's relative gates between two runs. Runs on another machine, toolchain or world set are
 * unpaired: their timings are context, never a gate result. A provisional run is never release
 * evidence.
 */
export function comparePerformance(
  baseline: { provenance: Provenance; report: PerformanceReport },
  candidate: { provenance: Provenance; report: PerformanceReport },
) {
  const part = {
    machine: (p: Provenance) => p.machine,
    toolchain: (p: Provenance) => p.toolchain,
    worlds: (p: Provenance) => p.seeds,
  };
  const reasons = PERFORMANCE_CONFIG.pairing
    .filter(
      (key) =>
        JSON.stringify(part[key](baseline.provenance)) !==
        JSON.stringify(part[key](candidate.provenance)),
    )
    .map((key) => `${key} differs`);
  const paired = reasons.length === 0;
  const medianOf = (r: PerformanceReport, id: PerformanceComponent) =>
    r.components.find((c) => c.id === id)?.medianMs;
  const gate = (
    id: string,
    budget: number,
    from: PerformanceComponent,
    to: PerformanceComponent,
  ): GateResult => {
    const baselineMs = medianOf(baseline.report, from),
      candidateMs = medianOf(candidate.report, to);
    if (!paired) return { id, budget, status: 'unpaired' };
    if (baselineMs === undefined || candidateMs === undefined)
      return { id, budget, status: 'missing', baselineMs, candidateMs };
    const ratio = candidateMs / baselineMs;
    return {
      id,
      budget,
      status: ratio <= budget ? 'pass' : 'fail',
      ratio,
      baselineMs,
      candidateMs,
    };
  };
  const gates = [
    gate(
      'npc-fixture',
      PERFORMANCE_CONFIG.npcFixtureBudget,
      'fixture.summary',
      'fixture.candidate',
    ),
    ...(
      Object.keys(PERFORMANCE_CONFIG.profiles) as (keyof typeof PERFORMANCE_CONFIG.profiles)[]
    ).map((profile) =>
      gate(
        `season.${profile}`,
        PERFORMANCE_CONFIG.seasonBudget,
        `season.${profile}`,
        `season.${profile}`,
      ),
    ),
  ];
  return {
    paired,
    reasons,
    gates,
    releaseEvidence:
      paired &&
      !baseline.report.provisional &&
      !candidate.report.provisional &&
      gates.every((g) => g.status === 'pass'),
  };
}
