import type { PlayTrait, RoleId } from '../../contracts/src/player';
import { clamp } from './primitives';

export type MatchAction =
  'shot' | 'box' | 'long' | 'dribble' | 'cross' | 'key' | 'press' | 'aerial' | 'run' | 'hold';
const MATCH_ACTIONS: readonly MatchAction[] = [
  'shot',
  'box',
  'long',
  'dribble',
  'cross',
  'key',
  'press',
  'aerial',
  'run',
  'hold',
];
export const ROLE_ACTION: Partial<Record<RoleId, Partial<Record<MatchAction, number>>>> = {
  stopper: { press: 1.2, aerial: 1.1 },
  ballPlayingDefender: { key: 1.1 },
  defensiveFullBack: { cross: 0.8 },
  overlappingFullBack: { cross: 1.3, run: 1.1 },
  invertedFullBack: { cross: 0.6, key: 1.1 },
  defensiveWingBack: { cross: 0.9 },
  attackingWingBack: { cross: 1.4, dribble: 1.1 },
  anchor: { press: 1.1 },
  ballWinner: { press: 1.5 },
  regista: { key: 1.4 },
  boxToBox: { run: 1.2, press: 1.2 },
  mezzala: { run: 1.2, key: 1.1 },
  deepLyingPlaymaker: { key: 1.3 },
  wideMidfielder: { cross: 1.3 },
  widePlaymaker: { key: 1.3, cross: 0.8 },
  attackingMidfielder: { key: 1.2, long: 1.2 },
  shadowStriker: { shot: 1.3, run: 1.3 },
  trequartista: { key: 1.4, dribble: 1.2 },
  traditionalWinger: { cross: 1.5, dribble: 1.2, shot: 0.8 },
  invertedWinger: { shot: 1.4, cross: 0.7, dribble: 1.2 },
  targetMan: { aerial: 1.6, hold: 1.4, shot: 1.1 },
  poacher: { box: 1.4, shot: 1.3 },
  falseNine: { key: 1.3, dribble: 1.2, shot: 0.8 },
  completeForward: { shot: 1.1, key: 1.1, aerial: 1.1 },
};
export const TRAIT_ACTION: Partial<Record<PlayTrait, Partial<Record<MatchAction, number>>>> = {
  workrate: { press: 1.2 },
  technician: { dribble: 1.4 },
  playmaker: { key: 1.4 },
  speedster: { run: 1.4 },
  linebreaker: { run: 1.3, shot: 1.1 },
  targetman: { aerial: 1.6, hold: 1.3 },
  longshot: { long: 1.5 },
  crosser: { cross: 1.5 },
  aerial: { aerial: 1.4 },
  tackler: { press: 1.2 },
  buildup: { key: 1.1 },
};
const ROLE_VECTORS = new Map<RoleId, Float64Array>();
/** A role's multiplier for every action, in MATCH_ACTIONS order. */
export function roleVector(role: RoleId) {
  let vector = ROLE_VECTORS.get(role);
  if (!vector) {
    vector = Float64Array.from(MATCH_ACTIONS, (action) => ROLE_ACTION[role]?.[action] ?? 1);
    ROLE_VECTORS.set(role, vector);
  }
  return vector;
}
const TRAIT_VECTORS = new WeakMap<readonly PlayTrait[], Float64Array>();
/** A player's traits' product for every action; traits are replaced, never edited in place. */
export function traitVector(traits: readonly PlayTrait[]) {
  let vector = TRAIT_VECTORS.get(traits);
  if (!vector) {
    vector = Float64Array.from(MATCH_ACTIONS, (action) =>
      traits.reduce((product, trait) => product * (TRAIT_ACTION[trait]?.[action] ?? 1), 1),
    );
    TRAIT_VECTORS.set(traits, vector);
  }
  return vector;
}
/** A player's weight for an action at a slot: his role's times his traits', within 0.5–2. */
export function actionWeight(role: RoleId, traits: readonly PlayTrait[], action: MatchAction) {
  const i = MATCH_ACTIONS.indexOf(action);
  return clamp(roleVector(role)[i]! * traitVector(traits)[i]!, 0.5, 2);
}
