import { describe, expect, it } from 'vitest';
import type { AppearanceSide, CrestDesign } from '../../../../packages/contracts/src/identity';
import { contrast } from './crests';
import { matchLook, UNRECORDED_LOOK } from './matchAppearance';
import { scoreboardHalves } from './scoreboardHalves';

const CREST: CrestDesign = {
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
  primary: '#123456',
};
const side = (club: string, primary: string, secondary?: string): AppearanceSide => ({
  club,
  crest: CREST,
  role: 'home',
  shirt: secondary ? { pattern: 'stripes', primary, secondary } : { pattern: 'plain', primary },
  goalkeeper: '#f5e663',
});
const recorded = (home: AppearanceSide, away: AppearanceSide) =>
  matchLook({
    home: home.club,
    away: away.club,
    appearance: { version: 1, sides: [home, away], warnings: [] },
  });

describe('scoreboardHalves (→WEB-50, WEB-49)', () => {
  it('fills each half with the shirt base colour that side wore', () => {
    const look = recorded(side('h', '#c8102e', '#ffffff'), side('a', '#f4f1e6', '#0b1f44'));
    const [home, away] = scoreboardHalves(look);
    // The shirt's base colour, never its stripe colour or the crest's.
    expect(home.background).toBe('#c8102e');
    expect(away.background).toBe('#f4f1e6');
    expect(home.background).not.toBe(away.background);
  });

  it('uses the unrecorded stand-ins when the match recorded no kits', () => {
    const halves = scoreboardHalves(matchLook({ home: 'h', away: 'a' }));
    expect(halves.map((half) => half.background)).toEqual(
      UNRECORDED_LOOK.sides.map((s) => s.kit.shirt.primary),
    );
    expect(halves[0].background).not.toBe(halves[1].background);
  });

  it('writes in readable ink on a light and a dark shirt', () => {
    const [light, dark] = scoreboardHalves(recorded(side('h', '#f4f1e6'), side('a', '#0b1f44')));
    expect(light.ink).toBe('#121212');
    expect(dark.ink).toBe('#ffffff');
    // A mid grey, where neither of `inkOn`'s inks reaches 4.5:1, still reads.
    const [mid] = scoreboardHalves(recorded(side('h', '#7a7a7a'), side('a', '#0b1f44')));
    expect(Math.max(contrast('#7a7a7a', '#121212'), contrast('#7a7a7a', '#ffffff'))).toBeLessThan(
      4.5,
    );
    expect(mid.ink).toBe('#000000');
    for (const half of [light, dark, mid])
      expect(contrast(half.background, half.ink)).toBeGreaterThanOrEqual(4.5);
  });
});
