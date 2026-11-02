import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { gameStore } from '../runtime/store';
import { daysUntilNextMatch } from '../../../../packages/engine/src/calendar';
import { careerEnded } from '../../../../packages/contracts/src/owner';

/** A new observed fixture is admitted only from the match-eve dialog (→WEB-50). */
export async function watchNextMatch(
  client: GameClient,
  controller: ProgressionController,
  open: () => void,
  { fromEve = false, background = false } = {},
) {
  const before = gameStore.getSnapshot();
  const worldId = before.view?.world.id;
  if (!fromEve || !worldId || daysUntilNextMatch(before.view!.world) !== 1) return;
  controller.beginWatch(true);
  await client.whenIdle();
  const state = gameStore.getSnapshot();
  if (
    state.readonly ||
    state.error ||
    state.view?.world.critical ||
    (state.view && careerEnded(state.view.world)) ||
    state.view?.world.id !== worldId ||
    daysUntilNextMatch(state.view.world) !== 1
  ) {
    controller.pause();
    controller.endWatch();
    return;
  }
  let reply;
  try {
    reply = await client.command({ type: 'next-match' }, { background });
  } catch {
    // The client publishes its recovery error; a failed watch cannot resume progression.
    controller.pause();
    controller.endWatch();
    return;
  }
  if (reply?.playback) open();
  else controller.endWatch();
}
