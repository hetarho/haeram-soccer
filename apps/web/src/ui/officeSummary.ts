import type { World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import { compactMoney } from './format';
import { cashState } from './teamState';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { playerOfficeOverview, workRequests } from './playerOfficeWork';
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
  pending: readonly StopReason[] = [],
): Record<Exclude<BusinessView, 'identity'>, string> {
  const club = clubOf(w);
  const players = playerOfficeOverview(w, pending);
  const staffPending = new Set(
    [...workRequests(pending, 'manager'), ...workRequests(pending, 'staff')].map((item) => item.id),
  ).size;
  const works = Object.keys(w.facilityWorks ?? {}).length;
  const open = sponsors.filter((slot) => slot.open),
    signed = open.filter((slot) => slot.contract).length;
  return {
    players: `1군 ${players.players}명 · 유소년 ${w.academy?.players.length ?? 0}명 · 만료 ${players.expiring.length}명 · 계약 협상 ${players.talks.length}건`,
    staff: `감독 ${w.manager.name} · 스태프 ${w.staff?.length ?? 0}명 · 결재 대기 ${staffPending}건`,
    investment: `${compactMoney(w.cash, club.country, w.year)} · 자금 여력 ${cashState(w).value}${works ? ` · 공사 중 ${works}건` : ''}`,
    sponsor: `후원 ${signed}/${open.length}자리`,
  };
}
