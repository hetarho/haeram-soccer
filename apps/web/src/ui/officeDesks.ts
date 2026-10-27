import type { ResponsibilityKey } from '../../../../packages/contracts/src/types';
import type { AreaKey } from './areas';

export const OFFICE_DESKS = [
  ['players', '선수 계약'],
  ['staff', '스태프 계약'],
  ['investment', '투자'],
  ['sponsor', '후원'],
  ['identity', '구단 디자인'],
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
  players: ['squad', 'scouting', 'market', 'youth'],
  staff: ['staff'],
  investment: ['finance', 'local', 'global', 'squad', 'youth'],
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
