import { message as sourceMessage } from '../../contracts/src/messages';
import type { ManagerStyle, SigningRequest, Tactic } from '../../contracts/src/types';
import {
  ATTRIBUTES,
  type Attribute,
  type Attributes,
  type Grade,
  type Line,
  type Personality,
  type PlayTrait,
  type Position,
  type PositionLevel,
  type Positions,
  type RoleId,
} from '../../contracts/src/player';
import { exp, log } from './portable-math';

/**
 * The player model (→PLAYER): attributes, positions and roles, OVR on one scale, traits,
 * adaptation and its multiplier, growth past potential, ageing, the schools' preferences and the
 * formations each tactic plays. Pure: no World, every draw from the caller's stream.
 */
export type Rng = () => number;

export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  finishing: sourceMessage('copy.summary.da1cc31972'),
  dribbling: sourceMessage('copy.materialView.1658226456'),
  crossing: sourceMessage('copy.summary.0796453f8e'),
  passing: sourceMessage('copy.summary.17242c9658'),
  vision: sourceMessage('copy.player.c30f56ae00'),
  tackling: sourceMessage('copy.Pitch.3f6ba38a9e'),
  positioning: sourceMessage('copy.player.3d0ff83ddb'),
  heading: sourceMessage('copy.materialView.fbdef67817'),
  pace: sourceMessage('copy.player.c03f7e871a'),
  stamina: sourceMessage('copy.player.57de68e569'),
  strength: sourceMessage('copy.player.8d4a33c55a'),
  reflexes: sourceMessage('copy.RecordsRoom.2a022bd612'),
  handling: sourceMessage('copy.player.f2cbbedfd4'),
  distribution: sourceMessage('copy.player.d6c50f6b3b'),
  decisions: sourceMessage('copy.player.c5b6345907'),
  composure: sourceMessage('copy.player.3151b149e3'),
};
export const ATTRIBUTE_GROUPS: readonly { label: string; attributes: readonly Attribute[] }[] = [
  {
    label: sourceMessage('position.family.FW'),
    attributes: ['finishing', 'dribbling', 'crossing'],
  },
  { label: sourceMessage('copy.summary.17242c9658'), attributes: ['passing', 'vision'] },
  {
    label: sourceMessage('position.family.DF'),
    attributes: ['tackling', 'positioning', 'heading'],
  },
  { label: sourceMessage('copy.player.f47a30d1c6'), attributes: ['pace', 'stamina', 'strength'] },
  { label: sourceMessage('copy.player.2c3d6b050d'), attributes: ['decisions', 'composure'] },
  { label: 'GK', attributes: ['reflexes', 'handling', 'distribution'] },
];
const GK_ATTRIBUTES: readonly Attribute[] = ['reflexes', 'handling', 'distribution'];

export const POSITION_LABEL: Record<Position, string> = {
  GK: sourceMessage('position.family.GK'),
  CB: sourceMessage('copy.player.e9008c0572'),
  LB: sourceMessage('copy.player.4849d4aa6b'),
  RB: sourceMessage('copy.player.5aef7cfedf'),
  LWB: sourceMessage('copy.player.f4e0096993'),
  RWB: sourceMessage('copy.player.ec604b81de'),
  DM: sourceMessage('copy.player.5893129f48'),
  CM: sourceMessage('copy.player.58a7cbb49b'),
  LM: sourceMessage('copy.player.62c1e57c96'),
  RM: sourceMessage('copy.player.ec62cc17ed'),
  AM: sourceMessage('copy.player.94170c7223'),
  LW: sourceMessage('copy.player.8c6d5f010d'),
  RW: sourceMessage('copy.player.4070546eea'),
  ST: sourceMessage('copy.player.988df2eb48'),
};
export const LINE_LABEL: Record<Line, string> = {
  GK: sourceMessage('position.family.GK'),
  DF: sourceMessage('position.family.DF'),
  MF: sourceMessage('position.family.MF'),
  FW: sourceMessage('position.family.FW'),
};
const LINE_OF: Record<Position, Line> = {
  GK: 'GK',
  CB: 'DF',
  LB: 'DF',
  RB: 'DF',
  LWB: 'DF',
  RWB: 'DF',
  DM: 'MF',
  CM: 'MF',
  LM: 'MF',
  RM: 'MF',
  AM: 'MF',
  LW: 'FW',
  RW: 'FW',
  ST: 'FW',
};
export const lineOf = (position: Position): Line => LINE_OF[position];
/** What a squad holds of each line at least: 18 players, the 단장's needs too (→CLUB-1, →CLUB-33). */
export const LINE_MINIMUM: Readonly<Record<Line, number>> = { GK: 2, DF: 6, MF: 6, FW: 4 };
const MIRROR: Partial<Record<Position, Position>> = {
  LB: 'RB',
  RB: 'LB',
  LWB: 'RWB',
  RWB: 'LWB',
  LM: 'RM',
  RM: 'LM',
  LW: 'RW',
  RW: 'LW',
};
export const mirrorOf = (position: Position): Position => MIRROR[position] ?? position;

/** Each position's attributes by tier (→PLAYER-6): primary ×3, secondary ×2, tertiary ×1. */
export const POSITION_WEIGHTS: Record<
  Position,
  { primary: readonly Attribute[]; secondary: readonly Attribute[]; tertiary: readonly Attribute[] }
> = (() => {
  const fullBack = {
    primary: ['tackling', 'pace'],
    secondary: ['positioning', 'stamina', 'crossing'],
    tertiary: ['passing', 'decisions'],
  } as const;
  const wingBack = {
    primary: ['pace', 'stamina', 'crossing'],
    secondary: ['tackling', 'dribbling'],
    tertiary: ['passing', 'decisions'],
  } as const;
  const wideMid = {
    primary: ['crossing', 'stamina'],
    secondary: ['passing', 'pace'],
    tertiary: ['dribbling', 'tackling', 'decisions'],
  } as const;
  const winger = {
    primary: ['dribbling', 'pace'],
    secondary: ['crossing', 'finishing'],
    tertiary: ['passing', 'composure'],
  } as const;
  return {
    GK: {
      primary: ['reflexes'],
      secondary: ['handling', 'positioning'],
      tertiary: ['distribution', 'decisions'],
    },
    CB: {
      primary: ['tackling', 'positioning', 'heading'],
      secondary: ['strength', 'decisions'],
      tertiary: ['pace', 'passing'],
    },
    LB: fullBack,
    RB: fullBack,
    LWB: wingBack,
    RWB: wingBack,
    DM: {
      primary: ['tackling', 'positioning'],
      secondary: ['passing', 'stamina', 'strength', 'decisions'],
      tertiary: ['vision'],
    },
    CM: {
      primary: ['passing', 'stamina'],
      secondary: ['vision', 'tackling', 'decisions'],
      tertiary: ['dribbling', 'finishing', 'composure'],
    },
    LM: wideMid,
    RM: wideMid,
    AM: {
      primary: ['vision', 'passing'],
      secondary: ['dribbling', 'finishing', 'decisions'],
      tertiary: ['positioning', 'composure'],
    },
    LW: winger,
    RW: winger,
    ST: {
      primary: ['finishing'],
      secondary: ['positioning', 'pace', 'strength', 'composure'],
      tertiary: ['dribbling', 'heading'],
    },
  };
})();

/** Roles (→PLAYER-5) with the positions they are played at and the attributes they move up a tier. */
export const ROLES: Record<
  RoleId,
  { label: string; positions: readonly Position[]; promotes: readonly Attribute[] }
> = {
  sweeperKeeper: {
    label: sourceMessage('copy.player.61296b8400'),
    positions: ['GK'],
    promotes: ['distribution', 'pace'],
  },
  shotStopper: { label: sourceMessage('copy.player.d8ff583c52'), positions: ['GK'], promotes: [] },
  stopper: {
    label: sourceMessage('copy.player.bc053f037e'),
    positions: ['CB'],
    promotes: ['strength'],
  },
  coverDefender: {
    label: sourceMessage('copy.player.3971ee0f37'),
    positions: ['CB'],
    promotes: ['pace'],
  },
  ballPlayingDefender: {
    label: sourceMessage('copy.player.6ca9bd69a9'),
    positions: ['CB'],
    promotes: ['passing', 'vision'],
  },
  defensiveFullBack: {
    label: sourceMessage('copy.player.4626b6f087'),
    positions: ['LB', 'RB'],
    promotes: ['positioning'],
  },
  overlappingFullBack: {
    label: sourceMessage('copy.player.731720f1a4'),
    positions: ['LB', 'RB'],
    promotes: ['crossing', 'stamina'],
  },
  invertedFullBack: {
    label: sourceMessage('copy.player.25a75e74ac'),
    positions: ['LB', 'RB'],
    promotes: ['passing', 'vision'],
  },
  defensiveWingBack: {
    label: sourceMessage('copy.player.795a2fb047'),
    positions: ['LWB', 'RWB'],
    promotes: ['tackling', 'positioning'],
  },
  attackingWingBack: {
    label: sourceMessage('copy.player.224cef748c'),
    positions: ['LWB', 'RWB'],
    promotes: ['dribbling'],
  },
  anchor: {
    label: sourceMessage('copy.player.02b8bf7d16'),
    positions: ['DM'],
    promotes: ['decisions'],
  },
  ballWinner: {
    label: sourceMessage('copy.player.ce6039f1ef'),
    positions: ['DM'],
    promotes: ['stamina', 'strength'],
  },
  regista: {
    label: sourceMessage('copy.player.f240df2616'),
    positions: ['DM'],
    promotes: ['passing', 'vision'],
  },
  boxToBox: {
    label: sourceMessage('copy.player.7359d90117'),
    positions: ['CM'],
    promotes: ['tackling', 'finishing'],
  },
  mezzala: {
    label: sourceMessage('copy.player.ce186b7043'),
    positions: ['CM'],
    promotes: ['dribbling', 'finishing'],
  },
  deepLyingPlaymaker: {
    label: sourceMessage('copy.player.2b581d11c3'),
    positions: ['CM'],
    promotes: ['vision', 'decisions'],
  },
  wideMidfielder: {
    label: sourceMessage('copy.player.d3febcdd7c'),
    positions: ['LM', 'RM'],
    promotes: ['tackling'],
  },
  widePlaymaker: {
    label: sourceMessage('copy.player.e35316ae48'),
    positions: ['LM', 'RM'],
    promotes: ['passing', 'vision'],
  },
  attackingMidfielder: {
    label: sourceMessage('copy.player.94170c7223'),
    positions: ['AM'],
    promotes: ['finishing'],
  },
  shadowStriker: {
    label: sourceMessage('copy.player.a531a2a33b'),
    positions: ['AM'],
    promotes: ['finishing', 'positioning'],
  },
  trequartista: {
    label: sourceMessage('copy.player.7ec33c0d31'),
    positions: ['AM'],
    promotes: ['dribbling'],
  },
  traditionalWinger: {
    label: sourceMessage('copy.player.6d77992b94'),
    positions: ['LW', 'RW'],
    promotes: ['crossing'],
  },
  invertedWinger: {
    label: sourceMessage('copy.player.e4e43b6b3d'),
    positions: ['LW', 'RW'],
    promotes: ['finishing'],
  },
  targetMan: {
    label: sourceMessage('copy.player.78af7331ea'),
    positions: ['ST'],
    promotes: ['heading', 'strength'],
  },
  poacher: {
    label: sourceMessage('copy.player.cbab395aed'),
    positions: ['ST'],
    promotes: ['positioning', 'composure'],
  },
  falseNine: {
    label: sourceMessage('copy.player.23c2de0c15'),
    positions: ['ST'],
    promotes: ['passing', 'vision'],
  },
  completeForward: {
    label: sourceMessage('copy.player.e3b620a1b7'),
    positions: ['ST'],
    promotes: ['dribbling', 'heading'],
  },
};
export const ROLE_LABEL = Object.fromEntries(
  Object.entries(ROLES).map(([id, role]) => [id, role.label]),
) as Record<RoleId, string>;
const rolesByPosition = new Map<Position, RoleId[]>();
/** The roles of a position, in the table's order. */
export function rolesAt(position: Position): readonly RoleId[] {
  let roles = rolesByPosition.get(position);
  if (!roles) {
    roles = (Object.keys(ROLES) as RoleId[]).filter((id) => ROLES[id].positions.includes(position));
    rolesByPosition.set(position, roles);
  }
  return roles;
}

export type Weight = 0 | 1 | 2 | 3;
interface WeightEntry {
  record: Readonly<Record<Attribute, Weight>>;
  /** `record`'s weights in `ATTRIBUTES` order. */
  values: readonly Weight[];
  total: number;
}
/**
 * Each (position, role)'s weights, built once and found without building a key: OVR is read for
 * every slot of every match.
 */
const weightCache = new Map<Position, { base?: WeightEntry; roles: Map<RoleId, WeightEntry> }>();
function buildWeights(position: Position, role?: RoleId): WeightEntry {
  const tiers = POSITION_WEIGHTS[position];
  const weights = Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, Weight>;
  for (const a of tiers.tertiary) weights[a] = 1;
  for (const a of tiers.secondary) weights[a] = 2;
  for (const a of tiers.primary) weights[a] = 3;
  for (const a of role ? ROLES[role].promotes : [])
    weights[a] = Math.min(3, weights[a] + 1) as Weight;
  return {
    record: Object.freeze(weights),
    values: ATTRIBUTES.map((a) => weights[a]),
    total: ATTRIBUTES.reduce((sum, a) => sum + weights[a], 0),
  };
}
function weightEntry(position: Position, role?: RoleId): WeightEntry {
  let atPosition = weightCache.get(position);
  if (!atPosition) {
    atPosition = { roles: new Map() };
    weightCache.set(position, atPosition);
  }
  if (!role) return (atPosition.base ??= buildWeights(position));
  let entry = atPosition.roles.get(role);
  if (!entry) {
    entry = buildWeights(position, role);
    atPosition.roles.set(role, entry);
  }
  return entry;
}
/** Each attribute's weight at a position, after the role moves its attributes up a tier. */
export function weightsFor(position: Position, role?: RoleId): Readonly<Record<Attribute, Weight>> {
  return weightEntry(position, role).record;
}

/** OVR at a position in a role: the weighted average of its attributes, one 1–99 scale (→PLAYER-6). */
export function ovrAt(attrs: Attributes, position: Position, role?: RoleId) {
  const { values, total } = weightEntry(position, role);
  let sum = 0;
  for (let i = 0; i < ATTRIBUTES.length; i++) sum += values[i]! * attrs[ATTRIBUTES[i]!];
  return sum / total;
}
export function bestRoleAt(attrs: Attributes, position: Position): RoleId {
  const roles = rolesAt(position);
  let best = roles[0]!,
    value = -Infinity;
  for (const role of roles) {
    const ovr = ovrAt(attrs, position, role);
    if (ovr > value) {
      best = role;
      value = ovr;
    }
  }
  return best;
}
/** His OVR at his main position in his best role there: `bestRoleAt`'s pass, keeping the value. */
export const mainOvr = ({ attrs, position }: { attrs: Attributes; position: Position }) => {
  const roles = rolesAt(position);
  let value = -Infinity;
  for (const role of roles) {
    const ovr = ovrAt(attrs, position, role);
    if (ovr > value) value = ovr;
  }
  // No role above −Infinity: the first role's OVR, as `bestRoleAt` keeps the first role.
  return value > -Infinity ? value : ovrAt(attrs, position, roles[0]);
};

/** Share of his ability a player brings to a position (→PLAYER-4). */
export function levelFactor(positions: Positions, position: Position) {
  const level = positions[position];
  return level === 3 ? 1 : level === 2 ? 0.92 : level === 1 ? 0.8 : 0.6;
}
/** How fast he settles at the position he played (→PLAYER-12). */
export function gainLevelFactor(positions: Positions, position: Position) {
  const level = positions[position];
  return level === 3 ? 1 : level === 2 ? 0.8 : level === 1 ? 0.5 : 0.2;
}

const MULTIPLIER_POINTS: readonly (readonly [number, number])[] = [
  [0.3, 0.7],
  [0.4, 0.76],
  [0.6, 0.88],
  [0.8, 1],
  [0.9, 1.025],
  [1, 1.05],
];
/** The adaptation at which a player plays at exactly his ability: settled (→PLAYER-10). */
export const ADAPTATION_NEUTRAL = 0.8;
/** Adaptation 0.3–1.0 to a multiplier on his ability: gentle above 0.8, steep below (→PLAYER-10). */
export function adaptationMultiplier(adaptation: number) {
  const a = Math.min(1, Math.max(0.3, adaptation));
  for (let i = 1; i < MULTIPLIER_POINTS.length; i++) {
    const [x1, y1] = MULTIPLIER_POINTS[i]!,
      [x0, y0] = MULTIPLIER_POINTS[i - 1]!;
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1.05;
}

/** Personality rates by grade (index grade − 1, →PLAYER-7). */
export const PROFESSIONALISM_RATE = [0.7, 0.85, 1, 1.15, 1.3] as const;
export const ADAPTABILITY_RATE = [0.6, 0.8, 1, 1.2, 1.4] as const;
export const AMBITION_UNHAPPY = [0, 0, 0, 0.25, 0.5] as const;
export const GRADE_LABEL: Record<Grade, string> = {
  1: sourceMessage('copy.player.76fc73c3b5'),
  2: sourceMessage('copy.player.9f07b9bc5f'),
  3: sourceMessage('copy.teamState.666599febd'),
  4: sourceMessage('copy.player.5327dee9ab'),
  5: sourceMessage('copy.player.1f18248b8f'),
};
export const PERSONALITY_LABEL: Record<keyof Personality, string> = {
  professionalism: sourceMessage('copy.influences.f22434c1d6'),
  adaptability: sourceMessage('copy.influences.af26f66619'),
  ambition: sourceMessage('copy.influences.7589bac4d7'),
};
export const TRAIT_LABEL: Record<PlayTrait, string> = {
  workrate: sourceMessage('copy.player.008abc9b64'),
  technician: sourceMessage('copy.player.09253268dd'),
  playmaker: sourceMessage('copy.player.7711ccb546'),
  speedster: sourceMessage('copy.player.6dfcd273b3'),
  linebreaker: sourceMessage('copy.player.576efe94f9'),
  targetman: sourceMessage('copy.player.78af7331ea'),
  longshot: sourceMessage('copy.player.5d7924f9cb'),
  crosser: sourceMessage('copy.player.1385169412'),
  aerial: sourceMessage('copy.player.ca2b54b3c8'),
  tackler: sourceMessage('copy.player.230465be05'),
  buildup: sourceMessage('copy.player.70e49291a5'),
  leader: sourceMessage('copy.player.2ac8ab1ae3'),
};

export type Joined = 'founding' | 'academy' | 'domestic' | 'abroad';
/** Where adaptation starts (→PLAYER-11). */
export function adaptationStart(adaptability: Grade, joined: Joined) {
  if (joined === 'founding' || joined === 'academy') return 0.8;
  const domestic = [0.45, 0.5, 0.55, 0.6, 0.65][adaptability - 1]!;
  return joined === 'abroad' ? Math.round((domestic - 0.1) * 100) / 100 : domestic;
}
/** Base gains before his rate, his level there and the school factor (→PLAYER-12). */
export const MATCH_GAIN = { start: 0.02, sub: 0.008 } as const;
export const TRAINING_GAIN = { recovery: 0.002, balanced: 0.004, hard: 0.007 } as const;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
/**
 * Adaptation after a gain: the part above 0.80 counts half, training alone never lifts it past
 * 0.80 (→PLAYER-12).
 */
export function adaptationAfter(
  current: number,
  gain: number,
  options: { trainingOnly?: boolean } = {},
) {
  if (gain <= 0) return current;
  const below = Math.max(0, 0.8 - current);
  let next = gain <= below ? current + gain : Math.max(current, 0.8) + (gain - below) / 2;
  if (options.trainingOnly) next = Math.min(next, Math.max(current, 0.8));
  return round4(Math.min(1, next));
}
/** A new manager costs part of the distance to 0.50 (→PLAYER-13, →LEAGUE-12). */
export function managerChangeLoss(adaptation: number, sameSchool: boolean) {
  if (adaptation <= 0.5) return adaptation;
  return round4(adaptation - (adaptation - 0.5) * (sameSchool ? 0.1 : 0.3));
}

const OVERSHOOT: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0.25],
  [3, 0.1],
  [5, 0.05],
  [10, 0.02],
];
/** Growth past potential, a log-like curve that flattens sharply (→PLAYER-16). */
export function overshootFactor(excess: number) {
  if (excess <= 0) return 1;
  if (excess >= 10) return 0.02 * (10 / excess);
  for (let i = 1; i < OVERSHOOT.length; i++) {
    const [x1, y1] = OVERSHOOT[i]!,
      [x0, y0] = OVERSHOOT[i - 1]!;
    if (excess <= x1) return exp(log(y0) + ((excess - x0) / (x1 - x0)) * (log(y1) - log(y0)));
  }
  return 0.02;
}

/** Attributes age by group (→PLAYER-17). */
export const AGEING: Record<
  Attribute,
  { growUntil: number; declineFrom: number; perSeason: number }
> = (() => {
  const by = (growUntil: number, declineFrom: number, perSeason: number) => ({
    growUntil,
    declineFrom,
    perSeason,
  });
  return {
    pace: by(26, 29, 2),
    stamina: by(26, 29, 2),
    strength: by(27, 31, 1),
    heading: by(27, 31, 1),
    finishing: by(27, 31, 1.5),
    dribbling: by(27, 31, 1.5),
    crossing: by(27, 31, 1.5),
    passing: by(28, 32, 1),
    tackling: by(28, 32, 1),
    vision: by(32, 33, 0.5),
    positioning: by(32, 33, 0.5),
    reflexes: by(30, 33, 1),
    handling: by(30, 33, 1),
    distribution: by(30, 33, 1),
    decisions: by(32, 33, 0.5),
    composure: by(32, 33, 0.5),
  };
})();

/** What each school of football prefers (→STAFF-21). */
export const SCHOOL_PREFS: Record<
  ManagerStyle,
  { attributes: readonly Attribute[]; traits: readonly PlayTrait[] }
> = {
  positional: { attributes: ['passing', 'vision'], traits: ['playmaker', 'technician', 'buildup'] },
  gegenpress: { attributes: ['stamina', 'tackling'], traits: ['workrate', 'tackler'] },
  counter: { attributes: ['pace', 'positioning'], traits: ['speedster', 'linebreaker'] },
  organizer: { attributes: ['positioning', 'heading'], traits: ['aerial', 'tackler'] },
  motivator: { attributes: ['stamina', 'composure'], traits: ['leader', 'workrate'] },
  developer: { attributes: ['passing', 'dribbling'], traits: ['technician', 'playmaker'] },
  firefighter: { attributes: ['strength', 'tackling'], traits: ['leader', 'aerial'] },
  headcoach: { attributes: ['decisions', 'positioning'], traits: ['linebreaker', 'buildup'] },
};
/** How fast a player adapts to a manager's school: 0.8–1.3, 1.0 under a neutral manager. */
export function schoolFactor(
  manager: { style?: ManagerStyle; neutral: boolean },
  player: { attrs: Attributes; traits: readonly PlayTrait[]; age: number },
) {
  if (manager.neutral || !manager.style) return 1;
  const prefs = SCHOOL_PREFS[manager.style];
  let factor = 0.8;
  for (const a of prefs.attributes) if (player.attrs[a] >= 65) factor += 0.1;
  for (const t of prefs.traits) if (player.traits.includes(t)) factor += 0.1;
  if (manager.style === 'developer' && player.age <= 21) factor += 0.1;
  return Math.round(Math.min(1.3, factor) * 100) / 100;
}

/** A formation's slot: the position played and the role the manager asks of it. */
export interface Slot {
  position: Position;
  role: RoleId;
}
const slot = (position: Position, role: RoleId): Slot => ({ position, role });
/**
 * The formation each applied tactic plays (→STAFF-22), slot 0 the goalkeeper, then the DF, MF and
 * FW lines, each left to right.
 */
export const FORMATIONS: Record<Tactic, { name: string; slots: readonly Slot[] }> = {
  possession: {
    name: '4-3-3',
    slots: [
      slot('GK', 'sweeperKeeper'),
      slot('LB', 'invertedFullBack'),
      slot('CB', 'ballPlayingDefender'),
      slot('CB', 'coverDefender'),
      slot('RB', 'overlappingFullBack'),
      slot('DM', 'anchor'),
      slot('CM', 'mezzala'),
      slot('CM', 'deepLyingPlaymaker'),
      slot('LW', 'invertedWinger'),
      slot('ST', 'falseNine'),
      slot('RW', 'traditionalWinger'),
    ],
  },
  press: {
    name: '4-2-3-1',
    slots: [
      slot('GK', 'sweeperKeeper'),
      slot('LB', 'overlappingFullBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('RB', 'overlappingFullBack'),
      slot('DM', 'ballWinner'),
      slot('CM', 'boxToBox'),
      slot('AM', 'shadowStriker'),
      slot('LW', 'invertedWinger'),
      slot('ST', 'completeForward'),
      slot('RW', 'invertedWinger'),
    ],
  },
  counter: {
    name: '4-4-2',
    slots: [
      slot('GK', 'shotStopper'),
      slot('LB', 'defensiveFullBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('RB', 'defensiveFullBack'),
      slot('LM', 'wideMidfielder'),
      slot('CM', 'boxToBox'),
      slot('CM', 'deepLyingPlaymaker'),
      slot('RM', 'wideMidfielder'),
      slot('ST', 'targetMan'),
      slot('ST', 'poacher'),
    ],
  },
  balanced: {
    name: '3-5-2',
    slots: [
      slot('GK', 'shotStopper'),
      slot('LWB', 'defensiveWingBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('CB', 'ballPlayingDefender'),
      slot('RWB', 'attackingWingBack'),
      slot('DM', 'anchor'),
      slot('CM', 'boxToBox'),
      slot('CM', 'mezzala'),
      slot('ST', 'targetMan'),
      slot('ST', 'poacher'),
    ],
  },
};
export const slotLine = (tactic: Tactic, index: number) =>
  lineOf(FORMATIONS[tactic].slots[index]!.position);

/**
 * The grades another club's player shows, as wide as the chief scout's ability allows (→PLAYER-18);
 * `scale` narrows it on whole grades, 원석 감별사's half (→OWNER-5) making ±2 read ±1 and ±1 exact.
 */
export function personalityRange(grade: Grade, scoutAbility?: number, scale = 1): [Grade, Grade] {
  const spread = Math.floor(
    (scoutAbility === undefined ? 2 : scoutAbility >= 80 ? 0 : scoutAbility >= 60 ? 1 : 2) * scale,
  );
  const at = (g: number) => Math.min(5, Math.max(1, g)) as Grade;
  return [at(grade - spread), at(grade + spread)];
}

/** Positions a player of one position also plays, nearest first. */
const NEIGHBORS: Record<Position, readonly Position[]> = {
  GK: [],
  CB: ['DM', 'RB', 'LB'],
  LB: ['RB', 'LWB', 'LM', 'CB'],
  RB: ['LB', 'RWB', 'RM', 'CB'],
  LWB: ['RWB', 'LB', 'LM', 'LW'],
  RWB: ['LWB', 'RB', 'RM', 'RW'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM', 'LM', 'RM'],
  LM: ['RM', 'LW', 'LWB', 'CM'],
  RM: ['LM', 'RW', 'RWB', 'CM'],
  AM: ['CM', 'ST', 'LW', 'RW'],
  LW: ['RW', 'LM', 'AM', 'ST'],
  RW: ['LW', 'RM', 'AM', 'ST'],
  ST: ['AM', 'LW', 'RW'],
};
const WIDE: readonly Position[] = ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'];
/** A flank position: full-backs, wing-backs, wide midfielders and wingers. */
export const isWide = (position: Position) => WIDE.includes(position);
function pick<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let u = rng() * total;
  for (const [value, weight] of entries) {
    u -= weight;
    if (u < 0) return value;
  }
  return entries[entries.length - 1]![0];
}
const OFFSET: Record<Weight, number> = { 3: 4, 2: 1, 1: -3, 0: -10 };

/** How far 판단력 and 침착성 start below an older player's for those aged 21 or younger (→PLAYER-2). */
const YOUNG_MENTAL_GAP = 5;
/** Where a generated player's shifted attributes stop, so the OVR a rating can reach. */
export const GENERATED_ATTRIBUTES = { floor: 15, ceiling: 95 } as const;
function generateAttributes(
  rng: Rng,
  position: Position,
  rating: number,
  role?: RoleId,
  age?: number,
) {
  const weights = weightsFor(position, role);
  const keeper = position === 'GK';
  const attrs = {} as Attributes;
  const shifted: Attribute[] = [];
  for (const a of ATTRIBUTES) {
    if (!keeper && GK_ATTRIBUTES.includes(a)) {
      attrs[a] = Math.round(8 + rng() * 12);
      continue;
    }
    const offset =
      keeper && ['finishing', 'dribbling', 'crossing'].includes(a) ? -20 : OFFSET[weights[a]];
    attrs[a] = rating + offset + (rng() * 2 - 1) * 9;
    shifted.push(a);
  }
  // The young grow into the mental attributes (→PLAYER-17); the shift below keeps the OVR.
  if (age !== undefined && age <= 21) {
    attrs.decisions -= YOUNG_MENTAL_GAP;
    attrs.composure -= YOUNG_MENTAL_GAP;
  }
  // Two passes: the clamp at the ends can leave the first shift short.
  for (let pass = 0; pass < 2; pass++) {
    const ovr = role ? ovrAt(attrs, position, role) : mainOvr({ attrs, position });
    const shift = rating - ovr;
    for (const a of shifted)
      attrs[a] = Math.min(
        GENERATED_ATTRIBUTES.ceiling,
        Math.max(GENERATED_ATTRIBUTES.floor, attrs[a] + shift),
      );
  }
  for (const a of shifted) attrs[a] = Math.round(attrs[a]);
  return attrs;
}

function generatePositions(rng: Rng, position: Position): Positions {
  const positions: Positions = { [position]: 3 };
  if (position === 'GK') return positions;
  const count = pick(rng, [
    [1, 25],
    [2, 35],
    [3, 22],
    [4, 10],
    [5, 5],
    [6, 3],
  ] as const);
  const queue = [...NEIGHBORS[position]];
  const seen = new Set<Position>([position, ...queue]);
  let held = 1;
  while (held < count && queue.length) {
    const next = queue.shift()!;
    for (const n of NEIGHBORS[next])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    if (rng() >= 0.7) continue;
    const mirror = next === mirrorOf(position) && next !== position;
    positions[next] = pick<PositionLevel>(
      rng,
      mirror
        ? [
            [3, 15],
            [2, 35],
            [1, 50],
          ]
        : [
            [3, 15],
            [2, 50],
            [1, 35],
          ],
    );
    held++;
  }
  return positions;
}

export const gradeOf = (rng: Rng) =>
  pick<Grade>(rng, [
    [1, 8],
    [2, 22],
    [3, 40],
    [4, 22],
    [5, 8],
  ]);

const TRAIT_AFFINITY: Record<PlayTrait, Attribute | undefined> = {
  workrate: 'stamina',
  technician: 'dribbling',
  playmaker: 'vision',
  speedster: 'pace',
  linebreaker: 'positioning',
  targetman: 'strength',
  longshot: 'finishing',
  crosser: 'crossing',
  aerial: 'heading',
  tackler: 'tackling',
  buildup: 'passing',
  leader: undefined,
};
function traitAllowed(trait: PlayTrait, position: Position) {
  const line = lineOf(position);
  if (line === 'GK') return trait === 'buildup' || trait === 'leader';
  switch (trait) {
    case 'linebreaker':
      return line === 'FW' || position === 'AM';
    case 'targetman':
      return line === 'FW';
    case 'longshot':
      return line === 'MF' || line === 'FW';
    case 'crosser':
      return WIDE.includes(position);
    case 'tackler':
      return line === 'DF' || line === 'MF';
    case 'buildup':
      return line === 'DF' || position === 'DM';
    default:
      return true;
  }
}
function generateTraits(rng: Rng, position: Position, rating: number, attrs: Attributes) {
  const count = pick(
    rng,
    rating >= 75
      ? ([
          [0, 5],
          [1, 35],
          [2, 40],
          [3, 20],
        ] as const)
      : ([
          [0, 20],
          [1, 45],
          [2, 28],
          [3, 7],
        ] as const),
  );
  const scored = (Object.keys(TRAIT_AFFINITY) as PlayTrait[])
    .filter((t) => traitAllowed(t, position))
    .map((t) => {
      const affinity = TRAIT_AFFINITY[t];
      return { t, score: affinity ? attrs[affinity] + rng() * 10 : rng() * 70 };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(({ t }) => t);
}

export interface Profile {
  attrs: Attributes;
  positions: Positions;
  personality: Personality;
  traits: PlayTrait[];
}
/**
 * A new player of a position, his OVR there landing at the rating (→PLAYER-2, →PLAYER-4,
 * →PLAYER-7, →PLAYER-9): attributes by the position's weights with noise, the positions he also
 * plays, his personality and his play traits.
 */
export function generateProfile(
  rng: Rng,
  position: Position,
  rating: number,
  role?: RoleId,
  age?: number,
): Profile {
  const attrs = generateAttributes(rng, position, rating, role, age);
  const positions = generatePositions(rng, position);
  const personality = {
    professionalism: gradeOf(rng),
    adaptability: gradeOf(rng),
    ambition: gradeOf(rng),
  };
  return { attrs, positions, personality, traits: generateTraits(rng, position, rating, attrs) };
}
/** A player of each line as a noun (수비수), beside LINE_LABEL's line name (수비). */
export const LINE_NAME: Readonly<Record<Line, string>> = {
  GK: sourceMessage('position.family.GK'),
  DF: sourceMessage('copy.RecruitmentDesk.48e2d845b6'),
  MF: sourceMessage('copy.RecruitmentDesk.7d50bd87b5'),
  FW: sourceMessage('copy.RecruitmentDesk.736f1ff574'),
};
/** A request in words: the line it asks for, or the formation slot's position. */
export const requestLabel = (request: Pick<SigningRequest, 'line' | 'position'>) =>
  request.position
    ? sourceMessage('copy.ScoutShortlist.28670cb5ca', { p0: POSITION_LABEL[request.position] })
    : LINE_NAME[request.line];
