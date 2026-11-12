/**
 * Delegation's vocabulary, a read leaf the UI may import (→ARCH-4): the owner's spending request
 * per responsibility, the person each responsibility's money goes to once delegated and that
 * person's temperament, and which club settings a delegated person sets in the owner's place. The
 * plans built from them live in `delegation.ts`.
 */
import { message as sourceMessage } from '../../contracts/src/messages';
import type {
  BudgetResponsibility,
  DirectionKey,
  PolicyKey,
  ResponsibilityKey,
  SpendRequest,
  Staff,
  World,
} from '../../contracts/src/types';
import { hash } from './primitives';
import { isDelegated } from './responsibilities';
import { staffMember, STAFF_INFO } from './staff-info';

export const SPEND_REQUESTS: readonly SpendRequest[] = [1, 2, 3, 4, 5];
/** A step of the request spends this share (in percent) of the cash above the cutoff a season. */
export const BUDGET_STEP = 12;
/** A responsibility without a request is asked to spend 적당히, the club as it ran before. */
export const DEFAULT_REQUEST: SpendRequest = 3;
/** The responsibilities that spend money, in the delegation page's order. */
export const BUDGET_RESPONSIBILITIES: readonly BudgetResponsibility[] = [
  'manager',
  'staff',
  'contracts',
  'recruitment',
  'sales',
  'academy',
];
/** Each responsibility's name (→WEB-45). */
export const RESPONSIBILITY_NAMES: Readonly<Record<ResponsibilityKey, string>> = {
  manager: sourceMessage('copy.intervention.4670efb7ec'),
  staff: sourceMessage('copy.intervention.aed9dbd6ea'),
  contracts: sourceMessage('copy.stories.cb2c18aee9'),
  recruitment: sourceMessage('copy.intervention.d12b6b87e1'),
  sales: sourceMessage('copy.intervention.5ea61dab56'),
  academy: sourceMessage('delegation.area.academy'),
  sponsors: sourceMessage('copy.intervention.710956eea4'),
};
export const isBudgetResponsibility = (key: ResponsibilityKey): key is BudgetResponsibility =>
  key !== 'sponsors';

/** The request's words: how much to spend, or for sales how readily to sell (1) or hold (5). */
const SPEND_LABELS: Record<SpendRequest, string> = {
  1: sourceMessage('delegation.request.spend.1'),
  2: sourceMessage('delegation.request.spend.2'),
  3: sourceMessage('delegation.request.spend.3'),
  4: sourceMessage('delegation.request.spend.4'),
  5: sourceMessage('delegation.request.spend.5'),
};
const SALES_LABELS: Record<SpendRequest, string> = {
  1: sourceMessage('delegation.request.sales.1'),
  2: sourceMessage('delegation.request.sales.2'),
  3: sourceMessage('copy.stories.634269a095'),
  4: sourceMessage('delegation.request.sales.4'),
  5: sourceMessage('delegation.request.sales.5'),
};
export function requestLabel(key: BudgetResponsibility, level: SpendRequest) {
  return (key === 'sales' ? SALES_LABELS : SPEND_LABELS)[level];
}
/** The request in force for a responsibility. */
export function requestOf(
  w: Pick<World, 'delegationRequests'>,
  key: BudgetResponsibility,
): SpendRequest {
  return w.delegationRequests?.[key] ?? DEFAULT_REQUEST;
}

/**
 * How a person handles the club's money. It sets the cash he never touches (his cutoff, in rounds
 * of fixed costs) and how he hears a request: a cautious person spends one step less than a big
 * request, a bold one a step more than a sparing one. A vacant post is run cautiously.
 */
export type Temperament = 'cautious' | 'balanced' | 'bold';
export const TEMPERAMENT_INFO: Record<
  Temperament,
  { label: string; summary: string; reserveRounds: number }
> = {
  cautious: {
    label: sourceMessage('delegation.temperament.cautious'),
    summary: sourceMessage('delegation.temperament.cautious.summary'),
    reserveRounds: 23,
  },
  balanced: {
    label: sourceMessage('delegation.temperament.balanced'),
    summary: sourceMessage('delegation.temperament.balanced.summary'),
    reserveRounds: 12,
  },
  bold: {
    label: sourceMessage('delegation.temperament.bold'),
    summary: sourceMessage('delegation.temperament.bold.summary'),
    reserveRounds: 6,
  },
};
/** A person's temperament, fixed for his career: three in ten cautious, four balanced, three bold. */
export function temperamentOf(personKey: string): Temperament {
  const roll = hash(`temperament:${personKey}`) % 10;
  return roll < 3 ? 'cautious' : roll < 7 ? 'balanced' : 'bold';
}
/** The level a person acts on when asked `request`. */
export function actedLevel(request: SpendRequest, temperament: Temperament): SpendRequest {
  if (temperament === 'cautious' && request >= 4) return (request - 1) as SpendRequest;
  if (temperament === 'bold' && request === 2) return 3;
  return request;
}

/** Whose judgement spends a delegated responsibility's money: the 단장, or the youth coach. */
export type DelegatePost = 'director' | 'youth';
export const DELEGATE_POST: Record<ResponsibilityKey, DelegatePost> = {
  manager: 'director',
  staff: 'director',
  contracts: 'director',
  recruitment: 'director',
  sales: 'director',
  academy: 'youth',
  sponsors: 'director',
};
export interface Delegate {
  post: DelegatePost;
  postLabel: string;
  member?: Staff;
  /** His name, or 공석. */
  name: string;
  temperament: Temperament;
}
export function delegateOf(w: World, key: ResponsibilityKey): Delegate {
  const post = DELEGATE_POST[key],
    member = staffMember(w, post);
  return {
    post,
    postLabel: post === 'director' ? sourceMessage('staff.role.director') : STAFF_INFO.youth.label,
    member,
    name: member?.name ?? sourceMessage('team.vacant'),
    temperament: member ? temperamentOf(member.person ?? member.id) : 'cautious',
  };
}

/**
 * The club settings a delegated person sets himself (→ECON-16/25): while the responsibility is
 * delegated the owner reads them on their pages and cannot change them; taken back, they stay as
 * the person left them until the owner changes them.
 */
export const DELEGATE_CONTROLS: Record<
  BudgetResponsibility,
  { policy: readonly PolicyKey[]; direction: readonly DirectionKey[] }
> = {
  manager: { policy: [], direction: ['manager', 'school'] },
  staff: { policy: [], direction: ['coaches'] },
  contracts: { policy: [], direction: ['renewal'] },
  recruitment: { policy: ['recruitment'], direction: ['recruitmentSupport'] },
  sales: { policy: [], direction: [] },
  academy: { policy: ['academy'], direction: ['youthGoal', 'debut'] },
};
/** The delegated responsibility whose person sets this dial or direction row now, if any. */
export function settingDelegate(
  w: Pick<World, 'settings'>,
  setting: { policy: PolicyKey } | { direction: DirectionKey },
): BudgetResponsibility | undefined {
  return BUDGET_RESPONSIBILITIES.find(
    (key) =>
      isDelegated(w, key) &&
      ('policy' in setting
        ? DELEGATE_CONTROLS[key].policy.includes(setting.policy)
        : DELEGATE_CONTROLS[key].direction.includes(setting.direction)),
  );
}
