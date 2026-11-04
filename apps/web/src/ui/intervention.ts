import type {
  GameSettings,
  ResponsibilityKey,
  World,
} from '../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import { STAFF_INFO, staffMember } from '../../../../packages/engine/src/staff-info';
import type { GameClient } from '../runtime/client';

export const RESPONSIBILITY_LABELS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: '감독 인사',
  staff: '스태프 인사',
  contracts: '선수 계약',
  recruitment: '선수 영입',
  sales: '선수 매각',
  academy: '유소년 승격·방출',
  sponsors: '스폰서 계약',
};
/** What each responsibility covers, under its label. */
export const RESPONSIBILITY_DETAILS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: '감독 선임·재계약',
  staff: '단장·스카우트·코치진의 선임·재계약',
  contracts: '선수 재계약·계약 개선',
  recruitment: '선수 영입·영입 협상',
  sales: '우리 선수에게 온 제안·매각 방침',
  academy: '유소년 승격과 방출',
  sponsors: '자리별 스폰서 계약',
};
/** Who takes each responsibility once the owner delegates it. */
export type ResponsibilityPost = 'director' | 'manager' | 'youth';
export const RESPONSIBILITY_DELEGATES: Readonly<
  Record<ResponsibilityKey, readonly ResponsibilityPost[]>
> = {
  manager: ['director'],
  staff: ['director'],
  contracts: ['director', 'manager'],
  recruitment: ['director', 'manager'],
  sales: ['director', 'manager'],
  academy: ['youth'],
  sponsors: ['director'],
};
/** Current holders and their person records for a delegated responsibility. */
export function responsibilityAssignee(w: World, post: ResponsibilityPost) {
  const labels = { director: '단장', manager: '감독', youth: STAFF_INFO.youth.label };
  const member = post === 'manager' ? w.manager : staffMember(w, post);
  return {
    post,
    label: labels[post],
    name: member?.name ?? '공석',
    person: member?.person,
    member,
  };
}
export function responsibilityAssignees(w: World, key: ResponsibilityKey) {
  return RESPONSIBILITY_DELEGATES[key].map((post) => responsibilityAssignee(w, post));
}
export function responsibilityDelegates(w: World, key: ResponsibilityKey) {
  return responsibilityAssignees(w, key).map(({ label, name }) => `${label} ${name}`);
}
export function applyResponsibilitySettings(client: GameClient, settings: GameSettings) {
  return client.command({ type: 'settings', settings }, { background: true });
}
export function decisionOwner(w: Pick<World, 'settings'>, key: ResponsibilityKey) {
  return { key, name: RESPONSIBILITY_LABELS[key], auto: isDelegated(w, key) };
}
