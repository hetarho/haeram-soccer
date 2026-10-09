import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, Role, World } from '../../contracts/src/types';
import {
  ACADEMY_LIMIT,
  ACADEMY_READINESS_LABEL,
  academyIntakeDay,
  academyIntakeSize,
  academyPlayers,
  academySummary,
  activePlayers,
  advanceRound,
  basicStaff,
  createWorld,
  developAcademy,
  makePlayer,
  operate,
  overall,
  promoteYouth,
  releaseYouth,
  runAcademyIntake,
  seasonAcademy,
  settleTraining,
  simulateSeason,
} from './index';

function world(seed = 'youth-academy') {
  const w = createWorld({
    country: 'ENG',
    name: 'Nursery End',
    color: '#556b2f',
    seed,
    difficulty: 2,
  });
  w.cash = '999999999';
  return w;
}

/** Runs the intake as the daily club business would on 15 March. */
function intake(w: World) {
  w.calendar = { day: academyIntakeDay(w) };
  runAcademyIntake(w);
  return academyPlayers(w);
}

function director(w: World, ability: number, trait?: 'developer' | 'spotter') {
  w.staff = (w.staff || basicStaff(w)).map((member) =>
    member.role === 'youth' ? { ...member, ability, ...(trait ? { trait } : {}) } : member,
  );
  return w;
}

let serial = 0;
/** A hand-made prospect whose overall equals `skill`. */
function prospect(w: World, role: Role, age: number, skill: number): Player {
  const player = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:academy:test:${serial++}`,
    w.year,
    30,
    role,
    age,
  );
  player.attack = player.passing = player.defense = player.stamina = skill;
  player.keeper = role === 'GK' ? skill : 10;
  player.potential = Math.max(skill, 80);
  player.wage = '0';
  w.academy = { ...w.academy, players: [...academyPlayers(w), player] };
  return player;
}

describe('youth academy intake', () => {
  it('admits one seeded class per season on 15 March with academy ids, ages and no wages', () => {
    const w = world();
    w.calendar = { day: academyIntakeDay(w) - 1 };
    runAcademyIntake(w);
    expect(academyPlayers(w)).toEqual([]);
    const players = intake(w);
    expect(players).toHaveLength(3);
    players.forEach((player, i) => {
      expect(player.id).toBe(`${w.playerClub}:academy:${w.year}:${i}`);
      expect(w.year - player.born).toBeGreaterThanOrEqual(15);
      expect(w.year - player.born).toBeLessThanOrEqual(16);
      expect(player.wage).toBe('0');
      expect(player.potential).toBeGreaterThanOrEqual(overall(player));
      expect(player.potential).toBeLessThanOrEqual(99);
      expect(overall(player)).toBeLessThan(60);
    });
    expect(new Set(players.map((player) => player.role)).size).toBe(3);
    expect(w.academy!.intakeYear).toBe(w.year);
    const before = canonical(w.academy),
      inbox = w.inbox!.length;
    w.calendar = { day: academyIntakeDay(w) + 20 };
    runAcademyIntake(w);
    expect(canonical(w.academy)).toBe(before);
    expect(w.inbox).toHaveLength(inbox);
    expect(w.events.filter((event) => event.kind === 'youth-intake')).toHaveLength(1);
    const best = [...players].sort((a, b) => b.potential - a.potential)[0];
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'youth-intake', attention: true, ref: best.id });
    expect(w.inbox!.at(-1)!.detail).toContain(best.name);
    expect(canonical(intake(world()))).toBe(canonical(players));
  });

  it('grows the class with a strong youth director and facilities, and its quality with a spotter', () => {
    expect(academyIntakeSize(world())).toBe(3);
    expect(academyIntakeSize(director(world(), 70))).toBe(4);
    const big = director(world(), 75);
    big.facilities = 4;
    expect(academyIntakeSize(big)).toBe(5);
    expect(intake(big)).toHaveLength(5);
    const average = (players: Player[]) =>
      players.reduce((sum, player) => sum + player.potential, 0) / players.length;
    const scouted = intake(director(world(), 90, 'spotter')).slice(0, 3);
    expect(average(scouted)).toBeGreaterThan(average(intake(world())));
    const vacant = world();
    vacant.staff = vacant.staff!.filter((member) => member.role !== 'youth');
    expect(average(intake(vacant))).toBeLessThan(average(intake(world())));
  });

  it('creates the academy lazily for older saves and stops admitting while it is full', () => {
    const old = world();
    delete old.academy;
    delete old.staff;
    expect(intake(old)).toHaveLength(3);
    expect(old.academy!.intakeYear).toBe(old.year);
    const full = world();
    for (let i = 0; i < ACADEMY_LIMIT; i++) prospect(full, 'MID', 16, 30);
    expect(intake(full)).toHaveLength(ACADEMY_LIMIT);
    expect(full.academy!.intakeYear).toBe(full.year);
    expect(full.events.at(-1)!.title).toContain('보류');
  });

  it('runs during simulated seasons exactly once a year and stays valid', () => {
    const w = world('academy-seasons');
    simulateSeason(w);
    simulateSeason(w);
    const intakes = w.events.filter(
      (event) => event.kind === 'youth-intake' && event.title.includes('입단'),
    );
    expect(intakes.map((event) => event.year)).toEqual([1901, 1902]);
    expect(
      academyPlayers(w).every((player) => player.id.startsWith(`${w.playerClub}:academy:`)),
    ).toBe(true);
    validateWorld(w);
  });
});

describe('academy development', () => {
  it('grows role skills toward potential each settled round and records it', () => {
    const w = world(),
      forward = prospect(w, 'FWD', 16, 30),
      keeper = prospect(w, 'GK', 16, 30);
    developAcademy(w);
    expect(forward.attack).toBeGreaterThan(30);
    expect(forward.stamina).toBeGreaterThan(30);
    expect(forward.passing).toBe(30);
    expect(forward.defense).toBe(30);
    expect(forward.developed).toBeCloseTo(forward.attack - 30, 8);
    expect(keeper.keeper).toBeGreaterThan(30);
    expect(keeper.attack).toBe(30);
    const capped = prospect(w, 'MID', 16, 50);
    capped.potential = 50;
    developAcademy(w);
    expect(capped.passing).toBe(50);
    expect(capped.developed).toBeUndefined();
  });

  it('develops faster with facilities and a developer youth director', () => {
    const gain = (setup: (w: World) => void) => {
      const w = world();
      setup(w);
      const player = prospect(w, 'DEF', 16, 30);
      for (let round = 0; round < 10; round++) developAcademy(w);
      return player.defense - 30;
    };
    const base = gain(() => undefined);
    expect(base).toBeGreaterThan(0);
    expect(gain((w) => (w.facilities = 8))).toBeGreaterThan(base);
    expect(gain((w) => director(w, 50, 'developer'))).toBeGreaterThan(base);
    expect(gain((w) => (w.staff = []))).toBeLessThan(base);
  });

  it('settles academy growth once per round boundary with first-team training', () => {
    const w = world(),
      player = prospect(w, 'MID', 16, 30);
    w.round = 1;
    settleTraining(w);
    const once = player.passing;
    expect(once).toBeGreaterThan(30);
    settleTraining(w);
    expect(player.passing).toBe(once);
    advanceRound(w, undefined, false);
    expect(player.passing).toBeGreaterThan(once);
  });
});

describe('promotion and release', () => {
  it('promotes into the first team with a small wage and a three-year contract', () => {
    const w = world(),
      player = prospect(w, 'MID', 17, 40),
      squad = activePlayers(w).length;
    operate(w, { type: 'promote-youth', id: player.id });
    expect(academyPlayers(w)).toHaveLength(0);
    expect(activePlayers(w)).toHaveLength(squad + 1);
    const promoted = w.players.find((other) => other.id === player.id)!;
    expect(BigInt(promoted.wage)).toBeGreaterThan(0n);
    expect(BigInt(promoted.wage)).toBeLessThan(
      activePlayers(w).reduce(
        (max, other) => (BigInt(other.wage) > max ? BigInt(other.wage) : max),
        0n,
      ),
    );
    expect(promoted.until).toBe(w.year + 3);
    expect(w.events.at(-1)!.kind).toBe('youth-promotion');
    expect(() => promoteYouth(w, player.id)).toThrow('아카데미에 없는');
    validateWorld(w);
  });

  it('refuses promotion into a full 26-player squad without changing anything', () => {
    const w = world(),
      player = prospect(w, 'DEF', 18, 60);
    let i = 0;
    while (activePlayers(w).length < 26)
      w.players.push(makePlayer('ENG', w.seed, `filler:${i++}`, w.year, 40, 'MID', 25));
    const before = canonical(w);
    expect(() => promoteYouth(w, player.id)).toThrow('26명');
    expect(canonical(w)).toBe(before);
  });

  it('releases a prospect on request', () => {
    const w = world(),
      player = prospect(w, 'FWD', 16, 30);
    operate(w, { type: 'release-youth', id: player.id });
    expect(academyPlayers(w)).toEqual([]);
    expect(w.players.some((other) => other.id === player.id)).toBe(false);
    expect(w.events.at(-1)!.kind).toBe('youth-release');
    expect(() => releaseYouth(w, player.id)).toThrow('아카데미에 없는');
  });
});

describe('season boundary', () => {
  function cohort() {
    const w = world();
    const ready = prospect(w, 'DEF', 17, 90),
      growing = prospect(w, 'MID', 17, 10),
      young = prospect(w, 'FWD', 15, 90),
      review = prospect(w, 'FWD', 19, 10),
      aged = prospect(w, 'MID', 22, 90);
    return { w, ready, growing, young, review, aged };
  }

  it('labels prospects for the academy view without changing the world', () => {
    const { w, ready, growing, young, review, aged } = cohort();
    const before = canonical(w);
    const summary = academySummary(w);
    expect(canonical(w)).toBe(before);
    const label = (player: Player) =>
      summary.players.find((entry) => entry.player.id === player.id)!.label;
    expect(label(ready)).toBe(ACADEMY_READINESS_LABEL.ready);
    expect(label(ready)).toBe('1군 준비 완료');
    expect(label(growing)).toBe('성장 중');
    expect(label(young)).toBe('성장 중');
    expect(label(review)).toBe('방출 검토');
    expect(label(aged)).toBe('1군 준비 완료');
    expect(summary.players[0]).toMatchObject({ overall: 90, age: 17 });
    expect(summary.room).toBe(26 - activePlayers(w).length);
    expect(summary.delegated).toBe(true);
  });

  it('lets delegated staff promote the ready, keep the growing and release the stalled', () => {
    const { w, ready, growing, young, review, aged } = cohort();
    seasonAcademy(w);
    const owned = new Set(w.players.map((player) => player.id));
    expect(owned.has(ready.id)).toBe(true);
    expect(
      academyPlayers(w)
        .map((player) => player.id)
        .sort(),
    ).toEqual([growing.id, young.id].sort());
    expect(owned.has(review.id) || owned.has(aged.id)).toBe(false);
    expect(w.events.filter((event) => event.kind === 'youth-promotion')).toHaveLength(1);
    expect(w.events.filter((event) => event.kind === 'youth-release')).toHaveLength(2);
    const reports = w.inbox!.filter((item) => item.kind === 'staff-report');
    expect(reports).toHaveLength(3);
    expect(reports.every((item) => !item.attention)).toBe(true);
    validateWorld(w);
  });

  it('defers delegated promotions while cash covers under a year of operating costs', () => {
    const { w, ready } = cohort();
    w.cash = '1';
    seasonAcademy(w);
    expect(w.players.some((player) => player.id === ready.id)).toBe(false);
    expect(academyPlayers(w).map((player) => player.id)).toContain(ready.id);
    expect(w.events.filter((event) => event.kind === 'youth-promotion')).toHaveLength(0);
    expect(w.inbox!.some((item) => item.title === '유스 디렉터가 승격 1명을 미뤘어요')).toBe(true);
    validateWorld(w);
  });

  it('only recommends when the owner runs the academy, apart from players past academy age', () => {
    const { w, ready, review, aged } = cohort();
    w.delegation = { ...w.delegation, academy: false };
    const players = canonical(w.players);
    seasonAcademy(w);
    expect(canonical(w.players)).toBe(players);
    expect(academyPlayers(w)).toHaveLength(4);
    expect(academyPlayers(w).some((player) => player.id === aged.id)).toBe(false);
    const report = w.inbox!.filter((item) => item.attention).at(-1)!;
    expect(report.kind).toBe('staff-report');
    expect(report.detail).toContain(ready.name);
    expect(report.detail).toContain(review.name);
    const quiet = world();
    quiet.delegation = { ...quiet.delegation, academy: false };
    prospect(quiet, 'MID', 16, 10);
    seasonAcademy(quiet);
    expect(quiet.inbox).toEqual([]);
  });

  it('keeps delegated promotions within the squad and position limits', () => {
    const full = world();
    let i = 0;
    while (activePlayers(full).length < 26)
      full.players.push(makePlayer('ENG', full.seed, `filler:${i++}`, full.year, 40, 'MID', 25));
    const blocked = prospect(full, 'DEF', 18, 90);
    seasonAcademy(full);
    expect(academyPlayers(full).map((player) => player.id)).toEqual([blocked.id]);
    const keepers = world();
    keepers.players.push(
      makePlayer('ENG', keepers.seed, 'third-keeper', keepers.year, 40, 'GK', 25),
    );
    const keeper = prospect(keepers, 'GK', 19, 95);
    seasonAcademy(keepers);
    expect(keepers.players.some((player) => player.id === keeper.id)).toBe(false);
    expect(keepers.inbox!.at(-1)!.detail).toContain('자리가 없었어요');
  });

  it('carries prospects across a real season close', () => {
    const w = world('academy-close');
    w.delegation = { ...w.delegation, academy: false };
    simulateSeason(w);
    const first = academyPlayers(w).map((player) => player.id);
    expect(first.length).toBe(3);
    w.delegation = { ...w.delegation, academy: true };
    simulateSeason(w);
    expect(academyPlayers(w).some((player) => player.id.includes(':academy:1902:'))).toBe(true);
    expect(academyPlayers(w).every((player) => w.year - player.born < 22)).toBe(true);
    validateWorld(w);
  });
});
