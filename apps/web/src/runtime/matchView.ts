import { create } from 'zustand';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { useGameState } from './store';

interface MatchPresentation {
  matchId?: string;
  finished: boolean;
}

/** Presentation completion is separate from the already settled simulation result. */
export const useMatchView = create<MatchPresentation & { set: (state: MatchPresentation) => void }>(
  (set) => ({ finished: false, set }),
);

export function unfinishedPlayback(
  playback: MatchPlayback | undefined,
  presentation: MatchPresentation,
) {
  return playback && presentation.matchId === playback.record.id && !presentation.finished
    ? playback
    : undefined;
}

export function useUnfinishedPlayback() {
  const playback = useGameState((state) => state.playback);
  return unfinishedPlayback(playback, useMatchView());
}
