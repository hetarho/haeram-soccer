import { describe, expect, it } from 'vitest';
import {
  SHIRT_PATTERNS,
  type ShirtDesign,
  type WornKeeper,
  type WornKit,
} from '../../../../packages/contracts/src/identity';
import {
  FIGURE_TORSO,
  figureShirtColourAt,
  insideFigureTorso,
  insidePolygon,
} from '../../../../packages/engine/src/kit-patterns';
import type { FigureActionWindow } from './figureActions';
import {
  FIGURE_LOD,
  FIGURE_SCALE,
  FIGURE_SPRITE_LIMIT,
  HAIR_COLOURS,
  HAIR_STYLES,
  SKIN_TONES,
  createFigurePainter,
  figureDetail,
  figurePoint,
  playerLook,
  type FigureCanvas,
  type FigureContext,
  type FigureDrawOptions,
  type PlayerLook,
} from './figurePainting';
import { figureOffset, poseAt, type FigureInput } from './figurePose';

/** A 2D affine transform [a, b, c, d, e, f], as `CanvasRenderingContext2D.getTransform` has it. */
type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, [x, y]: readonly [number, number]) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** The drawing state a real 2D context saves and restores. */
interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  clipped: boolean;
  matrix: Matrix;
}
interface Call {
  op: string;
  args: unknown[];
  state: State;
  depth: number;
}

const INITIAL: State = {
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  clipped: false,
  matrix: IDENTITY,
};

/**
 * A recording 2D context with a real save/restore stack and transform: every call is logged with
 * the state in force when it ran, so the tests read what a canvas would have drawn.
 */
class RecordingContext implements FigureContext<FakeCanvas> {
  calls: Call[] = [];
  private state: State = { ...INITIAL };
  private stack: State[] = [];
  get depth() {
    return this.stack.length;
  }
  get current(): Readonly<State> {
    return this.state;
  }
  private log(op: string, ...args: unknown[]) {
    this.calls.push({ op, args, state: { ...this.state }, depth: this.stack.length });
  }
  get fillStyle() {
    return this.state.fillStyle;
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    this.state.fillStyle = String(v);
  }
  get strokeStyle() {
    return this.state.strokeStyle;
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    this.state.strokeStyle = String(v);
  }
  get lineWidth() {
    return this.state.lineWidth;
  }
  set lineWidth(v: number) {
    this.state.lineWidth = v;
  }
  get lineCap() {
    return this.state.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.state.lineCap = v;
  }
  get lineJoin() {
    return this.state.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.state.lineJoin = v;
  }
  save() {
    this.log('save');
    this.stack.push({ ...this.state });
  }
  restore() {
    const top = this.stack.pop();
    if (!top) throw new Error('restore without save');
    this.state = top;
    this.log('restore');
  }
  translate(x: number, y: number) {
    this.state.matrix = times(this.state.matrix, [1, 0, 0, 1, x, y]);
    this.log('translate', x, y);
  }
  rotate(a: number) {
    const c = Math.cos(a),
      s = Math.sin(a);
    this.state.matrix = times(this.state.matrix, [c, s, -s, c, 0, 0]);
    this.log('rotate', a);
  }
  scale(x: number, y: number) {
    this.state.matrix = times(this.state.matrix, [x, 0, 0, y, 0, 0]);
    this.log('scale', x, y);
  }
  clip() {
    this.state.clipped = true;
    this.log('clip');
  }
  beginPath() {
    this.log('beginPath');
  }
  closePath() {
    this.log('closePath');
  }
  moveTo(x: number, y: number) {
    this.log('moveTo', x, y);
  }
  lineTo(x: number, y: number) {
    this.log('lineTo', x, y);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a: number, b: number) {
    this.log('ellipse', x, y, rx, ry, rot, a, b);
  }
  fill(rule?: CanvasFillRule) {
    this.log('fill', rule);
  }
  stroke() {
    this.log('stroke');
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.log('fillRect', x, y, w, h);
  }
  drawImage(image: FakeCanvas, x: number, y: number, w: number, h: number) {
    this.log('drawImage', image, x, y, w, h);
  }
}

/** The minimal offscreen canvas the painter accepts, recording into its own context. */
class FakeCanvas implements FigureCanvas {
  readonly ctx = new RecordingContext();
  constructor(
    public width: number,
    public height: number,
    private blank = false,
  ) {}
  getContext() {
    return this.blank ? null : this.ctx;
  }
}

/** A factory recording every sprite it makes; `blank` ones have no 2D context. */
function fakeFactory(blank = false) {
  const made: FakeCanvas[] = [];
  const factory = (width: number, height: number) => {
    const canvas = new FakeCanvas(width, height, blank);
    made.push(canvas);
    return canvas;
  };
  return { made, factory };
}

const KIT: WornKit = {
  shirt: { pattern: 'stripes', primary: '#c8102e', secondary: '#f4f1e6', trim: '#11203d' },
  shorts: '#223344',
  socks: '#556677',
};
const KEEPER: WornKeeper = {
  shirt: { pattern: 'plain', primary: '#9ccc3d' },
  shorts: '#12493a',
  socks: '#aabbcc',
  gloves: '#f5e663',
};
const LOOK: PlayerLook = { skin: '#a26b45', hair: '#241a14', style: 'crop' };
const BASE: FigureDrawOptions<FakeCanvas> = {
  x: 100,
  y: 80,
  radius: 12,
  dpr: 2,
  look: LOOK,
  outline: '#ffffffdd',
  outlineWidth: 1.3,
};

function input(over: Partial<FigureInput> = {}): FigureInput {
  return {
    id: 'p1',
    keeper: false,
    time: 10,
    position: [50, 50],
    speed: 0,
    velocity: [0, 0],
    velocityBefore: [0, 0],
    toBall: [30, 10],
    ballHeight: 0,
    carrier: false,
    distance: 0,
    ...over,
  };
}
const actions = (kind: FigureActionWindow['kind']): FigureActionWindow[] => [
  { kind, player: 'p1', start: 9.3, contact: 10, end: 10.8, toward: [60, 50] },
];
const STANDING = poseAt(input(), undefined, { reducedMotion: false });
const RUNNING = poseAt(
  input({ speed: 7, velocity: [60, 20], velocityBefore: [60, 20], distance: 1.3 }),
  undefined,
  { reducedMotion: false },
);
const CARRYING = poseAt(
  input({ speed: 4, velocity: [60, 0], velocityBefore: [60, 0], carrier: true }),
  undefined,
  { reducedMotion: false },
);
const THROWING = poseAt(input({ time: 9.9 }), actions('throwIn'), { reducedMotion: false });

/** Index of the first call matching `test`, or -1. */
const first = (calls: readonly Call[], test: (call: Call) => boolean) => calls.findIndex(test);
const filled = (colour: string) => (c: Call) =>
  (c.op === 'fill' || c.op === 'fillRect') && c.state.fillStyle === colour;
const stroked = (colour: string) => (c: Call) =>
  c.op === 'stroke' && c.state.strokeStyle === colour;
/** The ellipses [x, y, rx, ry, …] of the path filled at call `at`. */
const ellipsesOf = (calls: readonly Call[], at: number) => {
  const start = calls.slice(0, at).findLastIndex((c) => c.op === 'beginPath');
  return calls
    .slice(start, at)
    .filter((c) => c.op === 'ellipse')
    .map((c) => c.args as number[]);
};

describe('createFigurePainter layers (→MATCH-36)', () => {
  it('draws layers in order', () => {
    const { factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, RUNNING, KIT, BASE);
    const calls = ctx.calls;
    const order = [
      first(calls, filled('#0000003d')), // shadow
      first(calls, stroked(BASE.outline)), // silhouette under everything
      first(calls, stroked(KIT.socks)), // legs with socks
      first(calls, filled('#17191b')), // boots
      first(calls, stroked(KIT.shorts)), // shorts
      first(calls, stroked(KIT.shirt.primary)), // sleeves
      first(calls, filled(LOOK.skin)), // hands
      first(calls, (c) => c.op === 'drawImage'), // torso
      first(calls, filled(LOOK.hair)), // the head's hair
    ];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Nothing leaks: the caller's state and transform come back untouched.
    expect(ctx.depth).toBe(0);
    expect(ctx.current).toEqual(INITIAL);
  });

  it('paints raised arms over the torso and head, and the ball at its socket layer', () => {
    const { factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const throwing = new RecordingContext();
    const thrown: Matrix[] = [];
    painter.draw(throwing, THROWING, KIT, {
      ...BASE,
      ball: (c) => thrown.push((c as RecordingContext).current.matrix),
    });
    expect(THROWING.overhead).toBe(true);
    const calls = throwing.calls;
    const torso = first(calls, (c) => c.op === 'drawImage');
    const hair = first(calls, filled(LOOK.hair));
    const sleeves = first(calls, stroked(KIT.shirt.primary));
    expect(torso).toBeLessThan(hair);
    expect(hair).toBeLessThan(sleeves);
    // The held ball is drawn once, in the caller's own space, between the head and the hands.
    expect(thrown).toEqual([IDENTITY]);

    const carrying = new RecordingContext();
    let at = -1;
    painter.draw(carrying, CARRYING, KIT, {
      ...BASE,
      ball: () => (at = carrying.calls.length),
    });
    expect(CARRYING.ball?.height).toBe(0);
    // A ball at the feet lies over the legs and shorts, under the arms and torso.
    expect(at).toBeGreaterThan(first(carrying.calls, stroked(KIT.shorts)));
    expect(at).toBeLessThanOrEqual(first(carrying.calls, stroked(KIT.shirt.primary)));
    expect(carrying.current).toEqual(INITIAL);
  });

  it('places a socket where the body is drawn', () => {
    const { factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, RUNNING, KIT, BASE);
    // The body frame (forward up, the player's right +X) at the torso blit.
    const frame = ctx.calls.find((c) => c.op === 'drawImage')!.state.matrix;
    for (const point of [RUNNING.head, RUNNING.arms[1].end, RUNNING.legs[0].end]) {
      const painted = apply(frame, [point[0], -point[1]]);
      const placed = figurePoint(RUNNING, point, BASE);
      const offset = figureOffset(RUNNING.facing, point, BASE.radius * 2 * FIGURE_SCALE.torso);
      expect(placed[0]).toBeCloseTo(painted[0]!, 9);
      expect(placed[1]).toBeCloseTo(painted[1]!, 9);
      expect(placed[0]).toBeCloseTo(BASE.x + offset[0], 9);
      expect(placed[1]).toBeCloseTo(BASE.y + offset[1], 9);
    }
  });

  it('torso is 85% of the marker diameter', () => {
    expect(FIGURE_SCALE.torso).toBe(0.85);
    const body = (options: FigureDrawOptions<FakeCanvas>) => {
      const ctx = new RecordingContext();
      createFigurePainter(fakeFactory().factory).draw(ctx, RUNNING, KIT, options);
      const torso = ctx.calls.find((c) => c.op === 'drawImage')!.state.matrix;
      // Every painted point's farthest reach from the figure's centre, CSS px.
      const reach = Math.max(
        ...ctx.calls
          .filter((c) => ['moveTo', 'lineTo', 'ellipse'].includes(c.op))
          .map((c) => {
            const [px, py] = apply(c.state.matrix, [c.args[0] as number, c.args[1] as number]);
            return Math.hypot(px! - options.x, py! - options.y);
          }),
      );
      return { torso: Math.hypot(torso[0], torso[1]), reach };
    };
    for (const radius of [6, 9, 12.1]) {
      const full = body({ ...BASE, radius, outlineWidth: 0, torsoScale: 1 });
      const drawn = body({ ...BASE, radius, outlineWidth: 0 });
      // The torso blit is one torso width across: 85% of the marker's diameter.
      expect(full.torso).toBeCloseTo(2 * radius, 9);
      expect(drawn.torso).toBeCloseTo(2 * radius * 0.85, 9);
      expect(drawn.reach / full.reach).toBeCloseTo(0.85, 9);
      // A held ball's socket shrinks with the body it is drawn at.
      const socket = figurePoint(RUNNING, RUNNING.legs[0].end, { ...BASE, radius });
      const wide = figurePoint(RUNNING, RUNNING.legs[0].end, { ...BASE, radius, torsoScale: 1 });
      expect(Math.hypot(socket[0] - BASE.x, socket[1] - BASE.y)).toBeCloseTo(
        Math.hypot(wide[0] - BASE.x, wide[1] - BASE.y) * 0.85,
        9,
      );
    }
  });

  it('carrier body bounds equal a non-carrier’s in the same pose', () => {
    // The pitch draws every figure without an outline (WEB-95): the carrier, holding the ball,
    // paints exactly the body a team-mate does in his pose.
    const drawn = (ball?: () => void) => {
      const ctx = new RecordingContext();
      createFigurePainter(fakeFactory().factory).draw(ctx, CARRYING, KIT, {
        ...BASE,
        outlineWidth: 0,
        ball,
      });
      // What is painted and where; holding the ball only re-enters the body frame around it.
      return ctx.calls
        .filter((c) => !['save', 'restore', 'translate', 'rotate', 'scale'].includes(c.op))
        .map(({ op, args, state }) => ({ op, args: String(args), m: state.matrix }));
    };
    expect(drawn(() => {})).toEqual(drawn());
    // An outline would grow his silhouette past everyone's.
    const outlined = new RecordingContext();
    createFigurePainter(fakeFactory().factory).draw(outlined, CARRYING, KIT, BASE);
    expect(outlined.calls.some(stroked(BASE.outline))).toBe(true);
    const plain = new RecordingContext();
    createFigurePainter(fakeFactory().factory).draw(plain, CARRYING, KIT, {
      ...BASE,
      outlineWidth: 0,
    });
    expect(plain.calls.some(stroked(BASE.outline))).toBe(false);
  });

  it('draws only: the pose, the kit and the look are never changed', () => {
    const freeze = <T>(value: T): T => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    const pose = freeze(structuredClone(THROWING));
    const kit = freeze(structuredClone(KEEPER));
    const look = freeze({ ...LOOK });
    const before = JSON.stringify([pose, kit, look]);
    const { factory } = fakeFactory();
    createFigurePainter(factory).draw(new RecordingContext(), pose, kit, { ...BASE, look });
    expect(JSON.stringify([pose, kit, look])).toBe(before);
  });
});

/** The opaque colour the recorded sprite paints at sprite pixel (x, y): the last fill covering it. */
function paintedAt(calls: readonly Call[], x: number, y: number): string | undefined {
  type Sub = { kind: 'poly'; points: [number, number][] } | { kind: 'ellipse'; e: number[] };
  let path: Sub[] = [];
  let colour: string | undefined;
  const inside = (sub: Sub) =>
    sub.kind === 'poly'
      ? sub.points.length >= 3 && insidePolygon(sub.points, x, y)
      : Math.hypot((x - sub.e[0]!) / sub.e[2]!, (y - sub.e[1]!) / sub.e[3]!) <= 1 + 1e-9;
  for (const call of calls) {
    const opaque = /^#[0-9a-f]{6}$/i.test(call.state.fillStyle);
    const a = call.args as number[];
    switch (call.op) {
      case 'beginPath':
        path = [];
        break;
      case 'moveTo':
        path.push({ kind: 'poly', points: [[a[0]!, a[1]!]] });
        break;
      case 'lineTo': {
        const sub = path.at(-1);
        if (sub?.kind === 'poly') sub.points.push([a[0]!, a[1]!]);
        break;
      }
      case 'ellipse':
        // Only whole ellipses are ever filled; the torso's corner arcs only clip and stroke.
        if (Math.abs(a[6]! - a[5]! - Math.PI * 2) < 1e-9) path.push({ kind: 'ellipse', e: a });
        break;
      case 'fillRect':
        if (opaque && x >= a[0]! && x <= a[0]! + a[2]! && y >= a[1]! && y <= a[1]! + a[3]!)
          colour = call.state.fillStyle;
        break;
      case 'fill': {
        if (!opaque) break;
        const hits = path.filter(inside).length;
        if (call.args[0] === 'evenodd' ? hits % 2 === 1 : hits > 0) colour = call.state.fillStyle;
        break;
      }
    }
  }
  return colour;
}

/** The 16×16 points kit selection samples, those the torso shows (KIT-7). */
const SAMPLES = Array.from(
  { length: 256 },
  (_, n) => [((n % 16) + 0.5) / 16, (Math.floor(n / 16) + 0.5) / 16] as const,
).filter(([u, v]) => insideFigureTorso(u, v));

describe('createFigurePainter torso (→KIT-7, KIT-5)', () => {
  it('torso sample points use the shirt geometry colours', () => {
    const maps = new Set<string>();
    for (const pattern of SHIRT_PATTERNS)
      for (const trim of [undefined, '#fcbf49']) {
        const shirt: ShirtDesign = {
          pattern,
          primary: '#0b1f4d',
          ...(pattern === 'plain' ? {} : { secondary: '#f4f1e6' }),
          ...(trim ? { trim } : {}),
        };
        const { made, factory } = fakeFactory();
        // The large editor sample: a 120 CSS px torso at DPR 2.
        createFigurePainter(factory).draw(
          new RecordingContext(),
          STANDING,
          { ...KIT, shirt },
          {
            ...BASE,
            radius: 60,
          },
        );
        expect(made).toHaveLength(1);
        const sprite = made[0]!;
        expect(sprite.height).toBe(Math.ceil(sprite.width / FIGURE_TORSO.aspect));
        const colours = SAMPLES.map(([u, v]) => {
          const painted = paintedAt(sprite.ctx.calls, u * sprite.width, v * sprite.height);
          expect(painted, `${pattern} ${trim} at ${u},${v}`).toBe(figureShirtColourAt(shirt, u, v));
          return painted;
        });
        if (!trim) maps.add(colours.join());
        // The sprite lifts its clip and leaves no state behind.
        expect(sprite.ctx.depth).toBe(0);
        expect(sprite.ctx.current.clipped).toBe(false);
      }
    // All eight patterns paint distinctly at the large sample size.
    expect(maps.size).toBe(SHIRT_PATTERNS.length);
  });

  it('wears sleeves in the shirt colours beside each sleeve band', () => {
    const { factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const halves: WornKit = {
      ...KIT,
      shirt: { pattern: 'halves', primary: '#0b1f4d', secondary: '#f4f1e6' },
    };
    const ctx = new RecordingContext();
    painter.draw(ctx, STANDING, halves, BASE);
    // Halves: his left sleeve in the base colour, his right in the second colour.
    const sleeves = ctx.calls.filter(
      (c) => c.op === 'stroke' && c.state.lineCap === 'butt' && c.state.strokeStyle !== '#00000038',
    );
    expect(sleeves.map((c) => c.state.strokeStyle)).toEqual([BASE.outline, '#0b1f4d', '#f4f1e6']);
  });
});

describe('createFigurePainter goalkeepers (→KIT-8)', () => {
  it('keeper draws gloves', () => {
    const { factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const keeper = new RecordingContext();
    painter.draw(keeper, STANDING, KEEPER, { ...BASE, radius: 30 });
    const outfield = new RecordingContext();
    painter.draw(outfield, STANDING, KIT, { ...BASE, radius: 30 });
    // The hands: two equal circles filled together (the ears are ovals), gloves on the keeper,
    // bare skin otherwise.
    const hands = (ctx: RecordingContext, colour: string) =>
      ctx.calls.flatMap((c, i) => {
        const shapes = filled(colour)(c) ? ellipsesOf(ctx.calls, i) : [];
        const circles =
          shapes.length === 2 && shapes.every((e) => e[2] === e[3] && e[2] === shapes[0]![2]);
        return circles ? [shapes[0]![2]!] : [];
      });
    expect(hands(keeper, KEEPER.gloves)).toHaveLength(1);
    expect(hands(outfield, KEEPER.gloves)).toHaveLength(0);
    expect(hands(outfield, LOOK.skin)).toHaveLength(1);
    // Gloves are larger than hands, with a seam across the fingers at full detail.
    expect(hands(keeper, KEEPER.gloves)[0]).toBeGreaterThan(hands(outfield, LOOK.skin)[0]!);
    expect(keeper.calls.some(stroked('#00000040'))).toBe(true);
    expect(outfield.calls.some(stroked('#00000040'))).toBe(false);
  });
});

describe('createFigurePainter detail (→MATCH-36 scale rule)', () => {
  it('detail steps by torso width', () => {
    expect(FIGURE_LOD).toEqual({ full: 40, medium: 18 });
    // The torso is 2 · radius CSS px wide: device px decide.
    expect(figureDetail(10, 2)).toBe('full');
    expect(figureDetail(9.99, 2)).toBe('medium');
    expect(figureDetail(9, 1)).toBe('medium');
    expect(figureDetail(8.99, 1)).toBe('flat');
    // The pitch's own scales: desktop 1100 px and a 360 px phone, at DPR 1 and 2.
    expect(figureDetail(12.1, 2)).toBe('full');
    expect(figureDetail(12.1, 1)).toBe('medium');
    expect(figureDetail(6, 2)).toBe('medium');
    expect(figureDetail(6, 1)).toBe('flat');

    const drawAt = (radius: number, dpr: number) => {
      const { made, factory } = fakeFactory();
      const ctx = new RecordingContext();
      createFigurePainter(factory).draw(ctx, RUNNING, KIT, { ...BASE, radius, dpr });
      const sprite = made[0]!.ctx.calls;
      return {
        strands: ctx.calls.some(stroked('#ffffff26')),
        cuffs: ctx.calls.some(stroked(KIT.shirt.trim!)),
        edges: ctx.calls.some(stroked('#00000038')),
        boots: ctx.calls.some(stroked('#d6d9cc')),
        shading:
          ctx.calls.some(filled('#ffffff1c')) &&
          sprite.some((c) => c.state.fillStyle === '#00000021'),
        outline: ctx.calls.some(stroked(BASE.outline)),
        facing: ctx.calls.some(filled(LOOK.skin)),
      };
    };
    const full = drawAt(12.1, 2),
      medium = drawAt(12.1, 1),
      flat = drawAt(6, 1);
    expect(full).toMatchObject({
      strands: true,
      cuffs: true,
      edges: true,
      boots: true,
      shading: true,
    });
    expect(medium).toMatchObject({
      strands: false,
      cuffs: false,
      edges: false,
      boots: true,
      shading: true,
    });
    expect(flat).toMatchObject({
      strands: false,
      cuffs: false,
      edges: false,
      boots: false,
      shading: false,
    });
    // Every step keeps the silhouette's limb outlines and the skin-coloured facing cue.
    for (const step of [full, medium, flat])
      expect(step).toMatchObject({ outline: true, facing: true });
  });

  it('keeps the facing cue larger at the flat step', () => {
    const noseAt = (radius: number, dpr: number) => {
      const ctx = new RecordingContext();
      createFigurePainter(fakeFactory().factory).draw(ctx, STANDING, KIT, { ...BASE, radius, dpr });
      // The head and the nose are filled together in skin: the ellipse after the head's circle.
      const [, nose] = ctx.calls
        .map((c, i) => (filled(LOOK.skin)(c) ? ellipsesOf(ctx.calls, i) : []))
        .find((shapes) => shapes[0]?.[2] === FIGURE_TORSO.head.r)!;
      return nose![2]!;
    };
    expect(noseAt(6, 1)).toBeGreaterThan(noseAt(12.1, 2));
  });
});

describe('playerLook (→MATCH-36)', () => {
  it('same look for the same id', () => {
    expect(playerLook('p-1042')).toEqual(playerLook('p-1042'));
    expect(playerLook('p-1042')).not.toBe(playerLook('p-1042'));
    // Pinned: a player keeps his look in every match and every build.
    expect([playerLook('own-7'), playerLook('npc-3-11')]).toEqual([
      { skin: '#70432a', hair: '#15110f', style: 'buzz' },
      { skin: '#41261a', hair: '#523722', style: 'swept' },
    ]);
    // IDs spread over every tone and style; darker skins take the darker hair colours.
    const looks = Array.from({ length: 400 }, (_, i) => playerLook(`player-${i}`));
    expect(new Set(looks.map((l) => l.skin))).toEqual(new Set(SKIN_TONES));
    expect(new Set(looks.map((l) => l.style))).toEqual(new Set(HAIR_STYLES));
    for (const look of looks) {
      expect(HAIR_COLOURS).toContain(look.hair);
      if (SKIN_TONES.indexOf(look.skin) >= 6)
        expect(HAIR_COLOURS.indexOf(look.hair)).toBeLessThan(7);
    }
  });
});

describe('createFigurePainter sprite cache (→ARCH-7)', () => {
  it('cache is bounded', () => {
    const { made, factory } = fakeFactory();
    const painter = createFigurePainter(factory);
    const ctx = new RecordingContext();
    const kit = (i: number): WornKit => ({
      ...KIT,
      shirt: { pattern: 'plain', primary: `#${i.toString(16).padStart(6, '0')}` },
    });
    for (let i = 0; i < FIGURE_SPRITE_LIMIT; i++) painter.draw(ctx, STANDING, kit(i), BASE);
    expect(painter.size).toBe(FIGURE_SPRITE_LIMIT);
    // Shorts, socks, pose and look are drawn live: they never make a sprite.
    painter.draw(
      ctx,
      RUNNING,
      { ...kit(0), shorts: '#ffffff', socks: '#000000' },
      {
        ...BASE,
        look: playerLook('other'),
      },
    );
    expect(made).toHaveLength(FIGURE_SPRITE_LIMIT);
    // One more evicts the oldest: FIFO, a hit does not refresh its place.
    painter.draw(ctx, STANDING, kit(FIGURE_SPRITE_LIMIT), BASE);
    expect(painter.size).toBe(FIGURE_SPRITE_LIMIT);
    painter.draw(ctx, STANDING, kit(1), BASE);
    expect(made).toHaveLength(FIGURE_SPRITE_LIMIT + 1);
    painter.draw(ctx, STANDING, kit(0), BASE);
    expect(made).toHaveLength(FIGURE_SPRITE_LIMIT + 2);
    expect(painter.size).toBe(FIGURE_SPRITE_LIMIT);
    // Kit, detail step and DPR key a sprite.
    painter.draw(ctx, STANDING, kit(0), { ...BASE, dpr: 1 });
    painter.draw(ctx, STANDING, kit(0), { ...BASE, radius: 4, dpr: 1 });
    expect(made).toHaveLength(FIGURE_SPRITE_LIMIT + 4);
    expect(painter.size).toBe(FIGURE_SPRITE_LIMIT);
  });

  it('falls back to a solid torso when no offscreen context is available', () => {
    const painter = createFigurePainter(fakeFactory(true).factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, STANDING, KIT, BASE);
    painter.draw(ctx, STANDING, KIT, BASE);
    expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(ctx.calls.some(filled(KIT.shirt.primary))).toBe(true);
    expect(ctx.current).toEqual(INITIAL);
  });
});
