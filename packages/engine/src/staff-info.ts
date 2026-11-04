import { message as sourceMessage } from '../../contracts/src/messages';
/** Staff roles, traits, contract terms and member reads: a leaf the UI may read (→ARCH-4). */
import type {
  ContractTerm,
  ManagerTrait,
  Staff,
  StaffRole,
  StaffTrait,
  World,
} from '../../contracts/src/types';
import { ratio } from './primitives';

/** The 단장 beside the manager, then the coaching departments below him, in display order. */
export const STAFF_ROLES: readonly StaffRole[] = [
  'director',
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
];
/** A club's posts as its 코치진 lists them: the manager, the director and scout, then the coaches. */
export const CLUB_POSTS: readonly ('manager' | StaffRole)[] = [
  'manager',
  'director',
  'scout',
  ...STAFF_ROLES.filter((role) => role !== 'director' && role !== 'scout'),
];
export const STAFF_INFO: Record<StaffRole, { label: string; duty: string; traits: StaffTrait[] }> =
  {
    director: {
      label: sourceMessage('staff.role.director'),
      duty: sourceMessage('copy.staff_info.4d3eb786e7'),
      traits: ['negotiator', 'closer'],
    },
    assistant: {
      label: sourceMessage('staff.role.assistant'),
      duty: sourceMessage('copy.staff_info.b4dcd4c659'),
      traits: ['developer', 'specialist'],
    },
    attack: {
      label: sourceMessage('staff.role.attack'),
      duty: sourceMessage('copy.staff_info.f45ecb8f21'),
      traits: ['specialist', 'developer'],
    },
    defense: {
      label: sourceMessage('staff.role.defense'),
      duty: sourceMessage('copy.staff_info.ec0aeb90b5'),
      traits: ['specialist', 'developer'],
    },
    goalkeeping: {
      label: sourceMessage('staff.role.goalkeeping'),
      duty: sourceMessage('copy.staff_info.cb4c6ba2cc'),
      traits: ['specialist'],
    },
    fitness: {
      label: sourceMessage('staff.role.fitness'),
      duty: sourceMessage('copy.staff_info.571b27cc16'),
      traits: ['recovery', 'specialist'],
    },
    youth: {
      label: sourceMessage('staff.role.youth'),
      duty: sourceMessage('copy.staff_info.ada918345c'),
      traits: ['developer', 'spotter'],
    },
    scout: {
      label: sourceMessage('staff.role.scout'),
      duty: sourceMessage('copy.staff_info.f2b238750e'),
      traits: ['spotter'],
    },
  };
export const STAFF_TRAIT_INFO: Record<StaffTrait, { label: string; effect: string }> = {
  developer: {
    label: sourceMessage('copy.staff_info.c4a9093e6c'),
    effect: sourceMessage('copy.staff_info.fb752d9e2b'),
  },
  specialist: {
    label: sourceMessage('copy.staff_info.3e29e4abab'),
    effect: sourceMessage('copy.staff_info.e93e4ee1f0'),
  },
  recovery: {
    label: sourceMessage('copy.staff_info.4ae85088ba'),
    effect: sourceMessage('copy.staff_info.2967335103'),
  },
  spotter: {
    label: sourceMessage('copy.staff_info.84c07cc496'),
    effect: sourceMessage('copy.staff_info.6a0c1d7558'),
  },
  closer: {
    label: sourceMessage('copy.staff_info.7d478cec8b'),
    effect: sourceMessage('copy.staff_info.473fc211a6'),
  },
  negotiator: {
    label: sourceMessage('copy.staff_info.e644d5bbfb'),
    effect: sourceMessage('copy.staff_info.26a98d9ce2'),
  },
};
export const MANAGER_TRAIT_INFO: Record<ManagerTrait, { label: string; effect: string }> = {
  youth: {
    label: sourceMessage('copy.staff_info.8824c227ab'),
    effect: sourceMessage('copy.staff_info.53adb37b1e'),
  },
  rotation: {
    label: sourceMessage('copy.staff_info.f955ae7976'),
    effect: sourceMessage('copy.staff_info.4b5213a190'),
  },
  stable: {
    label: sourceMessage('copy.staff_info.272cfc1a0a'),
    effect: sourceMessage('copy.staff_info.1caba8f4eb'),
  },
};

export function staffMember(w: World, role: StaffRole): Staff | undefined {
  return w.staff?.find((member) => member.role === role);
}

/** Seasons a manager or coach may sign for when the owner chooses (→STAFF-11, →STAFF-14). */
export const CONTRACT_TERMS: readonly ContractTerm[] = [1, 2, 3, 4, 5];
/** The seasons a renewal signs for when nobody chose a term, and where the owner's choice starts. */
export const DELEGATED_TERM: ContractTerm = 2;

/** Seasons left on a contract, this one included: a deal ending at this season's close has one. */
export function seasonsLeft(w: World, until: number) {
  return Math.max(0, until - w.year);
}

/**
 * Releasing or replacing a paid coach or manager pays 25% of his annual wage for each season left
 * on his contract (→STAFF-11); volunteers leave freely.
 */
export function releaseCost(w: World, person: Pick<Staff, 'wage' | 'until'> | undefined) {
  if (!person || BigInt(person.wage) <= 0n) return '0';
  return ratio(person.wage, BigInt(seasonsLeft(w, person.until)), 4n);
}

/** Starting XI average fatigue that makes the assistant call a recovery week. */
export const AUTO_RECOVERY_FATIGUE = 30;
/** Below this starters' fatigue, with morale at least AUTO_HARD_MORALE, he may call 하드 (→CLUB-13). */
export const AUTO_HARD_FATIGUE = 15;
export const AUTO_HARD_MORALE = 50;

/** A player's fatigue at which the assistant rests him whatever the squad does (→CLUB-13). */
export const AUTO_PLAYER_RECOVERY = 40;

/** A paid coach whose contract ends at this season's close. */
export function isExpiring(w: World, member: Staff) {
  return BigInt(member.wage) > 0n && member.until <= w.year + 1;
}
export const MANAGER_GONE = sourceMessage('copy.staff_info.400b3efe70');
