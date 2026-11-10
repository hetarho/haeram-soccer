import { afterEach, describe, expect, it } from 'vitest';
import { SQUAD_SPREAD } from '../../packages/engine/src/world';
import { isSquadSpread, squadSpreadSetting } from './squad-spread-setting';

const released = SQUAD_SPREAD.inForce;
afterEach(() => {
  SQUAD_SPREAD.inForce = released;
});

describe('squadSpreadSetting (T808)', () => {
  it('keeps the released default without the flag and repeats nothing to a worker', () => {
    expect(squadSpreadSetting(['--seeds', 'a'])).toEqual([]);
    expect(SQUAD_SPREAD.inForce).toBe(released);
  });

  it('sets the named spread and hands a worker the same flag', () => {
    expect(squadSpreadSetting(['--setting', 'spread', '--out', 'x.json'])).toEqual([
      '--setting',
      'spread',
    ]);
    expect(SQUAD_SPREAD.inForce).toBe('spread');
    expect(squadSpreadSetting(['--setting', 'flat'])).toEqual(['--setting', 'flat']);
    expect(SQUAD_SPREAD.inForce).toBe('flat');
  });

  it('refuses a value that names no spread', () => {
    expect(() => squadSpreadSetting(['--setting', 'wide'])).toThrow(/flat or spread/);
    expect(() => squadSpreadSetting(['--setting'])).toThrow(/flat or spread/);
    expect(SQUAD_SPREAD.inForce).toBe(released);
    expect(isSquadSpread('spread')).toBe(true);
    expect(isSquadSpread('kept')).toBe(false);
  });
});
