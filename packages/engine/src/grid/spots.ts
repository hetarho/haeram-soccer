/** Formation spots and role shifts in metres, copied from `MATCH_MOTION_CONFIG` (→MATCH-8, MATCH-12). */
import type { RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import type { Point } from './pitch';

/** One spot per formation slot, in the attack frame of the side that plays it (x toward the opponent's goal). */
export const SPOTS: Record<Tactic, readonly Point[]> = {
  balanced: [
    [5.25, 34],
    [37.8, 8.16],
    [21, 20.4],
    [18.9, 34],
    [21, 47.6],
    [37.8, 59.84],
    [39.9, 34],
    [50.4, 21.76],
    [50.4, 46.24],
    [71.4, 27.2],
    [73.5, 40.8],
  ],
  possession: [
    [5.25, 34],
    [29.4, 8.16],
    [25.2, 25.84],
    [25.2, 42.16],
    [29.4, 59.84],
    [42, 34],
    [49.35, 20.4],
    [47.25, 47.6],
    [72.45, 10.88],
    [76.65, 34],
    [72.45, 57.12],
  ],
  counter: [
    [5.25, 34],
    [23.1, 11.56],
    [21, 26.52],
    [21, 41.48],
    [23.1, 56.44],
    [46.2, 9.52],
    [44.1, 26.52],
    [44.1, 41.48],
    [46.2, 58.48],
    [67.2, 27.2],
    [69.3, 40.8],
  ],
  press: [
    [5.25, 34],
    [31.5, 10.88],
    [28.35, 25.84],
    [28.35, 42.16],
    [31.5, 57.12],
    [46.2, 25.84],
    [48.3, 42.16],
    [63, 34],
    [67.2, 10.88],
    [78.75, 34],
    [67.2, 57.12],
  ],
};

/** `[forward, inward]` metres a role moves its player while his side has the ball; inward is toward y = 34. */
export const ROLE_SHIFT: Partial<Record<RoleId, readonly [number, number]>> = {
  sweeperKeeper: [6.3, 0],
  ballPlayingDefender: [3.15, 0],
  overlappingFullBack: [12.6, -1.36],
  invertedFullBack: [6.3, 10.88],
  defensiveWingBack: [6.3, 0],
  attackingWingBack: [14.7, -1.36],
  regista: [-4.2, 0],
  boxToBox: [4.2, 0],
  mezzala: [6.3, -4.08],
  deepLyingPlaymaker: [-4.2, 0],
  widePlaymaker: [0, 6.8],
  attackingMidfielder: [4.2, 0],
  shadowStriker: [8.4, 0],
  trequartista: [3.15, 0],
  traditionalWinger: [2.1, -2.72],
  invertedWinger: [2.1, 9.52],
  targetMan: [2.1, 0],
  poacher: [3.15, 0],
  falseNine: [-10.5, 0],
};
