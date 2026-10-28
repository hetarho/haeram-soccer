import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from '../../../../packages/engine/src/identity-legacy';
import { createFigurePainter, playerLook, type FigureCanvas } from './figurePainting';
import { poseAt } from './figurePose';
import {
  TAG_OFFSETS,
  drawNumberTag,
  numberTagStyle,
  placeNumberTags,
  type NumberTag,
  type NumberTagInput,
} from './numberTags';

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

interface Call {
  op: string;
  args: unknown[];
  matrix: Matrix;
  fillStyle: string;
  font: string;
}

/**
 * A recording 2D context for both the figure painter and the tags: every call with the transform
 * and paint in force when it ran. Anything not named here records with no state change.
 */
class RecordingContext {
  calls: Call[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  private matrix: Matrix = IDENTITY;
  private stack: Matrix[] = [];
  private log(op: string, args: unknown[]) {
    this.calls.push({
      op,
      args,
      matrix: this.matrix,
      fillStyle: String(this.fillStyle),
      font: this.font,
    });
  }
  save() {
    this.stack.push(this.matrix);
    this.log('save', []);
  }
  restore() {
    this.matrix = this.stack.pop()!;
    this.log('restore', []);
  }
  translate(x: number, y: number) {
    this.matrix = times(this.matrix, [1, 0, 0, 1, x, y]);
    this.log('translate', [x, y]);
  }
  rotate(a: number) {
    this.matrix = times(this.matrix, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    this.log('rotate', [a]);
  }
  scale(x: number, y: number) {
    this.matrix = times(this.matrix, [x, 0, 0, y, 0, 0]);
    this.log('scale', [x, y]);
  }
  beginPath = (...args: unknown[]) => this.log('beginPath', args);
  closePath = (...args: unknown[]) => this.log('closePath', args);
  moveTo = (...args: number[]) => this.log('moveTo', args);
  lineTo = (...args: number[]) => this.log('lineTo', args);
  arc = (...args: number[]) => this.log('arc', args);
  ellipse = (...args: number[]) => this.log('ellipse', args);
  clip = () => this.log('clip', []);
  fill = (...args: unknown[]) => this.log('fill', args);
  stroke = () => this.log('stroke', []);
  fillRect = (...args: number[]) => this.log('fillRect', args);
  fillText = (...args: unknown[]) => this.log('fillText', args);
  drawImage = (...args: unknown[]) => this.log('drawImage', args);
}

const blankCanvas = (width: number, height: number): FigureCanvas => ({
  width,
  height,
  getContext: () => null,
});

const AREA = { width: 400, height: 260, avoid: [] };
const figure = (
  id: string,
  x: number,
  y: number,
  number: number | string = id,
): NumberTagInput => ({
  id,
  number,
  x,
  y,
  radius: 12,
});
const boxOf = (t: NumberTag) =>
  [t.x - t.width / 2, t.y - t.height / 2, t.x + t.width / 2, t.y + t.height / 2] as const;
const disjoint = (a: NumberTag, b: NumberTag) => {
  const [p, q] = [boxOf(a), boxOf(b)];
  return p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1];
};
const STYLE = numberTagStyle({ markerOutline: '#ffffffdd', ground: '#183a2b' }, 'Pretendard');

describe('number tags (→MATCH-36, WEB-95)', () => {
  it('tags never rotate', () => {
    const ctx = new RecordingContext();
    const painter = createFigurePainter(blankCanvas);
    const players = [figure('a', 120, 100, 7), figure('b', 220, 140, 10)];
    // Figures facing every way first: their turned frames must not reach the tags.
    players.forEach((p, i) => {
      const pose = poseAt(
        {
          id: p.id,
          keeper: false,
          time: 0,
          position: [50, 50],
          speed: 6,
          velocity: [Math.cos(1.1 + i * 2), Math.sin(1.1 + i * 2)],
          velocityBefore: [Math.cos(1.1 + i * 2), Math.sin(1.1 + i * 2)],
          toBall: [0, 1],
          ballHeight: 0,
          carrier: false,
          distance: 3,
        },
        undefined,
        { reducedMotion: false },
      );
      painter.draw(
        ctx as never,
        pose,
        { shirt: { pattern: 'plain', primary: '#c8102e' }, shorts: '#111111', socks: '#c8102e' },
        {
          x: p.x,
          y: p.y,
          radius: p.radius,
          dpr: 2,
          look: playerLook(p.id),
          outline: '#ffffffdd',
          outlineWidth: 1.3,
        },
      );
    });
    expect(ctx.calls.some((c) => c.op === 'rotate')).toBe(true);
    const tags = placeNumberTags(players, AREA);
    const from = ctx.calls.length;
    for (const tag of tags) drawNumberTag(ctx, tag, STYLE);
    const drawn = ctx.calls.slice(from);
    expect(drawn.some((c) => ['rotate', 'scale', 'translate'].includes(c.op))).toBe(false);
    // Upright in the caller's own space, centred on the placed box, the plate square to the screen.
    const texts = drawn.filter((c) => c.op === 'fillText');
    expect(texts.map((c) => [c.args, c.matrix])).toEqual(
      tags.map((t) => [[t.text, t.x, t.y], IDENTITY]),
    );
    for (const tag of tags) {
      const [left, top, right, bottom] = boxOf(tag);
      const corners = drawn.filter((c) => c.op === 'lineTo').map((c) => c.args as number[]);
      expect(corners.some(([x, y]) => x === right && y >= top && y <= bottom)).toBe(true);
      expect(corners.some(([x, y]) => y === bottom && x >= left && x <= right)).toBe(true);
    }
    // The figures' facing is no input to placement: the same places give the same tags.
    expect(placeNumberTags(players, AREA)).toEqual(tags);
  });

  it('crowded figures get distinct offsets', () => {
    const crowd = [
      figure('h7', 200, 120, 7),
      figure('a4', 203, 122, 4),
      figure('h10', 198, 126, 10),
      figure('a23', 201, 118, 23),
    ];
    const tags = placeNumberTags(crowd, AREA);
    expect(new Set(tags.map((t) => t.offset)).size).toBe(crowd.length);
    for (let i = 0; i < tags.length; i++)
      for (let j = i + 1; j < tags.length; j++)
        expect(disjoint(tags[i]!, tags[j]!), `${tags[i]!.id} / ${tags[j]!.id}`).toBe(true);
    // Each keeps to one of the eight fixed offsets around its own figure.
    expect(tags.every((t) => t.offset >= 0 && t.offset < TAG_OFFSETS.length)).toBe(true);
  });

  it('placement is deterministic', () => {
    const players = Array.from({ length: 22 }, (_, i) =>
      figure(`p${i}`, 30 + ((i * 97) % 340), 30 + ((i * 53) % 200), (i % 11) + 1),
    );
    const bounds = { ...AREA, avoid: [[180, 120, 6]] as const };
    const tags = placeNumberTags(players, bounds);
    expect(placeNumberTags(players, bounds)).toEqual(tags);
    // Input order does not matter: the same figure gets the same tag.
    const shuffled = placeNumberTags([...players].reverse(), bounds);
    expect(new Map(shuffled.map((t) => [t.id, t]))).toEqual(new Map(tags.map((t) => [t.id, t])));
    // Returned in input order, on whole pixels.
    expect(tags.map((t) => t.id)).toEqual(players.map((p) => p.id));
    expect(tags.every((t) => Number.isInteger(t.x - t.width / 2))).toBe(true);
  });

  it('keeps clear of the ball and the carrier cue, and inside the pitch', () => {
    const alone = placeNumberTags([figure('a', 200, 120)], AREA)[0]!;
    expect(alone.offset).toBe(0);
    // The ball where the first choice would go moves the tag to another offset off it.
    const ball = [alone.x, alone.y, 5] as const;
    const moved = placeNumberTags([figure('a', 200, 120)], { ...AREA, avoid: [ball] })[0]!;
    expect(moved.offset).not.toBe(0);
    const [left, top, right, bottom] = boxOf(moved);
    expect(
      right <= ball[0] - 5 || left >= ball[0] + 5 || bottom <= ball[1] - 5 || top >= ball[1] + 5,
    ).toBe(true);
    // A figure in the corner keeps its tag on the pitch.
    const corner = placeNumberTags([figure('c', 396, 256)], AREA)[0]!;
    const box = boxOf(corner);
    expect(box[0] >= 0 && box[1] >= 0 && box[2] <= AREA.width && box[3] <= AREA.height).toBe(true);
  });

  it('reads on every theme: digits in the ground colour on a marker-outline plate', () => {
    const json = (path: string) =>
      JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as {
        entries?: { resource: string }[];
        tokens?: { ui?: Record<string, string> };
      };
    const registry = json('../../public/presentation/themes/index.json');
    expect(registry.entries!.length).toBeGreaterThan(0);
    for (const { resource } of registry.entries!) {
      const ui = json(`../../public/presentation/themes/${resource}`).tokens!.ui!;
      const style = numberTagStyle(
        { markerOutline: ui['pitch-marker-outline']!, ground: ui['pitch-ground']! },
        'Pretendard',
      );
      // Opaque parts of the colours; a translucent plate only lightens or darkens toward the grass.
      expect(
        contrast(style.plate.slice(0, 7), style.ink.slice(0, 7)),
        resource,
      ).toBeGreaterThanOrEqual(4.5);
      const ctx = new RecordingContext();
      drawNumberTag(ctx, placeNumberTags([figure('a', 100, 100, 9)], AREA)[0]!, style);
      const plate = ctx.calls.find((c) => c.op === 'fill')!;
      const text = ctx.calls.find((c) => c.op === 'fillText')!;
      expect([plate.fillStyle, text.fillStyle]).toEqual([style.plate, style.ink]);
      expect(text.font).toContain('Pretendard');
    }
  });
});
