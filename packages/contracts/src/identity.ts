/**
 * KIT-1–5, KIT-8, KIT-12: club identity vocabulary — representative colours, crest parts, three saved
 * kits, the goalkeeper kit, a fixture's shirt choice and the appearance frozen on a played own match.
 * Types and constants only: no React, DOM, engine imports or random draws (spec/ssot/KIT.md).
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
/** KIT-5: the shirt patterns — a vocabulary of their own, not the crest field patterns. */
export const SHIRT_PATTERNS = [
  'plain',
  'stripes',
  'hoops',
  'halves',
  'band',
  'sash',
  'checks',
  'chevron',
  'pinstripes',
  'quarters',
  'centre',
  'panels',
  'yoke',
  'diagonal',
] as const;
/** The designers the owner can commission, cheapest first; a dearer one delivers more drafts. */
export const DESIGN_STUDIOS = ['local', 'studio', 'star'] as const;
export const KIT_ROLES = ['home', 'away', 'third'] as const;
export const KIT_WARNINGS = ['teams', 'grass', 'goalkeepers'] as const;

export type CrestShape = (typeof CREST_SHAPES)[number];
export type CrestPattern = (typeof CREST_PATTERNS)[number];
export type CrestEmblem = (typeof CREST_EMBLEMS)[number];
export type ShirtPattern = (typeof SHIRT_PATTERNS)[number];
export type KitRole = (typeof KIT_ROLES)[number];
export type KitWarning = (typeof KIT_WARNINGS)[number];
export type DesignStudio = (typeof DESIGN_STUDIOS)[number];

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
/** KIT-3: a kit part the owner set; an absent part follows the starting rule until set. */
export interface KitParts {
  shorts?: string;
  socks?: string;
}
/** KIT-8: the club's one designed goalkeeper kit — any shirt pattern, every colour free. */
export interface GoalkeeperKit {
  shirt: ShirtDesign;
  shorts: string;
  socks: string;
  gloves: string;
}
/** What an outfield figure wears, always complete. */
export interface WornKit {
  shirt: ShirtDesign;
  shorts: string;
  socks: string;
}
/** What a goalkeeper figure wears, always complete: the designed kit or an automatic one. */
export interface WornKeeper {
  shirt: ShirtDesign;
  shorts: string;
  socks: string;
  gloves: string;
}
/**
 * Version 2 exactly when `parts` sets at least one part or `goalkeeper` is present; otherwise
 * version 1 with neither field, so a save without them stays readable by older builds.
 */
export interface ClubIdentity {
  version: 1 | 2;
  colours: IdentityColours;
  crest: CrestDesign;
  kits: Record<KitRole, ShirtDesign>;
  parts?: Partial<Record<KitRole, KitParts>>;
  goalkeeper?: GoalkeeperKit;
}
/** The drafts a commissioned designer delivered in the owner's colours, until one is adopted. */
export interface DesignCommission {
  studio: DesignStudio;
  colours: IdentityColours;
  drafts: ClubIdentity[];
}
/** KIT-7: the owner's shirt for exactly one named unplayed own fixture. */
export interface FixtureKitChoice {
  fixtureId: string;
  role: KitRole;
}
/**
 * One side as it took the field. `goalkeeper` is the keeper shirt's base colour. Version-2
 * appearances also carry the worn shorts, socks and keeper kit, and `keeperFallback` when the
 * side's designed keeper kit gave way to an automatic one in this match (KIT-8, KIT-12).
 */
export interface AppearanceSide {
  club: string;
  crest: CrestDesign;
  role: KitRole;
  shirt: ShirtDesign;
  goalkeeper: string;
  shorts?: string;
  socks?: string;
  keeper?: WornKeeper;
  keeperFallback?: true;
}
/**
 * KIT-12: what both sides actually wore, frozen when the own match settled. Version 2 exactly when
 * the sides carry `shorts`, `socks` and `keeper`.
 */
export interface MatchAppearance {
  version: 1 | 2;
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
