import { useEffect } from 'react';
import { seasonDate } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import type { ProgressionController } from '../runtime/progression';
import { gameStore } from '../runtime/store';

/**
 * While the tab is hidden its title tells the owner how the club is doing (→WEB-64): the game
 * date and whether the clock runs, or why it stopped. A visible tab keeps the page title.
 */
export function useTabTitle(controller: ProgressionController | undefined) {
  useEffect(() => {
    if (!controller) return;
    const base = document.title;
    let shown = base;
    const update = () => {
      const w = gameStore.getSnapshot().view?.world;
      let title = base;
      if (document.hidden && w) {
        const { running, reason } = controller.store.getState();
        title = `${running ? '▶' : '⏸'} ${seasonDate(w)}${!running && reason ? ` · ${reason}` : ''} · ${clubOf(w).name}`;
      }
      if (title !== shown) document.title = shown = title;
    };
    const stopGame = gameStore.subscribe(update),
      stopClock = controller.store.subscribe(update);
    document.addEventListener('visibilitychange', update);
    return () => {
      stopGame();
      stopClock();
      document.removeEventListener('visibilitychange', update);
      document.title = base;
    };
  }, [controller]);
}
