// The fit of a staged fitted match (T821): whether what was staged still counts back to the record,
// and what the staging had to strain to do it. Pure: the two timings come from `report.ts`.
import type { Settled } from '../core/settled.ts';
import type { Beat, Playback, Script, StageEvent } from '../core/types.ts';
import { compareRecord, countScript, fitCost, type Counted } from '../fit/count.ts';

const WINNER_KINDS: readonly StageEvent['kind'][] = ['intercept', 'tackle', 'loose'];
const CONTESTED: readonly StageEvent['kind'][] = [
  'intercept',
  'tackle',
  'foul',
  'loose',
  'block',
  'save',
];

/** The record's rows counted from a playback: its performed beats through `countScript`, with each contest's winner read from the stage event (`intercept`, `tackle`, `loose`) of that beat instead of the beat's `opponent`. */
export function countPlayback(playback: Playback, settled: Settled): Counted {
  const winner = new Map<number, number>();
  for (const e of playback.events) {
    if (WINNER_KINDS.includes(e.kind) && e.other !== undefined) winner.set(e.beat, e.other);
  }
  const beats = playback.beats.map((b): Beat => {
    const won = winner.get(b.index);
    return won === undefined || b.opponent === undefined ? b : { ...b, opponent: won };
  });
  const script: Script = {
    seed: playback.seed,
    fixture: playback.fixture,
    beats,
    times: [],
    nominalSeconds: 0,
  };
  return countScript(script, settled);
}

export interface FitMetric {
  id: string;
  value: number;
  pass?: boolean;
  detail?: string;
}

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const round = (v: number, places: number): number => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

/** Staged live seconds per match second, the median over the match minutes the frames' clock covers. */
export function clockRatio(playback: Playback): number {
  const step = (playback.stride ?? 1) / playback.hz;
  const live = new Map<number, number>();
  for (const f of playback.frames) {
    if (!f.live || f.clock === undefined) continue;
    const m = Math.min(89, Math.floor(f.clock / 60));
    live.set(m, (live.get(m) ?? 0) + step);
  }
  return round(median([...live.values()].map((s) => s / 60)), 2);
}

/** The fit lines in their order: `fit.exact`, `fit.performed` and `fit.recast` are judged, the rest are measurements. */
export function fitMetrics(
  playback: Playback,
  script: Script,
  settled: Settled,
  timings: { writeMs: number; stageMs: number },
): FitMetric[] {
  const differs = compareRecord(settled, countPlayback(playback, settled));
  const staged = new Set(playback.beats.map((b) => b.index));
  const missing = script.beats.filter((b) => !staged.has(b.index));
  const contested = playback.events.filter((e) => CONTESTED.includes(e.kind));
  const recast = contested.filter((e) => e.recast === true);
  const stretch = contested.filter((e) => e.stretch === true);
  const late = playback.events.filter((e) => e.late === true);
  const cost = fitCost(script, settled);
  const list = (xs: readonly string[]): string | undefined =>
    xs.length === 0 ? undefined : xs.slice(0, 8).join(',') + (xs.length > 8 ? ',…' : '');
  const judged = (id: string, value: number, detail?: string): FitMetric => ({
    id,
    value,
    pass: value === 0,
    ...(detail === undefined ? {} : { detail }),
  });
  return [
    judged('fit.exact', differs.length, list(differs)),
    judged('fit.performed', missing.length, list(missing.map((b) => String(b.index)))),
    judged('fit.recast', recast.length, list(recast.map((e) => String(e.beat)))),
    {
      id: 'fit.stretch',
      value: round(contested.length === 0 ? 0 : stretch.length / contested.length, 3),
      detail: `${stretch.length}/${contested.length}`,
    },
    { id: 'fit.late', value: late.length },
    { id: 'fit.links', value: cost.links },
    { id: 'fit.linkMetres', value: cost.linkMetres },
    { id: 'fit.miscontrols', value: cost.miscontrols },
    { id: 'fit.connectiveRestarts', value: cost.connectiveRestarts },
    {
      id: 'fit.orphans',
      value: cost.orphanSetPieces + cost.orphanFreeKickShots,
      detail: `setPieces=${cost.orphanSetPieces} freeKickShots=${cost.orphanFreeKickShots}`,
    },
    { id: 'fit.stagedSeconds', value: round(playback.duration, 1) },
    { id: 'fit.clockRatio', value: clockRatio(playback) },
    { id: 'fit.writeMs', value: Math.round(timings.writeMs) },
    { id: 'fit.stageMs', value: Math.round(timings.stageMs) },
  ];
}

/** One line per fit metric: `id value ok|FAIL|-`, then its detail. */
export function formatFit(metrics: readonly FitMetric[]): string[] {
  return metrics.map((m) => {
    const row = [m.id, String(m.value), m.pass === undefined ? '-' : m.pass ? 'ok' : 'FAIL'];
    if (m.detail !== undefined) row.push(m.detail);
    return row.join(' ');
  });
}
