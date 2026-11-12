/** What the picture and the UI read of a match's motion: formation spots, the ball's peak and team tendencies (→MATCH-8, MATCH-12, MATCH-17). */
import type { Manager, Tactic } from '../../../contracts/src/types';
import { FORMATIONS } from '../player';
import { clamp } from '../primitives';
import { PITCH } from './pitch';
import { SPOTS } from './spots';

type Units = [number, number];

/** Metres in the engine frame as the playback's pitch units, 0–100 along each axis. */
export const toUnits = (p: readonly [number, number]): Units => [
  (p[0] * 100) / PITCH.length,
  (p[1] * 100) / PITCH.width,
];
const unit = (n: number) => clamp(n, 0, 1);

/**
 * Candidate traces (→MATCH-12): match seconds at least between drawn player samples, and the speed
 * (metres per match second) below which every player of a restart's walk-in counts as standing on
 * his place (T477), so dead time draws them hurrying there and then waiting.
 */
export const SAMPLING = { spacing: 2, settle: 0.2 } as const;

/**
 * What the UI draws beside the playback: each tactic's formation spots in pitch units (from
 * `SPOTS`, slot order, attacking left to right), the ball's peak height, and the implicit team
 * tendencies (`teamMotionProfile`); a player's own are `playerTendencies` (match/tendencies.ts).
 */
export const MATCH_MOTION_CONFIG = {
  /** The ball's peak height in pitch units: a flight longer than 18 rises with its distance up to it. */
  ball: { maxLoft: 9 },
  formations: {
    balanced: SPOTS.balanced.map(toUnits),
    possession: SPOTS.possession.map(toUnits),
    counter: SPOTS.counter.map(toUnits),
    press: SPOTS.press.map(toUnits),
  } as Record<Tactic, readonly Units[]>,
  manager: {
    appliedTacticWeight: 0.55,
    flexibilityWeight: 0.35,
    abilityCohesion: 0.22,
    flexibilityFreedom: 0.22,
  },
  tactics: {
    balanced: {
      formation: FORMATIONS.balanced.name,
      cohesion: 0.65,
      freedom: 0.5,
      pressing: 0.5,
      risk: 0.5,
      line: 0,
    },
    possession: {
      formation: FORMATIONS.possession.name,
      cohesion: 0.76,
      freedom: 0.56,
      pressing: 0.46,
      risk: 0.48,
      line: 4,
    },
    counter: {
      formation: FORMATIONS.counter.name,
      cohesion: 0.84,
      freedom: 0.36,
      pressing: 0.23,
      risk: 0.77,
      line: -8,
    },
    press: {
      formation: FORMATIONS.press.name,
      cohesion: 0.61,
      freedom: 0.66,
      pressing: 0.95,
      risk: 0.72,
      line: 7,
    },
  },
} as const;

export function teamMotionProfile(
  tactic: Tactic,
  manager: Pick<Manager, 'philosophy' | 'ability' | 'flexibility'>,
) {
  const c = MATCH_MOTION_CONFIG.manager;
  const applied = c.appliedTacticWeight + unit(manager.flexibility / 100) * c.flexibilityWeight;
  const tacticProfile = MATCH_MOTION_CONFIG.tactics[tactic],
    philosophy = MATCH_MOTION_CONFIG.tactics[manager.philosophy];
  const mix = (key: 'cohesion' | 'freedom' | 'pressing' | 'risk' | 'line') =>
    tacticProfile[key] * applied + philosophy[key] * (1 - applied);
  return {
    formation: tacticProfile.formation,
    cohesion: unit(mix('cohesion') + (unit(manager.ability / 100) - 0.5) * c.abilityCohesion),
    freedom: unit(mix('freedom') + (unit(manager.flexibility / 100) - 0.5) * c.flexibilityFreedom),
    pressing: unit(mix('pressing')),
    risk: unit(mix('risk')),
    line: mix('line'),
    ability: unit(manager.ability / 100),
  };
}
