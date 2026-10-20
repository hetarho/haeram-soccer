import { ATTRIBUTES } from '../../contracts/src/player';
import { clubMilestones, createWorld } from './index';

export function world(strong = false) {
  const w = createWorld({
    country: 'ENG',
    name: 'Milestone United',
    color: '#224433',
    seed: 'milestone-career',
    level: 'easy' as const,
  });
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
