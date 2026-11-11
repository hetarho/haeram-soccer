import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { BOX_X, BOX_Y } from './pitch';
import { offsideLineX } from './places';
import { demoFixture } from './squads.testkit';
import type { Frame, Playback, StageEvent, Vec } from './types';
import { dist } from './vec';
import { performScript } from './script.testkit';
import { offsideKicks, posOf, scriptOf, type BeatSpec } from './script.testkit';

// Fixed scripts F–L of T797 (home = slot, away = 11 + slot), each after K and P.
const fixture = demoFixture();
const STAGE = STAGING_CONFIG.stage;

const K: BeatSpec = { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] };
const P: BeatSpec = { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] };
const H2: BeatSpec[] = [
  { kind: 'pass', actor: 6, receiver: 9, to: [66, 32] },
  { kind: 'carry', actor: 9, to: [86, 34] },
];
const GOAL_KICK: BeatSpec = {
  team: 1,
  kind: 'goalKick',
  actor: 11,
  receiver: 13,
  to: [93, 16],
  possession: 3,
};

const SCRIPTS = {
  F: [
    K,
    P,
    { kind: 'pass', actor: 6, receiver: 8, to: [84, 16], through: true, hold: 1.4 },
    { kind: 'carry', actor: 8, to: [92, 24] },
    { kind: 'shot', actor: 8, to: [105, 32.5], outcome: 'wide' },
    { ...GOAL_KICK, possession: 2 },
  ],
  G: [
    K,
    P,
    {
      kind: 'pass',
      actor: 6,
      receiver: 8,
      to: [84, 16],
      outcome: 'offside',
      through: true,
      hold: 1.4,
    },
    { team: 1, kind: 'freeKick', actor: 13, receiver: 14, to: [82, 40], possession: 2 },
  ],
  H: [
    K,
    P,
    ...H2,
    { kind: 'shot', actor: 9, to: [105, 35.5], outcome: 'goal' },
    { team: 1, kind: 'kickOff', actor: 20, receiver: 17, to: [60, 38], possession: 2 },
  ],
  I: [
    K,
    P,
    ...H2,
    { kind: 'shot', actor: 9, to: [105, 33], outcome: 'saved', opponent: 11 },
    { team: 1, kind: 'pass', actor: 11, receiver: 13, to: [93, 20], possession: 2 },
  ],
  J: [
    K,
    P,
    ...H2,
    { kind: 'shot', actor: 9, to: [105, 33], outcome: 'saved', opponent: 11 },
    { kind: 'corner', actor: 10, receiver: 3, to: [98, 29], loft: true, possession: 2 },
    {
      kind: 'shot',
      actor: 3,
      to: [105, 41],
      outcome: 'wide',
      header: true,
      hold: 0.25,
      possession: 2,
    },
    GOAL_KICK,
  ],
  L: [
    K,
    P,
    ...H2,
    { kind: 'shot', actor: 9, to: [105, 34.5], outcome: 'blocked', opponent: 14 },
    {
      team: 1,
      kind: 'clearance',
      actor: 14,
      to: [70, 68],
      outcome: 'out',
      loft: true,
      possession: 2,
    },
    { kind: 'throwIn', actor: 4, receiver: 7, to: [66, 60], possession: 3 },
  ],
} satisfies Record<string, BeatSpec[]>;

const PLAYED = Object.fromEntries(
  Object.entries(SCRIPTS).map(([name, list]) => [
    name,
    performScript(scriptOf(fixture, list), { duration: 90 }),
  ]),
) as Record<keyof typeof SCRIPTS, Playback>;

const all = (p: Playback, kind: StageEvent['kind']): StageEvent[] =>
  p.events.filter((e) => e.kind === kind);
const one = (p: Playback, kind: StageEvent['kind']): StageEvent => {
  const found = all(p, kind);
  expect(found).toHaveLength(1);
  return found[0];
};
const frameAt = (p: Playback, t: number): Frame => {
  const frame = p.frames.find((f) => Math.abs(f.t - t) < 1e-9);
  if (!frame) throw new Error('no frame at ' + t);
  return frame;
};
const positions = (frame: Frame): Vec[] => Array.from({ length: 22 }, (_, i) => posOf(frame, i));
const firstAfter = (p: Playback, kind: StageEvent['kind'], t: number): StageEvent | undefined =>
  p.events.find((e) => e.kind === kind && e.t > t);
const isAwayOutfield = (index: number): boolean => index >= 12 && index <= 21;

describe('stage attack', () => {
  it('F: the runner is onside as the ball is played and meets it', () => {
    const p = PLAYED.F;
    const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 2);
    expect(kick).toBeDefined();
    if (!kick) return;
    const frame = frameAt(p, kick.t);
    const line = offsideLineX(fixture, positions(frame), 0);
    const rx = posOf(frame, 8)[0];
    expect(rx).toBeLessThan(line);
    expect(line - rx).toBeLessThanOrEqual(STAGE.through.window + 0.5);
    const receive = p.events.find((e) => e.kind === 'receive' && e.beat === 2);
    expect(receive).toBeDefined();
    if (!receive) return;
    expect(dist(posOf(frameAt(p, receive.t), 8), receive.at)).toBeLessThanOrEqual(
      STAGE.controlRange + 0.6,
    );
    const wide = one(p, 'wide');
    const restart = firstAfter(p, 'restart', wide.t);
    expect(restart?.beat).toBe(5);
  });

  it('an ordinary pass is not played to a man in an offside position', () => {
    const { kicks, offside } = offsideKicks(PLAYED.F);
    expect(kicks).toBeGreaterThan(0);
    expect(offside).toBe(0);
  });

  it('a through ball running out is chased only to the line', () => {
    // T800 (demo): the runner sprinted at the ball's landing point beyond the byline and braked
    // 4 m off the pitch.
    const list: BeatSpec[] = [
      K,
      P,
      { kind: 'pass', actor: 6, receiver: 9, to: [107, 30], outcome: 'out', through: true },
      { team: 1, kind: 'goalKick', actor: 11, receiver: 13, to: [93, 16], possession: 2 },
    ];
    const p = performScript(scriptOf(fixture, list), { duration: 60 });
    const furthest = Math.max(...p.frames.map((f) => posOf(f, 9)[0]));
    expect(furthest).toBeLessThanOrEqual(105 + 1);
  });

  it('G: a runner who goes early is flagged', () => {
    const p = PLAYED.G;
    const flag = one(p, 'offside');
    expect(flag.line).toBeDefined();
    const line = flag.line ?? 0;
    const frame = frameAt(p, flag.t);
    expect(posOf(frame, 8)[0] - line).toBeGreaterThanOrEqual(STAGE.through.offsideGap - 0.05);
    expect(Math.abs(line - offsideLineX(fixture, positions(frame), 0))).toBeLessThanOrEqual(0.05);
    const whistle = firstAfter(p, 'whistle', flag.t - 1e-9);
    expect(whistle).toBeDefined();
    if (!whistle) return;
    expect(whistle.t - flag.t).toBeLessThanOrEqual(STAGE.through.flagDelay + 0.2);
    const restart = firstAfter(p, 'restart', whistle.t);
    expect(restart).toBeDefined();
    if (!restart) return;
    for (const f of p.frames) if (f.t > whistle.t && f.t <= restart.t) expect(f.live).toBe(false);
    expect(dist(restart.at, flag.at)).toBeLessThanOrEqual(1.5);
  });

  it('H: a goal counts once and play restarts from the centre', () => {
    const p = PLAYED.H;
    const goal = one(p, 'goal');
    expect(goal.score).toEqual([1, 0]);
    expect(p.score).toEqual([1, 0]);
    expect(p.frames.some((f) => f.t > goal.t && f.ball[0] > 105)).toBe(true);
    const restart = firstAfter(p, 'restart', goal.t);
    expect(restart).toBeDefined();
    if (!restart) return;
    for (const f of p.frames) if (f.t > goal.t && f.t <= restart.t) expect(f.live).toBe(false);
    const frame = frameAt(p, restart.t);
    for (let i = 0; i < 11; i++) expect(posOf(frame, i)[0]).toBeLessThanOrEqual(53);
    for (let i = 11; i < 22; i++) expect(posOf(frame, i)[0]).toBeGreaterThanOrEqual(52);
    // Event times are rounded to the millisecond; their difference carries float error (T800).
    expect(restart.t - goal.t).toBeGreaterThanOrEqual(STAGE.restart.delay.kickOff - 1e-9);
  });

  it('I: the keeper gets to a save and holds it', () => {
    const p = PLAYED.I;
    const save = one(p, 'save');
    const frame = frameAt(p, save.t);
    expect(dist(posOf(frame, 11), save.at)).toBeLessThanOrEqual(STAGE.controlRange + 0.6);
    expect(p.frames[p.frames.indexOf(frame) + 1].owner).toBe(11);
  });

  it('J: a parried shot gives a corner, the box fills and the header goes wide', () => {
    const p = PLAYED.J;
    const save = one(p, 'save');
    const out = firstAfter(p, 'out', save.t);
    expect(out).toBeDefined();
    const corner = p.events.find((e) => e.kind === 'restart' && e.beat === 5);
    expect(corner).toBeDefined();
    if (!corner) return;
    expect(dist(corner.at, [104.5, 0.5])).toBeLessThanOrEqual(1);
    const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 5);
    expect(kick).toBeDefined();
    if (!kick) return;
    const frame = frameAt(p, kick.t);
    let inBox = 0;
    for (let i = 1; i < 11; i++) {
      const [x, y] = posOf(frame, i);
      if (x >= BOX_X && y >= BOX_Y[0] && y <= BOX_Y[1]) inBox += 1;
    }
    expect(inBox).toBeGreaterThanOrEqual(5);
    const delivery = p.frames.filter((f) => f.beat === 5 && f.mode === 'flight');
    expect(Math.max(...delivery.map((f) => f.ball[2]))).toBeGreaterThan(
      STAGING_CONFIG.ball.loftMin,
    );
    const wide = one(p, 'wide');
    expect(p.events.some((e) => e.kind === 'restart' && e.beat === 7 && e.t > wide.t)).toBe(true);
  });

  it('L: a blocked shot stays in play for the defence', () => {
    const p = PLAYED.L;
    const block = one(p, 'block');
    expect(block.other).toBeDefined();
    const other = block.other ?? -1;
    expect(isAwayOutfield(other)).toBe(true);
    expect(dist(posOf(frameAt(p, block.t), other), block.at)).toBeLessThanOrEqual(
      STAGE.controlRange + 0.6,
    );
    const out = firstAfter(p, 'out', block.t);
    expect(out).toBeDefined();
    if (!out) return;
    expect(p.events.some((e) => e.kind === 'restart' && e.beat === 6 && e.t > out.t)).toBe(true);
  });
});
