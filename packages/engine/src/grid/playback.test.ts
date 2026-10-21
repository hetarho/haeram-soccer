import { describe, expect, it } from 'vitest';
import {
  frameTimeIssues,
  MATCH_MODEL_REVISION,
  NEUTRAL_FRAME_PACE,
} from '../../../contracts/src/match-model';
import { createWorld } from '../index';
import { GRID_BALL_CONFIG } from './movement';
import { playGrid } from './engine';
import { toUnits } from './pitch';
import { ballPath, buildFrames } from './playback';
import { buildGridSetup, type DecideRule } from './setup';

const w = createWorld({
  country: 'ENG',
  name: 'Grid Playback Lab',
  color: '#2a5d8f',
  seed: 'grid-playback',
  level: 'normal',
});
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const setupFor = (id: string, observe = true, candidate = false, decide?: DecideRule) =>
  buildGridSetup(
    w,
    { ...w.fixtures[0]!, id, home: home!.id, away: away!.id },
    {
      observe,
      recordPlayers: true,
      tactics: ['press', 'possession'],
      ...(candidate ? { model: MATCH_MODEL_REVISION } : {}),
      ...(decide ? { decide } : {}),
    },
  );
const watch = (id: string, candidate = false, decide?: DecideRule) => {
  const setup = setupFor(id, true, candidate, decide);
  const result = playGrid(setup);
  return { setup, result, frames: buildFrames(result, setup, w.seed) };
};
const { setup, result, frames } = watch('playback-1');
const added = result.record.added!;

describe('grid playback', () => {
  it('builds one frame per played minute including added time', () => {
    expect(frames).toHaveLength(90 + added[0]! + added[1]!);
    expect(frames.filter((f) => f.period === 1)).toHaveLength(45 + added[0]!);
    expect(frames.filter((f) => f.period === 2)).toHaveLength(45 + added[1]!);
    expect(frames.at(-1)!.score).toEqual(result.record.score);
    expect(frames.at(-1)!.xg).toEqual(result.record.xg);
    for (let m = 0; m < 10; m++)
      expect(frames.at(-1)!.metrics[0]![m]).toBe(result.record.metrics[0]![m]);
  });

  it('samples 8 positions and 80 ball points per minute', () => {
    for (const f of frames) {
      expect(f.motion).toHaveLength(8);
      expect(f.ballTrack).toHaveLength(80);
      expect(f.motion!.at(-1)!.elapsedSeconds).toBe(f.elapsedSeconds);
      // Pre-feature frames carry no explicit times; the clock decodes them at equal intervals.
      expect(f.startSeconds).toBeUndefined();
      expect(f.ballTimes).toBeUndefined();
    }
  });

  it('keeps everyone on the pitch inside 0–100 units and mirrors the second half', () => {
    const inside = (p: readonly number[]) => p.every((v) => v >= 0 && v <= 100);
    for (const f of frames) {
      for (const sample of f.motion!) {
        expect(inside(sample.ball)).toBe(true);
        for (const side of sample.players)
          for (const p of side) expect(inside(p.position) && inside(p.intent)).toBe(true);
      }
      for (const point of f.ballTrack!) expect(inside(point.slice(0, 2))).toBe(true);
    }
    const keeper = setup.rosters[0][0]!.id;
    const keeperX = (period: 1 | 2) =>
      frames
        .filter((f) => f.period === period)
        .flatMap((f) => f.players![0].filter((p) => p.id === keeper).map((p) => p.position[0]));
    expect(Math.max(...keeperX(1))).toBeLessThan(50);
    expect(Math.min(...keeperX(2))).toBeGreaterThan(50);
  });

  it('keeps the ball at the carrier while he carries', () => {
    let held = 0;
    for (const f of frames)
      for (const sample of f.motion!) {
        if (!sample.ownerId) continue;
        const carrier = sample.players.flat().find((p) => p.id === sample.ownerId)!;
        expect(carrier.state).toBe('carry');
        expect(sample.ball[0]).toBeCloseTo(carrier.position[0], 9);
        expect(sample.ball[1]).toBeCloseTo(carrier.position[1], 9);
        held++;
      }
    expect(held).toBeGreaterThan(50);
  });

  it('lands every flight at its recorded end', () => {
    const ball = ballPath(result, setup, w.seed);
    let flights = 0;
    for (const e of result.trace!) {
      if (!e.to || e.outcome === 'incident') continue;
      const to = toUnits(e.to, e.period);
      const at = ball(e.period, e.elapsed).at;
      // Snapshot positions are 32-bit floats.
      expect(at[0], `${e.action} ${e.outcome}`).toBeCloseTo(to[0], 4);
      expect(at[1], `${e.action} ${e.outcome}`).toBeCloseTo(to[1], 4);
      flights++;
    }
    expect(flights).toBeGreaterThan(500);
  });

  it('labels added time as 45+n and 90+n', () => {
    const labels = frames.map((f) => f.label);
    const regular = Array.from({ length: 90 }, (_, i) => String(i + 1));
    expect(labels.filter((l) => !l.includes('+'))).toEqual(regular);
    expect(labels.filter((l) => l.startsWith('45+'))).toEqual(
      Array.from({ length: added[0]! }, (_, i) => `45+${i + 1}`),
    );
    expect(labels.filter((l) => l.startsWith('90+'))).toEqual(
      Array.from({ length: added[1]! }, (_, i) => `90+${i + 1}`),
    );
    expect(labels.indexOf('45+1')).toBe(45);
    expect(frames.filter((f) => f.label.startsWith('90+')).every((f) => f.minute === 90)).toBe(
      true,
    );
  });

  it('shows each incident in a frame carrying its minute, none after the last frame (MATCH-24)', () => {
    let seen = 0;
    for (let n = 0; n < 6; n++) {
      const watched = n ? watch(`stamp-${n}`) : { result, frames };
      const shown = watched.frames.flatMap((f) =>
        f.events!.filter((e) => ['card', 'sub', 'injury'].includes(e.kind)).map((e) => ({ f, e })),
      );
      const incidents = watched.result.record.incidents ?? [];
      expect(shown).toHaveLength(incidents.length);
      incidents.forEach((x, k) => {
        const label = x.added ? `${x.minute}+${x.added}` : String(x.minute);
        expect(shown[k]!.e.actor).toBe(x.player);
        expect(shown[k]!.f.label, `${x.kind} ${label}`).toBe(label);
        expect(watched.frames.some((f) => f.label === label)).toBe(true);
        seen++;
      });
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('averages pace to 1 and slows minutes with shots and set pieces', () => {
    const paces = frames.map((f) => f.pace);
    expect(paces.reduce((a, b) => a + b, 0) / paces.length).toBeCloseTo(1, 9);
    const busy = frames.filter((f) =>
      f.events!.some((e) => e.outcome || e.restart === 'corner' || e.restart === 'penalty'),
    );
    expect(busy.length).toBeGreaterThan(5);
    const top = Math.max(...paces);
    expect(busy.every((f) => f.pace === top)).toBe(true);
    expect(Math.min(...paces)).toBeLessThan(1);
    expect(top / Math.min(...paces)).toBeCloseTo(1.6 / 0.6, 9);
  });

  it('shows ten players after a red card', () => {
    let id = '';
    for (let i = 0; i < 200 && !id; i++) {
      const quiet = playGrid(setupFor(`red-${i}`, false)).record;
      const reds = (quiet.incidents ?? []).filter(
        (x) => x.kind === 'red' || x.kind === 'secondYellow',
      );
      const injured = (quiet.incidents ?? []).some((x) => x.kind === 'injury');
      if (reds.length === 1 && !injured) id = `red-${i}`;
    }
    expect(id).not.toBe('');
    const watched = watch(id);
    const red = watched.result.record.incidents!.find(
      (x) => x.kind === 'red' || x.kind === 'secondYellow',
    )!;
    const at = watched.frames.findIndex((f) =>
      f.events!.some((e) => e.kind === 'card' && e.card === 'red'),
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(watched.frames[at]!.events!.find((e) => e.card === 'red')!.actor).toBe(red.player);
    for (const f of watched.frames.slice(at)) {
      expect(f.players![red.side]).toHaveLength(10);
      expect(f.onPitch[red.side]).toHaveLength(10);
      expect(f.onPitch[red.side]).not.toContain(red.player);
    }
    if (at > 0) expect(watched.frames[at - 1]!.onPitch[red.side]).toHaveLength(11);
  });

  it('does not change the record', () => {
    const quiet = playGrid(setupFor('playback-1', false));
    expect(result.record).toEqual(quiet.record);
    const record = structuredClone(result.record);
    const again = buildFrames(result, setup, w.seed);
    expect(result.record).toEqual(record);
    expect(again).toEqual(frames);
  });
});

describe('candidate playback on the match clock (→MATCH-12, WEB-32)', () => {
  const watched = watch('candidate-1', true);
  const trace = watched.result.trace!;
  const knotted = trace.filter((e) => e.knots?.length);
  const path = ballPath(watched.result, watched.setup, w.seed);
  const close = (a: readonly number[], b: readonly number[], digits = 4) => {
    expect(a[0]).toBeCloseTo(b[0]!, digits);
    expect(a[1]).toBeCloseTo(b[1]!, digits);
  };

  it('keeps dead-ball and open-play multipliers equal', () => {
    expect(knotted.length).toBeGreaterThan(500);
    // Every minute is neutral, restarts and chances included: no situation weights.
    expect(watched.frames.every((f) => f.pace === NEUTRAL_FRAME_PACE)).toBe(true);
    expect(watched.frames.some((f) => f.events!.some((e) => e.restart))).toBe(true);
    expect(frameTimeIssues(watched.frames)).toEqual([]);
    expect(watched.result.record).toEqual(playGrid(setupFor('candidate-1', false, true)).record);
  });

  it('draws every flight from its kick to its arrival at the recorded times', () => {
    let flights = 0;
    for (const e of knotted) {
      const knots = e.knots!;
      knots.forEach((knot, i) => {
        if (knot.kind !== 'kick') return;
        const landing = knots[i + 1];
        if (!landing || landing.at <= knot.at) return;
        close(path(e.period, knot.at).at, toUnits(knot.ball, e.period));
        close(path(e.period, landing.at).at, toUnits(landing.ball, e.period));
        // Halfway through, the ball is still on its way: the flight is not shortened.
        const mid = path(e.period, (knot.at + landing.at) / 2).at;
        const to = toUnits(landing.ball, e.period);
        if (Math.hypot(...toUnits(knot.ball, e.period).map((v, j) => v - to[j]!)) > 5)
          expect(Math.hypot(mid[0] - to[0], mid[1] - to[1])).toBeGreaterThan(0.5);
        flights++;
      });
    }
    expect(flights).toBeGreaterThan(400);
  });

  it('renders arrival before the next kick', () => {
    let pairs = 0;
    for (let k = 1; k < knotted.length; k++) {
      const before = knotted[k - 1]!.knots!.at(-1)!;
      const kick = knotted[k]!.knots!.find((knot) => knot.kind === 'kick');
      if (!kick || knotted[k]!.period !== knotted[k - 1]!.period) continue;
      expect(before.at).toBeLessThanOrEqual(kick.at);
      pairs++;
    }
    expect(pairs).toBeGreaterThan(400);
    // The drawn track holds each arrival at its own time, inside the minute that shows it.
    let drawn = 0;
    for (const f of watched.frames)
      f.ballTimes!.forEach((t, j) => {
        const knot = knotted
          .flatMap((e) => (e.period === f.period ? e.knots! : []))
          .find((x) => x.at === t && (x.kind === 'receive' || x.kind === 'arrive'));
        if (!knot) return;
        close(f.ballTrack![j]!, toUnits(knot.ball, f.period), 0);
        drawn++;
      });
    expect(drawn).toBeGreaterThan(300);
  });

  it("ends each period's last action inside its final minute, so it is drawn", () => {
    let periods = 0;
    // A knockout tie level after 90 minutes: `candidate-et-4` plays extra time (T321's tuning
    // settled `candidate-et-0` in 90 minutes, T324's `candidate-et-3`).
    for (const id of ['candidate-1', 'candidate-end-2', 'candidate-end-3', 'candidate-et-4']) {
      const extraTime = id === 'candidate-et-4';
      const { result, frames } =
        id === 'candidate-1'
          ? watched
          : watch(id, true, extraTime ? { awayGoals: false } : undefined);
      expect(!!result.record.regulation).toBe(extraTime);
      // The clock holds whole minutes: (90 or 120 + added) × 60 exactly.
      const minutes = (extraTime ? 120 : 90) + result.record.added!.reduce((a, b) => a + b, 0);
      expect(result.elapsed).toBe(minutes * 60);
      for (const p of extraTime ? ([1, 2, 3, 4] as const) : ([1, 2] as const)) {
        const entries = result.trace!.filter((e) => e.period === p);
        const last = frames.filter((f) => f.period === p).at(-1)!;
        const end = last.startSeconds! + 60;
        const whistle = entries.at(-1)!.elapsed;
        const knots = entries.flatMap((e) => e.knots?.map((k) => k.at) ?? []);
        // The whistle comes after the final minute starts and by its end, with every knot before it.
        expect(whistle).toBeGreaterThan(last.startSeconds!);
        expect(whistle).toBeLessThanOrEqual(end);
        expect(Math.max(...knots)).toBeLessThanOrEqual(whistle);
        // A minute of the period draws its last knot at its own time.
        const final = Math.max(...knots);
        expect(
          frames.some((f) => f.period === p && f.ballTimes!.includes(final)),
          `period ${p} knot at ${final}`,
        ).toBe(true);
        periods++;
      }
      expect(frameTimeIssues(frames)).toEqual([]);
    }
    expect(periods).toBe(10);
  });

  it('preserves minute-boundary continuity', () => {
    const frames = watched.frames;
    // Running speed bound in units per match second (the ball's maximum along the shorter axis).
    const fastest = (GRID_BALL_CONFIG.max * 100) / 68;
    for (let i = 1; i < frames.length; i++) {
      const [a, b] = [frames[i - 1]!, frames[i]!];
      expect(a.motion!.at(-1)!.elapsedSeconds).toBe(a.startSeconds! + 60);
      if (a.period !== b.period) {
        // A new period opens with its own drawn sample at its whistle.
        expect(b.motion![0]!.elapsedSeconds).toBe(b.startSeconds);
        continue;
      }
      expect(b.startSeconds).toBe(a.startSeconds! + 60);
      const [t0, t1] = [a.ballTimes!.at(-1)!, b.ballTimes![0]!];
      const [p0, p1] = [a.ballTrack!.at(-1)!, b.ballTrack![0]!];
      expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])).toBeLessThanOrEqual(
        fastest * (t1 - t0) + 0.2,
      );
    }
  });
});
