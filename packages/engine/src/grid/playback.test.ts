import { describe, expect, it } from 'vitest';
import {
  frameTimeIssues,
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  NEUTRAL_FRAME_PACE,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import type { MatchFrame, MatchMotionSample } from '../../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { createWorld } from '../index';
import { validateFullMatchRecord } from '../match-model';
import { GRID_BALL_CONFIG } from './movement';
import { playGrid } from './engine';
import { attackFrame, PITCH, toUnits } from './pitch';
import { ballPath, buildFrames } from './playback';
import { buildGridSetup, type DecideRule } from './setup';
import { SHAPE_CONFIG } from './shape';
import type { TraceEntry } from './trace';

// The pre-feature path's world: `candidate` opts a fixture into the model.
const w = createWorld(
  {
    country: 'ENG',
    name: 'Grid Playback Lab',
    color: '#2a5d8f',
    seed: 'grid-playback',
    level: 'normal',
  },
  DISABLED_RELEASE,
);
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
/** `candidate` plays the current revision, or the one it names. */
const setupFor = (
  id: string,
  observe = true,
  candidate: boolean | MatchModelRevision = false,
  decide?: DecideRule,
) =>
  buildGridSetup(
    w,
    { ...w.fixtures[0]!, id, home: home!.id, away: away!.id },
    {
      observe,
      recordPlayers: true,
      tactics: ['press', 'possession'],
      ...(candidate ? { model: candidate === true ? MATCH_MODEL_REVISION : candidate } : {}),
      ...(decide ? { decide } : {}),
    },
  );
const watch = (
  id: string,
  candidate: boolean | MatchModelRevision = false,
  decide?: DecideRule,
) => {
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

  it('times every pre-feature minute explicitly and draws each period from its kick-off', () => {
    expect(frameTimeIssues(frames)).toEqual([]);
    frames.forEach((f, i) => {
      expect(f.startSeconds).toBeDefined();
      expect(f.motion!.at(-1)!.elapsedSeconds).toBe(f.startSeconds! + 60);
      expect(f.ballTrack!.length).toBeGreaterThanOrEqual(80);
      expect(f.ballTimes).toHaveLength(f.ballTrack!.length);
      if (i && frames[i - 1]!.period === f.period) return;
      // The opening sample: the ball on the centre spot and both sides in their own halves.
      const [opening] = f.motion!;
      expect(opening!.elapsedSeconds).toBe(f.startSeconds);
      expect(opening!.ball).toEqual([50, 50]);
      const home = f.period === 1 ? 0 : 1;
      for (const side of [0, 1] as const)
        for (const player of opening!.players[side])
          if (side === home) expect(player.position[0]).toBeLessThanOrEqual(50);
          else expect(player.position[0]).toBeGreaterThanOrEqual(50);
    });
  });

  it('puts the receiver on the ball where a pre-feature pass lands (MATCH-12)', () => {
    const at = new Map(frames.flatMap((f) => f.motion!.map((m) => [m.elapsedSeconds, m])));
    let landed = 0,
      passes = 0;
    for (const e of result.trace!) {
      if (e.action !== 'pass' || e.outcome !== 'complete' || e.receiver === undefined) continue;
      passes++;
      const sample = at.get(e.elapsed);
      if (!sample) continue;
      const receiver = sample.players[e.side].find(
        (p) => p.id === setup.rosters[e.side][e.receiver!]!.id,
      );
      if (!receiver) continue;
      // Within a metre of the ball in either direction.
      expect(Math.abs(receiver.position[0] - sample.ball[0])).toBeLessThan(1);
      expect(Math.abs(receiver.position[1] - sample.ball[1])).toBeLessThan(1.5);
      landed++;
    }
    expect(landed).toBeGreaterThan(passes * 0.8);
  });

  it('records who holds the ball through each minute (WEB-95)', () => {
    let held = 0;
    for (const f of frames) {
      const holders = f.holders!;
      expect(holders[0]![0]).toBe(0);
      holders.forEach(([t, who], i) => {
        if (!i) return;
        expect(t).toBeGreaterThan(holders[i - 1]![0]);
        expect(who).not.toBe(holders[i - 1]![1]);
      });
      for (let i = 0; i < holders.length; i++)
        if (holders[i]![1]) held += (holders[i + 1]?.[0] ?? 60) - holders[i]![0];
      // A sample's recorded owner is the holder at its instant.
      for (const sample of f.motion!) {
        const seconds = sample.elapsedSeconds - f.startSeconds!;
        const holder = holders.findLast(([t]) => t <= seconds + 0.05)?.[1];
        if (sample.ownerId) expect(holder).toBe(sample.ownerId);
      }
    }
    // Passes fly about as long as the candidate's, so receivers are seen on the ball.
    expect(held / (frames.length * 60)).toBeGreaterThan(0.25);
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

  it('draws dead time as a hurry to the places and a wait for the kick (T477)', () => {
    const samples = watched.frames.flatMap((f) => f.motion!);
    // Pitch metres between two drawn positions (units are percent of 105 × 68 m).
    const metres = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(((a[0]! - b[0]!) * PITCH.length) / 100, ((a[1]! - b[1]!) * PITCH.width) / 100);
    const speeds: number[] = [];
    let creep = 0;
    for (const f of watched.frames)
      for (const st of f.stoppages ?? []) {
        const [dead, kick] = [f.startSeconds! + st.dead, f.startSeconds! + st.kick];
        const inside = samples.filter(
          (m) => m.elapsedSeconds >= dead - 1e-6 && m.elapsedSeconds <= kick + 1e-6,
        );
        if (inside.length < 2) continue;
        for (const side of [0, 1] as const)
          for (const { id } of inside[0]!.players[side]) {
            const track = inside.map((m) => ({
              t: m.elapsedSeconds,
              at: m.players[side].find((p) => p.id === id)?.position,
            }));
            if (track.some((x) => !x.at)) continue;
            const end = track.at(-1)!.at!;
            const distance = metres(track[0]!.at!, end);
            if (distance <= 3) continue;
            // He arrives at the first sample from which he stays where the kick finds him.
            let arrive = track.length - 1;
            while (arrive > 0 && metres(track[arrive - 1]!.at!, end) < 0.2) arrive--;
            speeds.push(distance / Math.max(1e-9, track[arrive]!.t - track[0]!.t));
            for (let i = arrive + 1; i < track.length; i++)
              creep = Math.max(creep, metres(track[i]!.at!, track[arrive]!.at!));
          }
      }
    speeds.sort((a, b) => a - b);
    expect(speeds.length).toBeGreaterThan(200);
    // Walking pace or slower before T477 (0.10–0.78 m per match second by restart kind).
    expect(speeds[Math.floor(speeds.length / 2)]).toBeGreaterThanOrEqual(2);
    expect(creep).toBeLessThan(0.2);
  });

  it('lists every restart prepared on the clock as a stoppage of the minute it is kicked in (T477)', () => {
    const restarts = trace.filter(
      (e, n) =>
        n > 0 &&
        e.spot !== undefined &&
        e.kick !== undefined &&
        e.kick.elapsed > trace[n - 1]!.elapsed &&
        e.kick.elapsed < e.elapsed,
    );
    const listed = watched.frames.flatMap((f) =>
      (f.stoppages ?? []).map((st) => ({ ...st, at: f.startSeconds! + st.kick })),
    );
    expect(restarts.length).toBeGreaterThan(50);
    expect(listed).toHaveLength(restarts.length);
    listed.forEach((st, i) => {
      const e = restarts[i]!;
      expect(st.kind).toBe(e.action === 'indirectFreeKick' ? 'freeKick' : e.action);
      expect(st.at).toBeCloseTo(e.kick!.elapsed, 1);
      expect(st.dead).toBeLessThanOrEqual(st.settled);
      expect(st.settled).toBeLessThanOrEqual(st.kick);
      // Kicked in this minute (the last minute of a period also takes later kicks).
      expect(st.kick).toBeGreaterThanOrEqual(0);
    });
    // A period's opening kick-off is a transition; only kick-offs after a goal are stoppages.
    const goals = watched.result.record.score.home + watched.result.record.score.away;
    expect(listed.filter((st) => st.kind === 'kickoff').length).toBeLessThanOrEqual(goals);
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
    // Revision 10 (T596, T599, T600): this fixture is level after 90 minutes, so the timing
    // assertions below cover both extra-time periods too (candidate-et-10 on revision 9 with T580's
    // pass side, candidate-et-5 before it and on 8, candidate-et-1 on revision 7, candidate-et-4 on 6).
    const extraTimeId = 'candidate-et-7';
    for (const id of ['candidate-1', 'candidate-end-2', 'candidate-end-3', extraTimeId]) {
      const extraTime = id === extraTimeId;
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

/**
 * The share of open-play holds a viewer sees stand still (T426's drawn-hold measure): every spell
 * of one player on the ball (the frames' `holders`, joined across minutes) of at least 0.2 s whose
 * drawn position — the motion samples, straight between them as the page draws them — moves under
 * 0.3 m/s for more than half of it, in tenth-second steps. The spells MATCH-12 r27 lets him stand
 * on the ball are left out: those of a hold-up or lay-off, a keeper's and a restart's (the entry
 * whose play the spell's middle falls in).
 */
function stillHolds(
  frames: readonly MatchFrame[],
  trace: readonly TraceEntry[],
  rosters: readonly (readonly { id: string }[])[],
): number {
  const plays = trace.filter((e) => e.outcome !== 'incident');
  let j = 0;
  const standing = (id: string, p: number, mid: number) => {
    while (j < plays.length && (plays[j]!.period < p || plays[j]!.elapsed < mid)) j++;
    const e = plays[j];
    if (!e || e.period !== p) return false;
    const side = rosters[0]!.some((x) => x.id === id) ? 0 : 1;
    const idx = rosters[side]!.findIndex((x) => x.id === id);
    const keeper = e.slots[side * 11] === idx;
    return e.spot !== undefined || keeper || (e.action === 'holdUp' && e.idx === idx);
  };
  const samples = frames.flatMap((f) =>
    (f.motion ?? []).map((m) => ({
      t: m.elapsedSeconds,
      p: f.period,
      at: new Map(m.players.flat().map((x) => [x.id, x.position])),
    })),
  );
  const holds: { id: string; p: number; t0: number; t1: number }[] = [];
  for (const f of frames)
    (f.holders ?? []).forEach(([t, id], i, list) => {
      if (!id) return;
      const t0 = f.startSeconds! + t;
      const t1 = f.startSeconds! + (list[i + 1]?.[0] ?? 60);
      const last = holds.at(-1);
      if (last?.id === id && last.p === f.period && Math.abs(last.t1 - t0) < 1e-6) last.t1 = t1;
      else holds.push({ id, p: f.period!, t0, t1 });
    });
  let k = 0;
  const drawn = (id: string, p: number, t: number) => {
    while (k > 0 && (samples[k]!.p > p || (samples[k]!.p === p && samples[k]!.t > t))) k--;
    while (k + 1 < samples.length && samples[k + 1]!.p <= p && samples[k + 1]!.t <= t) k++;
    const [a, b] = [samples[k]!, samples[k + 1]];
    const pa = a.p === p ? a.at.get(id) : undefined;
    if (!pa || !b || b.p !== p || b.t <= a.t) return pa;
    const pb = b.at.get(id) ?? pa;
    const f = (t - a.t) / (b.t - a.t);
    return [pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f] as const;
  };
  let counted = 0,
    still = 0;
  for (const h of holds) {
    const length = h.t1 - h.t0;
    if (length < 0.2 || standing(h.id, h.p, (h.t0 + h.t1) / 2)) continue;
    const n = Math.max(2, Math.round(length / 0.1));
    let quiet = 0,
      was = drawn(h.id, h.p, h.t0);
    for (let i = 1; i <= n; i++) {
      const now = drawn(h.id, h.p, h.t0 + (length * i) / n);
      if (was && now) {
        const metres = Math.hypot(
          ((now[0] - was[0]) * PITCH.length) / 100,
          ((now[1] - was[1]) * PITCH.width) / 100,
        );
        if (metres / (length / n) < 0.3) quiet += length / n;
      }
      was = now;
    }
    counted++;
    if (quiet > length / 2) still++;
  }
  return still / counted;
}

describe('candidate in-stride carry in playback (→MATCH-12 r27, T426)', () => {
  const played = ['in-stride-1', 'in-stride-2', 'in-stride-3'].map((id) => {
    const setup = buildGridSetup(
      w,
      { ...w.fixtures[0]!, id, home: home!.id, away: away!.id },
      {
        observe: true,
        recordPlayers: true,
        tactics: ['possession', 'counter'],
        model: MATCH_MODEL_REVISION,
      },
    );
    const result = playGrid(setup);
    return { setup, result, frames: buildFrames(result, setup, w.seed) };
  });

  it("the candidate's carrier moves with the ball between reception and kick", () => {
    let carries = 0;
    for (const { setup, result, frames } of played) {
      expect(validateFullMatchRecord(result.record), result.record.id).toEqual([]);
      const ball = ballPath(result, setup, w.seed);
      for (const e of result.trace!) {
        const knots = e.knots ?? [];
        const k = knots.findIndex((knot) => knot.kind === 'kick');
        if (k < 2 || knots[k - 1]!.kind !== 'carry') continue;
        const [start, end, kick] = [knots[k - 2]!, knots[k - 1]!, knots[k]!];
        const from = toUnits(start.ball, e.period);
        const to = toUnits(end.ball, e.period);
        // At his feet from where he received it to where he kicks it, and played from there.
        expect(ball(e.period, start.at).at[0]).toBeCloseTo(from[0], 4);
        expect(ball(e.period, start.at).at[1]).toBeCloseTo(from[1], 4);
        expect(ball(e.period, kick.at).at[0]).toBeCloseTo(to[0], 4);
        expect(ball(e.period, kick.at).at[1]).toBeCloseTo(to[1], 4);
        const mid = ball(e.period, (start.at + end.at) / 2);
        expect(mid.holder).toEqual([e.side, e.idx]);
        if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1)
          expect(Math.hypot(mid.at[0] - from[0], mid.at[1] - from[1])).toBeGreaterThan(0.1);
        carries++;
      }
      // Open-play holds the page draws still: 0.42, 0.45 and 0.42 of every hold before the carry.
      expect(stillHolds(frames, result.trace!, setup.rosters)).toBeLessThanOrEqual(0.05);
    }
    expect(carries).toBeGreaterThan(300);
  });
});

describe('candidate set pieces in playback (→MATCH-12, MATCH-18, T348)', () => {
  /** The fastest any player runs: full pace, fresh, recovering after a turnover (m/s). */
  const TOP = (SHAPE_CONFIG.speed.base + SHAPE_CONFIG.speed.pace) * SHAPE_CONFIG.recoverySpeed;
  type Sample = MatchMotionSample & { period: number };
  /**
   * Every delivered set piece (a corner, or a free kick crossed) of an observed candidate match:
   * its entry, when its jobs started (the end of its preparation) and the motion samples from the
   * play before it to two plays after it.
   */
  function deliveries({ result, frames }: ReturnType<typeof watch>) {
    const trace = result.trace!;
    const samples: Sample[] = frames.flatMap((f) =>
      (f.motion ?? []).map((m) => ({ ...m, period: f.period })),
    );
    return trace.flatMap((e, n) => {
      if (!(e.action === 'corner' || (e.spot && e.kind === 'cross'))) return [];
      const retrieve = e.knots?.[0];
      if (retrieve?.kind !== 'retrieve') return [];
      const plays = (list: typeof trace) =>
        list.filter((x) => x.period === e.period && x.outcome !== 'incident');
      const from = plays(trace.slice(0, n)).at(-1)?.elapsed ?? retrieve.at;
      const later = plays(trace.slice(n + 1));
      const to = later[1]?.elapsed ?? e.elapsed;
      return [
        {
          e,
          // The entry just before: the dead ball, or an incident at its time.
          last: trace[n - 1],
          next: later[0]?.elapsed ?? Infinity,
          // A recorded kick next (a restart's preparation, T359, or a carried shot's kick, T445): from
          // the delivery's end until that kick the samples show its snapshot.
          prepared: later[0]?.kick !== undefined,
          since: retrieve.at + e.dead!,
          window: samples.filter(
            (m) => m.period === e.period && m.elapsedSeconds >= from && m.elapsedSeconds <= to,
          ),
        },
      ];
    });
  }
  const watched = watch('candidate-1', true);
  /** Observed candidate matches by ID, each played once for the tests below. */
  const matches = new Map([['candidate-1', watched]]);
  const match = (id: string) => {
    let m = matches.get(id);
    if (!m) matches.set(id, (m = watch(id, true)));
    return m;
  };
  /** Revision 3's observed match `id` (T481): its corners take today's numbers. */
  const match3 = (id: string) => watch(id, MATCH_MODEL_REVISIONS[2]);
  /**
   * Enough observed matches for both attacking directions, both corner touchlines and a
   * delivered free kick by each side.
   */
  const SCENES = ['candidate-1', 'set-piece-1', 'set-piece-2', 'set-piece-3'];
  const sceneOf = (e: TraceEntry) =>
    e.action === 'corner'
      ? `corner by ${e.side} from ${e.spot![1] < PITCH.width / 2 ? 'left' : 'right'}`
      : `free kick by ${e.side}`;
  const ALL_SCENES = [
    'corner by 0 from left',
    'corner by 0 from right',
    'corner by 1 from left',
    'corner by 1 from right',
    'free kick by 0',
    'free kick by 1',
  ];

  it('both sides retain continuous recorded paths through a corner', () => {
    const seen = new Set<string>();
    let pairs = 0;
    // The scene matches, then further set-piece matches until the sample is large enough (T442's
    // shut lanes left the four scene matches 810 pairs).
    const more = Array.from({ length: 20 }, (_, i) => `set-piece-${i + 4}`);
    for (const id of [...SCENES, ...more]) {
      const w = match(id);
      for (const { e, window } of deliveries(w)) {
        seen.add(sceneOf(e));
        // Every player of both sides moves between consecutive samples no faster than he can run,
        // from the play before the restart, through its preparation and delivery, to the second ball.
        for (let k = 1; k < window.length; k++) {
          const [a, b] = [window[k - 1]!, window[k]!];
          const dt = b.elapsedSeconds - a.elapsedSeconds;
          for (const side of [0, 1] as const)
            for (const p of b.players[side]) {
              const q = a.players[side].find((x) => x.id === p.id);
              if (!q) continue;
              const metres = Math.hypot(
                ((p.position[0] - q.position[0]) * PITCH.length) / 100,
                ((p.position[1] - q.position[1]) * PITCH.width) / 100,
              );
              expect(metres, `${p.id} at ${b.elapsedSeconds}`).toBeLessThanOrEqual(TOP * dt + 1e-3);
              pairs++;
            }
        }
      }
      if (seen.size === ALL_SCENES.length && pairs > 1000) break;
    }
    expect([...seen].sort()).toEqual(ALL_SCENES);
    expect(pairs).toBeGreaterThan(1000);
  });

  /**
   * A defending set-piece job (T348): a committed mark or cover since the kick (`defendSetPiece`),
   * not ended, read alike from a trace entry's intentions (`end`) and a sample's (`ended`), so both
   * sides of a check count the same jobs. An urgent job the kick's own update gave instead
   * (priority `danger`, also since the kick) is ordinary coordination, not a set-piece job (T366).
   */
  const isJob = (
    i:
      | { kind: string; priority: string; since: number; end?: unknown; ended?: unknown }
      | null
      | undefined,
    since: number,
  ): boolean =>
    !!i &&
    i.end === undefined &&
    i.ended === undefined &&
    i.since === since &&
    i.priority === 'committed' &&
    (i.kind === 'mark' || i.kind === 'cover');

  it('defensive placement is not discarded before its job ends', () => {
    // Every scene match (T366). T365 read `set-piece-2` alone, since `candidate-1` no longer
    // completes a delivery against six jobs; `set-piece-1` failed then only because the engine side
    // also counted an urgent mark given at the kick, which the samples side did not (see below).
    let shown = 0,
      kept = 0,
      checked = 0;
    // The scene matches, then further set-piece matches until the sample is large enough (T399's
    // flank beside a back three left the four scene matches 154 shown jobs).
    const more = Array.from({ length: 20 }, (_, i) => `set-piece-${i + 4}`);
    for (const id of [...SCENES, ...more]) {
      if (SCENES.indexOf(id) < 0 && kept > 0 && checked > 50 && shown > 200) break;
      const played = match(id);
      const ids = (side: 0 | 1) => played.setup.rosters[side].map((p) => p.id);
      for (const { e, next, prepared, since, window } of deliveries(played)) {
        const att = e.side;
        const def = att === 0 ? 1 : 0;
        // The engine's set-piece jobs of the defending side as the delivery lands.
        const engine = new Set<string>();
        for (let k = def * 11; k < def * 11 + 11; k++)
          if (isJob(e.intentions?.[k], since)) engine.add(ids(def)[e.slots[k]!]!);
        if (e.outcome === 'complete' && engine.size >= 6) kept++;
        for (const m of window.filter((x) => x.elapsedSeconds >= since)) {
          const label = `${id} ${sceneOf(e)} at ${m.elapsedSeconds}`;
          const jobs = m.players[def].filter((p) => isJob(p.intention, since));
          // The kick's own sample still shows the places walked to: the jobs start there (T359).
          if (m.elapsedSeconds === since) expect(jobs, label).toEqual([]);
          // From the kick until the next play the samples show exactly the engine's jobs, drawn as
          // marking (the keeper as guarding his goal), each mark on a different attacker on the
          // pitch; when the next play is a restart, its preparation shows its own places (T359).
          else if (m.elapsedSeconds < next && (!prepared || m.elapsedSeconds <= e.elapsed)) {
            expect(new Set(jobs.map((p) => p.id)), label).toEqual(engine);
            checked++;
          }
          const attackers = new Set(m.players[att].map((p) => p.id));
          const marked = jobs.flatMap((p) =>
            p.intention!.kind === 'mark' ? [p.intention!.opponent!] : [],
          );
          expect(new Set(marked).size, label).toBe(marked.length);
          for (const runner of marked) expect(attackers.has(runner), label).toBe(true);
          for (const p of jobs) expect(['mark', 'keeper'], label).toContain(p.state);
          shown += jobs.length;
        }
      }
    }
    expect(kept).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(50);
    expect(shown).toBeGreaterThan(200);
    // Repeated same-seed runs reproduce exactly.
    const again = watch('set-piece-2', true);
    expect(deliveries(again).map((d) => d.window)).toEqual(
      deliveries(match('set-piece-2')).map((d) => d.window),
    );
    // The pre-feature path keeps its own set pieces: no intentions are traced there (its settled
    // facts are guarded by grid-throughput's pre-feature digests).
    expect(result.trace!.some((x) => x.action === 'corner')).toBe(true);
    expect(result.trace!.every((x) => x.intentions === undefined)).toBe(true);
  });

  it("an urgent job the kick's own update gives shows from the kick until the next play", () => {
    // T366: the update that reads the kick runs at the kick's own instant (`playGrid`, once the
    // restart resolves), so an urgent danger there (an attacker on the ball within 30 m of goal, a
    // runner nobody marks) gives urgent jobs since the kick and may displace a set-piece job as it
    // starts. Playback shows each as the engine holds it: no stage drops a job. In the scene matches
    // these are urgent presses and urgent marks by a zone's guard on a runner whom nobody's place
    // names (T370's `set-piece-1`: `p:8` on runner 8 on the edge, a man short). Before T367 the man-marker `p:10` left
    // runner 9 for him instead; a set-piece mark is now taken for the urgent pairing.
    // T373: a taker whose delivery handed the ball to nobody (headed out, a goal kick, a foul) is
    // no carrier for that update, so in every scene match no urgent press at a kick goes to him
    // unless the outcome gave him the ball again (he takes it: a receive since the kick). Before,
    // the nearest defender, however far, left his job to press him at the flag or the spot.
    let toReceivers = 0;
    for (const id of SCENES) {
      const w = match(id);
      for (const { e, since } of deliveries(w)) {
        const att = e.side;
        const def = att === 0 ? 1 : 0;
        const slot = (side: 0 | 1, idx: number) =>
          slotFor(w, e, side, w.setup.rosters[side][idx]!.id);
        const own = e.intentions?.[slot(att, e.idx)];
        const handed = own?.kind === 'receive' && own.since === since;
        for (let k = def * 11; k < def * 11 + 11; k++) {
          const i = e.intentions?.[k];
          if (!i || 'end' in i || i.since !== since || i.priority !== 'danger') continue;
          if (i.kind !== 'press') continue;
          if (i.opponent === e.idx)
            expect(handed, `${id} ${sceneOf(e)} at ${since}: the taker pressed`).toBe(true);
          else toReceivers++;
        }
      }
    }
    expect(toReceivers).toBeGreaterThan(0);
    const { mark } = SHAPE_CONFIG.setPiece;
    let samples = 0,
      kept = 0;
    const kinds: string[] = [];
    // The scene matches, then further set-piece matches until a kick has given both an urgent
    // mark and an urgent press (T371: its restart and finishing settings left no scene match with
    // an urgent mark at a kick).
    const more = Array.from({ length: 40 }, (_, i) => `set-piece-${i + 4}`);
    // Revision 4 marks every attacker who goes up for a corner (T480), so a runner nobody marks at a
    // kick, which an urgent mark answers, is rare there; revision 3's same fixtures still give one,
    // and playback draws every revision alike.
    const earlier = more.map((id) => `${id}@3`);
    for (const id of [...SCENES, ...more, ...earlier]) {
      if (SCENES.indexOf(id) < 0 && kinds.includes('mark') && kinds.includes('press')) break;
      const played = id.endsWith('@3') ? match3(id.slice(0, -2)) : match(id);
      const ids = (side: 0 | 1) => played.setup.rosters[side].map((p) => p.id);
      for (const { e, next, prepared, since, window } of deliveries(played)) {
        const att = e.side;
        const def = att === 0 ? 1 : 0;
        const kick = e.kick!;
        // An incident after the delivery (an injury, a substitution) may end a job as its
        // reference leaves (`departed`, T443's `set-piece-3`): the samples are read up to it.
        const trace = played.result.trace!;
        const incident =
          trace
            .slice(trace.indexOf(e) + 1)
            .find((x) => x.outcome === 'incident' && x.period === e.period)?.elapsed ?? Infinity;
        /** The intention an entry or the kick records for `side`'s roster index `idx`. */
        const held = (snap: typeof e | typeof kick, side: 0 | 1, idx: number) =>
          snap.intentions?.[slotFor(played, snap, side, ids(side)[idx]!)];
        /** Each restart place of the kick in the attacking side's frame, by roster index. */
        const places = (side: 0 | 1) =>
          played.setup.rosters[side].flatMap((_, idx) => {
            const i = held(kick, side, idx);
            return i && !('end' in i) && i.kind === 'restart'
              ? [[idx, attackFrame(att, i.target)] as const]
              : [];
          });
        // A man-marker's place is `setPiece.mark` m goal-side of his runner's spot (`setPieceTargets`).
        const runnerOf = new Map<number, number>();
        for (const [d, p] of places(def))
          for (const [a, q] of places(att))
            if (Math.abs(p[0] - q[0] - mark) < 1e-9 && p[1] === q[1]) runnerOf.set(d, a);
        const urgent = (i: ReturnType<typeof held>) =>
          !!i && !('end' in i) && i.since === since && i.priority === 'danger';
        // T367: at a kick whose update gives an urgent mark, every man-marker whose runner still holds
        // his box spot keeps his set-piece mark on him; only an urgent press on the man the delivery
        // reached takes him off it (T373: never one on the taker).
        const pairing = played.setup.rosters[def].some((_, idx) => {
          const i = held(e, def, idx);
          return urgent(i) && i!.kind === 'mark';
        });
        for (const [d, a] of pairing ? runnerOf : []) {
          const run = held(e, att, a);
          if (!run || 'end' in run || run.kind !== 'run' || run.priority !== 'committed') continue;
          const i = held(e, def, d);
          if (urgent(i) && i!.kind === 'press') continue;
          const label = `${sceneOf(e)} at ${since} ${ids(def)[d]}`;
          expect(isJob(i, since), label).toBe(true);
          expect(i, label).toMatchObject({ kind: 'mark', opponent: a });
          kept++;
        }
        for (let k = def * 11; k < def * 11 + 11; k++) {
          const i = e.intentions?.[k];
          // An urgent job the kick's own update gave, held since the kick, to a man of the scene (on
          // his restart place at the kick).
          if (!i || !urgent(i)) continue;
          const pid = ids(def)[e.slots[k]!]!;
          const place = kick.intentions?.[slotFor(played, kick, def, pid)];
          if (!place || 'end' in place || place.kind !== 'restart') continue;
          const opponent = i.opponent === undefined ? undefined : ids(e.side)[i.opponent];
          kinds.push(i.kind);
          // An urgent mark goes to a man whose place marks nobody (a zone's guard here, T367).
          if (i.kind === 'mark') expect(runnerOf.has(e.slots[k]!), `${since} ${pid}`).toBe(false);
          for (const m of window) {
            if (m.elapsedSeconds < since) continue;
            if (m.elapsedSeconds >= next || m.elapsedSeconds >= incident) break;
            if (prepared && m.elapsedSeconds > e.elapsed) break;
            const label = `${sceneOf(e)} at ${m.elapsedSeconds} ${pid}`;
            const p = m.players[def].find((x) => x.id === pid)!;
            // The kick's own sample: the place he walked to. A set-piece job he was given there ended
            // at that instant, so no sample can show it.
            if (m.elapsedSeconds === since) {
              expect(p.intention, label).toMatchObject({ kind: 'restart', priority: 'restart' });
              continue;
            }
            // Every later sample until the next play: the urgent job exactly as the entry records it.
            expect(p.intention, label).toMatchObject({
              kind: i.kind,
              priority: i.priority,
              since,
              until: i.until,
            });
            expect(p.intention!.ended, label).toBeUndefined();
            expect(p.intention!.opponent, label).toBe(opponent);
            expect(p.state, label).toBe(i.kind === 'press' ? 'press' : 'mark');
            expect(isJob(p.intention, since), label).toBe(false);
            // An urgent mark takes a runner no set-piece job marks.
            if (i.kind === 'mark')
              for (const q of m.players[def])
                if (isJob(q.intention, since) && q.intention!.kind === 'mark')
                  expect(q.intention!.opponent, label).not.toBe(opponent);
            samples++;
          }
        }
      }
    }
    expect(kinds).toContain('mark');
    expect(kinds).toContain('press');
    // A kick whose next play follows within the sampling interval has no later sample to check.
    expect(samples).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  /** Every on-pitch player of a snapshot in playback units of its period, by player ID. */
  function placesIn(
    snap: Pick<TraceEntry, 'positions' | 'slots'>,
    period: 1 | 2 | 3 | 4,
    { setup }: ReturnType<typeof watch>,
  ) {
    const out = new Map<string, [number, number]>();
    for (let k = 0; k < 22; k++) {
      const idx = snap.slots[k]!;
      if (idx < 0) continue;
      const id = setup.rosters[k < 11 ? 0 : 1][idx]!.id;
      out.set(id, toUnits([snap.positions[k * 2]!, snap.positions[k * 2 + 1]!], period));
    }
    return out;
  }
  /** Where player `pid` of `side` is in a snapshot: its index in `slots` (side × 11 + slot), or -1. */
  function slotFor(
    { setup }: ReturnType<typeof watch>,
    snap: Pick<TraceEntry, 'slots'>,
    side: 0 | 1,
    pid: string,
  ) {
    const idx = setup.rosters[side].findIndex((p) => p.id === pid);
    for (let k = side * 11; k < side * 11 + 11; k++) if (snap.slots[k] === idx) return k;
    return -1;
  }
  const near = (a: readonly number[], b: readonly number[], label: string) => {
    expect(a[0], label).toBeCloseTo(b[0]!, 3);
    expect(a[1], label).toBeCloseTo(b[1]!, 3);
  };

  it('playback passes through the recorded kick of a corner', () => {
    const seen = new Set<string>();
    let bent = 0,
      scenes = 0;
    for (const id of SCENES) {
      const w = match(id);
      for (const { e, last, since, window } of deliveries(w)) {
        const label = `${id} ${sceneOf(e)} at ${e.elapsed}`;
        seen.add(sceneOf(e));
        scenes++;
        // Recorded as `restartTaken` runs: when the preparation ends and the jobs start, before
        // the delivery's entry.
        const kick = e.kick!;
        expect(kick, label).toBeDefined();
        expect(kick.elapsed, label).toBe(since);
        expect(kick.elapsed, label).toBeLessThan(e.elapsed);
        // The walk-in ends on the places: the taker on the spot, the scene on its restart places.
        let placed = 0;
        for (let k = 0; k < 22; k++) {
          const i = kick.intentions?.[k];
          if (!i || 'end' in i || i.kind !== 'restart') continue;
          near([kick.positions[k * 2]!, kick.positions[k * 2 + 1]!], i.target, label);
          placed++;
        }
        expect(placed, label).toBeGreaterThan(6);
        const taker = slotFor(w, kick, e.side, w.setup.rosters[e.side][e.idx]!.id);
        near([kick.positions[taker * 2]!, kick.positions[taker * 2 + 1]!], e.spot!, label);
        // Playback draws that instant: a sample at the kick, everyone where the kick has him and
        // the ball on the spot.
        const at = window.find((m) => m.elapsedSeconds === kick.elapsed);
        expect(at, label).toBeDefined();
        const recorded = placesIn(kick, e.period, w);
        const drawn = at!.players.flat();
        expect(drawn.map((p) => p.id).sort(), label).toEqual([...recorded.keys()].sort());
        for (const p of drawn) near(p.position, recorded.get(p.id)!, `${label} ${p.id}`);
        near(at!.ball, toUnits(e.spot!, e.period), label);
        // Not one straight move from the dead ball to the delivery's end: the kick puts someone
        // more than a metre off that line.
        const [a, b] = [placesIn(last!, e.period, w), placesIn(e, e.period, w)];
        const f = (kick.elapsed - last!.elapsed) / (e.elapsed - last!.elapsed);
        const off = [...recorded].map(([pid, p]) => {
          const [q, r] = [a.get(pid)!, b.get(pid)!];
          const line = [q[0] + (r[0] - q[0]) * f, q[1] + (r[1] - q[1]) * f];
          return Math.hypot(
            ((p[0] - line[0]!) * PITCH.length) / 100,
            ((p[1] - line[1]!) * PITCH.width) / 100,
          );
        });
        if (Math.max(...off) > 1) bent++;
      }
      if (seen.size === ALL_SCENES.length) break;
    }
    expect([...seen].sort()).toEqual(ALL_SCENES);
    expect(bent).toBe(scenes);
    // Same-seed reruns reproduce exactly, kicks and samples.
    const again = watch('set-piece-1', true);
    const kicks = (w: ReturnType<typeof watch>) =>
      deliveries(w).map((d) => ({ kick: d.e.kick, window: d.window }));
    expect(kicks(again)).toEqual(kicks(match('set-piece-1')));
  });

  it("restart preparation samples show the restart's intentions", () => {
    let restarts = 0,
      prepared = 0,
      places = 0,
      displaced = 0,
      delivered = 0;
    const kinds = new Set<string>();
    for (const id of SCENES) {
      const w = match(id);
      const trace = w.result.trace!;
      const samples = w.frames.flatMap((f) =>
        (f.motion ?? []).map((m) => ({ ...m, period: f.period })),
      );
      trace.forEach((e, n) => {
        const kick = e.kick;
        // A restart's kick; a shot after an in-stride carry records its kick too (T445).
        if (!kick || !e.spot) return;
        // The entry before: the dead ball, or an incident at its time; then the preparation.
        const a = trace[n - 1]!;
        expect(a.period).toBe(e.period);
        expect(a.elapsed).toBeLessThan(kick.elapsed);
        restarts++;
        kinds.add(e.action);
        for (const m of samples) {
          if (m.period !== e.period || m.elapsedSeconds <= a.elapsed) continue;
          if (m.elapsedSeconds >= e.elapsed) break;
          // The preparation shows the kick's snapshot; the delivery, from the kick, its entry.
          const snap: Pick<TraceEntry, 'slots' | 'intentions'> =
            m.elapsedSeconds <= kick.elapsed ? kick : e;
          if (snap === kick) prepared++;
          else delivered++;
          for (const side of [0, 1] as const)
            for (const p of m.players[side]) {
              const i = snap.intentions?.[slotFor(w, snap, side, p.id)];
              const label = `${id} ${e.action} at ${m.elapsedSeconds} ${p.id}`;
              if (!i) {
                expect(p.intention, label).toBeUndefined();
                continue;
              }
              expect(p.intention, label).toMatchObject({
                kind: i.kind,
                priority: i.priority,
                since: i.since,
                until: i.until,
              });
              expect(p.intention!.ended, label).toBe('end' in i ? i.end : undefined);
              if (snap !== kick) continue;
              // Nothing the play before held is still held: only the restart's places are, taken
              // since the ball went dead, and the walk-in heads for them.
              const held = p.intention && !p.intention.ended;
              if (held) {
                expect(p.intention!.kind, label).toBe('restart');
                expect(p.intention!.since, label).toBeGreaterThanOrEqual(a.elapsed);
                near(p.intent, toUnits(i.target, e.period), label);
                places++;
              }
              const was = a.intentions?.[slotFor(w, a, side, p.id)];
              if (was && !('end' in was) && was.kind !== 'restart') {
                displaced++;
                if (held) expect(p.intention!.since, label).not.toBe(was.since);
              }
            }
        }
      });
    }
    expect([...kinds]).toEqual(
      expect.arrayContaining(['corner', 'throwIn', 'goalKick', 'freeKick', 'kickoff']),
    );
    expect(restarts).toBeGreaterThan(300);
    expect(prepared).toBeGreaterThan(600);
    expect(places).toBeGreaterThan(2000);
    expect(displaced).toBeGreaterThan(2000);
    expect(delivered).toBeGreaterThan(0);
    // An older trace without kicks stays readable: its preparation shows the play before, drawn
    // as one move to the restart's entry, as before the kick was recorded.
    const old = {
      ...watched.result,
      trace: watched.result.trace!.map((e) => {
        const copy = { ...e };
        delete copy.kick;
        return copy;
      }),
    };
    const frames = buildFrames(old, watched.setup, w.seed);
    expect(frameTimeIssues(frames)).toEqual([]);
    // The first corner after running play (T444's deliveries made `candidate-1`'s first corner
    // follow a throw-in that went out, a restart straight after a restart).
    const corner = old.trace.findIndex(
      (e, n) => n > 0 && e.action === 'corner' && old.trace[n - 1]!.tags !== undefined,
    );
    const [a, e] = [old.trace[corner - 1]!, old.trace[corner]!];
    const during = frames
      .filter((f) => f.period === e.period)
      .flatMap((f) => f.motion!)
      .filter((m) => m.elapsedSeconds > a.elapsed && m.elapsedSeconds < e.elapsed);
    expect(during.length).toBeGreaterThan(0);
    const before = placesIn(a, e.period, watched);
    const after = placesIn(e, e.period, watched);
    for (const m of during)
      for (const side of [0, 1] as const)
        for (const p of m.players[side]) {
          const f = (m.elapsedSeconds - a.elapsed) / (e.elapsed - a.elapsed);
          const [q, r] = [before.get(p.id)!, after.get(p.id)!];
          if (p.id === watched.setup.rosters[e.side][e.idx]!.id) continue;
          near(p.position, [q[0] + (r[0] - q[0]) * f, q[1] + (r[1] - q[1]) * f], p.id);
          const was = a.intentions![slotFor(watched, a, side, p.id)];
          expect(p.intention?.since).toBe(was?.since);
        }
    // The pre-feature path records no kick.
    expect(result.trace!.every((x) => x.kick === undefined)).toBe(true);
  });
});
