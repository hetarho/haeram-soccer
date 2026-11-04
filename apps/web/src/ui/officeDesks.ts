import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { ResponsibilityKey } from '../../../../packages/contracts/src/types';
import type { AreaKey } from './areas';
import { operationsAddress } from './clubSections';

export const OFFICE_DESKS = [
  ['players', sourceMessage('copy.stories.cb2c18aee9')],
  ['staff', sourceMessage('copy.officeDesks.1d8aa9e4e6')],
  ['investment', sourceMessage('club.operations.investment')],
  ['sponsor', sourceMessage('club.operations.sponsor')],
  ['identity', sourceMessage('club.operations.identity')],
] as const;
export type WorkDesk = (typeof OFFICE_DESKS)[number][0];
export const DESK_RESPONSIBILITIES: Record<WorkDesk, readonly ResponsibilityKey[]> = {
  players: ['contracts', 'recruitment', 'sales', 'academy'],
  staff: ['manager', 'staff'],
  investment: [],
  sponsor: ['sponsors'],
  identity: [],
};
/** A desk owns criteria; investment also exposes every recurring spending area. */
export const DESK_AREAS: Record<WorkDesk, readonly AreaKey[]> = {
  players: ['scouting', 'market', 'youth'],
  staff: ['staff'],
  investment: ['finance', 'local', 'global', 'youth'],
  sponsor: ['finance'],
  identity: [],
};
const LEGACY_OFFICE: Record<string, WorkDesk> = {
  strategy: 'investment',
  build: 'investment',
  finance: 'investment',
  facility: 'investment',
  marketing: 'investment',
};
export type OfficeDestination = WorkDesk | 'lobby' | 'office';
export function resolveOffice(view: string | null): OfficeDestination {
  if (view === 'office') return 'office';
  return OFFICE_DESKS.find(([key]) => key === view)?.[0] ?? LEGACY_OFFICE[view ?? ''] ?? 'lobby';
}
/**
 * Where an older desk address without a selected request lands (→WEB-39): player work on the
 * roster, the market or the academy by its work tab, staff work — the manager's included — in
 * 코치진, money, sponsors and design in their club-operations section. A request stays in the
 * office.
 */
export function deskDestination(desk: WorkDesk, work: string | null) {
  if (desk === 'players')
    return work === 'recruitment' || work === 'market'
      ? '/first-team?view=market'
      : work === 'academy'
        ? '/academy'
        : '/first-team?view=players';
  if (desk === 'staff') return '/staff?view=coaches';
  return operationsAddress(desk);
}
