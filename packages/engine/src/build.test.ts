import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { fatigueCost, ownStarters, recordMatch, simulateMatch, TACTICS } from './index';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { baseline, sample, scenario } from './build.testkit';

// Tactical builds on the pre-feature path, as build.tradeoffs guards them (T419).
describe('tactical roster tradeoffs', () => {
  it('turns midfield passing into actual possession and pass completion', () => {
    const weak = scenario({ ...baseline, passing: 20 }, 'balanced', DISABLED_RELEASE);
    const strong = scenario({ ...baseline, passing: 95 }, 'balanced', DISABLED_RELEASE);
    const low = sample(weak.w, weak.fixture, 'possession');
    const high = sample(strong.w, strong.fixture, 'possession');
    expect(high.possession).toBeGreaterThan(low.possession);
    expect(high.passes / high.attempts).toBeGreaterThan(low.passes / low.attempts);
  });

  it('uses defender quality to suppress actual opposing shot creation', () => {
    const weak = scenario({ ...baseline, defense: 20 }, 'balanced', DISABLED_RELEASE);
    const strong = scenario({ ...baseline, defense: 95 }, 'balanced', DISABLED_RELEASE);
    expect(sample(strong.w, strong.fixture, 'balanced').concededShots).toBeLessThan(
      sample(weak.w, weak.fixture, 'balanced').concededShots,
    );
  });

  it('gives pressing a strictly higher bounded fatigue cost at every stamina level', () => {
    for (let stamina = 0; stamina <= 100; stamina++) {
      const press = fatigueCost({ attrs: { stamina } }, 'press');
      expect(press).toBeGreaterThanOrEqual(14);
      expect(press).toBeLessThanOrEqual(19);
      for (const tactic of TACTICS.filter((value) => value !== 'press')) {
        const ordinary = fatigueCost({ attrs: { stamina } }, tactic);
        expect(ordinary).toBeGreaterThanOrEqual(8);
        expect(ordinary).toBeLessThanOrEqual(13);
        expect(press).toBe(ordinary + 6);
      }
    }
    expect(fatigueCost({ attrs: { stamina: 95 } }, 'press')).toBeLessThan(
      fatigueCost({ attrs: { stamina: 20 } }, 'press'),
    );
  });

  it('keeps seeded football facts identical with observation', () => {
    const { w, fixture } = scenario(baseline, 'press', DISABLED_RELEASE);
    for (const tactic of TACTICS) {
      w.tactic = tactic;
      const fast = simulateMatch(w, fixture, false, true);
      const observed = simulateMatch(w, fixture, true);
      expect(canonical(observed.record)).toBe(canonical(fast.record));
      expect(observed.squads[0].slice(0, 11).map((player) => player.id)).toEqual(
        ownStarters(w, fixture).map((player) => player.id),
      );
      expect(observed.record.tactics).toEqual([tactic, 'press']);
    }
  });

  it('settles recorded tactic fatigue and leaves past match facts unchanged by later builds', () => {
    const { w, fixture } = scenario(baseline, 'balanced', DISABLED_RELEASE);
    w.tactic = 'press';
    const match = simulateMatch(w, fixture, false, true);
    w.tactic = 'balanced';
    const first = match.squads[0][0];
    const cost = fatigueCost(first, 'press');
    recordMatch(w, match);
    expect(first.fatigue).toBe(cost);
    const saved = canonical(w.ownMatches[0]);
    w.tactic = 'counter';
    w.players.forEach((player) => {
      player.attrs.passing = 95;
      player.attrs.tackling = 95;
    });
    simulateMatch(w, { ...fixture, id: 'later-build' }, false, true);
    expect(canonical(w.ownMatches[0])).toBe(saved);
  });
});
