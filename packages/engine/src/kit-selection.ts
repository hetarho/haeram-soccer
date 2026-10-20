import {
  CREST_PALETTE,
  KIT_ROLES,
  KIT_WARNINGS,
  type ClubIdentity,
  type KitRole,
  type KitWarning,
  type ShirtDesign,
} from '../../contracts/src/identity';
import { colourDistance, contrast } from './identity-legacy';
import { insideShirtMarker, shirtColourAt } from './kit-patterns';

/**
 * KIT-6/7/8: the shirts both sides wear and the goalkeepers' colours, chosen only from the saved
 * designs (docs/CLUB-IDENTITY-CONTRACT.md §4). Pure and deterministic: no world, time, revision,
 * randomness or object insertion order takes part, and no saved design is repainted.
 */
export interface KitSelection {
  /** Home side's role, then the away side's. */
  roles: [KitRole, KitRole];
  /** Copies of the selected saved designs, literal colours kept. */
  shirts: [ShirtDesign, ShirtDesign];
  goalkeepers: [string, string];
  warnings: KitWarning[];
}

/** The grass the pitch is drawn on; shirts must stand out from it. */
export const GRASS = '#1c543e';
/** Below this separation the two outfield shirts clash (`teams`). */
export const TEAM_SEPARATION_MIN = 150;
/** Below this weighted contrast a shirt disappears into the grass (`grass`). */
export const GRASS_CONTRAST_MIN = 1.5;
/** Below this distance a goalkeeper cannot be told apart (`goalkeepers`). */
export const KEEPER_DISTANCE_MIN = 150;
/** Samples per axis: cell centres of a 16×16 grid over the shirt's box, kept inside the marker. */
const SAMPLES = 16;
const SAMPLE_POINTS: readonly (readonly [number, number])[] = Array.from(
  { length: SAMPLES * SAMPLES },
  (_, n) => [((n % SAMPLES) + 0.5) / SAMPLES, (Math.floor(n / SAMPLES) + 0.5) / SAMPLES] as const,
).filter(([x, y]) => insideShirtMarker(x, y));
/** Keeper candidates: the crest palette, then the 6-level RGB cube, without repeats. */
const CUBE = [0, 51, 102, 153, 204, 255].map((v) => v.toString(16).padStart(2, '0'));
const KEEPER_CANDIDATES: readonly string[] = [
  ...new Set<string>([
    ...CREST_PALETTE,
    ...CUBE.flatMap((r) => CUBE.flatMap((g) => CUBE.map((b) => `#${r}${g}${b}`))),
  ]),
];

/** A visible colour (lower-case key) and the share of the marker it covers. */
interface Visible {
  colour: string;
  weight: number;
}
const VISIBLE_CACHE_SIZE = 256;
const visibleCache = new Map<string, readonly Visible[]>();
/** The colours a shirt shows on the 16×16 marker sample, cached by its normalized design. */
function visibleColours(shirt: ShirtDesign): readonly Visible[] {
  const key = [shirt.pattern, shirt.primary, shirt.secondary, shirt.trim]
    .map((part) => part?.toLowerCase() ?? '')
    .join('|');
  const cached = visibleCache.get(key);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const [x, y] of SAMPLE_POINTS) {
    const colour = shirtColourAt(shirt, x, y).toLowerCase();
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  const visible = [...counts].map(([colour, count]) => ({
    colour,
    weight: count / SAMPLE_POINTS.length,
  }));
  if (visibleCache.size >= VISIBLE_CACHE_SIZE)
    visibleCache.delete(visibleCache.keys().next().value!);
  visibleCache.set(key, visible);
  return visible;
}
/** How far, on average over its visible area, shirt `a` is from the nearest colour of `b`. */
function nearest(a: readonly Visible[], b: readonly Visible[]) {
  return a.reduce(
    (sum, { colour, weight }) =>
      sum + weight * Math.min(...b.map((other) => colourDistance(colour, other.colour))),
    0,
  );
}
const grassContrast = (shirt: readonly Visible[]) =>
  shirt.reduce((sum, { colour, weight }) => sum + weight * contrast(colour, GRASS), 0);

interface Pairing {
  roles: [KitRole, KitRole];
  separation: number;
  grass: [number, number];
  warned: boolean;
}
function pairing(home: ClubIdentity, away: ClubIdentity, roles: [KitRole, KitRole]): Pairing {
  const a = visibleColours(home.kits[roles[0]]),
    b = visibleColours(away.kits[roles[1]]);
  const separation = (nearest(a, b) + nearest(b, a)) / 2;
  const grass: [number, number] = [grassContrast(a), grassContrast(b)];
  return {
    roles,
    separation,
    grass,
    warned:
      separation < TEAM_SEPARATION_MIN ||
      grass[0] < GRASS_CONTRAST_MIN ||
      grass[1] < GRASS_CONTRAST_MIN,
  };
}
/** No warning first, then greater separation, then greater minimum grass contrast. */
function better(a: Pairing, b: Pairing) {
  if (a.warned !== b.warned) return !a.warned;
  if (a.separation !== b.separation) return a.separation > b.separation;
  return Math.min(...a.grass) > Math.min(...b.grass);
}
/** The candidate farthest from every colour to avoid; the earliest wins an exact tie. */
function keeper(avoid: readonly string[]) {
  let best = KEEPER_CANDIDATES[0]!,
    distance = -1;
  for (const candidate of KEEPER_CANDIDATES) {
    const nearestAvoided = Math.min(...avoid.map((colour) => colourDistance(candidate, colour)));
    if (nearestAvoided > distance) [best, distance] = [candidate, nearestAvoided];
  }
  return { colour: best, distance };
}

/**
 * The clearest pairing of the two sides' saved shirts (KIT-7) and automatic goalkeeper colours
 * (KIT-8). Pairs are ranked by no warning, separation, minimum grass contrast, then home/away/third
 * order for the home side and then the away side. `forced` fixes one side's role (an owner's fixture
 * choice, KIT-6); the other side still takes its best saved shirt. A forced clash is kept and only
 * warned about; the unforced call is the automatic recommendation.
 */
export function selectMatchKits(
  home: ClubIdentity,
  away: ClubIdentity,
  forced?: { side: 0 | 1; role: KitRole },
): KitSelection {
  let best: Pairing | undefined;
  for (const homeRole of KIT_ROLES)
    for (const awayRole of KIT_ROLES) {
      const roles: [KitRole, KitRole] = [homeRole, awayRole];
      if (forced && roles[forced.side] !== forced.role) continue;
      const candidate = pairing(home, away, roles);
      if (!best || better(candidate, best)) best = candidate;
    }
  const { roles, separation, grass } = best!;
  const shirts: [ShirtDesign, ShirtDesign] = [
    { ...home.kits[roles[0]] },
    { ...away.kits[roles[1]] },
  ];
  // Keepers avoid every colour either outfield shirt shows, the grass and the earlier keeper.
  const outfield = shirts.flatMap((shirt) => visibleColours(shirt).map(({ colour }) => colour));
  const first = keeper([...outfield, GRASS]);
  const second = keeper([...outfield, GRASS, first.colour]);
  const raised = new Set<KitWarning>();
  if (separation < TEAM_SEPARATION_MIN) raised.add('teams');
  if (grass.some((value) => value < GRASS_CONTRAST_MIN)) raised.add('grass');
  if (Math.min(first.distance, second.distance) < KEEPER_DISTANCE_MIN) raised.add('goalkeepers');
  return {
    roles: [...roles],
    shirts,
    goalkeepers: [first.colour, second.colour],
    warnings: KIT_WARNINGS.filter((warning) => raised.has(warning)),
  };
}
