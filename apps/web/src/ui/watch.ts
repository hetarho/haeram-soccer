import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { gameStore } from '../runtime/store';

/**
 * Watch the next own match: stop the clock for it, wait for queued work, play to kickoff and open
 * the match view. A watch that produces no match resumes the clock it stopped (→WEB-18).
 */
export async function watchNextMatch(
  client: GameClient,
  controller: ProgressionController,
  open: () => void,
  { fromEve = false, background = false } = {},
) {
  controller.beginWatch(fromEve);
  await client.whenIdle();
  const state = gameStore.getSnapshot();
  if (state.readonly || state.error || state.view?.world.critical) {
    controller.endWatch();
    return;
  }
  const reply = await client.command({ type: 'next-match' }, { background });
  if (reply?.playback) open();
  else controller.endWatch();
}
