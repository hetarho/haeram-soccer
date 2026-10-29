import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { clubOvr, cohesionLine, ovrTier } from './OvrBadge';

describe('overall presentation tiers', () => {
  it.each([
    [0, 'bronze'],
    [49, 'bronze'],
    [50, 'silver'],
    [64, 'silver'],
    [65, 'gold'],
    [74, 'gold'],
    [75, 'platinum'],
    [84, 'platinum'],
    [85, 'ruby'],
    [99, 'ruby'],
  ] as const)('maps %i to %s at each tier boundary', (value, tier) => {
    expect(ovrTier(value)).toBe(tier);
  });
});

describe("a rival's XI at its 조직력 (→LEAGUE-12, WEB-58)", () => {
  it('rates a rival by its strength at its 조직력 and names it', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Cohesion Town',
      color: '#335577',
      seed: 'cohesion-ui',
      level: 'normal' as const,
    });
    const rival = w.clubs.find((club) => club.id !== w.playerClub && club.strength > 40)!;
    // A new rival stands at 0.80: exactly its strength.
    expect(clubOvr(w, rival)).toBe(rival.strength);
    expect(cohesionLine(rival)).toBe('조직력 0.80 · ×1');
    // A settled side plays above it, an unsettled one well below.
    rival.cohesion = 1;
    expect(clubOvr(w, rival)).toBeGreaterThan(rival.strength);
    expect(cohesionLine(rival)).toBe('조직력 1.00 · ×1.05');
    rival.cohesion = 0.5;
    expect(clubOvr(w, rival)).toBeLessThan(rival.strength - 2);
  });
});
