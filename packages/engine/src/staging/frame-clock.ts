/** Fit staged seconds to record seconds between fixed moments (MATCH-12). */
import type { MatchScript, ScriptBeat } from '../../../contracts/src/match-script';
import { LENGTH, OFFSET } from '../grid/clock';
import { invalidDetail } from '../script/failure';
import type { StageEvent, StageFrame } from './staging';
import { STAGING_CONFIG } from './config';

export interface ClockStaging {
  frames: readonly StageFrame[];
  events: readonly StageEvent[];
  /** Added time belongs to the record, not to the motion program. */
  added?: readonly number[];
}
export interface ClockRate {
  period: 1 | 2 | 3 | 4;
  /** Staged seconds, half open. */
  from: number;
  to: number;
  /** Elapsed match seconds, with earlier periods' added time included. */
  startSeconds: number;
  endSeconds: number;
  /** Match seconds per staged second. */
  rate: number;
  withinLimit: boolean;
}
export interface FramePeriod {
  period: 1 | 2 | 3 | 4;
  start: number;
  minutes: number;
  beats: ScriptBeat[];
}

/** Cuts of a fixture keep only their covered minutes; a complete half includes its added time. */
export function framePeriods(script: MatchScript, added: readonly number[] = []): FramePeriod[] {
  let start = 0;
  return ([1, 2, 3, 4] as const).flatMap((period) => {
    const beats = script.beats.filter((b) => b.period === period);
    if (!beats.length) return [];
    const length = LENGTH[period - 1];
    const played = script.beats.some((b) => b.period > period && b.period < 5)
      ? length
      : Math.max(1, Math.ceil((beats.at(-1)!.clock + 0.001) / 60 - OFFSET[period - 1]));
    const minutes = played + (played >= length ? (added[period - 1] ?? 0) : 0);
    const p = { period, start, minutes, beats };
    start += minutes * 60;
    return [p];
  });
}

const actionEvents = new Set<StageEvent['kind']>([
  'kick',
  'shot',
  'foul',
  'offside',
  'card',
  'sub',
  'injury',
]);
const finishEvents = new Set<StageEvent['kind']>([
  ...actionEvents,
  'receive',
  'intercept',
  'tackle',
  'out',
  'goal',
  'save',
  'block',
  'wide',
]);

/**
 * The action of a fixed beat anchors its scripted clock. Its last visible fact also stays in
 * that minute: if the next fixed moment lies much later, a guard at that fact bounds the fit.
 * Every interval, including dead time, still has exactly one positive linear rate. These rates
 * are reported, never clamped to the picture-quality limits.
 * An unfinished staging exposes only stretches whose right anchor is already known.
 */
export function clockRates(script: MatchScript, staging: ClockStaging): ClockRate[] {
  const sources = new Set(
    script.beats.flatMap((b) => (b.source === undefined || b.source < 0 ? [] : [b.source])),
  );
  const byBeat = new Map<number, StageEvent[]>();
  for (const e of staging.events) {
    const list = byBeat.get(e.beat) ?? [];
    list.push(e);
    byBeat.set(e.beat, list);
  }
  const out: ClockRate[] = [];
  for (const p of framePeriods(script, staging.added)) {
    const first = byBeat.get(p.beats[0].index)?.find((e) => e.kind === 'begin');
    if (!first) continue;
    const anchors: { t: number; clock: number; beat?: ScriptBeat }[] = [
      { t: first.t, clock: p.start, beat: p.beats[0] },
    ];
    for (const b of p.beats) {
      if (b === p.beats[0] && b.kind === 'kickOff') continue;
      if (!(
        b.shot !== undefined ||
        b.kind === 'shot' ||
        b.kind === 'penalty' ||
        b.incidents?.length ||
        (b.event !== undefined && sources.has(b.event))
      ))
        continue;
      const events = byBeat.get(b.index) ?? [];
      const action = events.find((e) => actionEvents.has(e.kind));
      if (!action) continue;
      anchors.push({ t: action.t, clock: p.start + b.clock - OFFSET[p.period - 1] * 60, beat: b });
    }
    const whistle = byBeat.get(p.beats.at(-1)!.index)?.find((e) => e.kind === 'whistle');
    if (whistle) anchors.push({ t: whistle.t, clock: p.start + p.minutes * 60 });
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i],
        z = anchors[i + 1];
      if (!(z.t > a.t && z.clock > a.clock)) throw invalidDetail('staging:clock');
      const append = (from: number, to: number, startSeconds: number, endSeconds: number) => {
        const rate = (endSeconds - startSeconds) / (to - from);
        const limit = STAGING_CONFIG.limits.clockRate;
        out.push({
          period: p.period,
          from,
          to,
          startSeconds,
          endSeconds,
          rate,
          withinLimit: rate >= limit[0] && rate <= limit[1],
        });
      };
      const b = a.beat;
      const last = b && byBeat.get(b.index)?.findLast((e) => finishEvents.has(e.kind) && e.t < z.t);
      const minuteEnd = b
        ? p.start + (Math.floor(b.clock / 60) + 1 - OFFSET[p.period - 1]) * 60
        : Infinity;
      const projected = last ? a.clock + ((last.t - a.t) * (z.clock - a.clock)) / (z.t - a.t) : 0;
      if (last && last.t > a.t && projected >= minuteEnd) {
        const end = minuteEnd - 1e-6;
        append(a.t, last.t, a.clock, end);
        append(last.t, z.t, end, z.clock);
      } else append(a.t, z.t, a.clock, z.clock);
    }
  }
  return out;
}

/** Choose the later stretch at an anchor, so velocities change with that stretch. */
export function rateAt(rates: readonly ClockRate[], t: number): ClockRate | undefined {
  let lo = 0,
    hi = rates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rates[mid].from <= t) lo = mid + 1;
    else hi = mid;
  }
  const r = rates[lo - 1];
  return r && t <= r.to + 1e-9 ? r : undefined;
}
export const matchSecond = (r: ClockRate, t: number): number =>
  r.startSeconds + (t - r.from) * r.rate;
