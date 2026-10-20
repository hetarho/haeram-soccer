import type { Founding } from '../../../../packages/contracts/src/types';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';

export const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Archive United',
  color: '#126044',
  seed: 'save-test',
  level: 'normal',
};
export const world = () => simulatedWorld(FOUNDING);
// The original compact1 unsigned stream, used to exercise historical save compatibility.
export function legacyIntegers(values: number[], width: number) {
  const count = values.length / width;
  const columns = Array.from(
    { length: values.length },
    (_, index) => values[(index % count) * width + Math.floor(index / count)],
  );
  const bytes: number[] = [];
  for (let value of columns) {
    do {
      const next = value % 128;
      value = Math.floor(value / 128);
      bytes.push(next + (value ? 128 : 0));
    } while (value);
  }
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    encoded += String.fromCharCode(...bytes.slice(offset, offset + 32768));
  return btoa(encoded);
}
