import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type { GameSettings, World } from '../../../../../../packages/contracts/src/types';
import { settingsOf } from '../../../../../../packages/engine/src/responsibilities';
import { careerEnded } from '../../../../../../packages/contracts/src/owner';
import type { ClientState, GameClient } from '../../../runtime/client';
import type { ProgressionController } from '../../../runtime/progression';
import { gameActionsBlocked, gameStore } from '../../../runtime/store';
import { applyResponsibilitySettings } from './intervention';

export function modeSwitchBlocked(state: ClientState) {
  const w = state.view?.world;
  return !w || !!(gameActionsBlocked(state) || w.critical || careerEnded(w));
}
export function settingsForMode(w: World, mode: GameSettings['mode']): GameSettings {
  const settings = settingsOf(w);
  return {
    ...settings,
    mode,
    observations: { ...settings.observations, ...(mode === 'manual' ? { matchEve: true } : {}) },
  };
}

/** Settle admitted work before switching; an explanation opened for another world cannot apply. */
export async function switchProgressMode(
  client: GameClient,
  controller: ProgressionController,
  expected: { id: string; mode: GameSettings['mode'] },
) {
  if (modeSwitchBlocked(gameStore.getSnapshot()))
    throw new Error(sourceMessage('copy.officeChanges.c9c4ad008e'));
  controller.pause();
  await client.whenIdle();
  const state = gameStore.getSnapshot(),
    w = state.view?.world;
  if (
    modeSwitchBlocked(state) ||
    !w ||
    w.id !== expected.id ||
    settingsOf(w).mode !== expected.mode
  )
    throw new Error(sourceMessage('copy.progressMode.bc0de8c791'));
  const target = expected.mode === 'automatic' ? 'manual' : 'automatic';
  const reply = await applyResponsibilitySettings(client, settingsForMode(w, target));
  const after = gameStore.getSnapshot().view?.world;
  if (!reply?.ok || after?.id !== expected.id || settingsOf(after).mode !== target)
    throw new Error(sourceMessage('copy.progressMode.b965d7d60c'));
}
