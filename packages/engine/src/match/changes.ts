/** The manager's substitution policy and in-match fatigue, read by every result path (→MATCH-20, STAFF-45, CLUB-23). */
import type { Manager } from '../../../contracts/src/types';
import { DEFAULT_SUB_POLICY, type SubPolicy } from './rules';

/** Thresholds of the managers' substitutions (STAFF-45) and the injury hazard (CLUB-23). */
export const CHANGES_CONFIG = {
  /** Fatigue up to this is match fitness; a player past it by `tired` is tired. */
  fitness: 20,
  tired: 15,
  /** In-match fatigue per missing stamina point over 90 minutes, and under press. */
  drain: 0.35,
  pressDrain: 1.3,
  earlyPressFrom: 55,
  protectFrom: 75,
  chaseFrom: 60,
  youthFrom: 80,
  youthAge: 21,
  /** Bench players within this many OVR points count as equal options. */
  youthMargin: 3,
  dataAt: [60, 70, 80],
  /** The hazard rises through the match: 0.7 at kick-off to 1.3 at 90′, averaging 1. */
  hazardFrom: 0.7,
  hazardRise: 0.6,
} as const;

/** How a manager substitutes, from his school and selection trait (STAFF-45); interims and the founding manager follow the default. */
export function subPolicyFor(manager: Manager | undefined): SubPolicy {
  if (!manager || manager.interim) return { ...DEFAULT_SUB_POLICY };
  const { style, trait } = manager;
  const earlyPress = style === 'gegenpress' || trait === 'rotation';
  return {
    ...DEFAULT_SUB_POLICY,
    fatigueFrom: earlyPress ? CHANGES_CONFIG.earlyPressFrom : DEFAULT_SUB_POLICY.fatigueFrom,
    earlyPress,
    protectLead: style === 'counter' || style === 'organizer',
    chaseWhenBehind: style === 'firefighter' || style === 'motivator',
    youth: style === 'developer' || trait === 'youth',
    data: style === 'headcoach',
    delay: trait === 'stable' ? 10 : 0,
  };
}

/**
 * In-match fatigue after `minutes` on the pitch: the pre-match fatigue plus the drain
 * of missing 체력, faster under press and by the side's drain. The aggregate planner applies the
 * same rule (aggregate/participation.ts).
 */
export function inMatchFatigue(
  fatigue: number,
  stamina: number,
  minutes: number,
  pressing: boolean,
  drain: number,
): number {
  return (
    fatigue +
    (((100 - stamina) * minutes) / 90) *
      CHANGES_CONFIG.drain *
      (pressing ? CHANGES_CONFIG.pressDrain : 1) *
      drain
  );
}
