import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  GameSettings,
  ResponsibilityKey,
  ResponsibilitySettings,
  World,
} from '../../../../../../packages/contracts/src/types';
import {
  RESPONSIBILITY_KEYS,
  settingsOf,
} from '../../../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../../../packages/engine/src/pending-work-preview';
import type { GameClient } from '../../../runtime/client';
import type { ProgressionController } from '../../../runtime/progression';
import { gameStore } from '../../../runtime/store';
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
    throw new Error(sourceMessage('copy.officeChanges.c9c4ad008e'));
  controller.pause();
  await client.whenIdle();
  const state = gameStore.getSnapshot(),
    w = state.view?.world;
  if (modeSwitchBlocked(state) || !w || w.id !== proposal.id)
    throw new Error(sourceMessage('copy.officeChanges.f98fa999d5'));
  const current = settingsOf(w);
  for (const group of ['responsibilities', 'observations'] as const)
    for (const key of Object.keys(proposal.change[group] || {}))
      if (
        (current[group] as Record<string, unknown>)[key] !==
        (proposal.previous[group] as Record<string, unknown>)[key]
      )
        throw new Error(sourceMessage('copy.officeChanges.957733315b'));
  if (JSON.stringify(officePreview(w, proposal.change)) !== JSON.stringify(proposal.pending))
    throw new Error(sourceMessage('copy.officeChanges.98f0960a16'));
  const reply = await applyResponsibilitySettings(client, officeSettings(w, proposal.change));
  if (!reply?.ok || gameStore.getSnapshot().view?.world.id !== proposal.id)
    throw new Error(reply?.error || sourceMessage('copy.officeChanges.367bc13069'));
}
