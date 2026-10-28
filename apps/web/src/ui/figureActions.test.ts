import { describe, expect, it } from 'vitest';
import type {
  MatchEvent,
  MatchFrame,
  PlayerMotion,
} from '../../../../packages/contracts/src/types';
import {
  FIGURE_ACTION_CONFIG,
  FIGURE_ACTION_LONGEST,
  figureActionWindows,
  type FigureActionWindow,
} from './figureActions';

const player = (id: string, x: number, y: number): PlayerMotion => ({
  id,
  position: [x, y],
  velocity: [0, 0],
  state: 'shape',
  intent: [x, y],
});

/**
 * Timed minute `index` of the first half (→MATCH-12): its events, player samples as
 * `[seconds into the minute, home, away]` and ball knots as `[seconds into the minute, x, y, h]`.
 */
function minute(
  index: number,
  events: Partial<MatchEvent>[],
  samples: [number, PlayerMotion[], PlayerMotion[]][] = [],
  ball: [number, number, number, number][] = [],
): MatchFrame {
  const start = index * 60;
  return {
    minute: index + 1,
    score: { home: 0, away: 0 },
    metrics: [[], []],
    ball: [50, 50],
    side: 0,
    player: 0,
    action: '패스',
    period: 1,
    label: String(index + 1),
    pace: 1,
    onPitch: [[], []],
    startSeconds: start,
    motion: samples.map(([t, home, away]) => ({
      elapsedSeconds: start + t,
      ball: [50, 50],
      players: [home, away],
    })),
    events: events.map((event) => ({
      t: 0,
      kind: 'pass',
      side: 0,
      actor: '',
      from: [50, 50],
      to: [50, 50],
      text: '',
      ...event,
    })),
    ballTrack: ball.map(([, x, y, h]) => [x, y, h]),
    ballTimes: ball.map(([t]) => start + t),
  };
}

const only = (windows: ReadonlyMap<string, readonly FigureActionWindow[]>, id: string) => {
  const list = windows.get(id) ?? [];
  expect(list).toHaveLength(1);
  return list[0]!;
};

describe('figure action windows (→MATCH-37)', () => {
  it('shot makes a kick window ending at departure', () => {
    // The event ends where the ball arrives (19.8 s into minute 2); the shot left at 18.9 s, the
    // last knot still within reach of where he struck it.
    const shot: Partial<MatchEvent> = {
      t: 19.8,
      kind: 'shot',
      actor: 'h9',
      from: [80, 50],
      to: [99, 50],
      outcome: 'miss',
    };
    const frames = [
      minute(0, []),
      minute(
        1,
        [shot],
        [],
        [
          [18, 75, 50, 0],
          [18.9, 79.6, 50.5, 0],
          [19.4, 90, 50, 0.6],
          [19.8, 99, 50, 0.4],
        ],
      ),
    ];
    const window = only(figureActionWindows(frames), 'h9');
    const [before, after] = FIGURE_ACTION_CONFIG.span.shot;
    expect(window.kind).toBe('shot');
    expect(window.player).toBe('h9');
    expect(window.contact).toBeCloseTo(60 + 18.9, 9);
    expect(window.start).toBeCloseTo(window.contact - before, 9);
    expect(window.end).toBeCloseTo(window.contact + after, 9);
    expect(window.end - window.start).toBeLessThanOrEqual(FIGURE_ACTION_LONGEST);
    expect(window.toward).toEqual([99, 50]);
    // Without a ball track the kick leaves a fixed flight before its event.
    const bare = only(figureActionWindows([minute(0, [shot])]), 'h9');
    expect(bare.contact).toBeCloseTo(19.8 - FIGURE_ACTION_CONFIG.fallbackFlight, 9);
    // A pass is a kick, a cross or one played far a long kick.
    const kinds = figureActionWindows([
      minute(0, [
        { t: 5, kind: 'pass', actor: 'h4', from: [30, 50], to: [40, 50] },
        { t: 10, kind: 'pass', actor: 'h5', from: [30, 50], to: [70, 50] },
        { t: 15, kind: 'cross', actor: 'h7', from: [85, 10], to: [90, 40] },
      ]),
    ]);
    expect(only(kinds, 'h4').kind).toBe('kick');
    expect(only(kinds, 'h5').kind).toBe('longKick');
    expect(only(kinds, 'h7').kind).toBe('longKick');
  });

  it('lost take-on makes a tackle for the opponent only', () => {
    const frames = [
      minute(
        0,
        [
          // The take-on was won by a4 standing at the ball; the pass was intercepted by a5.
          {
            t: 10.4,
            kind: 'takeOn',
            actor: 'h11',
            opponent: 'a4',
            from: [77, 10],
            to: [80, 2],
            lost: true,
          },
          {
            t: 20,
            kind: 'pass',
            actor: 'h8',
            opponent: 'a5',
            from: [40, 60],
            to: [52, 50],
            lost: true,
          },
        ],
        [
          [10, [player('h11', 77.2, 10)], [player('a4', 77.5, 10.5), player('a5', 50, 40)]],
          [19, [player('h8', 40, 60)], [player('a4', 80, 2), player('a5', 50, 35)]],
        ],
      ),
    ];
    const windows = figureActionWindows(frames);
    const tackle = only(windows, 'a4');
    expect(tackle.kind).toBe('tackle');
    expect(tackle.contact).toBeCloseTo(10.4, 9);
    // He goes for the carrier where the sample before the tackle drew him.
    expect(tackle.toward).toEqual([77.2, 10]);
    expect(windows.has('h11')).toBe(false);
    // An interception is no tackle; the passer still kicked.
    expect(windows.has('a5')).toBe(false);
    expect(only(windows, 'h8').kind).toBe('kick');
  });

  it('slide only beyond standing reach', () => {
    const challenge = (tackler: [number, number], kind: MatchEvent['kind']) =>
      only(
        figureActionWindows([
          minute(
            0,
            [
              {
                t: 10.4,
                kind,
                actor: 'h11',
                opponent: 'a4',
                from: [77, 10],
                to: [80, 2],
                lost: true,
              },
            ],
            [
              [10, [player('h11', 77, 10)], [player('a4', ...tackler)]],
              // A sample at the contact itself is not the one before it.
              [10.4, [player('h11', 77, 10)], [player('a4', 77, 10)]],
            ],
          ),
        ]),
        'a4',
      ).kind;
    // 1.05 m away he reaches it standing; 2.1 m away he has to slide (y units are 0.68 m).
    expect(FIGURE_ACTION_CONFIG.standingReach).toBe(1.2);
    expect(challenge([78, 10], 'takeOn')).toBe('tackle');
    expect(challenge([79, 10], 'takeOn')).toBe('slide');
    expect(challenge([77, 11.5], 'carry')).toBe('tackle');
    expect(challenge([77, 14], 'carry')).toBe('slide');
  });

  it('saved shot makes a catch or dive for the keeper', () => {
    const save = (keeper: [number, number], header = false) =>
      figureActionWindows([
        minute(
          0,
          [
            {
              t: 19.05,
              kind: 'shot',
              actor: 'h9',
              opponent: 'a1',
              from: [88, 50],
              to: [96, 48],
              outcome: 'save',
              header,
            },
          ],
          [
            [17, [player('h9', 88, 50)], [player('a1', ...keeper)]],
            [21, [player('h9', 88, 50)], [player('a1', ...keeper)]],
          ],
        ),
      ]);
    expect(FIGURE_ACTION_CONFIG.catchReach).toBe(1);
    // Where he stands, the shot arrives in his hands; he faces the shooter.
    const caught = only(save([96, 48.5]), 'a1');
    expect(caught).toMatchObject({ kind: 'catch', toward: [88, 50] });
    expect(caught.contact).toBeCloseTo(19.05, 9);
    expect(caught.dive).toBeUndefined();
    // Six units off, it arrives to his right (north of him facing west) or his left (south).
    expect(only(save([96, 54]), 'a1')).toMatchObject({ kind: 'dive', dive: 1 });
    expect(only(save([96, 42]), 'a1')).toMatchObject({ kind: 'dive', dive: -1 });
    // A saved header is still the keeper's save; a blocked or missed shot makes nothing for him.
    expect(only(save([96, 48.5], true), 'a1').kind).toBe('catch');
    const missed = figureActionWindows([
      minute(0, [{ t: 19, kind: 'shot', actor: 'h9', opponent: 'a1', outcome: 'block' }]),
    ]);
    expect(missed.has('a1')).toBe(false);
  });

  it('header flag makes a header', () => {
    const windows = figureActionWindows([
      minute(0, [
        {
          t: 8,
          kind: 'shot',
          actor: 'h9',
          from: [92, 50],
          to: [100, 48],
          outcome: 'miss',
          header: true,
        },
        { t: 20, kind: 'clearance', actor: 'a5', from: [90, 50], to: [60, 40], header: true },
        { t: 30, kind: 'shot', actor: 'h10', from: [85, 50], to: [100, 50], outcome: 'miss' },
      ]),
    ]);
    expect(only(windows, 'h9').kind).toBe('header');
    expect(only(windows, 'a5').kind).toBe('header');
    expect(only(windows, 'h10').kind).toBe('shot');
  });

  it('no window without a recorded event', () => {
    const samples: [number, PlayerMotion[], PlayerMotion[]][] = [
      [0, [player('h9', 50, 50)], [player('a4', 52, 50)]],
      [30, [player('h9', 70, 50)], [player('a4', 70.5, 50)]],
    ];
    const track: [number, number, number, number][] = [
      [0, 50, 50, 0],
      [30, 70, 50, 0],
    ];
    // Motion and the ball alone, however close the players come, act out nothing.
    expect(figureActionWindows([minute(0, [], samples, track)]).size).toBe(0);
    // Nor do carries kept, contests without a named winner, fouls, cards, offsides and whistles.
    const quiet = figureActionWindows([
      minute(
        0,
        [
          { t: 5, kind: 'carry', actor: 'h9', from: [50, 50], to: [60, 50] },
          { t: 9, kind: 'takeOn', actor: 'h9', opponent: 'a4', from: [60, 50], to: [65, 50] },
          { t: 12, kind: 'takeOn', actor: 'h9', from: [65, 50], to: [66, 50], lost: true },
          { t: 14, kind: 'holdUp', actor: 'h9', from: [66, 50], to: [66, 50] },
          { t: 16, kind: 'foul', actor: 'a4', opponent: 'h9' },
          { t: 17, kind: 'card', actor: 'a4', card: 'yellow' },
          { t: 25, kind: 'offside', actor: 'h10' },
          { t: 60, kind: 'whistle', actor: '' },
        ],
        samples,
        track,
      ),
    ]);
    expect(quiet.size).toBe(0);
  });

  it('kicked restarts kick and a throw-in throws', () => {
    const windows = figureActionWindows([
      minute(0, [
        { t: 5, kind: 'restart', restart: 'throwIn', actor: 'h7', from: [80, 0], to: [77, 20] },
        { t: 20, kind: 'restart', restart: 'corner', actor: 'h11', from: [100, 0], to: [92, 45] },
        { t: 40, kind: 'restart', restart: 'goalKick', actor: 'a1', from: [95, 50], to: [50, 30] },
        {
          t: 50,
          kind: 'restart',
          restart: 'penalty',
          actor: 'h9',
          opponent: 'a1',
          from: [89, 50],
          to: [100, 48],
          outcome: 'goal',
        },
      ]),
    ]);
    expect(only(windows, 'h7').kind).toBe('throwIn');
    expect(only(windows, 'h11').kind).toBe('longKick');
    expect(windows.get('a1')?.map((window) => window.kind)).toEqual(['longKick']);
    expect(only(windows, 'h9').kind).toBe('shot');
  });
});
