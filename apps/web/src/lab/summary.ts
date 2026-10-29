/**
 * What a finished lab run reports (→LAB-5): the outcome, MATCH-23's rows over the run's matches and
 * each side's team stats a match, every value with its 95% interval.
 */
import { TD } from '../../../../packages/contracts/src/detail';
import {
  buildTargetReport,
  TARGET_BANDS,
  type TargetStatus,
} from '../../../../scripts/lib/match-parity';
import type { LabSample } from './protocol';

/** The record's per-side metric slots (packages/engine/src/grid/record.ts `M`). */
const M = {
  goals: 0,
  passes: 2,
  completed: 3,
  shots: 4,
  onTarget: 5,
  tackles: 6,
  interceptions: 7,
  possession: 11,
} as const;

export interface Estimate {
  value: number;
  /** 95% interval; equal to the value for a single match. */
  interval: [number, number];
}

export interface TargetRow {
  id: string;
  label: string;
  source: string;
  /** The real-football range MATCH-23 lists. */
  real: readonly [number, number];
  /** The range a row holds within (MATCH-23's tolerance). */
  band: readonly [number, number];
  unit: string;
  status: TargetStatus;
  estimate?: Estimate;
  /** Inside the tolerant band by its point value. */
  pass?: boolean;
}

export interface SideRow {
  id: string;
  label: string;
  unit: 'count' | 'percent';
  left: Estimate;
  right: Estimate;
}

export interface MatchDetail {
  score: [number, number];
  goals: { minute: number; side: 0 | 1; name: string }[];
  cards: { minute: number; side: 0 | 1; player: string; kind: 'yellow' | 'secondYellow' | 'red' }[];
}

export interface RunSummary {
  matches: number;
  outcome: {
    leftWins: number;
    draws: number;
    rightWins: number;
    leftGoals: Estimate;
    rightGoals: Estimate;
  };
  targets: TargetRow[];
  sides: SideRow[];
  /** A 1-match run: the match itself; sides 0/1 are left/right. */
  match?: MatchDetail;
}

/** Mean with its normal 95% interval (sample sd); a single value has no spread. */
export function estimate(values: readonly number[]): Estimate {
  const n = values.length;
  if (!n) return { value: Number.NaN, interval: [Number.NaN, Number.NaN] };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { value: mean, interval: [mean, mean] };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  return { value: mean, interval: [mean - half, mean + half] };
}

/** Whether two estimates' intervals miss each other: a difference beyond the run's noise. */
export const beyondNoise = (a: Estimate, b: Estimate) =>
  a.interval[1] < b.interval[0] || b.interval[1] < a.interval[0];

const ratio = (num: number, den: number) => (den > 0 ? (100 * num) / den : 0);

/** LAB-5's side table: each row read from one side's record slots. */
const SIDE_ROWS: {
  id: string;
  label: string;
  unit: 'count' | 'percent';
  read: (s: LabSample, side: 0 | 1) => number;
}[] = [
  {
    id: 'goals',
    label: '득점',
    unit: 'count',
    read: (s, d) => s.sample.record.metrics[d]![M.goals]!,
  },
  {
    id: 'shots',
    label: '슈팅',
    unit: 'count',
    read: (s, d) => s.sample.record.metrics[d]![M.shots]!,
  },
  {
    id: 'onTarget',
    label: '유효 슈팅',
    unit: 'count',
    read: (s, d) => s.sample.record.metrics[d]![M.onTarget]!,
  },
  { id: 'xg', label: 'xG', unit: 'count', read: (s, d) => (s.sample.record.xg?.[d] ?? 0) / 100 },
  {
    id: 'possession',
    label: '점유율',
    unit: 'percent',
    read: (s, d) => ratio(s.sample.record.metrics[d]![M.possession]!, 90),
  },
  {
    id: 'passes',
    label: '패스',
    unit: 'count',
    read: (s, d) => s.sample.record.metrics[d]![M.passes]!,
  },
  {
    id: 'passCompletion',
    label: '패스 성공률',
    unit: 'percent',
    read: (s, d) =>
      ratio(s.sample.record.metrics[d]![M.completed]!, s.sample.record.metrics[d]![M.passes]!),
  },
  { id: 'crosses', label: '크로스', unit: 'count', read: (s, d) => detail(s, d, TD.crosses) },
  { id: 'takeOns', label: '돌파 시도', unit: 'count', read: (s, d) => detail(s, d, TD.takeOns) },
  {
    id: 'tacklesInterceptions',
    label: '태클 + 인터셉트',
    unit: 'count',
    read: (s, d) =>
      s.sample.record.metrics[d]![M.tackles]! + s.sample.record.metrics[d]![M.interceptions]!,
  },
  { id: 'corners', label: '코너킥', unit: 'count', read: (s, d) => detail(s, d, TD.corners) },
  { id: 'fouls', label: '파울', unit: 'count', read: (s, d) => detail(s, d, TD.fouls) },
  { id: 'offsides', label: '오프사이드', unit: 'count', read: (s, d) => detail(s, d, TD.offsides) },
  { id: 'yellow', label: '경고', unit: 'count', read: (s, d) => detail(s, d, TD.yellowCards) },
  { id: 'red', label: '퇴장', unit: 'count', read: (s, d) => detail(s, d, TD.redCards) },
];

function detail(s: LabSample, side: 0 | 1, key: number) {
  return s.sample.record.detail?.[side]?.[key] ?? 0;
}

/** The fixture side (0 home, 1 away) a lab side played on. */
const fixtureSide = (s: LabSample, lab: 0 | 1): 0 | 1 => (s.leftHome ? lab : 1 - lab) as 0 | 1;

/** The run's report; `names` resolves a player id to his name for the 1-match detail. */
export function summarizeRun(
  samples: readonly LabSample[],
  names: (id: string) => string = (id) => id,
): RunSummary {
  const ordered = [...samples].sort((a, b) => a.index - b.index);
  const goals = (s: LabSample, lab: 0 | 1) => {
    const score = s.sample.record.score;
    return fixtureSide(s, lab) === 0 ? score.home : score.away;
  };
  let leftWins = 0,
    draws = 0,
    rightWins = 0;
  for (const s of ordered) {
    const l = goals(s, 0),
      r = goals(s, 1);
    if (l > r) leftWins++;
    else if (l === r) draws++;
    else rightWins++;
  }
  const report = buildTargetReport(ordered.map((s) => s.sample));
  const targets = report.map((row) => {
    const band = TARGET_BANDS.find((b) => b.id === row.id)!;
    const est =
      row.value === undefined
        ? undefined
        : {
            value: row.value,
            interval: row.interval ?? ([row.value, row.value] as [number, number]),
          };
    return {
      id: row.id,
      label: row.label,
      source: band.source,
      real: band.real ?? band.band,
      band: row.band,
      unit: row.unit,
      status: row.status,
      ...(est && { estimate: est, pass: row.error === 0 }),
    };
  });
  const sides = SIDE_ROWS.map((row) => ({
    id: row.id,
    label: row.label,
    unit: row.unit,
    left: estimate(ordered.map((s) => row.read(s, fixtureSide(s, 0)))),
    right: estimate(ordered.map((s) => row.read(s, fixtureSide(s, 1)))),
  }));
  const summary: RunSummary = {
    matches: ordered.length,
    outcome: {
      leftWins,
      draws,
      rightWins,
      leftGoals: estimate(ordered.map((s) => goals(s, 0))),
      rightGoals: estimate(ordered.map((s) => goals(s, 1))),
    },
    targets,
    sides,
  };
  if (ordered.length === 1) {
    const s = ordered[0]!;
    // Fixture side → lab side: the same flip, since it is its own inverse.
    const lab = (side: 0 | 1) => fixtureSide(s, side);
    summary.match = {
      score: [goals(s, 0), goals(s, 1)],
      goals: s.sample.record.highlights
        .filter((h) => h.action === '골')
        .map((h) => ({ minute: h.minute, side: lab(h.side), name: h.player })),
      cards: (s.sample.record.incidents ?? [])
        .filter((i) => i.kind === 'yellow' || i.kind === 'secondYellow' || i.kind === 'red')
        .map((i) => ({
          minute: i.minute,
          side: lab(i.side),
          player: names(i.player),
          kind: i.kind as 'yellow' | 'secondYellow' | 'red',
        })),
    };
  }
  return summary;
}
