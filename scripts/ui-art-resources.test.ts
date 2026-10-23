import { describe, expect, it } from 'vitest';
import { isolatedAtlasBounds } from './ui-art-resources.mjs';

const atlas = () => ({
  file: 'fixture.png',
  width: 80,
  height: 40,
  pixels: new Uint8Array(80 * 40 * 4),
});
function plate(
  sheet: ReturnType<typeof atlas>,
  left: number,
  top: number,
  right: number,
  bottom: number,
  alpha = 255,
) {
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) sheet.pixels[(y * sheet.width + x) * 4 + 3] = alpha;
}

describe('isolated UI atlas silhouettes', () => {
  it('retains the complete silhouette across a nominal grid gutter and ignores faint background noise', () => {
    const sheet = atlas();
    plate(sheet, 10, 9, 43, 31);
    plate(sheet, 55, 9, 74, 31);
    plate(sheet, 0, 0, 80, 2, 1);
    expect(isolatedAtlasBounds(sheet, 2, 1)).toEqual([
      { x: 8, y: 7, width: 37, height: 26 },
      { x: 53, y: 7, width: 23, height: 26 },
    ]);
  });

  it('rejects missing or ambiguous cells instead of publishing clipped or substituted icons', () => {
    const sheet = atlas();
    plate(sheet, 5, 5, 18, 18);
    expect(() => isolatedAtlasBounds(sheet, 2, 1)).toThrow('Missing silhouette');
    plate(sheet, 23, 23, 36, 36);
    expect(() => isolatedAtlasBounds(sheet, 2, 1)).toThrow('Multiple silhouettes');
  });
});
