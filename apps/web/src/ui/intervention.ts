import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type {
  GameSettings,
  ResponsibilityKey,
  World,
} from '../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import { STAFF_INFO, staffMember } from '../../../../packages/engine/src/staff-info';
import type { GameClient } from '../runtime/client';

export const RESPONSIBILITY_LABELS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: sourceMessage('copy.intervention.4670efb7ec'),
  staff: sourceMessage('copy.intervention.aed9dbd6ea'),
  contracts: sourceMessage('copy.stories.cb2c18aee9'),
  recruitment: sourceMessage('copy.intervention.d12b6b87e1'),
  sales: sourceMessage('copy.intervention.5ea61dab56'),
  academy: sourceMessage('copy.OwnerOfficeView.dc639eb0dc'),
  sponsors: sourceMessage('copy.intervention.710956eea4'),
};
/** What each responsibility covers, under its label. */
export const RESPONSIBILITY_DETAILS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: sourceMessage('copy.OwnerOfficeView.ff794c03f8'),
  staff: sourceMessage('copy.intervention.20143ef8ea'),
  contracts: sourceMessage('copy.intervention.7afd0357ff'),
  recruitment: sourceMessage('copy.intervention.c58f247587'),
  sales: sourceMessage('copy.intervention.e68edb2830'),
  academy: sourceMessage('copy.intervention.1969f5af28'),
  sponsors: sourceMessage('copy.intervention.c5ca8c981c'),
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
  const labels = {
    director: sourceMessage('staff.role.director'),
    manager: sourceMessage('staff.role.manager'),
    youth: STAFF_INFO.youth.label,
  };
  const member = post === 'manager' ? w.manager : staffMember(w, post);
  return {
    post,
    label: labels[post],
    name: member?.name ?? sourceMessage('team.vacant'),
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
