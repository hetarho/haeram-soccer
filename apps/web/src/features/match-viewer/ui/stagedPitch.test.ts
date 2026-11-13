// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MatchFrame,
  MatchPlayback,
  World,
} from '../../../../../../packages/contracts/src/types';
import { setTextLocale } from '../../../presentation/text';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import type { LocalePack } from '../../../presentation/contracts';
import registry from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import { deadBallBeats, presentationSamples, runningRate } from '../../../entities/match/logic';
import { goalInstants } from '../lib/goalFeedback';
import { momentReady } from '../lib/moments';
import { replayGoals } from '../lib/goalReplay';
import { Pitch } from './Pitch';

vi.mock('../../../presentation/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../presentation/react')>()),
  useLocale: () => locale,
}));
// The final report is a separate lazy boundary; this test verifies when it opens, not its rows.
vi.mock('./MatchReport', () => ({
  MatchReport: () => createElement('section', { 'aria-label': 'Final analysis' }, 'Analysis'),
}));

const locale = createLoadedLocale(
  validateRegistry(registry, 'locale'),
  korean as LocalePack,
  korean as LocalePack,
);

function frame(i: number, goal = false): MatchFrame {
  return {
    minute: i + 1,
    label: String(i + 1),
    period: i < 2 ? 1 : 2,
    side: 0,
    player: 0,
    action: '패스',
    pace: 1,
    onPitch: [[], []],
    score: { home: goal ? 1 : 0, away: 0 },
    metrics: [Array(15).fill(0), Array(15).fill(0)],
    startSeconds: i * 60,
    elapsedSeconds: (i + 1) * 60,
    ball: [50, 50],
    motion: [0, 30, 60].map((t) => ({
      elapsedSeconds: i * 60 + t,
      ball: [50, 50],
      players: [[], []],
    })),
    ballTrack: [
      [50, 50, 0],
      [60, 50, 0],
    ],
    ballTimes: [i * 60, (i + 1) * 60],
    events: goal
      ? [
          {
            t: 30,
            kind: 'shot',
            side: 0,
            actor: 'scorer',
            from: [90, 50],
            to: [100, 50],
            outcome: 'goal',
            text: '골',
          },
        ]
      : [],
    stoppages: [{ kind: 'throwIn', dead: 5, settled: 8, kick: 10 }],
  };
}
function fixture(): MatchPlayback {
  return {
    record: {
      id: 'stream',
      country: 'ENG',
      groupKey: 'ENG.0.0',
      home: 'h',
      away: 'a',
      year: 2024,
      round: 1,
      kind: 'league',
      score: { home: 1, away: 0 },
      tactics: ['balanced', 'counter'],
      metrics: [[], []],
      players: [],
      highlights: [{ minute: 3, side: 0, player: 'Scorer', action: '골' }],
    } as MatchPlayback['record'],
    frames: [],
    squads: [[], []],
    staged: { done: false },
  };
}
const world = {
  playerClub: 'h',
  players: [],
  clubs: [
    { id: 'h', name: 'Home', short: 'Home' },
    { id: 'a', name: 'Away', short: 'Away' },
  ],
} as unknown as World;
let root: Root, container: HTMLDivElement;
let callbacks: Map<number, FrameRequestCallback>, serial: number, now: number;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setTextLocale(locale);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  callbacks = new Map();
  serial = 0;
  now = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    callbacks.set(++serial, cb);
    return serial;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  setTextLocale();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const seconds = () => Number(container.querySelector('canvas')!.dataset.seconds);
async function tick(ms = 100) {
  now += ms;
  const queued = [...callbacks.values()];
  callbacks.clear();
  await act(async () => {
    for (const cb of queued) cb(now);
  });
}
async function ticks(count: number) {
  for (let i = 0; i < count; i++) await tick();
}
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
async function draw(playback: MatchPlayback, finish = vi.fn()) {
  await act(async () => root.render(createElement(Pitch, { playback, world, onFinish: finish })));
  await tick();
}

describe('a theatre receiving staged frames', () => {
  it('the theatre plays a playback whose frames are still arriving', async () => {
    const p = fixture(),
      finish = vi.fn();
    await draw(p, finish);
    expect(finish).not.toHaveBeenCalled();
    const first = [frame(0), frame(1)];
    await draw({ ...p, frames: first }, finish);
    await ticks(3);
    expect(seconds()).toBeGreaterThan(0);
    const before = seconds();
    const all = [...first, frame(2, true)];
    const a = presentationSamples(first),
      b = presentationSamples(all);
    expect(b.samples.slice(0, a.samples.length)).toEqual(a.samples);
    expect(deadBallBeats(all).slice(0, deadBallBeats(first).length)).toEqual(deadBallBeats(first));
    expect(goalInstants(p.record, first, [])).toEqual([]);
    expect(goalInstants(p.record, all, []).map((g) => g.seconds)).toEqual([150]);
    await draw({ ...p, frames: all }, finish);
    expect(seconds()).toBe(before);
    await ticks(2);
    expect(seconds()).toBeGreaterThan(before);
    expect(finish).not.toHaveBeenCalled();
  });
  it('the presentation waits at the staged frontier and resumes without a jump', async () => {
    const p = fixture(),
      finish = vi.fn();
    await draw({ ...p, frames: [frame(0)] }, finish);
    await click('16×');
    await tick();
    await ticks(20);
    expect(seconds()).toBe(60);
    expect(container.textContent).toContain('장면 준비 중…');
    await ticks(20);
    expect(seconds()).toBe(60);
    await draw({ ...p, frames: [frame(0), { ...frame(1), stoppages: [] }] }, finish);
    expect(seconds()).toBe(60);
    await tick();
    // One 100 ms frame of running play at 16x past the frontier, no catch-up.
    expect(seconds()).toBeCloseTo(60 + 100 * runningRate(16));
    expect(finish).not.toHaveBeenCalled();
  });
  it('결과 보기 shows the result at once and reaches the final whistle when it is staged', async () => {
    const p = fixture(),
      finish = vi.fn();
    await draw(p, finish);
    await click('결과 보기');
    expect(container.querySelector('[data-testid="match-score"] strong')!.textContent).toContain(
      '1 : 0',
    );
    expect(finish).toHaveBeenCalledOnce();
    await click('경기 상세');
    expect(document.querySelector('[aria-label="Final analysis"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(true);
    const last = [frame(0), frame(1), frame(2, true)];
    await draw({ ...p, frames: last }, finish);
    expect(seconds()).toBe(0);
    await draw({ ...p, frames: last, staged: { done: true } }, finish);
    expect(container.querySelector('[data-ui="match-meta"]')!.textContent).toContain('경기 종료');
    expect(seconds()).toBe(180);
    expect(finish).toHaveBeenCalledOnce();
  });
  it('a moment not staged yet is disabled with the preparing label and enabled once staged', async () => {
    const p = fixture();
    await draw({ ...p, frames: [frame(0)] });
    await click('결과 보기');
    await click('경기 상세');
    const goal = () => document.querySelector<HTMLButtonElement>('[data-testid="recorded-goal"]')!;
    expect(goal().disabled).toBe(true);
    expect(goal().textContent).toContain('장면 준비 중…');
    expect(momentReady([frame(0)], 'halfTime', false)).toBe(false);
    await draw({ ...p, frames: [frame(0), frame(1), frame(2, true)] });
    expect(goal().disabled).toBe(false);
    expect(goal().textContent).not.toContain('장면 준비 중…');
    expect(momentReady([frame(0), frame(1), frame(2)], 'halfTime', false)).toBe(true);
    expect(momentReady([frame(0), frame(1), frame(2)], 'fullTime', false)).toBe(false);
  });
  it('a goal clip is offered only for a goal already staged and shown', async () => {
    const p = fixture();
    await draw({ ...p, frames: [frame(0)] });
    expect(container.querySelector('[data-testid="goal-replay-open"]')).toBeNull();
    const frames = [frame(0), frame(1), frame(2, true)];
    const goals = goalInstants(p.record, frames, []);
    expect(replayGoals(goals, frames, 0)).toEqual([]);
    await draw({ ...p, frames });
    expect(container.querySelector('[data-testid="goal-replay-open"]')).toBeNull();
    await click('16×');
    await tick();
    await ticks(45);
    expect(container.querySelector('[data-testid="goal-replay-open"]')).not.toBeNull();
    expect(replayGoals(goals, frames, 1)).toMatchObject([
      { footage: true, goal: { seconds: 150 } },
    ]);
  });
  it('finishes naturally only after staging completes and the final goal hold ends', async () => {
    const p = fixture(),
      finish = vi.fn();
    const frames = [frame(0), frame(1), frame(2, true)];
    await draw({ ...p, frames }, finish);
    await click('16×');
    await tick();
    await ticks(30);
    expect(container.querySelector('[data-testid="goal-cue"]')).not.toBeNull();
    await draw({ ...p, frames, staged: { done: true } }, finish);
    expect(finish).not.toHaveBeenCalled();
    await ticks(20);
    expect(finish).toHaveBeenCalledOnce();
    await draw({ ...p, frames, staged: { done: true } }, finish);
    expect(finish).toHaveBeenCalledOnce();
  });
  it('revealing a result during a clip leaves it even while later minutes are preparing', async () => {
    const p = fixture(),
      finish = vi.fn();
    const frames = [frame(0), frame(1), frame(2, true)];
    await draw({ ...p, frames }, finish);
    await click('16×');
    await tick();
    await ticks(45);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="goal-replay-open"]')!.click(),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="goal-replay-option"]')!.click(),
    );
    expect(container.querySelector('[data-testid="goal-replay-state"]')).not.toBeNull();
    await click('결과 보기');
    expect(container.querySelector('[data-testid="goal-replay-state"]')).toBeNull();
    expect(finish).toHaveBeenCalledOnce();
    await draw({ ...p, frames: [...frames, frame(3, true)], staged: { done: true } }, finish);
    expect(seconds()).toBe(240);
    expect(container.querySelector('[data-ui="match-meta"]')!.textContent).toContain('경기 종료');
    expect(finish).toHaveBeenCalledOnce();
  });
});
