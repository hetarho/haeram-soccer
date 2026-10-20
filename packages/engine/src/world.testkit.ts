import { expect } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { createWorld } from './index';

export const input = {
  country: 'ENG' as const,
  name: 'Haeram Forge',
  color: '#24664f',
  seed: 'portable-world-1',
  level: 'normal' as const,
};
export function assertCapacities(w: ReturnType<typeof createWorld>) {
  for (const cp of COUNTRIES)
    cp.groups.forEach((groups, tier) =>
      groups.forEach((count, group) =>
        expect(
          w.clubs.filter(
            (c) =>
              c.country === cp.code && c.tier === tier && c.group === group && !c.representative,
          ),
        ).toHaveLength(count),
      ),
    );
}
