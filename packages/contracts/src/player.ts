/** The 14 positions, left and right apart (→PLAYER-3), in their fixed order. */
export const POSITIONS = [
  'GK',
  'CB',
  'LB',
  'RB',
  'LWB',
  'RWB',
  'DM',
  'CM',
  'LM',
  'RM',
  'AM',
  'LW',
  'RW',
  'ST',
] as const;
export type Position = (typeof POSITIONS)[number];
/** The four lines positions group into; rules that count a squad by line use them (→PLAYER-3). */
export type Line = 'GK' | 'DF' | 'MF' | 'FW';
export const LINES = ['GK', 'DF', 'MF', 'FW'] as const;

/** The 14 attributes every player has (→PLAYER-2). */
export const ATTRIBUTES = [
  'finishing',
  'dribbling',
  'crossing',
  'passing',
  'vision',
  'tackling',
  'positioning',
  'heading',
  'pace',
  'stamina',
  'strength',
  'reflexes',
  'handling',
  'distribution',
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

/** How well a player plays a position: 3 최상, 2 준수, 1 어색; an unlisted position is 미숙 (→PLAYER-4). */
export type PositionLevel = 1 | 2 | 3;
export type Positions = Partial<Record<Position, PositionLevel>>;

/** A personality grade, 1 매우 낮음 to 5 매우 높음 (→PLAYER-7). */
export type Grade = 1 | 2 | 3 | 4 | 5;
export interface Personality {
  professionalism: Grade;
  adaptability: Grade;
  ambition: Grade;
}

/** Play traits (→PLAYER-9). */
export const PLAY_TRAITS = [
  'workrate',
  'technician',
  'playmaker',
  'speedster',
  'linebreaker',
  'targetman',
  'longshot',
  'crosser',
  'aerial',
  'tackler',
  'buildup',
  'leader',
] as const;
export type PlayTrait = (typeof PLAY_TRAITS)[number];

/** Roles a position is played in (→PLAYER-5), in the table's order. */
export const ROLE_IDS = [
  'sweeperKeeper',
  'shotStopper',
  'stopper',
  'coverDefender',
  'ballPlayingDefender',
  'defensiveFullBack',
  'overlappingFullBack',
  'invertedFullBack',
  'defensiveWingBack',
  'attackingWingBack',
  'anchor',
  'ballWinner',
  'regista',
  'boxToBox',
  'mezzala',
  'deepLyingPlaymaker',
  'wideMidfielder',
  'widePlaymaker',
  'attackingMidfielder',
  'shadowStriker',
  'trequartista',
  'traditionalWinger',
  'invertedWinger',
  'targetMan',
  'poacher',
  'falseNine',
  'completeForward',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];
