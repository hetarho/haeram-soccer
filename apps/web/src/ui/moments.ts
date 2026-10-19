import type { MatchFrame, MatchRecord } from '../../../../packages/contracts/src/types';

export function recordedGoals(record: MatchRecord) {
  let home = 0,
    away = 0;
  return record.highlights
    .filter((h) => h.action === '골')
    .slice()
    .sort((a, b) => a.minute - b.minute)
    .map((h) => {
      if (h.side === 0) home++;
      else away++;
      return { ...h, home, away };
    });
}

/** A place to seek to: kick-off, half-time, the final whistle or a recorded match minute. */
export type Moment = 'kickoff' | 'halfTime' | 'fullTime' | number;

/**
 * The sample a moment opens on: the first, the second half's first, the last, or the first of the
 * minute; added minutes are frames of their own, so the final whistle is the last frame.
 */
export function sampleAt(frames: MatchFrame[], samples: { frame: number }[], moment: Moment) {
  if (!samples.length) return 0;
  if (moment === 'kickoff') return 0;
  if (moment === 'fullTime') return samples.length - 1;
  const index = samples.findIndex((sample) => {
    const frame = frames[sample.frame];
    return moment === 'halfTime' ? (frame?.period ?? 1) >= 2 : (frame?.minute ?? 0) >= moment;
  });
  return index < 0 ? samples.length - 1 : index;
}
