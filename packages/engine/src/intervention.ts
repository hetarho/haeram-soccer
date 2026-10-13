import type {
  CoachDelegationKey,
  DelegationKey,
  InterventionLevel,
  World,
} from '../../contracts/src/types';

/** One key per coaching department, in display order (→STAFF-13). */
export const COACH_KEYS: readonly CoachDelegationKey[] = [
  'coach:assistant',
  'coach:attack',
  'coach:defense',
  'coach:goalkeeping',
  'coach:fitness',
  'coach:youth',
  'coach:scout',
];
/** Every decision the staff can take for the owner (→STAFF-13). */
export const DELEGATION_KEYS: readonly DelegationKey[] = [
  'academy',
  'contracts',
  'transfers',
  'business',
  'manager',
  ...COACH_KEYS,
];
/** The four intervention levels, 1 every decision to 4 leave it to the staff (→WEB-45). */
export const INTERVENTION_LEVELS: readonly InterventionLevel[] = [1, 2, 3, 4];
/** New clubs look at the important decisions themselves (→STAFF-13). */
export const NEW_CLUB_INTERVENTION: InterventionLevel = 2;
/**
 * The decisions the staff take at each level (→WEB-45). Where the clock stops is the clock's
 * half of the level and lives with it (→WEB-18); the training focus is no level's, the coaches
 * always set it (→CLUB-13).
 */
export const INTERVENTION_DELEGATES: Record<InterventionLevel, readonly DelegationKey[]> = {
  1: [],
  2: ['academy', 'contracts'],
  3: ['academy', 'contracts'],
  4: DELEGATION_KEYS,
};

/** The level in force; a world without one is the owner's alone. */
export function interventionOf(w: Pick<World, 'intervention'>): InterventionLevel {
  return w.intervention ?? 1;
}
/** Whether the staff take this decision now: the level alone decides (→STAFF-13). */
export function delegated(w: Pick<World, 'intervention'>, key: DelegationKey) {
  return INTERVENTION_DELEGATES[interventionOf(w)].includes(key);
}
