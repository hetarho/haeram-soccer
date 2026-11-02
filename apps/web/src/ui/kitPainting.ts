import type { ShirtDesign, ShirtPattern } from '../../../../packages/contracts/src/identity';

/**
 * KIT-5, WEB-87: the shirt patterns' Korean names and a shirt's spoken description. Shirts are
 * painted with the figures (`figurePainting.ts`) from the shared geometry in `kit-patterns.ts`.
 */

/** The Korean names of the shirt patterns, in `SHIRT_PATTERNS` order. */
export const SHIRT_PATTERN_LABELS: Readonly<Record<ShirtPattern, string>> = {
  plain: '단색',
  stripes: '세로 줄무늬',
  hoops: '가로 줄무늬',
  halves: '좌우 반반',
  band: '가슴 띠',
  sash: '대각선 띠',
  checks: '체크',
  chevron: '갈매기 무늬',
  pinstripes: '가는 세로줄',
  quarters: '4분할',
  centre: '가운데 줄',
  panels: '옆구리 배색',
  yoke: '어깨 배색',
  diagonal: '대각선 반반',
};

/** A spoken description of a shirt for an accessible name: pattern, then each colour it shows. */
export function describeShirt(shirt: ShirtDesign): string {
  const parts = [SHIRT_PATTERN_LABELS[shirt.pattern], `주색 ${shirt.primary}`];
  if (shirt.pattern !== 'plain' && shirt.secondary !== undefined)
    parts.push(`보조색 ${shirt.secondary}`);
  if (shirt.trim !== undefined) parts.push(`테두리 ${shirt.trim}`);
  return parts.join(', ');
}
