import { afterAll, describe, expect, it } from 'vitest';
import { startFlight } from './ball';
import { STAGING_CONFIG } from './config';
import { stageFixture } from './input';
import { speedAt } from './motion';
import { nominalSpot } from './places';
import { formedStage, formationSides, freezeOthers } from './tactics.testkit';
import { isPressRole, positionsOf, step } from './world';
import { dist, len } from './vec';

const tick = STAGING_CONFIG.tick;
const measured: Record<string, unknown> = {};
afterAll(() => console.info('T829 tendencies', JSON.stringify(measured)));

describe('staged tendencies on identical small scripts', () => {
  it('better anticipation reads the same pass sooner', () => {
    const first = [0, 100].map((anticipation) => {
      const sides = formationSides('possession');
      sides[0].players[6].anticipation = anticipation;
      const s = formedStage(sides);
      freezeOthers(s, [6]);
      const at = [...s.bodies[6].pos] as const;
      startFlight(s, [75, 55], 16, false);
      for (let i = 0; i < 20; i++) {
        step(s);
        if (dist(s.bodies[6].pos, at) > 0.03) return s.t;
      }
      return Infinity;
    });
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first[1]).toBeLessThan(first[0]);
    measured.firstStepSeconds = first;
  });

  it('more discipline strays less from his place', () => {
    const means = [0, 100].map((discipline) => {
      const sides = formationSides('possession');
      sides[0].players[6].discipline = discipline;
      const s = formedStage(sides);
      freezeOthers(s, [6]);
      let total = 0;
      for (let i = 0; i < 32 / tick; i++) {
        if (i % 80 === 0) startFlight(s, i % 160 === 0 ? [55, 30] : [35, 10], 16, false);
        step(s);
        const target = nominalSpot(
          {
            fixture: s.fixture,
            ball: s.ball.flight!.to,
            team: s.team,
            phase: s.phase,
            positions: positionsOf(s),
          },
          6,
        );
        total += dist(s.bodies[6].pos, target);
      }
      return total / (32 / tick);
    });
    expect(means[1]).toBeLessThan(means[0]);
    measured.meanPlaceMetres = means;
  });

  it('more pressing goes to the ball from further', () => {
    const reads = [0, 100].map((pressing) => {
      const sides = formationSides('counter');
      sides[0].players[6].pressing = pressing;
      const s = formedStage(sides, [50, 34], 1);
      freezeOthers(s, [6]);
      s.bodies[6].pos = [32, 34];
      const snapshot = positionsOf(s);
      const presses = isPressRole(s, 0, 6, snapshot);
      const start = dist(s.bodies[6].pos, s.ball.pos);
      for (let i = 0; i < 10; i++) step(s);
      return { presses, closed: start - dist(s.bodies[6].pos, s.ball.pos) };
    });
    expect(reads.map((r) => r.presses)).toEqual([false, true]);
    expect(reads[1].closed).toBeGreaterThan(reads[0].closed);
    measured.pressingAt18Metres = reads;
  });

  it("more freedom takes a role's habit further from the slot", () => {
    const stages = [0, 50, 100].map((freedom) => {
      const sides = formationSides('possession');
      sides[0].players[1].freedom = freedom;
      return formedStage(sides, [60, 34]);
    });
    const places = stages.map((s) =>
      nominalSpot(
        {
          fixture: s.fixture,
          ball: s.ball.pos,
          team: s.team,
          phase: s.phase,
          positions: positionsOf(s),
        },
        1,
      ),
    );
    expect(dist(places[0], places[1])).toBeGreaterThan(10);
    expect(dist(places[0], places[2])).toBeCloseTo(dist(places[0], places[1]) * 1.3, 10);
    measured.roleMetresFromAnchor = places.map((p) => dist(places[0], p));
    for (const s of stages) {
      freezeOthers(s, [1]);
      for (let i = 0; i < 10 / tick; i++) step(s);
    }
    expect(dist(stages[2].bodies[1].pos, places[0])).toBeGreaterThan(
      dist(stages[1].bodies[1].pos, places[0]),
    );
  });

  it('a faster player covers the same run sooner and nobody exceeds his own top speed', () => {
    const runs = [0, 100].map((pace) => {
      const sides = formationSides('possession');
      sides[0].players[6].pace = pace;
      const s = formedStage(sides);
      s.bodies[6].pos = [20, 34];
      freezeOthers(s, [6]);
      s.orders.set(6, { target: [85, 34], pace: 'sprint' });
      for (let i = 0; i < 250; i++) {
        const before = [...s.bodies[6].pos] as const;
        const top = speedAt(s, 6, 'sprint');
        step(s);
        expect(dist(before, s.bodies[6].pos)).toBeLessThanOrEqual(top * tick + 1e-9);
        expect(len(s.bodies[6].vel)).toBeLessThanOrEqual(top + 1e-9);
        if (dist(s.bodies[6].pos, [85, 34]) < 0.3) return s.t;
      }
      return Infinity;
    });
    expect(runs.every(Number.isFinite)).toBe(true);
    expect(runs[1]).toBeLessThan(runs[0]);
    measured.run65MetresSeconds = runs;
  });

  it('tired legs are slower late in the match, carrying included', () => {
    const runs = [0, 90 * 60].map((clock) => {
      const s = formedStage(formationSides('possession'));
      s.clock = clock;
      s.clockCap = Infinity;
      freezeOthers(s, [6]);
      s.bodies[6].pos = [20, 34];
      s.orders.set(6, { target: [85, 34], pace: 'sprint', speedCap: 5 });
      const speed = speedAt(s, 6, 'sprint', 5);
      for (let i = 0; i < 60; i++) step(s);
      return { speed, distance: s.bodies[6].pos[0] - 20 };
    });
    expect(runs[1].speed).toBeCloseTo(runs[0].speed * 0.92, 10);
    expect(runs[1].distance).toBeLessThan(runs[0].distance);
    measured.carry6Seconds = runs;
  });

  it('pace is normalized over both outfield sides, and equal paces stay neutral', () => {
    const sides = formationSides('balanced', 'press');
    expect(stageFixture(sides).players.every((p) => p.paceScale === 1)).toBe(true);
    sides[0].players[1].pace = 20;
    sides[1].players[10].pace = 80;
    sides[0].players[0].pace = 1;
    const fixture = stageFixture(sides);
    expect(fixture.players[1].paceScale).toBeCloseTo(0.85);
    expect(fixture.players[21].paceScale).toBeCloseTo(1.15);
    expect(fixture.players[0].paceScale).toBe(1);
  });
});
