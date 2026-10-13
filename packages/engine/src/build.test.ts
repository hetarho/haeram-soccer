import { describe, expect, it } from 'vitest';
import type { Fixture, Tactic, World } from '../../contracts/src/types';
import { canonical } from '../../contracts/src/index';
import {
  BUILD_LOCK_DAYS,
  BUILD_PRESETS,
  clubOf,
  createWorld,
  draftLock,
  operate,
  seasonDayLabel,
  slotLocks,
  fatigueCost,
  npcTactic,
  recordMatch,
  setLineup,
  simulateMatch,
  startingSquad,
  tacticalProfile,
  TACTICS,
} from './index';

interface Build {
  passing: number;
  defense: number;
  attack: number;
  stamina: number;
  fatigue?: number;
}

function scenario(build: Build, opponentTactic: Tactic = 'balanced') {
  const w = createWorld({
    country: 'ENG',
    name: 'Build Laboratory',
    color: '#112233',
    seed: 'build-samples',
    difficulty: 1,
  });
  w.manager.ability = 50;
  for (const player of w.players) {
    player.attack = player.role === 'FWD' ? build.attack : 55;
    player.passing = player.role === 'MID' ? build.passing : 55;
    player.defense = player.role === 'DEF' ? build.defense : 55;
    player.keeper = 55;
    player.stamina = build.stamina;
    player.fatigue = build.fatigue || 0;
  }
  // Every preset uses exactly this XI, so comparisons cannot select different players.
  setLineup(
    w,
    startingSquad(w, clubOf(w)).map((player) => player.id),
  );
  const opponent = w.clubs.find(
    (club) => club.id !== w.playerClub && npcTactic(club) === opponentTactic,
  )!;
  // Generated squads rate about five above their club strength; 50 fields an XI rated like ours.
  opponent.strength = 50;
  const fixture: Fixture = {
    id: 'build-fixture',
    year: w.year,
    round: 1,
    kind: 'league',
    home: w.playerClub,
    away: opponent.id,
    country: 'ENG',
    groupKey: 'sample',
  };
  return { w, fixture };
}

function sample(w: World, fixture: Fixture, tactic: Tactic, count = 160) {
  w.tactic = tactic;
  const totals = { margin: 0, shots: 0, concededShots: 0, possession: 0, passes: 0, attempts: 0 };
  for (let index = 0; index < count; index++) {
    const match = simulateMatch(w, { ...fixture, id: `sample:${index}` }).record;
    totals.margin += match.score.home - match.score.away;
    totals.shots += match.metrics[0][4];
    totals.concededShots += match.metrics[1][4];
    totals.possession += match.metrics[0][11];
    totals.passes += match.metrics[0][3];
    totals.attempts += match.metrics[0][2];
  }
  return totals;
}

const baseline: Build = { passing: 55, defense: 55, attack: 55, stamina: 55 };

describe('tactical roster tradeoffs', () => {
  it('turns midfield passing into actual possession and pass completion', () => {
    const weak = scenario({ ...baseline, passing: 20 });
    const strong = scenario({ ...baseline, passing: 95 });
    const low = sample(weak.w, weak.fixture, 'possession');
    const high = sample(strong.w, strong.fixture, 'possession');
    expect(high.possession).toBeGreaterThan(low.possession);
    expect(high.passes / high.attempts).toBeGreaterThan(low.passes / low.attempts);
  });

  it('uses defender quality to suppress actual opposing shot creation', () => {
    const weak = scenario({ ...baseline, defense: 20 });
    const strong = scenario({ ...baseline, defense: 95 });
    expect(sample(strong.w, strong.fixture, 'balanced').concededShots).toBeLessThan(
      sample(weak.w, weak.fixture, 'balanced').concededShots,
    );
  });

  it('requires fresh stamina for effective pressing instead of granting free chances', () => {
    const weak = scenario({ ...baseline, stamina: 20 }, 'possession');
    const strong = scenario({ ...baseline, stamina: 95 }, 'possession');
    const tired = scenario({ ...baseline, stamina: 95, fatigue: 90 }, 'possession');
    const freshShots = sample(strong.w, strong.fixture, 'press').shots;
    expect(freshShots).toBeGreaterThan(sample(weak.w, weak.fixture, 'press').shots);
    expect(freshShots).toBeGreaterThan(sample(tired.w, tired.fixture, 'press').shots);
    const players = startingSquad(strong.w, clubOf(strong.w));
    const pressed = tacticalProfile(players, 'press', 'counter');
    const balanced = tacticalProfile(players, 'balanced', 'counter');
    expect(pressed.defense).toBeLessThan(balanced.defense);
    expect(pressed.shot).toBeLessThan(tacticalProfile(players, 'press', 'possession').shot);
  });

  it.each([
    {
      name: 'passing midfield against balanced opponents',
      build: { passing: 95, defense: 55, attack: 55, stamina: 35 },
      opponent: 'balanced' as const,
      preferred: 'possession' as const,
    },
    {
      name: 'defenders and finishers against pressing opponents',
      build: { passing: 25, defense: 95, attack: 95, stamina: 35 },
      opponent: 'press' as const,
      preferred: 'counter' as const,
    },
    {
      name: 'fresh high-stamina players against possession opponents',
      build: { passing: 55, defense: 50, attack: 75, stamina: 95 },
      opponent: 'possession' as const,
      preferred: 'press' as const,
    },
    {
      name: 'tired players exposed to counterattacks',
      build: { passing: 55, defense: 55, attack: 65, stamina: 55, fatigue: 80 },
      opponent: 'counter' as const,
      preferred: 'balanced' as const,
    },
  ])('favors a different tradeoff for $name', ({ build, opponent, preferred }) => {
    const { w, fixture } = scenario(build, opponent);
    const outcomes = TACTICS.map((tactic) => ({ tactic, ...sample(w, fixture, tactic) }));
    const winner = outcomes.find((outcome) => outcome.tactic === preferred)!;
    for (const alternative of outcomes.filter((outcome) => outcome.tactic !== preferred))
      expect(winner.margin).toBeGreaterThan(alternative.margin);
  });

  it('gives pressing a strictly higher bounded fatigue cost at every stamina level', () => {
    for (let stamina = 0; stamina <= 100; stamina++) {
      const press = fatigueCost({ stamina }, 'press');
      expect(press).toBeGreaterThanOrEqual(14);
      expect(press).toBeLessThanOrEqual(19);
      for (const tactic of TACTICS.filter((value) => value !== 'press')) {
        const ordinary = fatigueCost({ stamina }, tactic);
        expect(ordinary).toBeGreaterThanOrEqual(8);
        expect(ordinary).toBeLessThanOrEqual(13);
        expect(press).toBe(ordinary + 6);
      }
    }
    expect(fatigueCost({ stamina: 95 }, 'press')).toBeLessThan(
      fatigueCost({ stamina: 20 }, 'press'),
    );
  });

  it('keeps seeded football facts identical with observation and manual preparation', () => {
    const { w, fixture } = scenario(baseline, 'press');
    for (const tactic of TACTICS) {
      w.tactic = tactic;
      const fast = simulateMatch(w, fixture, false, true);
      const observed = simulateMatch(w, fixture, true);
      expect(canonical(observed.record)).toBe(canonical(fast.record));
      expect(observed.squads[0].map((player) => player.id)).toEqual(w.lineup);
      expect(observed.record.tactics).toEqual([tactic, 'press']);
    }
  });

  it('settles recorded tactic fatigue and leaves past match facts unchanged by later builds', () => {
    const { w, fixture } = scenario(baseline);
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
      player.passing = 95;
      player.defense = 95;
    });
    simulateMatch(w, { ...fixture, id: 'later-build' }, false, true);
    expect(canonical(w.ownMatches[0])).toBe(saved);
  });
});

describe('the operating strategy applied at once (→ECON-22)', () => {
  const club = (day: number) => {
    const w = createWorld({
      country: 'ENG',
      name: 'Strategy Lockers',
      color: '#445566',
      seed: 'strategy-locks',
      difficulty: 1,
    });
    w.calendar = { day };
    return w;
  };

  it('applies a strategy at once and locks each changed slot for 90 days', () => {
    const w = club(10);
    operate(w, { type: 'build', build: { youth: 'homegrown', fans: 'community' } });
    expect(w.build).toEqual({ youth: 'homegrown', fans: 'community' });
    expect(w.buildChanged).toEqual({
      youth: { year: w.year, day: 10 },
      fans: { year: w.year, day: 10 },
    });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'build',
      title: '운영 전략 · 맞춤 전략',
      detail: '성골 유스 · 지역 밀착',
    });
    const frees = seasonDayLabel(w.year, 10 + BUILD_LOCK_DAYS);
    expect(slotLocks(w)).toEqual([
      { slot: 'youth', label: '유스 정책', daysLeft: 90, frees },
      { slot: 'fans', label: '홈·팬', daysLeft: 90, frees },
    ]);
    // A free slot changes at once while the locked ones keep their cards; its own lock starts.
    w.calendar = { day: 40 };
    operate(w, {
      type: 'build',
      build: { youth: 'homegrown', fans: 'community', scouting: 'data' },
    });
    expect(w.build).toEqual({ youth: 'homegrown', fans: 'community', scouting: 'data' });
    expect(slotLocks(w).map((lock) => [lock.slot, lock.daysLeft])).toEqual([
      ['youth', 60],
      ['scouting', 90],
      ['fans', 60],
    ]);
    // Day 100 frees the first two; a later change keeps only the lock still running.
    w.calendar = { day: 100 };
    expect(slotLocks(w).map((lock) => lock.slot)).toEqual(['scouting']);
    operate(w, { type: 'build', build: { scouting: 'data' } });
    expect(w.build).toEqual({ scouting: 'data' });
    expect(w.buildChanged).toEqual({
      youth: { year: w.year, day: 100 },
      scouting: { year: w.year, day: 40 },
      fans: { year: w.year, day: 100 },
    });
  });

  it('refuses a draft that changes a locked slot, naming the slot and the day it frees', () => {
    const w = club(10);
    operate(w, { type: 'build', build: { youth: 'homegrown' } });
    w.calendar = { day: 50 };
    const message = `유스 정책 카드는 최근에 바꿔 ${seasonDayLabel(w.year, 100)}부터 다시 바꿀 수 있어요.`;
    expect(draftLock(w, {})).toBe(message);
    expect(draftLock(w, { youth: 'homegrown', culture: 'family' })).toBeUndefined();
    const before = canonical(w);
    expect(() => operate(w, { type: 'build', build: { youth: 'pathway' } })).toThrow(message);
    // A preset applies only when every slot it changes is free.
    const preset = BUILD_PRESETS.find((p) => p.id === 'commercial')!;
    expect(() => operate(w, { type: 'build', build: preset.build })).toThrow('유스 정책');
    expect(canonical(w)).toBe(before);
    // Re-sending the strategy in force is no change and never refused.
    operate(w, { type: 'build', build: { youth: 'homegrown' } });
    expect(canonical({ ...w, revision: 0 })).toBe(
      canonical({ ...JSON.parse(before), revision: 0 }),
    );
  });

  it("a slot frees after 90 days across a season's turn", () => {
    const w = club(300);
    const year = w.year;
    operate(w, { type: 'build', build: { culture: 'family' } });
    // The season closes and the next starts on 1 August; the lock counts on from the change.
    w.year = year + 1;
    w.calendar = { day: 0 };
    const left = 300 + BUILD_LOCK_DAYS - 365;
    expect(slotLocks(w)).toEqual([
      {
        slot: 'culture',
        label: '라커룸 문화',
        daysLeft: left,
        frees: seasonDayLabel(w.year, left),
      },
    ]);
    expect(() => operate(w, { type: 'build', build: {} })).toThrow('라커룸 문화');
    w.calendar = { day: left - 1 };
    expect(draftLock(w, {})).toContain('라커룸 문화');
    w.calendar = { day: left };
    expect(slotLocks(w)).toEqual([]);
    operate(w, { type: 'build', build: {} });
    expect(w.build).toBeUndefined();
    expect(w.buildChanged).toEqual({ culture: { year: year + 1, day: left } });
  });
});
