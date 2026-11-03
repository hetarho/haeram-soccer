import { describe, expect, it } from 'vitest';
import { EVOLUTION, evolveClubs, levelOf } from './index';
import { careerWorld } from './career.testkit';

describe('clubs nobody owns', () => {
  it('can grow past any old cap through rare projects, as strong as an owner can build', () => {
    const w = careerWorld({ seed: 'superclub-probe' });
    let highest = 0,
      projects = 0;
    for (let season = 0; season < 40; season++) {
      const tiers = new Map(w.clubs.map((club) => [club.id, club.tier]));
      evolveClubs(w, tiers);
      w.year++;
      for (const club of w.clubs) {
        if (club.id === w.playerClub) continue;
        expect(club.strength).toBeLessThanOrEqual(EVOLUTION.ceiling);
        highest = Math.max(highest, club.strength);
        if (club.project) {
          projects++;
          // A project lifts the level the club drifts toward.
          expect(levelOf(w, club)).toBeGreaterThan(levelOf(w, { ...club, project: undefined }));
        }
      }
    }
    expect(highest).toBeGreaterThan(92);
    expect(projects).toBeGreaterThan(0);
  });
});
