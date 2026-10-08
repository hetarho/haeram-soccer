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

export function sampleAtMinute(frames: MatchFrame[], samples: { frame: number }[], minute: number) {
  const index = samples.findIndex((sample) => (frames[sample.frame]?.minute ?? 0) >= minute);
  return index < 0 ? Math.max(0, samples.length - 1) : index;
}
