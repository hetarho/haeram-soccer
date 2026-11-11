import type { Club, World } from '../../../contracts/src/types';
import type { LabWorld } from './match';

/** Synthetic two-club input, no world generation, season or campaign lifecycle. */
export function tinyLabWorld(): LabWorld {
  const hosts = [0, 1].map((side) => ({
    id: `lab-host-${side}`,
    name: `Synthetic ${side}`,
    short: `S${side}`,
    country: 'ENG',
    tier: 0,
    color: side === 0 ? '#bb2233' : '#2233bb',
  })) as [Club, Club];
  const w = {
    seed: 'lab-world',
    clubs: hosts,
    playerClub: '',
    fixtures: [{}],
    manager: { flexibility: 50 },
    matchModel: { revision: 'scripted-aggregate-11' },
  } as unknown as World;
  return { w, hosts };
}
