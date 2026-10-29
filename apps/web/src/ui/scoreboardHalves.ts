/**
 * WEB-50, WEB-49: the scoreboard's two halves, home on the left and away on the right, each filled
 * with the shirt base colour that side wore in this match and its text in ink chosen for contrast
 * on it. Pure: the colours come from the match's resolved look only, so an unrecorded match shows
 * its stand-in shirts and nothing current repaints a played match (KIT-12).
 */
import { contrast, inkOn } from './crests';
import type { MatchLook } from './matchAppearance';

export interface ScoreboardHalf {
  /** The side's shirt base colour. */
  background: string;
  /** Text on it: dark on light shirts, white on dark ones. */
  ink: string;
}

/** Home half, then away half. */
export function scoreboardHalves(
  look: Pick<MatchLook, 'sides'>,
): readonly [ScoreboardHalf, ScoreboardHalf] {
  const half = (side: 0 | 1): ScoreboardHalf => {
    const background = look.sides[side].kit.shirt.primary;
    const ink = inkOn(background);
    // A mid-tone shirt leaves `inkOn`'s pair just short of 4.5:1; pure black always reaches it there.
    return { background, ink: contrast(background, ink) >= 4.5 ? ink : '#000000' };
  };
  return [half(0), half(1)];
}
