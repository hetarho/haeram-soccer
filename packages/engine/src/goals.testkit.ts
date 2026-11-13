import { ATTRIBUTES } from '../../contracts/src/player';
import { clubMilestones, clubOf } from './index';
import { careerWorld } from './career.testkit';
import { setNpcLevel } from './testing';

/**
 * The milestone club on the released model: club goals, not the match model, are the subject. A
 * taken-over club arrives with its ground and following (→CLUB-1), so this one is given a small
 * club's facts, the founding's 2,500 ground and 800 supporters, leaving the facility and supporter
 * milestones open to earn.
 */
export function world(strong = false) {
  const w = careerWorld({ seed: 'milestone-career' });
  w.cash = '999999999999';
  w.stadium = 0;
  clubOf(w).fans = 800;
  if (strong) {
    w.manager.ability = 100;
    w.tactic = 'balanced';
    for (const player of w.players) {
      for (const a of ATTRIBUTES) player.attrs[a] = 95;
      player.potential = 100;
      player.born = w.year - 20;
      w.people![player.id].born = player.born;
    }
    for (const club of w.clubs) if (club.id !== w.playerClub) setNpcLevel(w, club, 5);
  }
  return w;
}

export const byId = (w: ReturnType<typeof world>, id: string) =>
  clubMilestones(w).goals.find((item) => item.id === id)!;
