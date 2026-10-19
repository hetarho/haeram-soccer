import type { ManagerStyle, Tactic } from '../../contracts/src/types';
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

/**
 * The player model (→PLAYER): attributes, positions and roles, OVR on one scale, traits,
 * adaptation and its multiplier, growth past potential, ageing, the schools' preferences and the
 * formations each tactic plays. Pure: no World, every draw from the caller's stream.
 */
export type Rng = () => number;

export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  finishing: '슈팅',
  dribbling: '드리블',
  crossing: '크로스',
  passing: '패스',
  vision: '시야',
  tackling: '태클',
  positioning: '위치선정',
  heading: '공중볼',
  pace: '속도',
  stamina: '체력',
  strength: '몸싸움',
  reflexes: '선방',
  handling: '공중볼 처리',
  distribution: '발밑',
  decisions: '판단력',
  composure: '침착성',
};
export const ATTRIBUTE_GROUPS: readonly { label: string; attributes: readonly Attribute[] }[] = [
  { label: '공격', attributes: ['finishing', 'dribbling', 'crossing'] },
  { label: '패스', attributes: ['passing', 'vision'] },
  { label: '수비', attributes: ['tackling', 'positioning', 'heading'] },
  { label: '신체', attributes: ['pace', 'stamina', 'strength'] },
  { label: '정신', attributes: ['decisions', 'composure'] },
  { label: 'GK', attributes: ['reflexes', 'handling', 'distribution'] },
];
const GK_ATTRIBUTES: readonly Attribute[] = ['reflexes', 'handling', 'distribution'];

export const POSITION_LABEL: Record<Position, string> = {
  GK: '골키퍼',
  CB: '센터백',
  LB: '왼쪽 풀백',
  RB: '오른쪽 풀백',
  LWB: '왼쪽 윙백',
  RWB: '오른쪽 윙백',
  DM: '수비형 미드필더',
  CM: '중앙 미드필더',
  LM: '왼쪽 미드필더',
  RM: '오른쪽 미드필더',
  AM: '공격형 미드필더',
  LW: '왼쪽 윙어',
  RW: '오른쪽 윙어',
  ST: '스트라이커',
};
export const LINE_LABEL: Record<Line, string> = {
  GK: '골키퍼',
  DF: '수비',
  MF: '미드필드',
  FW: '공격',
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
  sweeperKeeper: { label: '스위퍼 키퍼', positions: ['GK'], promotes: ['distribution', 'pace'] },
  shotStopper: { label: '슈팅 스토퍼', positions: ['GK'], promotes: [] },
  stopper: { label: '스토퍼', positions: ['CB'], promotes: ['strength'] },
  coverDefender: { label: '커버형 센터백', positions: ['CB'], promotes: ['pace'] },
  ballPlayingDefender: {
    label: '볼 플레잉 디펜더',
    positions: ['CB'],
    promotes: ['passing', 'vision'],
  },
  defensiveFullBack: { label: '수비형 풀백', positions: ['LB', 'RB'], promotes: ['positioning'] },
  overlappingFullBack: {
    label: '오버래핑 풀백',
    positions: ['LB', 'RB'],
    promotes: ['crossing', 'stamina'],
  },
  invertedFullBack: {
    label: '인버티드 풀백',
    positions: ['LB', 'RB'],
    promotes: ['passing', 'vision'],
  },
  defensiveWingBack: {
    label: '수비형 윙백',
    positions: ['LWB', 'RWB'],
    promotes: ['tackling', 'positioning'],
  },
  attackingWingBack: { label: '공격형 윙백', positions: ['LWB', 'RWB'], promotes: ['dribbling'] },
  anchor: { label: '앵커', positions: ['DM'], promotes: ['decisions'] },
  ballWinner: { label: '볼 위닝 미드필더', positions: ['DM'], promotes: ['stamina', 'strength'] },
  regista: { label: '레지스타', positions: ['DM'], promotes: ['passing', 'vision'] },
  boxToBox: { label: '박스투박스', positions: ['CM'], promotes: ['tackling', 'finishing'] },
  mezzala: { label: '메짤라', positions: ['CM'], promotes: ['dribbling', 'finishing'] },
  deepLyingPlaymaker: {
    label: '딥라잉 플레이메이커',
    positions: ['CM'],
    promotes: ['vision', 'decisions'],
  },
  wideMidfielder: { label: '와이드 미드필더', positions: ['LM', 'RM'], promotes: ['tackling'] },
  widePlaymaker: {
    label: '와이드 플레이메이커',
    positions: ['LM', 'RM'],
    promotes: ['passing', 'vision'],
  },
  attackingMidfielder: { label: '공격형 미드필더', positions: ['AM'], promotes: ['finishing'] },
  shadowStriker: {
    label: '섀도 스트라이커',
    positions: ['AM'],
    promotes: ['finishing', 'positioning'],
  },
  trequartista: { label: '트레콰르티스타', positions: ['AM'], promotes: ['dribbling'] },
  traditionalWinger: { label: '전통형 윙어', positions: ['LW', 'RW'], promotes: ['crossing'] },
  invertedWinger: { label: '인버티드 윙어', positions: ['LW', 'RW'], promotes: ['finishing'] },
  targetMan: { label: '타겟맨', positions: ['ST'], promotes: ['heading', 'strength'] },
  poacher: { label: '포처', positions: ['ST'], promotes: ['positioning', 'composure'] },
  falseNine: { label: '펄스 나인', positions: ['ST'], promotes: ['passing', 'vision'] },
  completeForward: {
    label: '컴플리트 포워드',
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
/** Each (position, role)'s weights, built once: OVR is read for every slot of every match. */
const weightCache = new Map<
  string,
  { record: Readonly<Record<Attribute, Weight>>; total: number }
>();
function weightEntry(position: Position, role?: RoleId) {
  const key = role ? `${position}|${role}` : position;
  let entry = weightCache.get(key);
  if (!entry) {
    const tiers = POSITION_WEIGHTS[position];
    const weights = Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, Weight>;
    for (const a of tiers.tertiary) weights[a] = 1;
    for (const a of tiers.secondary) weights[a] = 2;
    for (const a of tiers.primary) weights[a] = 3;
    for (const a of role ? ROLES[role].promotes : [])
      weights[a] = Math.min(3, weights[a] + 1) as Weight;
    entry = {
      record: Object.freeze(weights),
      total: ATTRIBUTES.reduce((sum, a) => sum + weights[a], 0),
    };
    weightCache.set(key, entry);
  }
  return entry;
}
/** Each attribute's weight at a position, after the role moves its attributes up a tier. */
export function weightsFor(position: Position, role?: RoleId): Readonly<Record<Attribute, Weight>> {
  return weightEntry(position, role).record;
}

/** OVR at a position in a role: the weighted average of its attributes, one 1–99 scale (→PLAYER-6). */
export function ovrAt(attrs: Attributes, position: Position, role?: RoleId) {
  const { record, total } = weightEntry(position, role);
  let sum = 0;
  for (const a of ATTRIBUTES) sum += record[a] * attrs[a];
  return sum / total;
}
export function bestRoleAt(attrs: Attributes, position: Position): RoleId {
  let best = rolesAt(position)[0]!,
    value = -Infinity;
  for (const role of rolesAt(position)) {
    const ovr = ovrAt(attrs, position, role);
    if (ovr > value) [best, value] = [role, ovr];
  }
  return best;
}
/** His OVR at his main position in his best role there. */
export const mainOvr = (p: { attrs: Attributes; position: Position }) =>
  ovrAt(p.attrs, p.position, bestRoleAt(p.attrs, p.position));

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
  1: '매우 낮음',
  2: '낮음',
  3: '보통',
  4: '높음',
  5: '매우 높음',
};
export const PERSONALITY_LABEL: Record<keyof Personality, string> = {
  professionalism: '프로의식',
  adaptability: '적응력',
  ambition: '야망',
};
export const TRAIT_LABEL: Record<PlayTrait, string> = {
  workrate: '활동량',
  technician: '테크니션',
  playmaker: '플레이메이커',
  speedster: '스피드스터',
  linebreaker: '라인 브레이커',
  targetman: '타겟맨',
  longshot: '중거리 슈터',
  crosser: '크로스 전문가',
  aerial: '공중 장악',
  tackler: '태클러',
  buildup: '빌드업',
  leader: '리더',
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
    if (excess <= x1)
      return Math.exp(Math.log(y0) + ((excess - x0) / (x1 - x0)) * (Math.log(y1) - Math.log(y0)));
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

/** The grades another club's player shows, as wide as the chief scout's ability allows (→PLAYER-18). */
export function personalityRange(grade: Grade, scoutAbility?: number): [Grade, Grade] {
  const spread =
    scoutAbility === undefined ? 2 : scoutAbility >= 80 ? 0 : scoutAbility >= 60 ? 1 : 2;
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
    for (const a of shifted) attrs[a] = Math.min(95, Math.max(15, attrs[a] + shift));
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
