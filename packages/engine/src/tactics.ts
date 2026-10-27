/** Tactic names and the stable style of clubs nobody owns: a leaf the UI may read (→ARCH-4). */
import type { Club, Tactic } from '../../contracts/src/types';

export const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const tacticLabel: Record<Tactic, string> = {
  balanced: '균형',
  possession: '점유',
  counter: '역습',
  press: '전방 압박',
};
/** Stable playing style of a club nobody owns, shared by simulation and scouting. */
export function clubStyle(club: Pick<Club, 'id'>): Tactic {
  return TACTICS[
    Math.abs(club.id.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0)) % 4
  ];
}
/** Stable opponent identity is shared by simulation and pre-match scouting. */
export function npcTactic(club: Pick<Club, 'id'>): Tactic {
  return clubStyle(club);
}
