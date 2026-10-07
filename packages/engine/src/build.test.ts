import { describe, expect, it } from 'vitest';
import type { Fixture, Tactic, World } from '../../contracts/src/types';
import { canonical } from '../../contracts/src/index';
import {
  clubOf,
  createWorld,
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
  opponent.strength = 55;
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
