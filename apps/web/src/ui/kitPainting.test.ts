import { describe, expect, it } from 'vitest';
import type { ShirtDesign } from '../../../../packages/contracts/src/identity';
import {
  SHIRT_TRIM_INNER,
  shirtPatternRegions,
} from '../../../../packages/engine/src/kit-patterns';
import {
  KIT_SPRITE_LIMIT,
  createKitPainter,
  describeShirt,
  type KitCanvas,
  type KitContext,
} from './kitPainting';

/** The drawing state a real 2D context saves and restores. */
interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  clipped: boolean;
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
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  clipped: false,
};

/**
 * A recording 2D context with a real save/restore stack: every call is logged with the state in
 * force when it ran, so the tests read what a canvas would have drawn, not what a helper returned.
 */
class RecordingContext implements KitContext<KitCanvas> {
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
  get font() {
    return this.state.font;
  }
  set font(v: string) {
    this.state.font = v;
  }
  get textAlign() {
    return this.state.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.state.textAlign = v;
  }
  get textBaseline() {
    return this.state.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.state.textBaseline = v;
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
  arc(x: number, y: number, r: number, a: number, b: number, ccw?: boolean) {
    this.log('arc', x, y, r, a, b, ...(ccw === undefined ? [] : [ccw]));
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
  fillText(text: string, x: number, y: number) {
    this.log('fillText', text, x, y);
  }
  strokeText(text: string, x: number, y: number) {
    this.log('strokeText', text, x, y);
  }
  drawImage(image: KitCanvas, x: number, y: number, w: number, h: number) {
    this.log('drawImage', image, x, y, w, h);
  }
}

/** The minimal offscreen canvas the painter accepts, recording into its own context. */
class FakeCanvas implements KitCanvas {
  readonly ctx = new RecordingContext();
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return this.ctx;
  }
}

function fakeFactory() {
  const made: FakeCanvas[] = [];
  const factory = (width: number, height: number) => {
    const canvas = new FakeCanvas(width, height);
    made.push(canvas);
    return canvas;
  };
  return { made, factory };
}

const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#c8102e', secondary: '#ffffff' };
const TRIMMED: ShirtDesign = { ...STRIPES, trim: '#111111' };
const NAVY: ShirtDesign = { pattern: 'plain', primary: '#0b1f4d' };

/** The calls of one marker, from its outer save to the matching restore. */
function segments(ctx: RecordingContext) {
  const out: Call[][] = [];
  let open: Call[] | undefined;
  for (const call of ctx.calls) {
    if (call.op === 'save' && call.depth === 0) open = [];
    open?.push(call);
    if (call.op === 'restore' && call.depth === 0 && open) {
      out.push(open);
      open = undefined;
    }
  }
  return out;
}

describe('createKitPainter sprite painting (→KIT-3–5, contract §4/§7)', () => {
  it('paints field, every pattern polygon, the clip and the trim ring from the shared geometry', () => {
    const { made, factory } = fakeFactory();
    const painter = createKitPainter(factory);
    painter.draw(new RecordingContext(), TRIMMED, 20, 20, 10, { dpr: 2 });
    expect(made).toHaveLength(1);
    const sprite = made[0]!;
    // 10 CSS px radius at DPR 2 is a 40-pixel square sprite.
    expect([sprite.width, sprite.height]).toEqual([40, 40]);
    const calls = sprite.ctx.calls;
    const ops = calls.map((c) => c.op);
    // The circular clip is set inside save and lifted by the matching restore.
    expect(ops[0]).toBe('save');
    const clipAt = ops.indexOf('clip');
    expect(calls[clipAt - 1]).toMatchObject({ op: 'arc', args: [20, 20, 20, 0, Math.PI * 2] });
    expect(ops.at(-1)).toBe('restore');
    expect(sprite.ctx.depth).toBe(0);
    expect(sprite.ctx.current.clipped).toBe(false);
    // Main field fills the box under the clip.
    const field = calls.find((c) => c.op === 'fillRect')!;
    expect(field.args).toEqual([0, 0, 40, 40]);
    expect(field.state).toMatchObject({ fillStyle: '#c8102e', clipped: true });
    // The secondary path is exactly the shared stripes polygons, scaled to the sprite.
    const expected = shirtPatternRegions('stripes').flatMap((polygon) =>
      polygon.map(([x, y]) => [x * 40, y * 40]),
    );
    const vertices = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo');
    expect(vertices.slice(0, expected.length).map((c) => c.args)).toEqual(expected);
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills[0]!.state).toMatchObject({ fillStyle: '#ffffff', clipped: true });
    // The trim is the 0.84–1 ring, painted last, even-odd so the inside stays.
    const trimArcs = calls.filter((c) => c.op === 'arc').slice(-2);
    expect(trimArcs.map((c) => c.args[2])).toEqual([20, 20 * SHIRT_TRIM_INNER]);
    expect(fills.at(-1)).toMatchObject({ args: ['evenodd'] });
    expect(fills.at(-1)!.state).toMatchObject({ fillStyle: '#111111', clipped: true });
  });

  it('draws no secondary or trim for a plain untrimmed shirt, even with a stray secondary', () => {
    const { made, factory } = fakeFactory();
    createKitPainter(factory).draw(
      new RecordingContext(),
      { ...NAVY, secondary: '#ffffff' },
      8,
      8,
      8,
    );
    const ops = made[0]!.ctx.calls.map((c) => c.op);
    expect(ops).toEqual(['save', 'beginPath', 'arc', 'clip', 'fillRect', 'restore']);
  });

  it('checks fill the five cells of the shared 3×3 grid', () => {
    const { made, factory } = fakeFactory();
    createKitPainter(factory).draw(
      new RecordingContext(),
      { pattern: 'checks', primary: '#000000', secondary: '#ffffff' },
      9,
      9,
      9,
    );
    const moves = made[0]!.ctx.calls
      .filter((c) => c.op === 'moveTo')
      .map((c) => c.args.map((v) => Math.round(v as number)));
    expect(moves).toEqual([
      [0, 0],
      [12, 0],
      [6, 6],
      [0, 12],
      [12, 12],
    ]);
  });
});

describe('createKitPainter sprite cache (→ARCH-7, contract §7)', () => {
  it('reuses an identical style-size-DPR sprite and blits it at the marker', () => {
    const { made, factory } = fakeFactory();
    const painter = createKitPainter(factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, STRIPES, 30, 40, 6, { dpr: 2 });
    // A fresh but equal design object is the same style.
    painter.draw(ctx, { ...STRIPES }, 70, 40, 6, { dpr: 2, number: 9 });
    expect(made).toHaveLength(1);
    expect(painter.size).toBe(1);
    const blits = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(blits.map((c) => c.args)).toEqual([
      [made[0], 24, 34, 12, 12],
      [made[0], 64, 34, 12, 12],
    ]);
  });

  it('builds a new sprite for a changed secondary, trim, size or DPR', () => {
    const { made, factory } = fakeFactory();
    const painter = createKitPainter(factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, STRIPES, 0, 0, 6, { dpr: 1 });
    painter.draw(ctx, { ...STRIPES, secondary: '#000000' }, 0, 0, 6, { dpr: 1 });
    painter.draw(ctx, TRIMMED, 0, 0, 6, { dpr: 1 });
    painter.draw(ctx, STRIPES, 0, 0, 6, { dpr: 2 });
    painter.draw(ctx, STRIPES, 0, 0, 7, { dpr: 1 });
    painter.draw(ctx, { ...STRIPES, pattern: 'hoops' }, 0, 0, 6, { dpr: 1 });
    expect(made).toHaveLength(6);
    expect(made.map((c) => c.width)).toEqual([12, 12, 12, 24, 14, 12]);
    // The changed colours reach the new sprites' fills.
    const fillColours = (c: FakeCanvas) =>
      c.ctx.calls.filter((call) => call.op === 'fill').map((call) => call.state.fillStyle);
    expect(fillColours(made[1]!)).toEqual(['#000000']);
    expect(fillColours(made[2]!)).toEqual(['#ffffff', '#111111']);
    // Repeating every one of them builds nothing more.
    painter.draw(ctx, TRIMMED, 0, 0, 6, { dpr: 1 });
    painter.draw(ctx, STRIPES, 0, 0, 6, { dpr: 2 });
    expect(made).toHaveLength(6);
  });

  it(`evicts the oldest sprite beyond its fixed ${KIT_SPRITE_LIMIT}-entry bound`, () => {
    const { made, factory } = fakeFactory();
    const painter = createKitPainter(factory);
    const ctx = new RecordingContext();
    const shade = (i: number): ShirtDesign => ({
      pattern: 'plain',
      primary: `#${i.toString(16).padStart(6, '0')}`,
    });
    for (let i = 0; i < KIT_SPRITE_LIMIT; i++) painter.draw(ctx, shade(i), 0, 0, 5);
    expect(painter.size).toBe(KIT_SPRITE_LIMIT);
    // A hit does not refresh the first entry's place: eviction is FIFO, not LRU.
    painter.draw(ctx, shade(0), 0, 0, 5);
    expect(made).toHaveLength(KIT_SPRITE_LIMIT);
    painter.draw(ctx, shade(KIT_SPRITE_LIMIT), 0, 0, 5);
    expect(painter.size).toBe(KIT_SPRITE_LIMIT);
    expect(made).toHaveLength(KIT_SPRITE_LIMIT + 1);
    // Entry 1 is still cached; entry 0 was evicted and is painted again.
    painter.draw(ctx, shade(1), 0, 0, 5);
    expect(made).toHaveLength(KIT_SPRITE_LIMIT + 1);
    painter.draw(ctx, shade(0), 0, 0, 5);
    expect(made).toHaveLength(KIT_SPRITE_LIMIT + 2);
    expect(made.at(-1)!.ctx.calls.find((c) => c.op === 'fillRect')!.state.fillStyle).toBe(
      '#000000',
    );
    expect(painter.size).toBe(KIT_SPRITE_LIMIT);
  });

  it('caches style backgrounds only: numbers and outlines never reach a sprite', () => {
    const { made, factory } = fakeFactory();
    const painter = createKitPainter(factory);
    painter.draw(new RecordingContext(), STRIPES, 10, 10, 6, { number: 7, outline: '#ffffff' });
    painter.draw(new RecordingContext(), STRIPES, 10, 10, 6, { number: 11, outline: '#000000' });
    expect(made).toHaveLength(1);
    const ops = new Set(made[0]!.ctx.calls.map((c) => c.op));
    expect(ops.has('fillText')).toBe(false);
    expect(ops.has('stroke')).toBe(false);
  });
});

describe('createKitPainter numbers and outlines (→WEB-50)', () => {
  it('restores every state change so one side does not leak into the next', () => {
    const { factory } = fakeFactory();
    const painter = createKitPainter(factory);
    const ctx = new RecordingContext();
    painter.draw(ctx, STRIPES, 20, 20, 8, {
      number: 10,
      outline: '#ffffffcc',
      outlineWidth: 2,
      font: '9px Galmuri11',
    });
    expect(ctx.current).toEqual(INITIAL);
    painter.draw(ctx, NAVY, 60, 20, 8, { number: 4 });
    expect(ctx.current).toEqual(INITIAL);
    expect(ctx.depth).toBe(0);
    const [home, away] = segments(ctx);
    // Home: blit, then a 2 px outline, then a haloed number over the patterned shirt.
    expect(home!.map((c) => c.op)).toEqual([
      'save',
      'drawImage',
      'beginPath',
      'arc',
      'stroke',
      'strokeText',
      'fillText',
      'restore',
    ]);
    expect(home!.find((c) => c.op === 'stroke')!.state).toMatchObject({
      strokeStyle: '#ffffffcc',
      lineWidth: 2,
    });
    // White at the stripes centre (x=0.5 is primary red): white ink, dark halo.
    expect(home!.find((c) => c.op === 'fillText')).toMatchObject({
      args: ['10', 20, 20],
      state: { fillStyle: '#ffffff', font: '9px Galmuri11', textAlign: 'center' },
    });
    // Away has no outline: no stroke at all, and its blit runs with the untouched initial state.
    expect(away!.map((c) => c.op)).toEqual(['save', 'drawImage', 'fillText', 'restore']);
    expect(away!.find((c) => c.op === 'drawImage')!.state).toEqual(INITIAL);
    const number = away!.find((c) => c.op === 'fillText')!;
    expect(number.args).toEqual(['4', 60, 20]);
    expect(number.state.fillStyle).toBe('#ffffff');
    expect(number.state.font).not.toBe('9px Galmuri11');
  });

  it('chooses the number ink from the colour actually under the centre', () => {
    const { factory } = fakeFactory();
    const painter = createKitPainter(factory);
    const ctx = new RecordingContext();
    // Halves: the centre lies on the (inclusive) secondary edge, so the ink reads on the secondary.
    painter.draw(ctx, { pattern: 'halves', primary: '#0b1f4d', secondary: '#f5f5f5' }, 0, 0, 8, {
      number: 1,
    });
    const text = ctx.calls.find((c) => c.op === 'fillText')!;
    expect(text.state.fillStyle).toBe('#121212');
    expect(ctx.calls.find((c) => c.op === 'strokeText')!.state.strokeStyle).toBe('#ffffff');
  });

  it('falls back to a solid marker when no offscreen context is available', () => {
    const painter = createKitPainter((width, height) => ({
      width,
      height,
      getContext: () => null,
    }));
    const ctx = new RecordingContext();
    painter.draw(ctx, STRIPES, 5, 5, 5);
    painter.draw(ctx, STRIPES, 5, 5, 5);
    expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(ctx.calls.filter((c) => c.op === 'fill').map((c) => c.state.fillStyle)).toEqual([
      '#c8102e',
      '#c8102e',
    ]);
    expect(ctx.current).toEqual(INITIAL);
  });
});

describe('describeShirt (→WEB-87 accessible names)', () => {
  it('names the pattern and only the colours the shirt shows', () => {
    expect(describeShirt(TRIMMED)).toBe(
      '세로 줄무늬, 주색 #c8102e, 보조색 #ffffff, 테두리 #111111',
    );
    expect(describeShirt({ ...NAVY, secondary: '#ffffff' })).toBe('단색, 주색 #0b1f4d');
  });
});
