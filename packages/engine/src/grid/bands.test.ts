import { describe, expect, it } from 'vitest';
import { TD } from '../../../contracts/src/detail';
import type { Club, Tactic, World } from '../../../contracts/src/types';
import { createWorld, rating } from '../index';
import { playGrid } from './engine';
import { M } from './record';
import { buildGridSetup } from './setup';

const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];

/** Equal top-tier sides of one world (ratings within 2), modern-era rules, the four tactics mixed. */
function equalPairs(): { w: World; home: Club; away: Club }[] {
  const w = createWorld({
    country: 'ENG',
    name: 'Grid Bands',
    color: '#2a5d8f',
    seed: 'grid-bands-1',
    level: 'normal',
  });
  const out: { w: World; home: Club; away: Club }[] = [];
  for (const country of ['ENG', 'ESP', 'GER', 'ITA']) {
    const clubs = w.clubs
      .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
      .map((c) => ({ c, r: rating(w, c) }));
    for (let i = 0; i < clubs.length; i++)
      for (let j = i + 1; j < clubs.length; j++)
        if (Math.abs(clubs[i]!.r - clubs[j]!.r) <= 2)
          out.push({ w, home: clubs[i]!.c, away: clubs[j]!.c });
  }
  return out;
}

describe('grid engine distributions', () => {
  it('stays inside coarse real-football guards', () => {
    const pairs = equalPairs();
    const n = 120;
    let goals = 0,
      shots = 0,
      passes = 0,
      far = 0,
      ownHalf = 0,
      yellows = 0;
    for (let i = 0; i < n; i++) {
      const { w, home, away } = pairs[i % pairs.length]!;
      const f = { ...w.fixtures[0]!, id: `guards:${i}`, year: 2024, home: home.id, away: away.id };
      const tactics: [Tactic, Tactic] = [TACTICS[i % 4]!, TACTICS[Math.floor(i / 4) % 4]!];
      const { record, diagnostics } = playGrid(
        buildGridSetup(w, f, { observe: false, recordPlayers: false, tactics }),
      );
      goals += record.score.home + record.score.away;
      for (const side of [0, 1] as const) {
        shots += record.metrics[side]![M.shots]!;
        passes += record.metrics[side]![M.passes]!;
        yellows += record.detail![side]![TD.yellowCards]!;
      }
      for (const s of diagnostics.shots) {
        if (Math.hypot(105 - s.x, 34 - s.y) >= 30) far++;
        if (s.x < 52.5) ownHalf++;
      }
    }

    expect(goals / n).toBeGreaterThanOrEqual(2.0);
    expect(goals / n).toBeLessThanOrEqual(3.6);
    expect(shots / n / 2).toBeGreaterThanOrEqual(9);
    expect(shots / n / 2).toBeLessThanOrEqual(17);
    expect(passes / n / 2).toBeGreaterThanOrEqual(350);
    expect(passes / n / 2).toBeLessThanOrEqual(600);
    expect(far / shots).toBeLessThanOrEqual(0.15);
    expect(ownHalf / shots).toBeLessThanOrEqual(0.01);
    expect(yellows / n).toBeGreaterThanOrEqual(2);
    expect(yellows / n).toBeLessThanOrEqual(6);
  });
});
