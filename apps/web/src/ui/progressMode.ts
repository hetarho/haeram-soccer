import type { GameSettings, World } from '../../../../packages/contracts/src/types';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { gameActionsBlocked, gameStore } from '../runtime/store';
import { applyResponsibilitySettings } from './intervention';

export function modeSwitchBlocked(state: ClientState) {
  const w = state.view?.world;
  return !w || !!(gameActionsBlocked(state) || w.critical || w.bankrupt);
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
    throw new Error('진행을 정지하고 날짜 처리가 끝난 뒤 변경해 주세요.');
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
    throw new Error(
      '게임 상태가 변경되어 전환하지 못했어요. 현재 상태를 확인하고 다시 시도해 주세요.',
    );
  const target = expected.mode === 'automatic' ? 'manual' : 'automatic';
  const reply = await applyResponsibilitySettings(client, settingsForMode(w, target));
  const after = gameStore.getSnapshot().view?.world;
  if (!reply?.ok || after?.id !== expected.id || settingsOf(after).mode !== target)
    throw new Error('진행 방식이 변경되지 않았어요. 다시 시도해 주세요.');
}
