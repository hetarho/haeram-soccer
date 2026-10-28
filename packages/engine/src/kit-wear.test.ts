import { describe, expect, it } from 'vitest';
import type { ClubIdentity, GoalkeeperKit, ShirtDesign } from '../../contracts/src/identity';
import {
  automaticKeeper,
  contrastInk,
  designedKeeper,
  startingShorts,
  startingSocks,
  wornKeeper,
  wornKit,
} from './kit-wear';

const RED = '#d62828',
  WHITE = '#FfFfFf',
  NAVY = '#0b1f44',
  GOLD = '#fcbf49';
const KEEPER: GoalkeeperKit = {
  shirt: { pattern: 'hoops', primary: '#9ccc3d', secondary: '#121212', trim: '#FFFFFF' },
  shorts: '#121212',
  socks: '#9ccc3d',
  gloves: '#F77F00',
};
/** Home red stripes, away plain white with navy trim, third plain gold: no parts or keeper set. */
const identity = (): ClubIdentity => ({
  version: 1,
  colours: [RED, WHITE, GOLD],
  crest: { shape: 'shield', pattern: 'plain', emblem: 'star', primary: RED },
  kits: {
    home: { pattern: 'stripes', primary: RED, secondary: WHITE, trim: NAVY },
    away: { pattern: 'plain', primary: WHITE, trim: NAVY },
    third: { pattern: 'plain', primary: GOLD },
  },
});

describe('worn kits (→KIT-3, KIT-12)', () => {
  it('starting shorts follow second colour, then trim, then contrast ink', () => {
    const cases: [ShirtDesign, string][] = [
      // The second colour wins over trim on a patterned shirt.
      [{ pattern: 'stripes', primary: RED, secondary: WHITE, trim: NAVY }, WHITE],
      [{ pattern: 'sash', primary: NAVY, secondary: GOLD }, GOLD],
      // A plain shirt carries its linked second colour as trim.
      [{ pattern: 'plain', primary: WHITE, trim: NAVY }, NAVY],
      // Neither: ink that reads on the base colour.
      [{ pattern: 'plain', primary: GOLD }, '#111111'],
      [{ pattern: 'plain', primary: '#FFFFFF' }, '#111111'],
      [{ pattern: 'plain', primary: NAVY }, '#ffffff'],
      [{ pattern: 'plain', primary: RED }, '#ffffff'],
    ];
    for (const [shirt, shorts] of cases) {
      expect(startingShorts(shirt), JSON.stringify(shirt)).toBe(shorts);
      expect(startingSocks(shirt)).toBe(shirt.primary);
    }
    expect(wornKit(identity(), 'home')).toEqual({
      shirt: identity().kits.home,
      shorts: WHITE,
      socks: RED,
    });
    expect(wornKit(identity(), 'third')).toEqual({
      shirt: identity().kits.third,
      shorts: '#111111',
      socks: GOLD,
    });
  });

  it('set parts win over the starting rule', () => {
    const own: ClubIdentity = {
      ...identity(),
      version: 2,
      parts: { home: { shorts: '#00A6C8' }, third: { socks: '#6A0DAD' } },
    };
    // Each part the owner set is kept; the other follows the starting rule.
    expect(wornKit(own, 'home')).toEqual({ shirt: own.kits.home, shorts: '#00A6C8', socks: RED });
    expect(wornKit(own, 'away')).toEqual({ shirt: own.kits.away, shorts: NAVY, socks: WHITE });
    expect(wornKit(own, 'third')).toEqual({
      shirt: own.kits.third,
      shorts: '#111111',
      socks: '#6A0DAD',
    });
    // An unset part follows a later colour edit; a set part keeps its colour.
    own.kits.home = { pattern: 'stripes', primary: '#2b9348', secondary: '#f3e3c3' };
    expect(wornKit(own, 'home')).toEqual({
      shirt: own.kits.home,
      shorts: '#00A6C8',
      socks: '#2b9348',
    });
    // A fresh copy: changing it leaves the saved design alone.
    const worn = wornKit(own, 'home');
    expect(worn.shirt).not.toBe(own.kits.home);
    worn.shirt.primary = '#000000';
    expect(own.kits.home.primary).toBe('#2b9348');
  });

  it('automatic keeper kit is plain with contrasting gloves', () => {
    expect(automaticKeeper('#f5e663')).toEqual({
      shirt: { pattern: 'plain', primary: '#f5e663' },
      shorts: '#f5e663',
      socks: '#f5e663',
      gloves: '#111111',
    });
    expect(automaticKeeper('#6a0dad').gloves).toBe('#ffffff');
    expect(contrastInk('#ffffff')).toBe('#111111');
    expect(contrastInk('#000000')).toBe('#ffffff');
    // Every club without a designed kit, opponents included, has none to keep (KIT-8, KIT-11).
    expect(designedKeeper(identity())).toBeUndefined();
    const own: ClubIdentity = { ...identity(), version: 2, goalkeeper: structuredClone(KEEPER) };
    const designed = designedKeeper(own)!;
    expect(designed).toEqual(KEEPER);
    expect(designed).not.toBe(own.goalkeeper);
    expect(designed.shirt).not.toBe(own.goalkeeper!.shirt);
    // Worn: the designed kit when there is one, else the automatic kit in the given colour.
    expect(wornKeeper(own, '#f5e663')).toEqual(KEEPER);
    expect(wornKeeper(identity(), '#f5e663')).toEqual(automaticKeeper('#f5e663'));
  });
});
