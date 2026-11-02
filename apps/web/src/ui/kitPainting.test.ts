import { describe, expect, it } from 'vitest';
import type { ShirtDesign } from '../../../../packages/contracts/src/identity';
import { describeShirt } from './kitPainting';

const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#c8102e', secondary: '#ffffff' };
const TRIMMED: ShirtDesign = { ...STRIPES, trim: '#111111' };
const NAVY: ShirtDesign = { pattern: 'plain', primary: '#0b1f4d' };

describe('describeShirt (→WEB-87 accessible names)', () => {
  it('names the pattern and only the colours the shirt shows', () => {
    expect(describeShirt(TRIMMED)).toBe(
      '세로 줄무늬, 주색 #c8102e, 보조색 #ffffff, 테두리 #111111',
    );
    expect(describeShirt({ ...NAVY, secondary: '#ffffff' })).toBe('단색, 주색 #0b1f4d');
  });
});
