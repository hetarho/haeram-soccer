import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Line, Player, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf } from './player';
import {
  ACADEMY_LIMIT,
  ACADEMY_READINESS_LABEL,
  academyIntakeDay,
  academyIntakeSize,
  academyPlayers,
  academySummary,
  activePlayers,
  advanceRound,
  autoTrainingAdvice,
  basicStaff,
  createWorld,
  developAcademy,
  makePlayer,
  operate,
  overall,
  ownStarters,
  promoteYouth,
  releaseYouth,
  runAcademyIntake,
  seasonAcademy,
  settleTraining,
  simulateSeason,
  youthAdvice,
  FOUNDING_YEAR,
} from './index';

function world(seed = 'youth-academy') {
  const w = createWorld({
    country: 'ENG',
    name: 'Nursery End',
    color: '#556b2f',
    seed,
    level: 'easy' as const,
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
function prospect(w: World, role: Position, age: number, skill: number): Player {
  const player = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:academy:test:${serial++}`,
    w.year,
    30,
    role,
    age,
  );
  for (const a of ATTRIBUTES) player.attrs[a] = skill;
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
    expect(new Set(players.map((player) => player.position)).size).toBe(3);
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

  it('grows the class with a strong youth director and academy facilities, and its quality with a spotter', () => {
    expect(academyIntakeSize(world())).toBe(3);
    expect(academyIntakeSize(director(world(), 70))).toBe(4);
    const big = director(world(), 75);
    big.academyFacility = 2;
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
    for (let i = 0; i < ACADEMY_LIMIT; i++) prospect(full, 'CM', 16, 30);
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
    expect(intakes.map((event) => event.year)).toEqual([FOUNDING_YEAR, FOUNDING_YEAR + 1]);
    expect(
      academyPlayers(w).every((player) => player.id.startsWith(`${w.playerClub}:academy:`)),
    ).toBe(true);
    validateWorld(w);
  });
});

describe('academy development', () => {
  it("grows his position's attributes toward potential each settled round and records it", () => {
    const w = world(),
      forward = prospect(w, 'ST', 16, 30),
      keeper = prospect(w, 'GK', 16, 30);
    developAcademy(w);
    expect(forward.attrs.finishing).toBeGreaterThan(forward.attrs.pace);
    expect(forward.attrs.pace).toBeGreaterThan(30);
    expect(forward.attrs.passing).toBe(30);
    expect(forward.attrs.tackling).toBe(30);
    expect(forward.developed).toBeCloseTo(overall(forward) - 30, 0);
    expect(keeper.attrs.reflexes).toBeGreaterThan(30);
    expect(keeper.attrs.finishing).toBe(30);
    const capped = prospect(w, 'CM', 16, 50);
    capped.potential = 50;
    developAcademy(w);
    expect(capped.attrs.passing).toBe(50);
    expect(capped.developed).toBeUndefined();
  });

  it('develops faster with academy facilities and a developer youth director', () => {
    const gain = (setup: (w: World) => void) => {
      const w = world();
      setup(w);
      const player = prospect(w, 'CB', 16, 30);
      for (let round = 0; round < 10; round++) developAcademy(w);
      return player.attrs.tackling - 30;
    };
    const base = gain(() => undefined);
    expect(base).toBeGreaterThan(0);
    expect(gain((w) => (w.academyFacility = 3))).toBeGreaterThan(base);
    expect(gain((w) => director(w, 50, 'developer'))).toBeGreaterThan(base);
    expect(gain((w) => (w.staff = []))).toBeLessThan(base);
  });

  it('settles academy growth once per round boundary with first-team training', () => {
    const w = world(),
      player = prospect(w, 'CM', 16, 30);
    w.round = 1;
    settleTraining(w);
    const once = player.attrs.passing;
    expect(once).toBeGreaterThan(30);
    settleTraining(w);
    expect(player.attrs.passing).toBe(once);
    advanceRound(w, undefined, false);
    expect(player.attrs.passing).toBeGreaterThan(once);
  });
});

describe('promotion and release', () => {
  it('promotes into the first team with a small wage and a three-year contract', () => {
    // An amateur squad earns the minimum wage, so the prospect is a little weaker than it.
    const w = world(),
      player = prospect(w, 'CM', 17, 25),
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
      player = prospect(w, 'CB', 18, 60);
    let i = 0;
    while (activePlayers(w).length < 26)
      w.players.push(makePlayer('ENG', w.seed, `filler:${i++}`, w.year, 40, 'CM', 25));
    const before = canonical(w);
    expect(() => promoteYouth(w, player.id)).toThrow('26명');
    expect(canonical(w)).toBe(before);
  });

  it('releases a prospect on request', () => {
    const w = world(),
      player = prospect(w, 'ST', 16, 30);
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
    const ready = prospect(w, 'CB', 17, 90),
      growing = prospect(w, 'CM', 17, 10),
      young = prospect(w, 'ST', 15, 90),
      review = prospect(w, 'ST', 19, 10),
      aged = prospect(w, 'CM', 22, 90);
    // At 19 a prospect whose potential cannot reach the first team is up for release (→STAFF-13).
    review.potential = 15;
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
    w.intervention = 1;
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
    quiet.intervention = 1;
    prospect(quiet, 'CM', 16, 10);
    seasonAcademy(quiet);
    expect(quiet.inbox).toEqual([]);
  });

  it('keeps delegated promotions within the squad and position limits', () => {
    const full = world();
    let i = 0;
    while (activePlayers(full).length < 26)
      full.players.push(makePlayer('ENG', full.seed, `filler:${i++}`, full.year, 40, 'CM', 25));
    const blocked = prospect(full, 'CB', 18, 90);
    seasonAcademy(full);
    expect(academyPlayers(full).map((player) => player.id)).toEqual([blocked.id]);
    const keepers = world();
    keepers.players.push(
      makePlayer('ENG', keepers.seed, 'third-keeper', keepers.year, 40, 'GK', 25),
    );
    const keeper = prospect(keepers, 'GK', 19, 95);
    seasonAcademy(keepers);
    // Ready but without a place, he stays in U-21 until one frees or he turns 21.
    expect(keepers.players.some((player) => player.id === keeper.id)).toBe(false);
    expect(academyPlayers(keepers).some((player) => player.id === keeper.id)).toBe(true);
    expect(keepers.inbox!.at(-1)!.detail).toContain('자리가 없어');
  });

  it('carries prospects across a real season close', () => {
    const w = world('academy-close');
    w.intervention = 1;
    simulateSeason(w);
    const first = academyPlayers(w).map((player) => player.id);
    expect(first.length).toBe(3);
    w.intervention = 2;
    simulateSeason(w);
    expect(
      academyPlayers(w).some((player) => player.id.includes(`:academy:${FOUNDING_YEAR + 1}:`)),
    ).toBe(true);
    expect(academyPlayers(w).every((player) => w.year - player.born < 22)).toBe(true);
    validateWorld(w);
  });
});

describe('육성 목표 and 데뷔 시점 (→CLUB-32)', () => {
  /** The weakest first-teamer of the line and the starters' average, as the director measures. */
  const levels = (w: World, role: Line) => {
    const peers = activePlayers(w)
      .filter((player) => lineOf(player.position) === role)
      .map(overall);
    const starters = ownStarters(w)
      .filter((player) => lineOf(player.position) === role)
      .map(overall);
    return {
      weakest: Math.min(...peers),
      starters: starters.reduce((sum, value) => sum + value, 0) / starters.length,
    };
  };
  const state = (w: World, player: Player) =>
    academySummary(w).players.find((one) => one.player.id === player.id)!.readiness;
  const row = (w: World, key: 'youthGoal' | 'debut', option: string) =>
    operate(w, { type: 'direction', key, option });

  it("데뷔 시점 sets readiness and the coaches' focus rules", () => {
    const w = world('debut-rows');
    const { weakest, starters } = levels(w, 'DF');
    // Below both of 표준's bars, within 빠른 데뷔's.
    const near = prospect(w, 'CB', 18, Math.floor(Math.min(weakest - 2, starters - 11)));
    expect(state(w, near)).not.toBe('ready');
    row(w, 'debut', 'early');
    expect(state(w, near)).toBe('ready');
    row(w, 'debut', 'ready');
    expect(state(w, near)).not.toBe('ready');
    const level = prospect(w, 'CB', 18, Math.ceil(starters));
    expect(state(w, level)).toBe('ready');
    // 늦게: nobody before 19, whatever his rating.
    row(w, 'debut', 'late');
    expect(state(w, level)).not.toBe('ready');
    const nineteen = prospect(w, 'CB', 19, Math.ceil(starters));
    expect(state(w, nineteen)).toBe('ready');

    // The youth director readies a U-19 within 10 under 빠른 데뷔, and only U-21 under 늦게.
    const focus = world('debut-focus');
    const bars = levels(focus, 'MF');
    prospect(focus, 'CM', 17, Math.floor(Math.min(bars.weakest, bars.starters - 10)) - 8);
    expect(youthAdvice(focus).focus).not.toBe('firstTeam');
    row(focus, 'debut', 'early');
    expect(youthAdvice(focus).focus).toBe('firstTeam');
    const late = world('debut-late');
    const lateBars = levels(late, 'MF');
    prospect(late, 'CM', 17, Math.ceil(lateBars.starters));
    expect(youthAdvice(late).focus).toBe('firstTeam');
    row(late, 'debut', 'late');
    expect(youthAdvice(late).focus).not.toBe('firstTeam');

    // The assistant turns to youth work from two young starters under 빠른 데뷔 (→CLUB-13).
    const first = world('debut-assistant');
    for (const player of ownStarters(first)) player.born = first.year - 26;
    for (const player of ownStarters(first).slice(0, 2)) player.born = first.year - 20;
    expect(autoTrainingAdvice(first).focus).toBe('balanced');
    row(first, 'debut', 'early');
    expect(autoTrainingAdvice(first).focus).toBe('hard');
  });

  it('육성 목표 sets release', () => {
    const w = world('goal-rows');
    const { weakest, starters } = levels(w, 'DF');
    // 19 and short of the weakest first-teamer's level for good: released at 표준.
    const stalled = prospect(w, 'CB', 19, 5);
    stalled.potential = weakest - 5;
    expect(state(w, stalled)).toBe('review');
    row(w, 'youthGoal', 'firstTeam');
    expect(state(w, stalled)).toBe('growing');
    // 18 and short of the starters' level, though above the weakest: only 최소 운영 lets him go.
    const middling = prospect(w, 'CB', 18, 5);
    middling.potential = Math.max(weakest + 1, Math.floor(starters) - 1);
    row(w, 'youthGoal', 'standard');
    expect(state(w, middling)).toBe('growing');
    row(w, 'youthGoal', 'minimal');
    expect(state(w, middling)).toBe(middling.potential < starters ? 'review' : 'growing');
  });
});
