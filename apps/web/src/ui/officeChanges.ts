import type {
  GameSettings,
  ResponsibilityKey,
  ResponsibilitySettings,
  World,
} from '../../../../packages/contracts/src/types';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../packages/engine/src/pending-work-preview';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { gameStore } from '../runtime/store';
import { modeSwitchBlocked } from './progressMode';
import { applyResponsibilitySettings } from './intervention';
export interface OfficeChange {
  responsibilities?: Partial<ResponsibilitySettings>;
  observations?: Partial<GameSettings['observations']>;
}
/** Review all report/work choices together, without changing time mode or unrelated preferences. */
export function officeBulkChange(
  w: World,
  value: ResponsibilitySettings[ResponsibilityKey],
): OfficeChange | undefined {
  const settings = settingsOf(w);
  const responsibilities = Object.fromEntries(
    RESPONSIBILITY_KEYS.filter((key) => settings.responsibilities[key] !== value).map((key) => [
      key,
      value,
    ]),
  );
  const observations = Object.fromEntries(
    Object.entries(settings.observations)
      .filter(([, current]) => current !== (value === 'direct'))
      .map(([key]) => [key, value === 'direct']),
  );
  return Object.keys(responsibilities).length || Object.keys(observations).length
    ? { responsibilities, observations }
    : undefined;
}
export function officeSettings(w: World, change: OfficeChange): GameSettings {
  const current = settingsOf(w);
  return {
    ...current,
    responsibilities: { ...current.responsibilities, ...change.responsibilities },
    observations: { ...current.observations, ...change.observations },
  };
}
export function officePreview(w: World, change: OfficeChange) {
  return pendingWorkPreview(w, officeSettings(w, change)).filter(
    (item) => item.count > 0 || (item.held ?? 0) > 0,
  );
}
export function officeProposal(w: World, change: OfficeChange) {
  return {
    id: w.id,
    previous: structuredClone(settingsOf(w)),
    change,
    pending: officePreview(w, change),
  };
}
export type OfficeProposal = ReturnType<typeof officeProposal>;
/** Rebase only reviewed fields over fresh settings; reject changed authority or pending work. */
export async function applyOfficeChange(
  client: GameClient,
  controller: ProgressionController,
  proposal: OfficeProposal,
) {
  if (modeSwitchBlocked(gameStore.getSnapshot()))
    throw new Error('진행을 정지하고 날짜 처리가 끝난 뒤 변경해 주세요.');
  controller.pause();
  await client.whenIdle();
  const state = gameStore.getSnapshot(),
    w = state.view?.world;
  if (modeSwitchBlocked(state) || !w || w.id !== proposal.id)
    throw new Error('현재 상태에서는 변경할 수 없어요. 상태를 확인한 뒤 다시 시도해 주세요.');
  const current = settingsOf(w);
  for (const group of ['responsibilities', 'observations'] as const)
    for (const key of Object.keys(proposal.change[group] || {}))
      if (
        (current[group] as Record<string, unknown>)[key] !==
        (proposal.previous[group] as Record<string, unknown>)[key]
      )
        throw new Error('이미 설정이 변경되었어요. 닫고 현재 선택을 다시 확인해 주세요.');
  if (JSON.stringify(officePreview(w, proposal.change)) !== JSON.stringify(proposal.pending))
    throw new Error('대기 업무가 변경되었어요. 닫고 이관 내용을 다시 확인해 주세요.');
  const reply = await applyResponsibilitySettings(client, officeSettings(w, proposal.change));
  if (!reply?.ok || gameStore.getSnapshot().view?.world.id !== proposal.id)
    throw new Error(reply?.error || '설정을 적용하지 못했어요. 다시 시도해 주세요.');
}
