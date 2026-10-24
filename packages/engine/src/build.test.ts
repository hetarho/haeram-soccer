import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  BUILD_PRESETS,
  createWorld,
  operate,
  fatigueCost,
  recordMatch,
  simulateMatch,
  TACTICS,
} from './index';
import { DISABLED_RELEASE } from '../../../tests/fixtures/worlds';
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

  it('keeps seeded football facts identical with observation and manual preparation', () => {
    const { w, fixture } = scenario(baseline, 'press', DISABLED_RELEASE);
    for (const tactic of TACTICS) {
      w.tactic = tactic;
      const fast = simulateMatch(w, fixture, false, true);
      const observed = simulateMatch(w, fixture, true);
      expect(canonical(observed.record)).toBe(canonical(fast.record));
      expect(observed.squads[0].slice(0, 11).map((player) => player.id)).toEqual(w.lineup);
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

describe('the operating strategy applied at once (→ECON-22)', () => {
  const club = (day: number) => {
    const w = createWorld(
      {
        country: 'ENG',
        name: 'Strategy Lockers',
        color: '#445566',
        seed: 'strategy-locks',
        level: 'normal' as const,
      },
      DISABLED_RELEASE,
    );
    w.calendar = { day };
    return w;
  };

  it('applies a strategy at once, and the next one too: cards change at any time', () => {
    const w = club(10);
    operate(w, { type: 'build', build: { youth: 'homegrown', fans: 'community' } });
    expect(w.build).toEqual({ youth: 'homegrown', fans: 'community' });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'build',
      title: '방향 · 맞춤 방향',
      detail: '성골 유스 · 지역 밀착',
    });
    // The very next day a preset replaces every card it names; no slot waits.
    w.calendar = { day: 11 };
    const preset = BUILD_PRESETS.find((p) => p.id === 'commercial')!;
    operate(w, { type: 'build', build: preset.build });
    expect(w.build).toEqual(preset.build);
    operate(w, { type: 'build', build: {} });
    expect(w.build).toBeUndefined();
    expect('buildChanged' in w).toBe(false);
    // Re-sending the strategy in force is no change.
    const before = canonical({ ...w, revision: 0 });
    operate(w, { type: 'build', build: {} });
    expect(canonical({ ...w, revision: 0 })).toBe(before);
  });
});
