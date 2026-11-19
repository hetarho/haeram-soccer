/**
 * Delegation's vocabulary, a read leaf the UI may import (→ARCH-4): the owner's spending request
 * per responsibility, the spending step each request asks the 단장 to plan with, the
 * person each responsibility goes to once delegated and that person's temperament, and which club
 * settings a delegated person sets in the owner's place. The plans built from them live in
 * `delegation.ts`.
 */
import { message as sourceMessage } from '../../contracts/src/messages';
import type {
  BudgetResponsibility,
  DirectionKey,
  PolicyKey,
  PolicyLevel,
  ResponsibilityKey,
  SpendRequest,
  Staff,
  World,
} from '../../contracts/src/types';
import { hash } from './primitives';
import { isDelegated } from './responsibilities';
import { staffMember, STAFF_INFO } from './staff-info';

export const SPEND_REQUESTS: readonly SpendRequest[] = [1, 2, 3, 4, 5];
/**
 * The 단장's looks with recruitment delegated (→CLUB-33): on a window's opening day and every
 * `lookDays`th day after it, making moves until his pending bids reach `pendingByStep` by the 선수
 * 영입 step he acts on (1–5). Read by the signings and by the pages that explain them.
 */
export const RECRUITMENT_LOOKS = {
  lookDays: 3,
  pendingByStep: [1, 1, 1, 2, 3] as readonly number[],
};
/**
 * Youth money: the youth director's pay and the academy investment, a share of income in basis
 * points. The youth director is paid first — the 단장 may hire one up to the whole share — and the
 * academy runs at the level the request aims at (`ACADEMY_AIM`) or the highest the rest pays for.
 */
export const YOUTH_SHARE: Readonly<Record<SpendRequest, number>> = {
  1: 50,
  2: 100,
  3: 160,
  4: 240,
  5: 350,
};
/** The academy investment level each acted level aims at: 기본 운영 … 최고 수준 아카데미. */
export const ACADEMY_AIM: Readonly<Record<SpendRequest, PolicyLevel>> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};
/** Rounds of fixed costs the plain insolvency stop keeps in cash after any delegated spend. */
export const SAFETY_ROUNDS = 4;
/** The cash buffer is waived only for the bold director's most expansive request. */
export function safetyRounds(w: World, key: BudgetResponsibility): number {
  const temperament = delegateOf(w).temperament;
  return temperament === 'bold' && actedLevel(requestOf(w, key), temperament) === 5
    ? 0
    : SAFETY_ROUNDS;
}
/** A share in basis points as a percent with at most one decimal: 6200 → 62, 55 → 0.6. */
export const sharePercent = (basisPoints: number) => Math.round(basisPoints / 10) / 10;
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
 * How a person hears a request: a cautious person plans one step below a big request, a bold one
 * a step above a sparing one, and each says why. A vacant post is run cautiously.
 */
export type Temperament = 'cautious' | 'balanced' | 'bold';
export const TEMPERAMENT_INFO: Record<Temperament, { label: string; summary: string }> = {
  cautious: {
    label: sourceMessage('delegation.temperament.cautious'),
    summary: sourceMessage('delegation.temperament.cautious.summary'),
  },
  balanced: {
    label: sourceMessage('delegation.temperament.balanced'),
    summary: sourceMessage('delegation.temperament.balanced.summary'),
  },
  bold: {
    label: sourceMessage('delegation.temperament.bold'),
    summary: sourceMessage('delegation.temperament.bold.summary'),
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

/**
 * Whose judgement a delegated responsibility follows. Money is the 단장's in every work, youth money
 * included; the youth director trains the prospects and makes the academy's football calls
 * (`YOUTH_ROWS`, promotions and releases).
 */
export type DelegatePost = 'director' | 'youth';
export interface Delegate {
  post: DelegatePost;
  postLabel: string;
  member?: Staff;
  /** His name, or 공석. */
  name: string;
  temperament: Temperament;
}
export function personOf(w: World, post: DelegatePost): Delegate {
  const member = staffMember(w, post);
  return {
    post,
    postLabel: post === 'director' ? sourceMessage('staff.role.director') : STAFF_INFO.youth.label,
    member,
    name: member?.name ?? sourceMessage('team.vacant'),
    temperament: member ? temperamentOf(member.person ?? member.id) : 'cautious',
  };
}
/** The person every delegated responsibility's money goes to: the 단장. */
export function delegateOf(w: World): Delegate {
  return personOf(w, 'director');
}
/** The academy's football rows the youth director sets, not the 단장 (→CLUB-32). */
export const YOUTH_ROWS: readonly DirectionKey[] = ['youthGoal', 'debut'];

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
/** Who sets this dial or direction row while its work is delegated: the 단장, or for the academy's football rows the youth director. */
export function settingPerson(
  w: World,
  setting: { policy: PolicyKey } | { direction: DirectionKey },
): Delegate {
  return personOf(
    w,
    'direction' in setting && YOUTH_ROWS.includes(setting.direction) ? 'youth' : 'director',
  );
}
