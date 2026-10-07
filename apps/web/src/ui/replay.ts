import type {
  MatchRecord,
  MatchPlayback,
  MatchFrame,
} from '../../../../packages/contracts/src/types';
// Archive playback uses recorded goals only. Intermediate counters are not presented as minute data.
export function archivePlayback(record: MatchRecord): MatchPlayback {
  const frames: MatchFrame[] = Array.from({ length: 90 }, (_, i) => {
    const minute = i + 1,
      goals = record.highlights.filter((h) => h.action === '골' && h.minute <= minute),
      event = record.highlights.find((h) => h.minute === minute);
    return {
      minute,
      score: {
        home: goals.filter((h) => h.side === 0).length,
        away: goals.filter((h) => h.side === 1).length,
      },
      metrics:
        minute === 90 ? record.metrics : [Array<number>(12).fill(0), Array<number>(12).fill(0)],
      ball: event ? [event.side === 0 ? 95 : 5, 50] : [50, 50],
      side: event?.side || 0,
      player: 0,
      action: event?.action || '기록 요약',
    };
  });
  frames[89].score = record.score;
  return { record, frames, squads: [[], []] };
}
