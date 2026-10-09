import type { Club, World } from '../../../../packages/contracts/src/types';
import { hash } from '../../../../packages/engine/src/primitives';

/** WEB-49: every club wears a crest built from a shape, a field pattern, two colours and an emblem. */
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
export type CrestShape = (typeof CREST_SHAPES)[number];
export type CrestPattern = (typeof CREST_PATTERNS)[number];
export type CrestEmblem = (typeof CREST_EMBLEMS)[number];
export interface Crest {
  primary: string;
  secondary: string;
  shape: CrestShape;
  pattern: CrestPattern;
  emblem: CrestEmblem;
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Text drawn on `fill`: dark ink on light colours, white on dark ones. */
export function inkOn(fill: string) {
  return contrast(fill, '#121212') >= contrast(fill, '#ffffff') ? '#121212' : '#ffffff';
}
function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
/** Perceptual-enough distance for kit clashes. */
export function colourDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a),
    [r2, g2, b2] = rgb(b);
  const mean = (r1 + r2) / 2;
  return Math.sqrt(
    (2 + mean / 256) * (r1 - r2) ** 2 +
      4 * (g1 - g2) ** 2 +
      (2 + (255 - mean) / 256) * (b1 - b2) ** 2,
  );
}
function nearestPaletteIndex(hex: string) {
  let best = 0;
  for (let i = 1; i < CREST_PALETTE.length; i++)
    if (colourDistance(hex, CREST_PALETTE[i]) < colourDistance(hex, CREST_PALETTE[best])) best = i;
  return best;
}

/** Ordered colour pairs whose pattern stays readable: the secondary must stand out. */
export const CREST_PAIRS: readonly (readonly [number, number])[] = CREST_PALETTE.flatMap(
  (primary, p) =>
    CREST_PALETTE.flatMap((secondary, s) =>
      p !== s && contrast(primary, secondary) >= 1.8 ? [[p, s] as const] : [],
    ),
);
/** Distinct-looking field designs: one colour pair with one pattern. */
export const CREST_FIELDS = CREST_PAIRS.length * CREST_PATTERNS.length;
export const CREST_COMBINATIONS = CREST_FIELDS * CREST_SHAPES.length * CREST_EMBLEMS.length;

const cache = new WeakMap<
  Club[],
  { seed: string; player: string; colour: string; map: Map<string, Crest> }
>();

/**
 * Assign every club a crest from the world seed and its stable ID. Clubs are visited in ID order
 * and probe past field designs already taken, so no two clubs share colours and pattern while the
 * world holds fewer clubs than field designs. Clubs added later (European entrants) sort after
 * the domestic IDs and never move an earlier assignment.
 */
export function crestMap(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>) {
  const own = w.clubs.find((club) => club.id === w.playerClub);
  const cached = cache.get(w.clubs);
  if (
    cached &&
    cached.seed === w.seed &&
    cached.player === w.playerClub &&
    cached.colour === own?.color
  )
    return cached.map;
  const map = new Map<string, Crest>();
  const taken = new Set<number>();
  const ids = w.clubs.map((club) => club.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // The player club claims its founding colour first, so nobody else wears the same look.
  const order = own ? [own.id, ...ids.filter((id) => id !== own.id)] : ids;
  const ownPrimary =
    own && /^#[0-9a-fA-F]{6}$/.test(own.color) ? nearestPaletteIndex(own.color) : -1;
  for (const id of order) {
    const h = hash(`${w.seed}:crest:${id}`),
      mixed = hash(`${id}:${h}`);
    let field = h % CREST_FIELDS;
    const isOwn = id === own?.id && ownPrimary >= 0;
    if (isOwn) {
      // Keep the founding colour as primary; pick a readable secondary and a free pattern.
      const pairs = CREST_PAIRS.filter(([p]) => p === ownPrimary);
      const pair = CREST_PAIRS.indexOf(pairs[h % pairs.length]);
      field = pair * CREST_PATTERNS.length + (mixed % CREST_PATTERNS.length);
    } else if (taken.size < CREST_FIELDS) {
      // An odd stride visits every field before repeating.
      const stride = 2 * (mixed % 997) + 1;
      while (taken.has(field)) field = (field + stride) % CREST_FIELDS;
    }
    taken.add(field);
    const [p, s] = CREST_PAIRS[Math.floor(field / CREST_PATTERNS.length)];
    map.set(id, {
      primary: isOwn ? own!.color : CREST_PALETTE[p],
      secondary: CREST_PALETTE[s],
      pattern: CREST_PATTERNS[field % CREST_PATTERNS.length],
      shape: CREST_SHAPES[(mixed >>> 4) % CREST_SHAPES.length],
      emblem: CREST_EMBLEMS[(mixed >>> 12) % CREST_EMBLEMS.length],
    });
  }
  cache.set(w.clubs, {
    seed: w.seed,
    player: w.playerClub,
    colour: own?.color || '',
    map,
  });
  return map;
}

const FALLBACK: Crest = {
  primary: '#455a64',
  secondary: '#f3e3c3',
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
};
export function crestOf(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, id: string | undefined) {
  return (id && crestMap(w).get(id)) || FALLBACK;
}

/** The grass the pitch canvas draws; shirts must stand out from it. */
const GRASS = '#1c543e';
const onGrass = (crest: Crest) =>
  contrast(crest.primary, GRASS) >= 1.5 ||
  contrast(crest.secondary, GRASS) < contrast(crest.primary, GRASS)
    ? crest.primary
    : crest.secondary;
/**
 * Shirt colours for both sides. A shirt that disappears into the grass switches to its secondary,
 * and the away side changes to its secondary when the two shirts clash.
 */
export function kits(home: Crest, away: Crest): [string, string] {
  const homeKit = onGrass(home);
  const awayKit = onGrass(away);
  const clash = colourDistance(homeKit, awayKit) < 150;
  return [homeKit, clash ? (awayKit === away.primary ? away.secondary : away.primary) : awayKit];
}
