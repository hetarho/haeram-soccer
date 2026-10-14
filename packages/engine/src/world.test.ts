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
  operate,
  FOUNDING_YEAR,
  activePlayers,
  clubStyle,
  DIFFICULTY_LEVELS,
  formationOf,
  LEVEL_CASH,
  LEVEL_OFFSET,
  npcSquad,
  rating,
} from './index';
import type { World } from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { LINE_MINIMUM, lineOf, ovrAt } from './player';
const input = {
  country: 'ENG' as const,
  name: 'Haeram Forge',
  color: '#24664f',
  seed: 'portable-world-1',
  level: 'normal' as const,
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
  it('level offsets the founding XI and scales only the cash', () => {
    const at = (level: 'easy' | 'normal' | 'hard' | 'extreme') => createWorld({ ...input, level });
    const normal = at('normal');
    assertCapacities(normal);
    expect(validateWorld(normal).id).toBe(normal.id);
    const others = (w: World) => w.clubs.filter((club) => club.id !== w.playerClub);
    const own = (w: World) => rating(w, clubOf(w));
    const league = (w: World) => {
      const peers = w.clubs.filter(
        (club) =>
          club.country === clubOf(w).country && club.representative && club.tier === clubOf(w).tier,
      );
      return peers.reduce((sum, club) => sum + rating(w, club), 0) / peers.length;
    };
    for (const level of DIFFICULTY_LEVELS) {
      const w = at(level);
      expect(w.level).toBe(level);
      // Every rule and every other club stay as they are; only cash and the XI move (→WEB-3).
      expect(others(w)).toEqual(others(normal));
      expect(Math.abs(own(w) - (league(w) + LEVEL_OFFSET[level]))).toBeLessThanOrEqual(1.5);
    }
    // Cash is the founding budget times the level's multiple (2/1/0.5/0.25).
    expect(LEVEL_CASH).toEqual({ easy: 2, normal: 1, hard: 0.5, extreme: 0.25 });
    expect(BigInt(at('easy').cash)).toBeGreaterThan(BigInt(normal.cash));
    expect(BigInt(at('extreme').cash)).toBeLessThan(BigInt(at('hard').cash));
  });
  it('founding squad covers the formation', () => {
    for (const seed of ['cover-1', 'cover-2', 'cover-3', 'cover-4', 'cover-5']) {
      const w = createWorld({ ...input, seed });
      const active = activePlayers(w);
      expect(active).toHaveLength(18);
      for (const line of LINES)
        expect(active.filter((p) => lineOf(p.position) === line)).toHaveLength(LINE_MINIMUM[line]);
      for (const slot of formationOf(w.tactic))
        expect(active.some((p) => (p.positions[slot.position] ?? 0) >= 2)).toBe(true);
      expect(active.every((p) => p.adaptation === 0.8)).toBe(true);
    }
  });
  it('npc squad fills the formation', () => {
    const w = createWorld(input);
    for (const club of w.clubs.filter((c) => c.id !== w.playerClub).slice(0, 40)) {
      const squad = npcSquad(w.seed, w.year, club),
        slots = formationOf(clubStyle(club));
      expect(squad).toHaveLength(18);
      slots.forEach((slot, i) => {
        expect(squad[i]!.position).toBe(slot.position);
        expect(squad[i]!.positions[slot.position]).toBe(3);
        expect(
          Math.abs(ovrAt(squad[i]!.attrs, slot.position, slot.role) - club.strength),
        ).toBeLessThanOrEqual(1.5);
      });
      for (const line of LINES)
        expect(squad.filter((p) => lineOf(p.position) === line)).toHaveLength(LINE_MINIMUM[line]);
    }
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
    for (const season of w.history) {
      const leagueMatches = w.ownMatches.filter(
        (match) => match.year === season.year && ['league', 'lower'].includes(match.kind),
      );
      expect(leagueMatches).toHaveLength(season.played);
      expect(
        leagueMatches.reduce(
          (sum, match) => sum + (match.home === w.playerClub ? match.score.home : match.score.away),
          0,
        ),
      ).toBe(season.gf);
    }
    expect(w.year).toBe(FOUNDING_YEAR + 4);
    expect(w.history[0].year).toBe(FOUNDING_YEAR);
  });
  it('replaces retiring goalkeepers even when the remaining squad exceeds 18 players', () => {
    const w = createWorld(input);
    w.cash = '999999999';
    for (const p of w.players) p.born = w.year - (p.position === 'GK' ? 35 : 21);
    for (const candidate of [1, 2, 3, 5, 6, 7]) operate(w, { type: 'recruit', candidate });
    simulateSeason(w);
    const active = w.players.filter((p) => p.status === 'active');
    expect(active.length).toBeGreaterThan(18);
    expect(active.some((p) => p.position === 'GK')).toBe(true);
    expect(validateWorld(w).id).toBe(w.id);
  });
  it('settles an owned fixture once and lets supporters grow past any ceiling', () => {
    const w = createWorld(input);
    clubOf(w).fans = 5000000;
    const f = w.fixtures.find((f) => f.home === w.playerClub)!;
    const p = simulateMatch(w, f, false, true);
    recordMatch(w, p, true);
    const snapshot = canonical(w);
    recordMatch(w, p, true);
    expect(canonical(w)).toBe(snapshot);
    // A win draws a few more supporters even past five million (→ECON-23).
    expect(clubOf(w).fans).toBeGreaterThanOrEqual(5000000 * (1 - 0.001));
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
