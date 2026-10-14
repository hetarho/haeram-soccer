import { describe, expect, it } from 'vitest';
import type { MatchFrame, MatchMotionSample, Tactic } from '../../contracts/src/types';
import { createWorld, simulateMatch } from './index';
import {
  MATCH_MOTION_CONFIG,
  MatchMotion,
  motionTraits,
  teamMotionProfile,
  type BallTraceStep,
} from './motion';

const world = createWorld({
  country: 'ENG',
  name: 'Independent Athletic',
  color: '#24664f',
  seed: 'motion-regression',
  level: 'normal' as const,
});
const fixture = world.fixtures.find((f) => f.home === world.playerClub)!;
const playback = simulateMatch(world, fixture, true, true);
const samples = playback.frames.flatMap((frame) => frame.motion!);

describe('independent match movement', () => {
  it('repeats observation without changing the result or writing frame traces to the archive', () => {
    const repeat = simulateMatch(world, fixture, true, true);
    const fast = simulateMatch(world, fixture, false, true);
    expect(repeat.frames).toEqual(playback.frames);
    expect(fast.record).toEqual(playback.record);
    expect(fast.frames).toEqual([]);
    expect(playback.record).not.toHaveProperty('motion');
    expect(playback.record).not.toHaveProperty('frames');
    expect(playback.frames).toHaveLength(90);
    expect(samples).toHaveLength(90 * MATCH_MOTION_CONFIG.integration.samplesPerMinute);
    expect(samples.at(-1)!.elapsedSeconds).toBe(5400);
    expect(playback.frames.at(-1)!.score).toEqual(playback.record.score);
  });

  it('keeps trajectories finite, continuous, and within pitch, speed, and acceleration bounds', () => {
    const c = MATCH_MOTION_CONFIG.integration;
    const ids = playback.squads.map((squad) => squad.map((player) => player.id));
    for (const [index, sample] of samples.entries()) {
      expect(sample.players.map((team) => team.map((player) => player.id))).toEqual(ids);
      for (const value of sample.ball) expect(value).toBeGreaterThanOrEqual(c.minPosition);
      for (const value of sample.ball) expect(value).toBeLessThanOrEqual(c.maxPosition);
      for (const [side, team] of sample.players.entries()) {
        for (const [slot, player] of team.entries()) {
          expect(
            [...player.position, ...player.velocity, ...player.intent].every(Number.isFinite),
          ).toBe(true);
          expect(player.position.every((n) => n >= c.minPosition && n <= c.maxPosition)).toBe(true);
          expect(Math.hypot(...player.velocity)).toBeLessThanOrEqual(c.maxSpeed + 1e-8);
          const previous = samples[index - 1];
          if (!previous) continue;
          const dt = ((sample.elapsedSeconds - previous.elapsedSeconds) / 60) * c.secondsPerMinute;
          const before = previous.players[side][slot];
          expect(
            Math.hypot(
              player.position[0] - before.position[0],
              player.position[1] - before.position[1],
            ),
          ).toBeLessThanOrEqual(c.maxSpeed * dt + 1e-8);
          expect(
            Math.hypot(
              player.velocity[0] - before.velocity[0],
              player.velocity[1] - before.velocity[1],
            ),
          ).toBeLessThanOrEqual(c.acceleration * dt + 1e-8);
        }
      }
      if (index > 0) {
        const before = samples[index - 1];
        expect(sample.elapsedSeconds).toBeGreaterThan(before.elapsedSeconds);
        const dt = ((sample.elapsedSeconds - before.elapsedSeconds) / 60) * c.secondsPerMinute;
        expect(
          Math.hypot(sample.ball[0] - before.ball[0], sample.ball[1] - before.ball[1]),
        ).toBeLessThanOrEqual(c.maxBallSpeed * dt + 1e-8);
      }
    }
  });

  it('gives teammates different decisions, movement, and local phase offsets', () => {
    const sequence = playback.squads.flat().map((player) =>
      samples
        .slice(0, 120)
        .map((sample) => sample.players.flat().find((agent) => agent.id === player.id)!.state)
        .join(','),
    );
    expect(new Set(sequence).size).toBeGreaterThanOrEqual(18);
    const states = new Set(
      samples.flatMap((sample) => sample.players.flat().map((player) => player.state)),
    );
    expect(states).toEqual(
      new Set(['shape', 'support', 'run', 'press', 'mark', 'recover', 'carry', 'keeper']),
    );
    expect(
      samples.some((sample) => new Set(sample.players[0].map((player) => player.state)).size >= 4),
    ).toBe(true);
    const start = samples[0].players.flat();
    const later = samples[20].players.flat();
    const displacement = later.map((player, slot) =>
      [player.position[0] - start[slot].position[0], player.position[1] - start[slot].position[1]]
        .map((n) => n.toFixed(2))
        .join(','),
    );
    expect(new Set(displacement).size).toBe(22);
  });

  it('plays passes between real players, keeps possession near its owner, and shoots only for shot events', () => {
    expect(new Set(samples.map((sample) => sample.phase))).toEqual(
      new Set(['possession', 'transition', 'pass', 'shot', 'restart']),
    );
    const owners = new Set<string>();
    let controlled = 0;
    for (const frame of playback.frames) {
      for (const sample of frame.motion!) {
        if (sample.phase === 'shot') expect(['골', '슛', '선방']).toContain(frame.action);
        if (!sample.ownerId) continue;
        const owner = sample.players.flat().find((player) => player.id === sample.ownerId)!;
        expect(owner).toBeDefined();
        expect(owner.state === 'carry' || owner.state === 'keeper').toBe(true);
        expect(
          Math.hypot(owner.position[0] - sample.ball[0], owner.position[1] - sample.ball[1]),
        ).toBeLessThanOrEqual(
          MATCH_MOTION_CONFIG.possession.controlDistance +
            MATCH_MOTION_CONFIG.integration.maxSpeed * MATCH_MOTION_CONFIG.integration.stepSeconds,
        );
        expect(sample.phase).toBe('possession');
        owners.add(sample.ownerId);
        controlled++;
      }
    }
    expect(owners.size).toBeGreaterThanOrEqual(12);
    expect(controlled).toBeGreaterThan(120);
  });

  it('derives stable personalities from identity and skills, and blends coach philosophy with applied tactics', () => {
    const player = playback.squads[0][5];
    const traits = motionTraits(player);
    expect(motionTraits({ ...player })).toEqual(traits);
    expect(Object.values(traits).every((n) => n >= 0 && n <= 1)).toBe(true);
    const improved = motionTraits({
      ...player,
      attrs: Object.fromEntries(
        Object.keys(player.attrs).map((a) => [a, 100]),
      ) as typeof player.attrs,
    });
    expect(improved.pace).toBeGreaterThan(traits.pace);
    expect(improved.anticipation).toBeGreaterThan(traits.anticipation);
    const rigid = teamMotionProfile('press', {
      philosophy: 'counter',
      ability: 50,
      flexibility: 0,
    });
    const flexible = teamMotionProfile('press', {
      philosophy: 'counter',
      ability: 50,
      flexibility: 100,
    });
    const skilled = teamMotionProfile('press', {
      philosophy: 'counter',
      ability: 100,
      flexibility: 100,
    });
    expect(flexible.pressing).toBeGreaterThan(rigid.pressing);
    expect(flexible.freedom).toBeGreaterThan(rigid.freedom);
    expect(skilled.cohesion).toBeGreaterThan(flexible.cohesion);
  });

  it('changes actual pressing and defensive formation when tactics or the coach change', () => {
    const render = (
      tactic: Tactic,
      philosophy: Tactic,
      flexibility: number,
    ): MatchMotionSample[] => {
      const manager = { philosophy, ability: 75, flexibility };
      const motion = new MatchMotion(
        'same-context',
        playback.squads,
        [tactic, 'balanced'],
        [manager, manager],
      );
      return Array.from({ length: 18 }, (_, index) => {
        const frame: MatchFrame = {
          minute: index + 1,
          score: { home: 0, away: 0 },
          metrics: [[], []],
          ball: [35 + (index % 4), index % 2 ? 60 : 40],
          side: 1,
          player: 9,
          action: '패스',
        };
        return motion.minute(frame).motion!;
      }).flat();
    };
    const press = render('press', 'press', 100),
      counter = render('counter', 'counter', 100);
    const countPress = (frames: MatchMotionSample[]) =>
      frames.reduce(
        (sum, frame) => sum + frame.players[0].filter((p) => p.state === 'press').length,
        0,
      );
    const line = (frames: MatchMotionSample[]) =>
      frames.reduce(
        (sum, frame) => sum + frame.players[0].slice(1, 5).reduce((n, p) => n + p.position[0], 0),
        0,
      ) /
      (frames.length * 4);
    expect(countPress(press)).toBeGreaterThan(countPress(counter));
    expect(line(press)).toBeGreaterThan(line(counter) + 5);
    expect(render('press', 'counter', 0)).not.toEqual(render('press', 'counter', 100));
  });
});

describe('ball flights', () => {
  const c = MATCH_MOTION_CONFIG;
  const dt = c.integration.stepSeconds;
  const manager = { philosophy: 'balanced' as const, ability: 60, flexibility: 50 };
  // Replay the recorded duels of the observed match through a traced engine.
  const replay = (minutes: number) => {
    const motion = new MatchMotion('ball-flights', playback.squads, playback.record.tactics, [
      manager,
      manager,
    ]);
    const steps: BallTraceStep[] = [];
    for (const frame of playback.frames.slice(0, minutes))
      motion.minute(
        {
          minute: frame.minute,
          score: frame.score,
          metrics: frame.metrics,
          ball: frame.ball,
          side: frame.side,
          player: frame.player,
          action: frame.action,
          events: frame.events,
        },
        (step) => steps.push(step),
      );
    return steps;
  };
  const trace = replay(90);
  const flights = new Map<number, { first: number; last: number }>();
  trace.forEach((step, index) => {
    if (!step.flight) return;
    const span = flights.get(step.flight.id);
    if (span) span.last = index;
    else flights.set(step.flight.id, { first: index, last: index });
  });
  const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  it('lands every flight at the feet of its receiver, who takes the ball at once', () => {
    let landed = 0;
    for (const { first, last } of flights.values()) {
      const flight = trace[last].flight!;
      const after = trace[last + 1];
      // A flight without a receiver is a shot into the net or wide, or a dead ball to its spot;
      // the final whistle may also blow with the ball in the air.
      if (!flight.receiverId || !after) continue;
      expect(after.ownerId).toBe(flight.receiverId);
      expect(after.flight).toBeUndefined();
      expect(gap(after.ball, after.holder!)).toBeLessThanOrEqual(c.possession.controlDistance);
      expect((last - first + 2) * dt).toBeLessThanOrEqual(flight.duration + 0.3);
      landed++;
    }
    expect(landed).toBeGreaterThan(300);
    const styles = new Set([...flights.values()].map(({ last }) => trace[last].flight!.style));
    expect(styles).toEqual(
      new Set(['pass', 'loose', 'cut', 'tackle', 'shot', 'reset', 'throw', 'cross']),
    );
    // A tackle pokes the ball off the carrier's feet; it never flies across the pitch.
    for (const { first } of flights.values()) {
      const flight = trace[first].flight!;
      if (flight.style === 'tackle')
        expect(gap(flight.from, trace[first].holder!)).toBeLessThanOrEqual(
          c.ball.tackleReach + 2 + c.integration.maxSpeed * dt,
        );
    }
  });

  it('never leaves a live ball resting in open space', () => {
    const window = Math.round(0.6 / dt);
    for (let index = 0; index + window < trace.length; index++) {
      const run = trace.slice(index, index + window + 1);
      if (run.some((step) => step.ownerId || step.dead)) continue;
      expect(gap(run[0].ball, run.at(-1)!.ball)).toBeGreaterThanOrEqual(0.05);
    }
    // Outside dead balls the ball is always either at someone's feet or on its way to someone.
    expect(trace.filter((step) => !step.ownerId && !step.flight && !step.dead)).toEqual([]);
  });

  it('keeps the ball fast but inside its speed limit', () => {
    expect(c.integration.passSpeed).toBeGreaterThan(c.integration.maxSpeed * 6);
    const track = playback.frames.flatMap((frame) => frame.ballTrack!);
    expect(track).toHaveLength(90 * Math.round(c.integration.secondsPerMinute / dt));
    for (let index = 1; index < track.length; index++)
      // Track points are rounded to a tenth of a unit.
      expect(gap(track[index - 1], track[index])).toBeLessThanOrEqual(
        c.integration.maxBallSpeed * dt + 0.15,
      );
    for (let index = 1; index < trace.length; index++)
      expect(gap(trace[index - 1].ball, trace[index].ball)).toBeLessThanOrEqual(
        c.integration.maxBallSpeed * dt + 1e-9,
      );
    const median = (style: string) => {
      const speeds = [...flights.values()]
        .map(({ last }) => trace[last].flight!)
        .filter((flight) => flight.style === style && gap(flight.from, flight.to) >= 10)
        .map((flight) => gap(flight.from, flight.to) / flight.duration)
        .sort((a, b) => a - b);
      return speeds[Math.floor(speeds.length / 2)];
    };
    expect(median('pass')).toBeGreaterThan(42);
    expect(median('pass')).toBeLessThan(55);
    expect(median('shot')).toBeGreaterThan(65);
  });

  it('curls passes off the straight line and lofts only the long ones', () => {
    const deviations: number[] = [];
    let lofted = 0;
    for (const { first, last } of flights.values()) {
      const flight = trace[last].flight!;
      if (flight.style !== 'pass') continue;
      const chord = gap(flight.from, flight.to);
      const steps = trace.slice(first, last + 1);
      const peak = Math.max(...steps.map((step) => step.ball[2]));
      if (chord < c.ball.loftFrom - 4) expect(peak).toBe(0);
      if (chord >= 35 && peak >= 2) lofted++;
      if (chord < 15) continue;
      const [ax, ay] = flight.from,
        [bx, by] = flight.to;
      // Distance of each ball position from the straight chord between launch and landing.
      const off = steps.map(
        ({ ball: [x, y] }) => Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / chord,
      );
      deviations.push(Math.max(...off) / chord);
    }
    deviations.sort((a, b) => a - b);
    expect(deviations.length).toBeGreaterThan(150);
    expect(deviations[Math.floor(deviations.length / 2)]).toBeGreaterThan(0.03);
    expect(deviations.filter((d) => d >= 0.015).length / deviations.length).toBeGreaterThan(0.9);
    expect(lofted).toBeGreaterThan(5);
    expect(Math.max(...trace.map((step) => step.ball[2]))).toBeLessThanOrEqual(
      c.ball.maxLoft + Math.max(...Object.values(c.ball.styles).map((style) => style.bobble)),
    );
  });

  it('sends the ball out of play before every restart and takes it from the line', () => {
    const { minPosition: low, maxPosition: high, secondsPerMinute } = c.integration;
    const steps = Math.round(secondsPerMinute / dt);
    let restarts = 0;
    playback.frames.forEach((frame, index) => {
      const restart = frame.events![0];
      if (restart.kind !== 'restart') return;
      restarts++;
      const minute = trace.slice(index * steps, (index + 1) * steps);
      const dead = minute.filter((step) => step.dead);
      const line = (step: BallTraceStep) =>
        restart.restart === 'throwIn'
          ? step.ball[1] <= low + 0.01 || step.ball[1] >= high - 0.01
          : step.ball[0] <= low + 0.01 ||
            step.ball[0] >= high - 0.01 ||
            Math.abs(step.ball[0] - 50) >= 44 - 0.01;
      expect(dead.length, `minute ${frame.minute}`).toBeGreaterThan(0);
      expect(dead.some(line), `minute ${frame.minute}`).toBe(true);
    });
    expect(restarts).toBeGreaterThan(15);
  });

  it('draws flight shapes from its own ball stream, so the same match repeats exactly', () => {
    const repeat = replay(10);
    expect(repeat).toEqual(trace.slice(0, repeat.length));
  });
});
