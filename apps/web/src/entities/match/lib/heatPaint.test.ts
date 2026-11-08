import { describe, expect, it } from 'vitest';
import { HEAT_CONFIG, heatColour, heatField, paintHeat, type HeatCanvas } from './heatPaint';
import { cellRect } from './materialView';

const { width, height } = HEAT_CONFIG.resolution;
/** A map with most touches in one cell and a few in another. */
const cells = (busy: number, quiet: number) =>
  Array.from({ length: 40 }, (_, cell) => (cell === busy ? 30 : cell === quiet ? 6 : 0));
const pixelOf = (cell: number) => {
  const rect = cellRect(cell);
  return Math.floor(rect.y + rect.height / 2) * width + Math.floor(rect.x + rect.width / 2);
};
const hue = ([r, g, b]: readonly number[]) => {
  const max = Math.max(r!, g!, b!),
    min = Math.min(r!, g!, b!),
    d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
};

/** A canvas stand-in that records the pixels it is given. */
function fakeCanvas() {
  const written: Uint8ClampedArray[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => written.push(image.data),
    }),
    toDataURL: () => `data:image/png;base64,${written.length}`,
  };
  return { canvas: canvas as unknown as HeatCanvas, written };
}

describe('heatPaint', () => {
  it('peaks at the busiest cell', () => {
    const field = heatField(cells(17, 32), width, height);
    let top = 0;
    for (let i = 1; i < field.length; i++) if (field[i]! > field[top]!) top = i;
    const rect = cellRect(17);
    const [x, y] = [top % width, Math.floor(top / width)];
    expect(x).toBeGreaterThanOrEqual(rect.x);
    expect(x).toBeLessThanOrEqual(rect.x + rect.width);
    expect(y).toBeGreaterThanOrEqual(rect.y);
    expect(y).toBeLessThanOrEqual(rect.y + rect.height);
    expect(field[pixelOf(17)]!).toBeGreaterThan(field[pixelOf(32)]!);
  });

  it('is zero-alpha where nothing happened', () => {
    const field = heatField(cells(2, 7), width, height);
    // The far end of the pitch, and the margin outside the lines.
    expect(heatColour(field[pixelOf(37)]!)[3]).toBe(0);
    expect(heatColour(field[0]!)[3]).toBe(0);
    expect(heatColour(0)[3]).toBe(0);
    expect(heatColour(HEAT_CONFIG.floor / 2)[3]).toBe(0);
    expect(heatField(new Array<number>(40).fill(0), width, height).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("scales to the map's own maximum", () => {
    const small = heatField(cells(12, 22), width, height);
    const large = heatField(
      cells(12, 22).map((n) => n * 50),
      width,
      height,
    );
    expect(Math.max(...small)).toBeCloseTo(1, 5);
    expect(Math.max(...large)).toBeCloseTo(1, 5);
    for (let i = 0; i < small.length; i += 97) expect(large[i]!).toBeCloseTo(small[i]!, 5);
    expect(heatColour(1)[3]).toBe(Math.round(HEAT_CONFIG.alpha * 255));
  });

  it('ramp runs blue to red monotonically in hue', () => {
    const hues = Array.from({ length: 101 }, (_, i) => hue(heatColour(i / 100)));
    expect(hues[0]!).toBeGreaterThan(200);
    expect(hues[0]!).toBeLessThan(250);
    expect(hues[100]!).toBeLessThan(15);
    for (let i = 1; i < hues.length; i++) expect(hues[i]!).toBeLessThanOrEqual(hues[i - 1]! + 1e-9);
    const alphas = Array.from({ length: 101 }, (_, i) => heatColour(i / 100)[3]);
    for (let i = 1; i < alphas.length; i++)
      expect(alphas[i]!).toBeGreaterThanOrEqual(alphas[i - 1]!);
  });

  it('is deterministic', () => {
    const first = fakeCanvas(),
      second = fakeCanvas();
    expect(paintHeat(first.canvas, cells(23, 8))).toMatch(/^data:image\/png/);
    paintHeat(second.canvas, cells(23, 8));
    expect(first.canvas.width).toBe(width);
    expect(first.canvas.height).toBe(height);
    expect(first.written[0]).toEqual(second.written[0]);
    expect(first.written[0]!.some((byte) => byte > 0)).toBe(true);
    const none = { ...first.canvas, getContext: () => null } as HeatCanvas;
    expect(paintHeat(none, cells(23, 8))).toBeUndefined();
  });
});
