import { describe, expect, it } from 'vitest';
import { isSquadSpread, squadSpreadSetting } from './squad-spread-setting';

describe('squadSpreadSetting (T808)', () => {
  it('keeps the released default without the flag and repeats nothing to a worker', () => {
    expect(squadSpreadSetting(['--seeds', 'a'])).toEqual([]);
  });

  it('accepts the spread label and hands a worker the same flag', () => {
    expect(squadSpreadSetting(['--setting', 'spread', '--out', 'x.json'])).toEqual([
      '--setting',
      'spread',
    ]);
    expect(() => squadSpreadSetting(['--setting', 'flat'])).toThrow(/spread/);
  });

  it('refuses a value that names no spread', () => {
    expect(() => squadSpreadSetting(['--setting', 'wide'])).toThrow(/spread/);
    expect(() => squadSpreadSetting(['--setting'])).toThrow(/spread/);
    expect(isSquadSpread('spread')).toBe(true);
    expect(isSquadSpread('kept')).toBe(false);
  });
});
