import type { World } from '../../../../packages/contracts/src/types';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { worldBoard } from '../../../../packages/engine/src/presets';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import type { SavedStrategy } from '../adapters/profile';
import { compactMoney, number } from './format';
import { strategyName } from './strategies';
import { cashState } from './teamState';
import type { BusinessView } from './state';

/** The two observations the office reports on, beside the seven business responsibilities. */
export const OBSERVATION_KEYS = ['matchEve', 'windowOpen'] as const;

/** How many of the office's nine report rows the owner has handed to staff (→WEB-79). */
export function delegationCounts(w: World) {
  const settings = settingsOf(w);
  const delegated =
    RESPONSIBILITY_KEYS.filter((key) => settings.responsibilities[key] === 'delegated').length +
    OBSERVATION_KEYS.filter((key) => !settings.observations[key]).length;
  const total = RESPONSIBILITY_KEYS.length + OBSERVATION_KEYS.length;
  return { delegated, direct: total - delegated, total };
}

/**
 * One current fact per office area for its lobby card (→WEB-39). The design area shows the crest
 * itself, so it has no line here.
 */
export function officeFacts(
  w: World,
  sponsors: readonly SponsorSlotView[],
  saved: SavedStrategy[],
): Record<Exclude<BusinessView, 'identity'>, string> {
  const club = clubOf(w),
    step = STADIUM_STEPS[w.stadium];
  const works = Object.keys(w.facilityWorks ?? {}).length;
  const open = sponsors.filter((slot) => slot.open),
    signed = open.filter((slot) => slot.contract).length;
  const counts = delegationCounts(w);
  return {
    strategy: strategyName(worldBoard(w), saved),
    build: works ? `공사 중 ${works}건` : `${step.name} · ${number(step.capacity)}석`,
    finance: `${compactMoney(w.cash, club.country, w.year)} · 자금 여력 ${cashState(w).value}`,
    sponsor: `후원 ${signed}/${open.length}자리`,
    office: `보고받기 ${counts.direct} · 위임 ${counts.delegated}`,
  };
}
