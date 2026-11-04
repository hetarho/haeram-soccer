import { message as sourceMessage } from '../../contracts/src/messages';
/** Tactic names and the stable style of clubs nobody owns: a leaf the UI may read (→ARCH-4). */
import type { Club, Tactic } from '../../contracts/src/types';

export const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const tacticLabel: Record<Tactic, string> = {
  balanced: sourceMessage('copy.stories.634269a095'),
  possession: sourceMessage('copy.tactics.433fdd3f04'),
  counter: sourceMessage('copy.stories.6b52f66491'),
  press: sourceMessage('copy.tactics.5e3d599695'),
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
