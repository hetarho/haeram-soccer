import type { World } from '../../packages/contracts/src/types';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { advanceRound } from '../../packages/engine/src/index';
import { cachedWorld } from './cached-world';

/** Real operating costs put a top-flight club below zero; no balance is edited after play. */
export function operatingLossWorld(): World {
  return cachedWorld('business-operating-loss', () => {
    const world = careerWorld({
      country: 'ENG',
      seed: 'business-budget-recovery',
      club: 'ENG:0:0:0',
    });
    // A price off the presets, as an older save keeps it (→ECON-17).
    world.ticket = 0.01;
    world.cash = '1';
    for (let i = 0; i < 46 && BigInt(world.cash) >= 0n; i++) advanceRound(world, undefined, false);
    return world;
  });
}
