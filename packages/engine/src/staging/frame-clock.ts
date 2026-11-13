/** Fit staged seconds to record seconds between fixed moments (MATCH-12). */
import type { MatchScript, ScriptBeat } from '../../../contracts/src/match-script';
import { LENGTH, OFFSET } from '../match/clock';
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
/** Record events another beat names as its source. */
export const recordSources = (script: MatchScript): Set<number> =>
  new Set(script.beats.flatMap((b) => (b.source === undefined || b.source < 0 ? [] : [b.source])));

/** A beat whose action is a fixed moment of the record: a shot, an incident or a source event. */
export const isClockAnchor = (b: ScriptBeat, sources: ReadonlySet<number>): boolean =>
  b.shot !== undefined ||
  b.kind === 'shot' ||
  b.kind === 'penalty' ||
  !!b.incidents?.length ||
  (b.event !== undefined && sources.has(b.event));

/** Match seconds an anchor keeps from a neighbour in its own minute. */
const ANCHOR_GAP = 0.05;

export function clockRates(script: MatchScript, staging: ClockStaging): ClockRate[] {
  const sources = recordSources(script);
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
    const fixed: { t: number; beat: ScriptBeat; minute: number }[] = [];
    for (const b of p.beats) {
      if (b === p.beats[0] && b.kind === 'kickOff') continue;
      if (!isClockAnchor(b, sources)) continue;
      const events = byBeat.get(b.index) ?? [];
      const action = events.find((e) => actionEvents.has(e.kind));
      if (!action) continue;
      fixed.push({ t: action.t, beat: b, minute: Math.floor(b.clock / 60) });
    }
    // A fixed action keeps its record minute, not its nominal second: inside the minute it falls
    // where real time (one match second per staged second) from the previous anchor puts it. It
    // leaves the later fixed actions of its minute their nominal spacing, and reads nothing later
    // than itself, so a minute already shown never moves.
    for (const [k, f] of fixed.entries()) {
      const prev = anchors.at(-1)!;
      const nominal = f.beat.clock - OFFSET[p.period - 1] * 60;
      const lo = p.start + (f.minute - OFFSET[p.period - 1]) * 60;
      let reserve = 0;
      for (let q = k + 1; q < fixed.length && fixed[q].minute === f.minute; q++)
        reserve = fixed[q].beat.clock - f.beat.clock + ANCHOR_GAP * (q - k);
      // A shot's outcome, a card after its foul: the beat's own facts follow its action in the minute.
      const own = f.beat.shot !== undefined || f.beat.kind === 'shot' ? 3 : f.beat.incidents?.length ? 2 : 1;
      const hi = Math.max(p.start + nominal, lo + 60 - ANCHOR_GAP - reserve - own);
      const ideal = prev.clock + (f.t - prev.t);
      anchors.push({
        t: f.t,
        clock: Math.max(prev.clock + ANCHOR_GAP, Math.min(hi, Math.max(lo, ideal))),
        beat: f.beat,
      });
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
      // Play kept on after a half's last beat (stage/keep.ts) is not that beat's fact.
      const performed = (b && byBeat.get(b.index)?.find((e) => e.kind === 'performed')?.t) ?? Infinity;
      const last =
        b &&
        byBeat
          .get(b.index)
          ?.findLast((e) => finishEvents.has(e.kind) && e.t < z.t && e.t <= performed);
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
