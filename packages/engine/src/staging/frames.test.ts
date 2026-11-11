import { describe, expect, it } from 'vitest';
import type { MatchScript } from '../../../contracts/src/match-script';
import { frameTimeIssues } from '../../../contracts/src/match-model';
import { M } from '../grid/record';
import { sampleDetail, smallDetail } from '../../../../tests/fixtures/match-script';
import { writeScript } from '../script/write';
import { clockRates, stageAll, stageFrames } from './frames';
import { matchSecond } from './frame-clock';
import { pictureAt, ownership, timedEvents, timedFrames } from './frame-samples';
import { frameTestInputs } from './frames.testkit';
import { matchScript, scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';
import { advance, createStaging } from './staging';

const hand = matchScript(
  scriptOf(demoFixture(), [
    { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
    { kind: 'pass', actor: 5, receiver: 6, to: [60, 24] },
    { kind: 'carry', actor: 6, to: [70, 30], outcome: 'tackled', opponent: 13 },
    { kind: 'pass', team: 1, actor: 13, receiver: 15, to: [62, 40], possession: 2 },
    { kind: 'pass', team: 1, actor: 15, to: [70, 69], outcome: 'out', possession: 2 },
    { kind: 'throwIn', actor: 4, receiver: 8, to: [75, 54], possession: 3 },
    {
      kind: 'shot',
      actor: 8,
      to: [105, 34],
      outcome: 'saved',
      opponent: 11,
      possession: 3,
      header: true,
    },
  ]),
);
hand.beats.forEach((b, i) => (b.clock = [0, 12, 21, 35, 40, 61, 72][i]));
Object.assign(hand.beats[1], { event: 0, move: 'short' });
Object.assign(hand.beats[2], { event: 1, move: 'carry' });
Object.assign(hand.beats[5], { event: 2, move: 'short' });
Object.assign(hand.beats[6], {
  shot: 0,
  xg: 20,
  shotKind: 'open',
  source: 2,
  keyPass: 4,
  keeper: 0,
});
const input = frameTestInputs(hand);
const frames = stageAll(hand, input.sides, input.record, input.squads);

describe('staged match frames', () => {
  it('yields a minute containing a corner delivery before its ledger cause is performed', () => {
    const script: MatchScript = {
      ...hand,
      beats: [
        hand.beats[0],
        {
          ...hand.beats[5],
          index: 1,
          kind: 'corner',
          move: 'cross',
          setPiece: 'corner',
          event: 0,
          clock: 61,
          from: [105, 0],
          to: [94, 34],
        },
        {
          ...hand.beats[6],
          index: 2,
          clock: 121,
          source: 0,
          shotKind: 'corner',
          from: [94, 34],
          corner: true,
        },
      ],
    };
    const args = frameTestInputs(script);
    const all = stageAll(script, args.sides, args.record, args.squads);
    expect(all).toHaveLength(3);
    expect(all[1].metrics[0][M.passes]).toBe(1);
    expect(all[1].metrics[0][M.shots]).toBe(0);
    expect(all[2].metrics[0][M.shots]).toBe(1);
    expect(all.at(-1)!.score).toEqual(args.record.score);
  });
  it("frames follow the contract's time rules", () => {
    expect(frameTimeIssues(frames)).toEqual([]);
    expect(frames).toHaveLength(2);
    expect(
      frames.map((f) => [f.startSeconds, f.elapsedSeconds, f.period, f.label, f.pace]),
    ).toEqual([
      [0, 60, 1, '1', 1],
      [60, 120, 1, '2', 1],
    ]);
    for (const f of frames) {
      expect(f.ballTrack?.length).toBe(f.ballTimes?.length);
      expect(f.motion!.at(-1)!.elapsedSeconds).toBe(f.startSeconds! + 60);
      expect(f.onPitch).toEqual(f.players!.map((s) => s.map((p) => p.id)));
      expect(f.motion!.flatMap((s) => s.players.flat()).some((p) => p.intention)).toBe(false);
    }
  });

  it('the clock never runs backward and every fixed beat falls in its recorded minute', () => {
    const events = frames.flatMap((f) =>
      f.events!.map((e) => ({ e, time: f.startSeconds! + e.t })),
    );
    expect(events.map((e) => e.time)).toEqual(events.map((e) => e.time).sort((a, b) => a - b));
    expect(events.find(({ e }) => e.kind === 'shot')!.time).toBeGreaterThanOrEqual(60);
    expect(events.find(({ e }) => e.kind === 'shot')!.time).toBeLessThan(120);
  });

  it("the picture's seconds are fitted to the clock at one rate between two fixed moments", () => {
    const staging = advance(createStaging(hand, input.sides), Infinity);
    const rates = clockRates(hand, staging);
    expect(rates.every((r) => r.rate > 0)).toBe(true);
    const r = rates.find((r) => r.to - r.from > 3)!;
    expect(matchSecond(r, r.from + 2) - matchSecond(r, r.from + 1)).toBeCloseTo(r.rate, 9);
    const raw = timedFrames(staging.frames, rates),
      events = timedEvents(staging.events, rates);
    const identity = {
      ids: [input.squads[0].map((p) => p.id), input.squads[1].map((p) => p.id)] as [
        string[],
        string[],
      ],
      names: [[], []] as [string[], string[]],
    };
    const owners = ownership(raw, events, hand, identity);
    const f = raw.find(
      (f) =>
        f.frame.t > r.from &&
        f.frame.t < r.to &&
        f.frame.p.some((p) => Math.hypot(...p.movement!.velocity) > 1),
    )!;
    const sample = pictureAt(raw, owners, f.time, identity).sample;
    const body = f.frame.p[0],
      shown = sample.players[0].find((p) => p.id === identity.ids[0][body.player.line])!;
    expect(shown.velocity[0]).toBeCloseTo(
      (body.movement!.velocity[0] * 100) / 105 / f.rate.rate,
      10,
    );
    expect(shown.velocity[1]).toBeCloseTo(
      (body.movement!.velocity[1] * 100) / 68 / f.rate.rate,
      10,
    );
    for (const frame of frames)
      for (const t of frame.ballTimes!) expect(t).toBeGreaterThanOrEqual(frame.startSeconds!);
  });

  it('the holder list names who has the ball and nobody while it flies or lies', () => {
    for (const f of frames)
      for (const s of f.motion!) {
        const holder =
          f.holders!.filter(([t]) => t <= s.elapsedSeconds - f.startSeconds! + 1e-9).at(-1)?.[1] ??
          '';
        // A minute-end sample has the next minute's boundary ownership.
        if (s.elapsedSeconds === f.startSeconds! + 60) continue;
        expect(holder).toBe(s.ownerId ?? '');
        if (holder) expect(s.players.flat().some((p) => p.id === holder)).toBe(true);
      }
    expect(frames.flatMap((f) => f.holders!).some(([, id]) => !id)).toBe(true);
    expect(frames[0].holders![0][1]).toBe('0:9');
  });

  it('a restart is a stoppage with dead ≤ settled ≤ kick', () => {
    const stops = frames.flatMap((f) => f.stoppages!);
    expect(stops.some((s) => s.kind === 'throwIn')).toBe(true);
    expect(stops.every((s) => s.dead <= s.settled && s.settled <= s.kick)).toBe(true);
  });

  it('a pass, shot, tackle, throw-in and save carry what a pose needs', () => {
    const events = frames.flatMap((f) => f.events!);
    const pass = events.find((e) => e.kind === 'pass' && e.actor === '0:5')!;
    expect(pass.receiver).toBe('0:6');
    expect(pass.opponent).toBeUndefined();
    expect(pass.ok).toBe(true);
    const tackle = events.find((e) => e.kind === 'carry' && e.lost)!;
    expect(tackle.opponent).toBe('1:2');
    const shot = events.find((e) => e.kind === 'shot')!;
    expect(shot).toMatchObject({
      actor: '0:8',
      opponent: '1:0',
      outcome: 'save',
      header: true,
      xg: 0.2,
    });
    expect(events.find((e) => e.restart === 'throwIn')).toMatchObject({
      kind: 'restart',
      actor: '0:4',
      receiver: '0:8',
    });
    for (const e of events) {
      expect(e.text.length).toBeGreaterThan(0);
      expect(e.from.every(Number.isFinite)).toBe(true);
      expect(e.to.every(Number.isFinite)).toBe(true);
    }
    expect(input.record.score).toEqual({ home: 0, away: 0 });
  });

  it('a frame is one match minute and carries its label through all four periods and added time', () => {
    const script: MatchScript = {
      ...hand,
      beats: [
        { ...hand.beats[0], index: 0, clock: 0, period: 1 },
        { ...hand.beats[0], index: 1, side: 1, clock: 2700, period: 2 },
        { ...hand.beats[0], index: 2, clock: 5400, period: 3 },
        { ...hand.beats[0], index: 3, side: 1, clock: 6300, period: 4 },
        { ...hand.beats[1], index: 4, clock: 7170, period: 4 },
      ],
    };
    const detail = smallDetail();
    detail.length = 120;
    detail.added = [2, 4, 1, 0];
    const args = frameTestInputs(script, detail);
    const all = stageAll(script, args.sides, args.record, args.squads);
    expect(frameTimeIssues(all)).toEqual([]);
    expect(all.map((f) => f.label)).toContain('45+2');
    expect(all.map((f) => f.label)).toContain('90+4');
    expect(all.map((f) => f.label)).toContain('105+1');
    expect(new Set(all.map((f) => f.period))).toEqual(new Set([1, 2, 3, 4]));
    expect(
      all.flatMap((f) => f.events!.filter((e) => e.kind === 'kickoff').map(() => f.minute)),
    ).toEqual([1, 46, 91, 106]);
    expect(all.at(-1)!.startSeconds! + 60).toBe((120 + 7) * 60);
  });

  it('a five-minute fixture cut and a stopped generator need no full match', () => {
    const written = writeScript(sampleDetail(), 'frame-cut');
    if (!('script' in written)) throw new Error('script failed');
    const cut = { ...written.script, beats: written.script.beats.filter((b) => b.clock < 300) };
    const args = frameTestInputs(cut, sampleDetail());
    const generator = stageFrames(cut, args.sides, args.record, args.squads);
    const first = generator.next();
    expect(first.done).toBe(false);
    expect(first.value!.label).toBe('1');
    generator.return(undefined as never);
    const all = stageAll(cut, args.sides, args.record, args.squads);
    expect(all).toHaveLength(5);
    expect(frameTimeIssues(all)).toEqual([]);
    expect(all.at(-1)!.metrics[0][M.shots]).toBeLessThanOrEqual(args.record.metrics[0][M.shots]);
  });

  it('goal events, cumulative counts and xG reconcile from performed beats rather than the record score', () => {
    const script = structuredClone(hand);
    const shot = script.beats.at(-1)!;
    shot.outcome = 'goal';
    delete shot.opponent;
    const args = frameTestInputs(script);
    const all = stageAll(
      script,
      args.sides,
      { ...args.record, score: { home: 99, away: 99 } },
      args.squads,
    );
    expect(all[0].score).toEqual({ home: 0, away: 0 });
    expect(all.at(-1)!.score).toEqual({ home: 1, away: 0 });
    expect(all[1].events!.filter((e) => e.outcome === 'goal')).toMatchObject([
      { actor: '0:8', side: 0 },
    ]);
    for (const side of [0, 1] as const) {
      expect(all.at(-1)!.metrics[side].slice(0, M.minutes)).toEqual(
        args.record.metrics[side].slice(0, M.minutes),
      );
      expect(all.at(-1)!.metrics[side][M.possession]).toBe(args.record.metrics[side][M.possession]);
    }
    expect(all.at(-1)!.xg).toEqual(args.record.xg);
  });

  it('an incident walk changes the XI at the staged crossing and stays inside its recorded stoppage', () => {
    const detail = smallDetail();
    detail.sides[0].lines.push({ ...detail.sides[0].lines[5], id: '0:11' });
    const script = structuredClone(hand);
    script.beats = script.beats.slice(0, 2);
    script.beats.push({
      ...hand.beats[1],
      index: 2,
      kind: 'stoppage',
      clock: 61,
      actor: 5,
      receiver: undefined,
      event: undefined,
      incidents: [{ kind: 'sub', side: 0, line: 5, other: 11 }],
    });
    script.beats.push({
      ...hand.beats[1],
      index: 3,
      clock: 95,
      actor: 11,
      event: undefined,
      kind: 'freeKick',
    });
    const args = frameTestInputs(script, detail);
    const all = stageAll(script, args.sides, args.record, args.squads);
    const subFrame = all.find((f) => f.events!.some((e) => e.kind === 'sub'))!;
    expect(subFrame.minute).toBe(2);
    const sub = subFrame.events!.find((e) => e.kind === 'sub')!;
    expect(sub).toMatchObject({ actor: '0:5', receiver: '0:11' });
    const at = subFrame.startSeconds! + sub.t;
    const stops = all.flatMap((f) =>
      f.stoppages!.map((s) => ({ dead: f.startSeconds! + s.dead, kick: f.startSeconds! + s.kick })),
    );
    expect(stops.some((s) => s.dead <= at && at <= s.kick)).toBe(true);
    const samples = all.flatMap((f) => f.motion!);
    for (const sample of samples) {
      const ids = sample.players[0].map((p) => p.id);
      expect(ids).toContain(sample.elapsedSeconds < at - 1e-8 ? '0:5' : '0:11');
      expect(ids).not.toContain(sample.elapsedSeconds < at - 1e-8 ? '0:11' : '0:5');
    }
  });
});
