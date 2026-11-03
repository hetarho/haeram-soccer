import { ATTRIBUTES } from '../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { clubMilestones } from './index';
import { careerWorld } from './career.testkit';

/** The milestone club on the pre-feature path: club goals, not the match model, are the subject. */
export function world(strong = false) {
  const w = careerWorld({ seed: 'milestone-career' }, DISABLED_RELEASE);
  w.cash = '999999999999';
  if (strong) {
    w.manager.ability = 100;
    w.tactic = 'balanced';
    for (const player of w.players) {
      for (const a of ATTRIBUTES) player.attrs[a] = 95;
      player.potential = 100;
      player.born = w.year - 20;
      w.people![player.id].born = player.born;
    }
    for (const club of w.clubs) if (club.id !== w.playerClub) club.strength = 5;
  }
  return w;
}

export const byId = (w: ReturnType<typeof world>, id: string) =>
  clubMilestones(w).goals.find((item) => item.id === id)!;
