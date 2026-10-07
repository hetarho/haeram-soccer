import { describe, expect, it } from 'vitest';
import type { MatchFrame, MatchMotionSample, Tactic } from '../../contracts/src/types';
import { createWorld, simulateMatch } from './index';
import { MATCH_MOTION_CONFIG, MatchMotion, playerTraits, teamMotionProfile } from './motion';

const world = createWorld({
  country: 'ENG',
  name: 'Independent Athletic',
  color: '#24664f',
  seed: 'motion-regression',
  difficulty: 1,
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
    const traits = playerTraits(player);
    expect(playerTraits({ ...player })).toEqual(traits);
    expect(Object.values(traits).every((n) => n >= 0 && n <= 1)).toBe(true);
    const improved = playerTraits({
      ...player,
      stamina: 100,
      attack: 100,
      passing: 100,
      defense: 100,
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
