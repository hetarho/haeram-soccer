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
import { BAND_EDGES, goalDistance, inBox, inGoalArea } from '../../packages/engine/src/grid/pitch';
import {
  M,
  type GridDiagnostics,
  type ShotDiagnostic,
} from '../../packages/engine/src/grid/record';
import { eraRules } from '../../packages/engine/src/grid/setup';
import { random, zeroMetrics } from '../../packages/engine/src/primitives';
import { CHECKPOINT_LIMIT, TOTAL_LIMIT } from '../../apps/web/src/adapters/repository';

/** Changes whenever an entry, unit, band, condition, partition, size or tolerance changes (→MATCH-28). */
export const MATCH_PARITY_VERSION = 'match-parity-1';

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
  possession: { label: 'minutes in possession', stored: 'minutes', source: 'MATCH-3' },
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
  pressActions: { label: 'press tackles and interceptions (PPDA denominator)', source: 'MATCH-13' },
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
  /** Home-minus-away match strength before form (MATCH-2), for the outcome curve. */
  gap?: number;
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
  /** Read from the record alone, or from the grid's diagnostics. */
  reads: 'record' | 'diagnostics';
  /** A ratio of sums over matches, or the median of pooled values. */
  estimator: 'ratio' | 'median';
  /** Per match: numerator and denominator (ratio) or the values (median); undefined when absent. */
  contribution: (s: MatchSample) => Contribution | readonly number[] | undefined;
  scale: number;
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
const shotsOf = (s: MatchSample) => s.diagnostics?.shots;
const shotShare = (s: MatchSample, keep: (x: ShotDiagnostic) => boolean) => {
  const shots = shotsOf(s);
  return shots && share(shots.filter(keep).length, shots.length);
};
const goalShare = (s: MatchSample, keep: (g: ShotDiagnostic) => boolean) => {
  const goals = shotsOf(s)?.filter((g) => g.goal);
  return goals && share(goals.filter(keep).length, goals.length);
};
const direction = (s: MatchSample, d: number) => {
  const dirs = s.diagnostics?.directions;
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
  return {
    id,
    label,
    band: range,
    unit,
    source: options.source ?? 'MATCH-23',
    reads,
    estimator: options.estimator ?? 'ratio',
    contribution,
    scale: unit === 'percent' ? 100 : 1,
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
  band('passForward', 'passes forward', [30, 40], 'percent', 'diagnostics', (s) => direction(s, 0)),
  band('passLateral', 'passes lateral', [45, 55], 'percent', 'diagnostics', (s) => direction(s, 1)),
  band('passBack', 'passes back', [12, 18], 'percent', 'diagnostics', (s) => direction(s, 2)),
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
  band('shotsGoalArea', 'shots from the goal area', [6, 9], 'percent', 'diagnostics', (s) =>
    shotShare(s, (x) => inGoalArea(point(x))),
  ),
  band('shotsBox', 'shots from the rest of the box', [48, 58], 'percent', 'diagnostics', (s) =>
    shotShare(s, (x) => inBox(point(x)) && !inGoalArea(point(x))),
  ),
  band('shotsOutside', 'shots from outside the box', [32, 42], 'percent', 'diagnostics', (s) =>
    shotShare(s, (x) => !inBox(point(x))),
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
  band('offsides', 'offsides (team)', [1.5, 2.5], 'count', 'record', (s) =>
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
    'diagnostics',
    (s) => goalShare(s, (g) => g.setPiece),
  ),
  band('penaltyGoals', 'goals from penalties', [6, 9], 'percent', 'record', (s) =>
    share(detail(s, TD.penaltiesScored), s.record.score.home + s.record.score.away),
  ),
  band('headedGoals', 'headed goals', [14, 20], 'percent', 'diagnostics', (s) =>
    goalShare(s, (g) => g.header),
  ),
  band('goalsFW', 'goals by forwards', [50, 60], 'percent', 'diagnostics', (s) =>
    goalShare(s, (g) => g.line === 'FW'),
  ),
  band('goalsMF', 'goals by midfielders', [27, 37], 'percent', 'diagnostics', (s) =>
    goalShare(s, (g) => g.line === 'MF'),
  ),
  band('goalsDF', 'goals by defenders', [8, 15], 'percent', 'diagnostics', (s) =>
    goalShare(s, (g) => g.line === 'DF'),
  ),
  band('ballInPlay', 'ball in play (match)', [54, 58], 'minutes', 'diagnostics', (s) =>
    s.diagnostics ? [s.diagnostics.ballInPlay / 60, 1] : undefined,
  ),
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
const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
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
 * Corpus sizes, the condition matrix and the seed partitions. Families vary one factor around the
 * core condition; no unmeasured combination of families is claimed.
 */
export const CORPUS_CONFIG = {
  version: 1,
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
    ...TACTICS.flatMap((home) =>
      TACTICS.map((away) =>
        condition('tactics', `${home}-${away}`, `${home} at home to ${away}`, { home, away }),
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
    }),
    condition('knockout', 'second-leg', 'second leg level on aggregate', {
      decide: { first: { home: 1, away: 1 }, awayGoals: false },
    }),
    condition('knockout', 'second-leg-away-goals', 'second leg under the away-goals rule', {
      decide: { first: { home: 1, away: 1 }, awayGoals: true },
    }),
    condition('rare', 'discipline', 'red cards and second yellows', {}, true),
    condition('rare', 'penalties', 'penalties awarded and scored', {}, true),
    condition('rare', 'injuries', 'in-match injuries', {}, true),
    condition(
      'rare',
      'extra-time',
      'extra time and shoot-outs',
      { decide: { awayGoals: false } },
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
 * Probability that a rare-event rate ratio's interval fits [1 − m, 1 + m] (on the log scale, so
 * the two edges differ) when both paths record `events` events at the same rate.
 */
export function rareEventPower(events: number) {
  const m = PARITY_CONFIG.rareRelativeMargin;
  return equivalencePower(Math.sqrt(2 / events), -Math.log(1 - m), Math.log(1 + m));
}
let rareEvents: number | undefined;
/** The fewest events each path needs for the rare-event comparison to reach PARITY_CONFIG.power. */
export function requiredRareEvents() {
  if (rareEvents === undefined) {
    let events = 1;
    while (rareEventPower(events) < PARITY_CONFIG.power) events++;
    rareEvents = events;
  }
  return rareEvents;
}

export type PerformanceCategory =
  'preparation' | 'computation' | 'observation' | 'settlement' | 'season' | 'codec';
/**
 * ARCH-31's paired budgets and the unchanged browser/storage limits (→ARCH-28, SAVE-4). Fixture
 * components time whole processing including preparation; `preparation.*` times it alone.
 */
export const PERFORMANCE_CONFIG = {
  version: 1,
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
    'observation.grid': 'observation',
    'observation.frames': 'observation',
    'settlement.npc': 'settlement',
    'settlement.own': 'settlement',
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
 * reported as what it is.
 */
export type ComparisonStatus =
  | 'equivalent'
  | 'different'
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
  if (d.comparison === 'rate-ratio') {
    const events: [number, number] = [sum(reference.values), sum(candidate.values)];
    const required = requiredRareEvents();
    // No events is a measured absence, not a rule: the rate stays unresolved (→MATCH-28).
    if (events[0] === 0 && events[1] === 0)
      return {
        ...base,
        status: 'underpowered',
        reason: `no events on either path, ${required} needed`,
      };
    if (events[0] === 0 || events[1] === 0)
      return { ...base, status: 'underpowered', reason: 'one path has no events' };
    // Events per match: player lines a match differ between paths that substitute differently.
    const ratio = events[1] / clusterCount(candidate) / (events[0] / clusterCount(reference));
    const half = zInterval() * Math.sqrt(1 / events[0] + 1 / events[1]);
    const interval: [number, number] = [ratio * Math.exp(-half), ratio * Math.exp(half)];
    const m = PARITY_CONFIG.rareRelativeMargin;
    const resolved = verdict(interval, 1 - m, 1 + m);
    const short = resolved !== 'different' && Math.min(...events) < required;
    const status: ComparisonStatus = short ? 'underpowered' : resolved;
    return {
      ...base,
      status,
      rate: { events, ratio, interval, requiredEvents: required, status },
      ...(short && { reason: `${Math.min(...events)} events on a path, ${required} needed` }),
    };
  }
  const nRef = clusterCount(reference),
    nCand = clusterCount(candidate);
  if (nRef < PARITY_CONFIG.minimumSamples || nCand < PARITY_CONFIG.minimumSamples)
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
  const margin = Math.max(
    PARITY_CONFIG.meanRelativeMargin * Math.abs(base.reference.mean),
    PARITY_CONFIG.meanSdMargin * base.reference.sd,
  );
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
  'inside' | 'outside' | 'unresolved' | 'underpowered' | 'missing' | 'undefined';
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
/** Absolute target errors against the intended bands (→MATCH-23): only `inside` passes. */
export function buildTargetReport(samples: readonly MatchSample[]): TargetResult[] {
  return TARGET_BANDS.map((t) => {
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
      const pairs = parts as Contribution[];
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
  });
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
const matchMinutes = (r: MatchRecord) => (r.regulation ? 120 : 90);

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
 * rules make impossible are not applicable: listed with their rule and left out of the verdict.
 * Equal constants pass by their zero difference and are listed; every other status blocks.
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
      if (rule)
        return {
          ...compareDistributions({ ...d, applies: false }, reference, candidate),
          reason: rule,
        };
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
      .filter((m) => m.status === 'not-applicable')
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

/** The comparison sections kept apart: target errors, path equivalence and exact invariants. */
export function buildParityReport(input: {
  provenance: Provenance;
  partition: Partition;
  condition: string;
  reference: { path: string; samples: readonly MatchSample[]; seasons?: readonly SeasonSample[] };
  candidate: { path: string; samples: readonly MatchSample[]; seasons?: readonly SeasonSample[] };
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
      reference: buildTargetReport(input.reference.samples),
      candidate: buildTargetReport(input.candidate.samples),
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
