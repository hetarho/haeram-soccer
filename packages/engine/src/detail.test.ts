import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../contracts/src/detail';
import { validateWorld } from '../../contracts/src/index';
import type { Tactic, World } from '../../contracts/src/types';
import { advanceRound, createWorld } from './index';

function season(tactic: Tactic, seed: string) {
  const w = createWorld({
    country: 'ENG',
    name: 'Detail Athletic',
    color: '#24664f',
    seed,
    difficulty: 1,
  });
  w.tactic = tactic;
  for (let round = 0; round < 46; round++) advanceRound(w, undefined, false);
  return w;
}
const sideOf = (w: World, m: World['ownMatches'][number]) => (m.home === w.playerClub ? 0 : 1);

describe('advanced match counters', () => {
  const w = season('balanced', 'detail-a');

  it('records both sides and every own player on every own match', () => {
    expect(w.ownMatches.length).toBeGreaterThan(40);
    for (const m of w.ownMatches) {
      expect(m.detail).toBeDefined();
      expect(m.players.every((p) => p.detail?.length === 9)).toBe(true);
    }
    validateWorld(w);
  });

  it('keeps the counters consistent with the counts they refine', () => {
    for (const m of w.ownMatches) {
      const side = sideOf(w, m);
      for (const s of [0, 1] as const) {
        const t = m.detail![s],
          row = m.metrics[s];
        expect(t[TD.keyPasses]).toBeLessThanOrEqual(row[4]);
        expect(t[TD.bigChancesScored]).toBeLessThanOrEqual(t[TD.bigChances]);
        expect(t[TD.bigChances]).toBeLessThanOrEqual(t[TD.boxShots]);
        expect(t[TD.finalThirdCompleted]).toBeLessThanOrEqual(t[TD.finalThirdPasses]);
        expect(t[TD.buildUpPasses] + t[TD.finalThirdPasses]).toBe(row[2]);
        expect(t[TD.takeOns]).toBeGreaterThanOrEqual(row[8]);
      }
      const players = m.players;
      const sum = (key: number) => players.reduce((n, p) => n + p.detail![key], 0);
      expect(sum(PD.keyPasses)).toBe(m.detail![side][TD.keyPasses]);
      expect(sum(PD.finalThirdPasses)).toBe(m.detail![side][TD.finalThirdPasses]);
      expect(sum(PD.highTurnovers)).toBe(m.detail![side][TD.highTurnovers]);
      // Every assist comes from a key pass.
      expect(players.reduce((n, p) => n + p.metrics[1], 0)).toBeLessThanOrEqual(sum(PD.keyPasses));
    }
  });

  it('leaves some shots unassisted, as solo runs are', () => {
    const shots = w.ownMatches.reduce((n, m) => n + m.metrics[sideOf(w, m)][4], 0);
    const keyPasses = w.ownMatches.reduce((n, m) => n + m.detail![sideOf(w, m)][TD.keyPasses], 0);
    expect(keyPasses).toBeLessThan(shots);
    expect(keyPasses / shots).toBeGreaterThan(0.6);
  });

  it('shows pressing as a lower PPDA than a low block over a season', () => {
    const ppda = (world: World) => {
      let passes = 0,
        actions = 0;
      for (const m of world.ownMatches) {
        const side = sideOf(world, m);
        passes += m.detail![side === 0 ? 1 : 0][TD.buildUpPasses];
        actions += m.detail![side][TD.pressActions];
      }
      return passes / actions;
    };
    expect(ppda(season('press', 'detail-b'))).toBeLessThan(ppda(season('counter', 'detail-b')));
  });
});
