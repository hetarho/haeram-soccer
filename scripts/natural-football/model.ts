import type { MatchFrame } from '../../packages/contracts/src/types';
import {
  deadBallBeats,
  runningRate,
  type Preparation,
} from '../../apps/web/src/entities/match/logic';

export interface Period {
  period: number;
  start: number;
  count: number;
}
export function periodsOf(frames: readonly Pick<MatchFrame, 'period'>[]): Period[] {
  const periods: Period[] = [];
  frames.forEach((frame, index) => {
    const last = periods.at(-1);
    if (last?.period === frame.period) last.count++;
    else periods.push({ period: frame.period, start: index, count: 1 });
  });
  return periods;
}
export function sharedTimeline(panels: readonly (readonly Pick<MatchFrame, 'period'>[])[]) {
  const lists = panels.map(periodsOf);
  const periods: Period[] = [];
  let count = 0;
  for (const period of [...new Set(lists.flatMap((list) => list.map((p) => p.period)))].sort()) {
    const length = Math.max(
      ...lists.map((list) => list.find((p) => p.period === period)?.count ?? 0),
    );
    periods.push({ period, start: count, count: length });
    count += length;
  }
  return { periods, length: count * 60 };
}
export type SharedTimeline = ReturnType<typeof sharedTimeline>;
export function ownSeconds(periods: readonly Period[], shared: SharedTimeline, seconds: number) {
  const at = Math.max(0, Math.min(shared.length, seconds));
  const period =
    shared.periods.find((p) => at < (p.start + p.count) * 60) ?? shared.periods.at(-1)!;
  const own = periods.find((p) => p.period === period.period);
  if (!own) return (periods.at(-1)!.start + periods.at(-1)!.count) * 60;
  const offset = at - period.start * 60;
  return own.start * 60 + Math.min(offset, own.count * 60 - (at < shared.length ? 0.001 : 0));
}
/** Use the slowest active panel's dead-ball factor; identical panels keep the game's own clock. */
export function sharedPreparations(
  panels: readonly MatchFrame[][],
  shared: SharedTimeline,
): Preparation[] {
  const lists = panels.map((frames) => {
    const periods = periodsOf(frames);
    return deadBallBeats(frames).map((beat) => {
      const p = periods.find((p) => beat.from < (p.start + p.count) * 60) ?? periods.at(-1)!;
      const period = shared.periods.find((q) => q.period === p.period)!;
      const from = period.start * 60 + beat.from - p.start * 60;
      return {
        from,
        to: from + beat.to - beat.from,
        factor: Math.max(beat.factor, (beat.to - beat.from) / beat.ms / runningRate(1)),
      };
    });
  });
  const cuts = [
    ...new Set([0, shared.length, ...lists.flatMap((list) => list.flatMap((p) => [p.from, p.to]))]),
  ].sort((a, b) => a - b);
  const out: Preparation[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1],
      to = cuts[i],
      mid = (from + to) / 2;
    const factor = Math.min(
      ...lists.map((list) => list.find((p) => p.from <= mid && mid < p.to)?.factor ?? 1),
    );
    if (factor > 1) out.push({ from, to, factor, ms: Infinity });
  }
  return out;
}
