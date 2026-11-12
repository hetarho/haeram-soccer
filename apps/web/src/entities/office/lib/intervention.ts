import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  GameSettings,
  ResponsibilityKey,
  World,
} from '../../../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import { RESPONSIBILITY_NAMES } from '../../../../../../packages/engine/src/delegation-info';
import { STAFF_INFO, staffMember } from '../../../../../../packages/engine/src/staff-info';
import type { GameClient } from '../../../runtime/client';

export const RESPONSIBILITY_LABELS: Readonly<Record<ResponsibilityKey, string>> =
  RESPONSIBILITY_NAMES;
/** What each responsibility covers, under its label: its decisions and the settings its person sets. */
export const RESPONSIBILITY_DETAILS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: sourceMessage('delegation.detail.manager'),
  staff: sourceMessage('delegation.detail.staff'),
  contracts: sourceMessage('delegation.detail.contracts'),
  recruitment: sourceMessage('delegation.detail.recruitment'),
  sales: sourceMessage('copy.intervention.e68edb2830'),
  academy: sourceMessage('delegation.detail.academy'),
  sponsors: sourceMessage('copy.intervention.c5ca8c981c'),
};
/**
 * Who takes each responsibility's money once the owner delegates it: the 단장, youth money included
 * (the youth director's football calls are named in the academy's plan).
 */
export type ResponsibilityPost = 'director' | 'manager' | 'youth';
export const RESPONSIBILITY_DELEGATES: Readonly<
  Record<ResponsibilityKey, readonly ResponsibilityPost[]>
> = {
  manager: ['director'],
  staff: ['director'],
  contracts: ['director', 'manager'],
  recruitment: ['director', 'manager'],
  sales: ['director', 'manager'],
  academy: ['director'],
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
