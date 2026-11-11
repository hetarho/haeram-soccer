import { describe, expect, it } from 'vitest';
import { ROLE_IDS, type RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { PITCH, attackFrame } from '../grid/pitch';
import { FORMATIONS, slotLine } from '../player';
import { STAGING_CONFIG } from './config';
import {
  FORMATION_SHAPE,
  ROLE_SHAPE,
  SLOT_ANCHOR_ROLES,
  SWEEPER_ROLE,
  cellCentre,
  nominalSpot,
  placeFor,
  type ShapeContext,
  type ShapeSide,
  type StagingPhase,
} from './shape';
import type { Vec } from './vec';

const AXIS = PITCH.width / 2;
const EPS = 1e-9;
const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const PHASES: readonly StagingPhase[] = [
  'buildUp',
  'progression',
  'finalThird',
  'counter',
  'setPiece',
];
const SLOTS = Array.from({ length: 11 }, (_, slot) => slot);
const OUTFIELD = SLOTS.slice(1);
const BALLS: readonly Vec[] = [0, 8, 20, 35, 45, 52.5, 60, 72, 80, 88.5, 95, 105].flatMap((x) =>
  [0, 12, 34, 50, 68].map((y): Vec => [x, y]),
);

const sideOf = (tactic: Tactic): ShapeSide => ({
  tactic,
  roles: FORMATIONS[tactic].slots.map((s) => s.role),
});
/** A slot's place in its own side's attack frame. */
const own = (ctx: ShapeContext, side: 0 | 1, slot: number): Vec =>
  attackFrame(side, nominalSpot(ctx, side, slot));
/** Every pairing of the four tactics, every sampled ball, side in possession and phase. */
function* situations(): Generator<ShapeContext> {
  for (const t0 of TACTICS)
    for (const t1 of TACTICS)
      for (const ball of BALLS)
        for (const team of [0, 1] as const)
          for (const phase of PHASES) yield { sides: [sideOf(t0), sideOf(t1)], ball, team, phase };
}
const at = (ctx: ShapeContext) =>
  `${ctx.sides[0].tactic}/${ctx.sides[1].tactic} ball ${ctx.ball.join(',')} team ${ctx.team} ${ctx.phase}`;
const xsOf = (ctx: ShapeContext, side: 0 | 1, slots: readonly number[]) =>
  slots.map((slot) => own(ctx, side, slot)[0]);
const slotsOn = (tactic: Tactic, line: 'DF' | 'MF' | 'FW') =>
  OUTFIELD.filter((slot) => slotLine(tactic, slot) === line);
const slotOf = (tactic: Tactic, position: string, nth = 0) =>
  SLOTS.filter((slot) => FORMATIONS[tactic].slots[slot]!.position === position)[nth]!;

/**
 * The prototype's demo squads (scripts/match-proto/core/squads.ts) under the engine's role ids:
 * `keeper` → `shotStopper`, `fullBack` → `defensiveFullBack`, `centreBack` → `coverDefender` or
 * `stopper` (neither moves its anchor). The home side plays possession's 4-3-3, the away side
 * counter's 4-4-2, as the prototype's do.
 */
const PROTO_SIDES: readonly [ShapeSide, ShapeSide] = [
  {
    tactic: 'possession',
    roles: [
      'sweeperKeeper',
      'invertedFullBack',
      'ballPlayingDefender',
      'coverDefender',
      'overlappingFullBack',
      'anchor',
      'mezzala',
      'boxToBox',
      'invertedWinger',
      'falseNine',
      'traditionalWinger',
    ],
  },
  {
    tactic: 'counter',
    roles: [
      'shotStopper',
      'defensiveFullBack',
      'stopper',
      'coverDefender',
      'overlappingFullBack',
      'traditionalWinger',
      'ballWinner',
      'boxToBox',
      'wideMidfielder',
      'poacher',
      'targetMan',
    ],
  },
];
/** The prototype test's `lineUp`: one side's 11 by slot at x values for the keeper, the back four and the rest. */
const lineUp = (keeper: number, back: number, rest: number): Vec[] =>
  SLOTS.map((slot): Vec => [slot === 0 ? keeper : slot <= 4 ? back : rest, 6 + slot * 5]);
const POSITIONS: readonly [readonly Vec[], readonly Vec[]] = [
  lineUp(10, 40, 60),
  lineUp(90, 62, 50),
];

/**
 * `nominalSpot` of the prototype (scripts/match-proto/core/shape.ts at T823's base) for the balls
 * and phases its test reads, copied: x0, y0, x1, y1, … by slot, pitch metres.
 */
const PROTO: readonly {
  ball: Vec;
  team: 0 | 1;
  phase: StagingPhase;
  positioned?: true;
  places: readonly [readonly number[], readonly number[]];
}[] = [
  {
    ball: [20, 34],
    team: 0,
    phase: 'buildUp',
    places: [
      [
        12.399999999999999, 34, 32.36, 25, 22.4, 19, 22.4, 43, 27.048, 59, 32.36, 34, 39.664, 22,
        39.664, 46, 51.616, 7, 46.304, 34, 51.616, 61,
      ],
      [
        98.4, 34, 58.24999999999999, 52, 58.24999999999999, 40.3, 58.24999999999999,
        27.700000000000003, 58.24999999999999, 16, 45.769999999999996, 53.8, 45.769999999999996,
        40.3, 45.769999999999996, 27.700000000000003, 45.769999999999996, 14.200000000000003, 32.25,
        39.4, 32.25, 28.6,
      ],
    ],
  },
  {
    ball: [52, 20],
    team: 0,
    phase: 'progression',
    places: [
      [
        29.04, 31.2, 50.9808, 21.9, 39.04, 22.9, 39.04, 40.9, 54.843999999999994, 60.9, 49.576,
        31.9, 60.111999999999995, 16.9, 57.3024, 43.9, 69.9456, 5.9, 67.136, 31.9, 70.648, 61.9,
      ],
      [
        100.36974326674685, 32.77691331574445, 75.85, 49.2, 75.85, 37.5, 75.85, 24.900000000000006,
        75.85, 13.200000000000003, 63.36999999999999, 51, 63.36999999999999, 37.5,
        63.36999999999999, 24.900000000000006, 63.36999999999999, 11.400000000000006,
        49.849999999999994, 36.599999999999994, 49.849999999999994, 25.800000000000004,
      ],
    ],
  },
  {
    ball: [85, 50],
    team: 0,
    phase: 'finalThird',
    places: [
      [
        30, 37.2, 67.33, 28.4, 56.2, 27.4, 56.2, 45.4, 85.88000000000001, 66.4, 67.33, 36.4,
        88.10600000000001, 23.4, 85.138, 42.4, 92.18700000000001, 21.4, 87.364, 36.4,
        92.18700000000001, 65.4,
      ],
      [
        102.62869678583546, 35.89704257133164, 94, 55.2, 94, 43.5, 94, 30.900000000000006, 94,
        19.200000000000003, 81.52, 57, 81.52, 43.5, 81.52, 30.900000000000006, 81.52,
        17.400000000000006, 68, 42.599999999999994, 68, 31.800000000000004,
      ],
    ],
  },
  {
    ball: [53, 34],
    team: 1,
    phase: 'progression',
    places: [
      [
        4.68, 34, 35.150000000000006, 16, 35.150000000000006, 27.7, 35.150000000000006, 40.3,
        35.150000000000006, 52, 43.85000000000001, 34, 51.10000000000001, 25.9, 51.10000000000001,
        42.1, 51.970000000000006, 12.399999999999999, 64.15, 34, 51.970000000000006, 55.6,
      ],
      [
        87, 34, 58.2336, 59, 65.96000000000001, 43, 65.96000000000001, 25, 50.156000000000006, 5,
        35.650000000000006, 64, 51.2096, 42, 51.2096, 26, 41.376000000000005, 8, 35.650000000000006,
        41, 35.650000000000006, 27,
      ],
    ],
  },
  {
    ball: [20, 18],
    team: 1,
    phase: 'finalThird',
    places: [
      [
        2.3713032141645454, 32.10295742866836, 17, 12.8, 17, 24.5, 17, 37.099999999999994, 17, 48.8,
        25.7, 30.8, 32.95, 22.7, 32.95, 38.9, 33.82, 9.2, 46, 30.8, 33.82, 52.4,
      ],
      [
        87, 30.799999999999997, 36.18599999999999, 56.6, 48.8, 40.6, 48.8, 22.6, 19.11999999999999,
        1.5999999999999943, 17.5, 60.6, 32.10499999999999, 39.6, 19.861999999999995, 25.6, 17.5,
        4.600000000000001, 17.5, 37, 17.5, 24.6,
      ],
    ],
  },
  {
    ball: [52.5, 34],
    team: 1,
    phase: 'counter',
    places: [
      [
        4.65, 34, 34.875, 16, 34.875, 27.7, 34.875, 40.3, 34.875, 52, 43.575, 34, 50.825, 25.9,
        50.825, 42.1, 51.695, 12.399999999999999, 63.875, 34, 51.695, 55.6,
      ],
      [
        87, 34, 57.967000000000006, 59, 65.7, 43, 65.7, 25, 49.88250000000001, 5, 35.375, 64,
        50.937000000000005, 42, 50.937000000000005, 26, 41.095000000000006, 8, 35.375, 41, 35.375,
        27,
      ],
    ],
  },
  {
    ball: [8, 30],
    team: 1,
    phase: 'setPiece',
    places: [
      [
        1.8216407864998736, 33.089179606750065, 6.5, 15.2, 6.5, 26.9, 6.5, 39.5, 6.5, 51.2, 15.2,
        33.2, 22.450000000000003, 25.099999999999998, 22.450000000000003, 41.300000000000004, 23.32,
        11.599999999999998, 35.5, 33.2, 23.32, 54.800000000000004,
      ],
      [
        87, 33.2, 38.67959999999999, 58.4, 47, 42.4, 47, 24.4, 29.980999999999995,
        4.399999999999999, 12.961999999999989, 63.4, 31.1156, 41.4, 31.1156, 25.4,
        20.525999999999996, 7.399999999999999, 7, 40, 11.070999999999998, 26.4,
      ],
    ],
  },
  {
    ball: [95, 34],
    team: 0,
    phase: 'buildUp',
    places: [
      [
        30, 34, 69.31, 25, 58, 19, 58, 43, 63.278, 59, 69.31, 34, 77.604, 22, 77.604, 46, 91.176, 7,
        85.144, 34, 91.176, 61,
      ],
      [
        102.9, 34, 99, 52, 99, 40.3, 99, 27.700000000000003, 99, 16, 86.52, 53.8, 86.52, 40.3,
        86.52, 27.700000000000003, 86.52, 14.200000000000003, 73, 39.4, 73, 28.6,
      ],
    ],
  },
  {
    ball: [0, 0],
    team: 0,
    phase: 'finalThird',
    places: [
      [
        4, 27.2, 21.6, 20.9, 12, 19.9, 12, 37.9, 37.6, 58.9, 21.6, 28.9, 39.519999999999996, 15.9,
        36.96, 34.9, 43.04, 13.9, 38.879999999999995, 28.9, 43.04, 57.9,
      ],
      [
        98.3404349183603, 31.84356940213572, 55, 45.2, 55, 33.5, 55, 20.900000000000006, 55,
        9.200000000000003, 42.519999999999996, 47, 42.519999999999996, 33.5, 42.519999999999996,
        20.900000000000006, 42.519999999999996, 7.400000000000006, 29, 32.599999999999994, 29,
        21.799999999999997,
      ],
    ],
  },
  {
    ball: [105, 68],
    team: 1,
    phase: 'buildUp',
    places: [
      [
        6.659565081639693, 36.15643059786428, 50, 22.8, 50, 34.5, 50, 47.099999999999994, 50, 58.8,
        58.7, 40.8, 65.95, 32.7, 65.95, 48.900000000000006, 66.82, 19.2, 79, 40.8, 66.82,
        62.400000000000006,
      ],
      [
        101, 40.8, 89.8, 64.1, 93, 48.1, 93, 30.1, 88.52, 14.100000000000001, 73.16, 65.1, 79.56,
        47.1, 79.56, 31.1, 73.16, 13.100000000000001, 50.5, 49.5, 62.6, 32.1,
      ],
    ],
  },
  {
    ball: [60, 34],
    team: 1,
    phase: 'progression',
    places: [
      [
        5.1, 34, 39, 16, 39, 27.7, 39, 40.3, 39, 52, 47.7, 34, 54.95, 25.9, 54.95, 42.1, 55.82,
        12.399999999999999, 68, 34, 55.82, 55.6,
      ],
      [
        87, 34, 61.965999999999994, 59, 69.6, 43, 69.6, 25, 53.98499999999999, 5, 39.5, 64,
        55.025999999999996, 42, 55.025999999999996, 26, 45.309999999999995, 8, 39.5, 41, 39.5, 27,
      ],
    ],
  },
  {
    ball: [30, 60],
    team: 0,
    phase: 'setPiece',
    places: [
      [
        17.6, 39.2, 39.092, 27.9, 27.6, 28.9, 27.6, 46.9, 42.81, 66.5, 37.74, 37.9,
        47.879999999999995, 22.9, 45.176, 49.9, 57.343999999999994, 11.9, 54.64, 37.9,
        58.019999999999996, 66.5,
      ],
      [
        99.08274570225205, 36.051314823219286, 63.75, 57.2, 63.75, 45.5, 63.75, 32.900000000000006,
        63.75, 21.200000000000003, 51.269999999999996, 59, 51.269999999999996, 45.5,
        51.269999999999996, 32.900000000000006, 51.269999999999996, 19.400000000000006, 37.75,
        44.599999999999994, 37.75, 33.800000000000004,
      ],
    ],
  },
  {
    ball: [85, 50],
    team: 0,
    phase: 'finalThird',
    positioned: true,
    places: [
      [
        30, 37.2, 61.5, 28.4, 56.2, 27.4, 56.2, 45.4, 61.5, 66.4, 61.5, 36.4, 61.5, 23.4, 61.5,
        42.4, 61.5, 21.4, 61.5, 36.4, 61.5, 65.4,
      ],
      [
        102.62869678583546, 35.89704257133164, 94, 55.2, 94, 43.5, 94, 30.900000000000006, 94,
        19.200000000000003, 81.52, 57, 81.52, 43.5, 81.52, 30.900000000000006, 81.52,
        17.400000000000006, 68, 42.599999999999994, 68, 31.800000000000004,
      ],
    ],
  },
  {
    ball: [20, 18],
    team: 1,
    phase: 'progression',
    positioned: true,
    places: [
      [
        2.3713032141645454, 32.10295742866836, 17, 12.8, 17, 24.5, 17, 37.099999999999994, 17, 48.8,
        25.7, 30.8, 32.95, 22.7, 32.95, 38.9, 33.82, 9.2, 46, 30.8, 33.82, 52.4,
      ],
      [
        87, 30.799999999999997, 40.63799999999999, 56.6, 48.8, 40.6, 48.8, 22.6, 40.5,
        2.5999999999999943, 40.5, 61.6, 40.5, 39.6, 40.5, 23.6, 40.5, 5.600000000000001, 40.5, 37,
        40.5, 24.6,
      ],
    ],
  },
];

describe('staging shape', () => {
  it('a 4-3-3 and a 4-4-2 stand where the prototype puts them', () => {
    for (const { ball, team, phase, positioned, places } of PROTO) {
      const ctx: ShapeContext = {
        sides: PROTO_SIDES,
        ball,
        team,
        phase,
        ...(positioned ? { positions: POSITIONS } : {}),
      };
      for (const side of [0, 1] as const)
        for (const slot of SLOTS) {
          const [x, y] = nominalSpot(ctx, side, slot);
          expect(
            Math.abs(x - places[side][slot * 2]!),
            `${phase} side ${side} slot ${slot} x`,
          ).toBeLessThanOrEqual(EPS);
          expect(
            Math.abs(y - places[side][slot * 2 + 1]!),
            `${phase} side ${side} slot ${slot} y`,
          ).toBeLessThanOrEqual(EPS);
        }
    }
  });

  it('every formation fields eleven distinct places inside the pitch', () => {
    const outside: string[] = [];
    // Distinct: no two teammates within half a metre (a body's width). The prototype's own widths
    // stand its 4-3-3's full-back and winger a metre apart under a high line (measured 261111 on
    // balls every 2.5 × 2 m: the closest pair of any formation, 1.0 m). Each tactic, slot pair,
    // possession and phase closer
    // than that is listed with where it happens.
    const close: Record<string, { metres: number; where: string }> = {};
    const margin = STAGING_CONFIG.margin;
    for (const ctx of situations())
      for (const side of [0, 1] as const) {
        const places = SLOTS.map((slot) => nominalSpot(ctx, side, slot));
        places.forEach(([x, y], slot) => {
          const m = slot === 0 ? 0 : margin;
          if (x < m - EPS || x > PITCH.length - m + EPS || y < m - EPS || y > PITCH.width - m + EPS)
            outside.push(`${at(ctx)}: side ${side} slot ${slot} outside at ${x},${y}`);
        });
        for (let a = 0; a < 11; a++)
          for (let b = a + 1; b < 11; b++) {
            const metres = Math.hypot(places[a]![0] - places[b]![0], places[a]![1] - places[b]![1]);
            if (metres >= 0.5) continue;
            const key = `${ctx.sides[side].tactic} slots ${a}-${b} ${ctx.team === side ? 'in' : 'out of'} possession ${ctx.phase}`;
            const prev = close[key];
            if (!prev || metres < prev.metres) close[key] = { metres, where: at(ctx) };
          }
      }
    expect(outside.slice(0, 5)).toEqual([]);
    expect(close).toEqual({});
  });

  it('lines keep their order in and out of possession', () => {
    const misses: string[] = [];
    for (const ctx of situations())
      for (const side of [0, 1] as const) {
        const tactic = ctx.sides[side].tactic;
        const deepestDefender = Math.min(...xsOf(ctx, side, slotsOn(tactic, 'DF')));
        const deepestMidfielder = Math.min(...xsOf(ctx, side, slotsOn(tactic, 'MF')));
        const highestForward = Math.max(...xsOf(ctx, side, slotsOn(tactic, 'FW')));
        if (!(deepestDefender < deepestMidfielder && deepestMidfielder < highestForward))
          misses.push(
            `${at(ctx)}: side ${side} DF ${deepestDefender} MF ${deepestMidfielder} FW ${highestForward}`,
          );
      }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('wide slots stay on their flank', () => {
    const misses: string[] = [];
    for (const ctx of situations())
      for (const side of [0, 1] as const) {
        const slots = FORMATIONS[ctx.sides[side].tactic].slots;
        for (const slot of OUTFIELD) {
          const position = slots[slot]!.position;
          const flank = position.startsWith('L') ? -1 : position.startsWith('R') ? 1 : 0;
          if (flank === 0) continue;
          const y = own(ctx, side, slot)[1];
          if (Math.sign(y - AXIS) !== flank)
            misses.push(`${at(ctx)}: side ${side} ${position} at y ${y}`);
        }
      }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('a 3-5-2 keeps three centre-backs between its wing-backs', () => {
    const left = slotOf('balanced', 'LWB');
    const right = slotOf('balanced', 'RWB');
    const backs = SLOTS.filter((slot) => FORMATIONS.balanced.slots[slot]!.position === 'CB');
    expect(backs).toHaveLength(3);
    const misses: string[] = [];
    for (const ctx of situations())
      for (const side of [0, 1] as const) {
        if (ctx.sides[side].tactic !== 'balanced') continue;
        const ys = backs.map((slot) => own(ctx, side, slot)[1]);
        const low = own(ctx, side, left)[1];
        const high = own(ctx, side, right)[1];
        if (!ys.every((y) => low < y && y < high))
          misses.push(`${at(ctx)}: side ${side} LWB ${low} CBs ${ys.join(' ')} RWB ${high}`);
      }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it("a 4-2-3-1's shadow striker stands between its midfield pair and its striker", () => {
    const pair = [slotOf('press', 'DM'), slotOf('press', 'CM')];
    const shadow = slotOf('press', 'AM');
    const striker = slotOf('press', 'ST');
    expect(FORMATIONS.press.slots[shadow]!.role).toBe('shadowStriker');
    const misses: string[] = [];
    for (const ctx of situations())
      for (const side of [0, 1] as const) {
        if (ctx.sides[side].tactic !== 'press') continue;
        const midfield = Math.max(...xsOf(ctx, side, pair));
        const [x] = own(ctx, side, shadow);
        const front = own(ctx, side, striker)[0];
        if (!(midfield < x && x <= front))
          misses.push(`${at(ctx)}: side ${side} pair ${midfield} AM ${x} ST ${front}`);
      }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('an attacking wing-back is higher and wider in the final third than a defensive one', () => {
    const attacking = slotOf('balanced', 'RWB');
    const defensive = slotOf('balanced', 'LWB');
    expect(FORMATIONS.balanced.slots[attacking]!.role).toBe('attackingWingBack');
    expect(FORMATIONS.balanced.slots[defensive]!.role).toBe('defensiveWingBack');
    for (const opponent of TACTICS)
      for (const side of [0, 1] as const)
        for (const x of [72, 80, 88.5, 94, 100]) {
          const sides: [ShapeSide, ShapeSide] = [sideOf(opponent), sideOf(opponent)];
          sides[side] = sideOf('balanced');
          const ctx: ShapeContext = {
            sides,
            ball: attackFrame(side, [x, AXIS]),
            team: side,
            phase: 'finalThird',
          };
          const high = own(ctx, side, attacking);
          const low = own(ctx, side, defensive);
          expect(high[0]).toBeGreaterThan(low[0]);
          expect(Math.abs(high[1] - AXIS)).toBeGreaterThan(Math.abs(low[1] - AXIS));
        }
  });

  it("a press side's line is at least as high as a possession side's and a counter side's the deepest", () => {
    for (const ball of [
      [52.5, 34],
      [52.5, 10],
      [52.5, 58],
    ] as const)
      for (const side of [0, 1] as const) {
        const line = (tactic: Tactic) => {
          const sides: [ShapeSide, ShapeSide] = [sideOf('possession'), sideOf('possession')];
          sides[side] = sideOf(tactic);
          const ctx: ShapeContext = {
            sides,
            ball: attackFrame(side, ball),
            team: side === 0 ? 1 : 0,
            phase: 'progression',
          };
          return Math.min(...xsOf(ctx, side, slotsOn(tactic, 'DF')));
        };
        expect(line('press')).toBeGreaterThanOrEqual(line('possession'));
        for (const tactic of ['possession', 'press', 'balanced'] as const)
          expect(line('counter')).toBeLessThan(line(tactic));
      }
  });

  it("placeFor is nominalSpot with the ball at the cell's centre", () => {
    // The prototype's phase rule (its grammar's thresholds at attack x 38 and 72), read here
    // independently of the band table the shape keeps.
    const phaseAt = (x: number): StagingPhase =>
      x < 38 ? 'buildUp' : x < 72 ? 'progression' : 'finalThird';
    for (const t0 of TACTICS)
      for (const t1 of TACTICS) {
        const sides = [sideOf(t0), sideOf(t1)] as const;
        for (let cell = 0; cell < 40; cell++)
          for (const side of [0, 1] as const)
            for (const inPossession of [true, false]) {
              const team = inPossession ? side : side === 0 ? 1 : 0;
              const ball = attackFrame(side, cellCentre(cell));
              const ctx: ShapeContext = {
                sides,
                ball,
                team,
                phase: phaseAt(attackFrame(team, ball)[0]),
              };
              for (const slot of SLOTS)
                expect(placeFor(sides, side, slot, cell, inPossession)).toEqual(
                  own(ctx, side, slot),
                );
            }
      }
    const [x0, y0] = cellCentre(0);
    expect([x0, y0.toFixed(9)]).toEqual([2.75, '6.920000000']);
    const [x37, y37] = cellCentre(37);
    expect([x37, y37.toFixed(9)]).toEqual([102.25, '34.000000000']);
  });

  it('an absent slot has no place', () => {
    const sides: [ShapeSide, ShapeSide] = [
      { ...sideOf('counter'), present: SLOTS.map((slot) => slot !== 10) },
      sideOf('press'),
    ];
    const ctx: ShapeContext = { sides, ball: [40, 30], team: 0, phase: 'progression' };
    expect(() => nominalSpot(ctx, 0, 10)).toThrow();
    expect(() => placeFor(sides, 0, 10, 17, true)).toThrow();
    expect(nominalSpot(ctx, 0, 9)).toEqual(
      nominalSpot({ ...ctx, sides: [sideOf('counter'), sides[1]] }, 0, 9),
    );
  });

  it('every formation role is known to the shape', () => {
    const known = new Set<RoleId>([
      ...(Object.keys(ROLE_SHAPE) as RoleId[]),
      ...SLOT_ANCHOR_ROLES,
      SWEEPER_ROLE,
    ]);
    for (const tactic of TACTICS) {
      const { slots } = FORMATIONS[tactic];
      expect(slots).toHaveLength(11);
      expect(FORMATION_SHAPE[tactic].ip).toHaveLength(11);
      expect(FORMATION_SHAPE[tactic].oop).toHaveLength(11);
      for (const slot of SLOTS) {
        expect(known.has(slots[slot]!.role), `${tactic} slot ${slot} ${slots[slot]!.role}`).toBe(
          true,
        );
        expect(FORMATION_SHAPE[tactic].ip[slot] === null).toBe(slot === 0);
        expect(FORMATION_SHAPE[tactic].oop[slot] === null).toBe(slot === 0);
      }
    }
    // Every role is known exactly once: by its habit, as keeping its slot's anchor, or as the sweeper.
    const listed = [...Object.keys(ROLE_SHAPE), ...SLOT_ANCHOR_ROLES, SWEEPER_ROLE];
    expect([...listed].sort()).toEqual([...ROLE_IDS].sort());
  });
});
