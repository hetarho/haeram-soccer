import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { COUNTRIES } from '../../catalogs/src/index';
import { validateWorld } from '../../contracts/src/schema';
import { canonical } from '../../contracts/src/index';
import {
  createWorld,
  simulateSeason,
  fixturesFor,
  simulateMatch,
  advanceRound,
  clubOf,
  recordMatch,
} from './index';
const input = {
  country: 'ENG' as const,
  name: 'Haeram Forge',
  color: '#24664f',
  seed: 'portable-world-1',
  difficulty: 1,
};
function assertCapacities(w: ReturnType<typeof createWorld>) {
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
describe('world progression', () => {
  it('uses capital alone for difficulty and reserves the player slot', () => {
    const a = createWorld(input),
      b = createWorld({ ...input, difficulty: 2 });
    assertCapacities(a);
    expect(b.clubs).toEqual(a.clubs);
    expect(b.players).toEqual(a.players);
    expect(BigInt(b.cash)).toBe(BigInt(a.cash) * 2n);
    expect(validateWorld(a).id).toBe(a.id);
  });
  it('schedules every ordered home/away pair once including odd groups', () =>
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 24 }), (n) => {
        const w = createWorld(input);
        const f = fixturesFor(w.clubs.slice(0, n), 1901);
        expect(f).toHaveLength(n * (n - 1));
        expect(new Set(f.map((m) => m.home + ':' + m.away)).size).toBe(f.length);
        const slots = new Set<string>();
        for (const m of f) {
          for (const club of [m.home, m.away]) {
            expect(slots.has(m.round + ':' + club)).toBe(false);
            slots.add(m.round + ':' + club);
          }
        }
        return true;
      }),
      { numRuns: 12 },
    ));
  it('observed and fast outcomes agree and all metric totals are event-backed', () => {
    const w = createWorld(input),
      f = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
    const fast = simulateMatch(w, f, false, true),
      observed = simulateMatch(w, f, true, true);
    expect(fast.record).toEqual(observed.record);
    expect(observed.frames.at(-1)!.score).toEqual(observed.record.score);
    expect(observed.frames).toHaveLength(90);
    for (let side = 0; side < 2; side++) {
      const ids = new Set(observed.squads[side].map((p) => p.id));
      const goals = observed.record.players
        .filter((p) => ids.has(p.id))
        .reduce((s, p) => s + p.metrics[0], 0);
      expect(goals).toBe(side === 0 ? observed.record.score.home : observed.record.score.away);
      expect(observed.record.metrics[side][3]).toBeLessThanOrEqual(
        observed.record.metrics[side][2],
      );
    }
  });
  it('conserves league capacities across promotions and retains records', () => {
    const w = createWorld(input);
    for (let i = 0; i < 4; i++) {
      simulateSeason(w);
      assertCapacities(w);
      validateWorld(w);
    }
    expect(new Set(w.ownMatches.map((m) => m.id)).size).toBe(w.ownMatches.length);
    expect(w.ownMatches.length).toBeLessThan(300);
    expect(w.history).toHaveLength(4);
    expect(w.ownMatches.length).toBeGreaterThan(100);
    expect(w.year).toBe(1905);
    expect(w.history[0].year).toBe(1901);
  });
  it('settles an owned fixture once and bounds its audience', () => {
    const w = createWorld(input);
    clubOf(w).fans = 5000000;
    const f = w.fixtures.find((f) => f.home === w.playerClub)!;
    const p = simulateMatch(w, f, false, true);
    recordMatch(w, p, true);
    const snapshot = canonical(w);
    recordMatch(w, p, true);
    expect(canonical(w)).toBe(snapshot);
    expect(clubOf(w).fans).toBeLessThanOrEqual(5000000);
  });
  it('replays commands deterministically without browser time', () => {
    const a = createWorld(input),
      b = createWorld(input);
    advanceRound(a);
    advanceRound(b);
    expect(canonical(a)).toBe(canonical(b));
    expect(clubOf(a).name).toBe(input.name);
  });
});
it('never assigns the single goal scorer an assist for the same goal', () => {
  let checked = 0;
  for (let n = 0; n < 24; n++) {
    const w = createWorld({ ...input, seed: `assist-rule-${n}` });
    const f = w.fixtures.find((f) => f.home === w.playerClub)!;
    const p = simulateMatch(w, f, false, true);
    for (const [side, score] of [
      [0, p.record.score.home],
      [1, p.record.score.away],
    ])
      if (score === 1) {
        const ids = new Set(p.squads[side].map((player) => player.id));
        const scorer = p.record.players.find(
          (player) => ids.has(player.id) && player.metrics[0] === 1,
        )!;
        expect(scorer.metrics[1]).toBe(0);
        checked++;
      }
  }
  expect(checked).toBeGreaterThan(0);
});
