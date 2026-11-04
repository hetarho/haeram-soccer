import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { ShirtDesign, ShirtPattern } from '../../../../packages/contracts/src/identity';

/**
 * KIT-5, WEB-87: the shirt patterns' Korean names and a shirt's spoken description. Shirts are
 * painted with the figures (`figurePainting.ts`) from the shared geometry in `kit-patterns.ts`.
 */

/** The Korean names of the shirt patterns, in `SHIRT_PATTERNS` order. */
export const SHIRT_PATTERN_LABELS: Readonly<Record<ShirtPattern, string>> = {
  plain: sourceMessage('copy.kitPainting.91d86bbd6e'),
  stripes: sourceMessage('copy.kitPainting.5a18f52f7f'),
  hoops: sourceMessage('copy.kitPainting.42ba72e552'),
  halves: sourceMessage('copy.kitPainting.d22402f5b9'),
  band: sourceMessage('copy.kitPainting.378617f830'),
  sash: sourceMessage('copy.kitPainting.7e821e0c57'),
  checks: sourceMessage('copy.kitPainting.3b1b15fe6e'),
  chevron: sourceMessage('copy.kitPainting.2da3cc4583'),
  pinstripes: sourceMessage('copy.kitPainting.961a829bc1'),
  quarters: sourceMessage('copy.kitPainting.5c59468caa'),
  centre: sourceMessage('copy.kitPainting.6f706c2f9e'),
  panels: sourceMessage('copy.kitPainting.0a581109ad'),
  yoke: sourceMessage('copy.kitPainting.55377d3b92'),
  diagonal: sourceMessage('copy.kitPainting.1988a42286'),
};

/** A spoken description of a shirt for an accessible name: pattern, then each colour it shows. */
export function describeShirt(shirt: ShirtDesign): string {
  const parts = [
    SHIRT_PATTERN_LABELS[shirt.pattern],
    sourceMessage('copy.kitPainting.21ef1d02e0', { p0: shirt.primary }),
  ];
  if (shirt.pattern !== 'plain' && shirt.secondary !== undefined)
    parts.push(sourceMessage('copy.kitPainting.e61d9e44d9', { p0: shirt.secondary }));
  if (shirt.trim !== undefined)
    parts.push(sourceMessage('copy.kitPainting.37cf1ad78f', { p0: shirt.trim }));
  return parts.join(', ');
}
