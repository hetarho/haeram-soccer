/**
 * KIT-1–5, KIT-12: club identity vocabulary — representative colours, crest parts, three saved shirts,
 * a fixture's shirt choice and the appearance frozen on a played own match. Types and constants only:
 * no React, DOM, engine imports or random draws (spec/ssot/KIT.md).
 */

/** The 24 crest colours of WEB-49, in their original order. */
export const CREST_PALETTE = [
  '#d62828', // red
  '#7f0d16', // maroon
  '#f77f00', // orange
  '#fcbf49', // gold
  '#f5e663', // yellow
  '#9ccc3d', // lime
  '#2b9348', // green
  '#12493a', // forest
  '#4fd1a5', // mint
  '#00a6c8', // cyan
  '#8ecae6', // sky
  '#1f4fd1', // royal
  '#0b1f44', // navy
  '#6a5acd', // violet
  '#6a0dad', // purple
  '#c9184a', // raspberry
  '#ff8fab', // pink
  '#6f4518', // brown
  '#c8a27a', // tan
  '#ffffff', // white
  '#121212', // black
  '#a7b0ba', // silver
  '#f3e3c3', // cream
  '#455a64', // slate
] as const;
export const CREST_SHAPES = ['shield', 'round', 'french', 'badge', 'diamond', 'crown'] as const;
export const CREST_PATTERNS = [
  'plain',
  'stripes',
  'hoops',
  'halves',
  'quarters',
  'sash',
  'chevron',
  'cross',
  'band',
  'checks',
] as const;
export const CREST_EMBLEMS = [
  'star',
  'ball',
  'crown',
  'moon',
  'sun',
  'bolt',
  'flame',
  'anchor',
  'tower',
  'tree',
  'mountain',
  'wave',
  'key',
  'heart',
  'gem',
  'arrow',
  'bird',
  'wheel',
  'clover',
  'horseshoe',
] as const;
/** KIT-5: the eight shirt patterns — a vocabulary of their own, not the crest field patterns. */
export const SHIRT_PATTERNS = [
  'plain',
  'stripes',
  'hoops',
  'halves',
  'band',
  'sash',
  'checks',
  'chevron',
] as const;
export const KIT_ROLES = ['home', 'away', 'third'] as const;
export const KIT_WARNINGS = ['teams', 'grass', 'goalkeepers'] as const;

export type CrestShape = (typeof CREST_SHAPES)[number];
export type CrestPattern = (typeof CREST_PATTERNS)[number];
export type CrestEmblem = (typeof CREST_EMBLEMS)[number];
export type ShirtPattern = (typeof SHIRT_PATTERNS)[number];
export type KitRole = (typeof KIT_ROLES)[number];
export type KitWarning = (typeof KIT_WARNINGS)[number];

/** One to three representative colours, each `#RRGGBB` in its stored spelling. */
export type IdentityColours = [string] | [string, string] | [string, string, string];

/** Missing secondary is negative space; the emblem uses accent, else secondary, else negative space. */
export interface CrestDesign {
  shape: CrestShape;
  pattern: CrestPattern;
  emblem: CrestEmblem;
  primary: string;
  secondary?: string;
  accent?: string;
}
/** `plain` omits secondary; every other pattern requires it. Trim is independent. */
export interface ShirtDesign {
  pattern: ShirtPattern;
  primary: string;
  secondary?: string;
  trim?: string;
}
export interface ClubIdentity {
  version: 1;
  colours: IdentityColours;
  crest: CrestDesign;
  kits: Record<KitRole, ShirtDesign>;
}
/** KIT-7: the owner's shirt for exactly one named unplayed own fixture. */
export interface FixtureKitChoice {
  fixtureId: string;
  role: KitRole;
}
export interface AppearanceSide {
  club: string;
  crest: CrestDesign;
  role: KitRole;
  shirt: ShirtDesign;
  goalkeeper: string;
}
/** KIT-12: what both sides actually wore, frozen when the own match settled. */
export interface MatchAppearance {
  version: 1;
  /** Home, then away. */
  sides: [AppearanceSide, AppearanceSide];
  warnings: KitWarning[];
}

/** KIT-2: the six ready-made crest compositions, in order. */
export const CREST_PRESETS: readonly Pick<CrestDesign, 'shape' | 'pattern' | 'emblem'>[] = [
  { shape: 'shield', pattern: 'stripes', emblem: 'star' },
  { shape: 'round', pattern: 'plain', emblem: 'ball' },
  { shape: 'french', pattern: 'sash', emblem: 'crown' },
  { shape: 'badge', pattern: 'halves', emblem: 'anchor' },
  { shape: 'diamond', pattern: 'chevron', emblem: 'bolt' },
  { shape: 'crown', pattern: 'band', emblem: 'tree' },
];
