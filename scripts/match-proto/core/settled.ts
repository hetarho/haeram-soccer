// Settled matches (T819): one production match per file, settled by the aggregate path and written
// by scripts/export-settled.ts, which writes this shape without importing it. The prototype owns
// the format; a script fitted to a settled result (T820) reads it here. Data only: identifiers and
// numbers, no names (-> ARCH-32).
import type {
  Attrs,
  Fixture,
  FormationId,
  PlayerSpec,
  Position,
  RoleId,
  Style,
  TeamId,
  TeamSpec,
} from './types.ts';

export interface Settled {
  version: 1;
  /** `s01` … */
  id: string;
  /** Production identifiers, data only. */
  source: { seed: string; fixture: string; year: number; revision: number };
  sides: [SettledSide, SettledSide];
  score: [number, number];
  /** Added minutes of the two halves, as the record states them. */
  added: [number, number];
  /** One row per attempt: [side, group, kind, setPiece, from, to, actor, result, lineBreaking, other]. */
  events: number[][];
  /** One row per shot: [side, minute, cell, kind, header, xg, outcome, corner, shooter, passer, source, keeper]; xg in hundredths of a goal, as the ledger keeps it. */
  shots: number[][];
  /** One row per foul: [fouledSide, cell, fouler, fouled, cardMinute]. */
  fouls: number[][];
  /** One row per yellow card: [minute, side, player]. */
  cards: number[][];
  record: { team: [number[], number[]]; players: number[][] };
}
export interface SettledSide {
  formation: FormationId;
  style: Style;
  /** Eleven, by slot: position, role, shirt number and the ten attributes in `Attrs` order. */
  players: { position: Position; role: RoleId; number: number; attrs: number[] }[];
}

export const EVENT_KINDS = [
  'short',
  'long',
  'through',
  'cross',
  'cutBack',
  'carry',
  'takeOn',
] as const;
export const SET_PIECES = ['none', 'corner', 'freeKick'] as const;
export const EVENT_RESULTS = [
  'complete',
  'offside',
  'intercepted',
  'outTouch',
  'outByline',
  'cornerWon',
  'looseKept',
  'looseRecovered',
  'tackled',
] as const;
export const SHOT_KINDS = ['open', 'corner', 'freeKick'] as const;
export const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
export const TEAM_ROW = [
  'goals',
  'shots',
  'onTarget',
  'passes',
  'completed',
  'corners',
  'offsides',
  'throwIns',
  'goalKicks',
  'freeKicks',
  'fouls',
] as const;
export const PLAYER_ROW = [
  'goals',
  'assists',
  'shots',
  'onTarget',
  'passes',
  'completed',
  'tackles',
  'interceptions',
  'takeOns',
  'offsides',
  'fouls',
  'foulsWon',
  'yellowCards',
  'saves',
] as const;

/** The `Attrs` order of a settled player's ten attributes. */
export const SETTLED_ATTRS = [
  'passing',
  'vision',
  'finishing',
  'dribbling',
  'pace',
  'decisions',
  'positioning',
  'tackling',
  'heading',
  'composure',
] as const satisfies readonly (keyof Attrs)[];

/** Column indexes of the row layouts. */
export const EV = {
  side: 0,
  group: 1,
  kind: 2,
  setPiece: 3,
  from: 4,
  to: 5,
  actor: 6,
  result: 7,
  lineBreaking: 8,
  other: 9,
} as const;
export const SH = {
  side: 0,
  minute: 1,
  cell: 2,
  kind: 3,
  header: 4,
  xg: 5,
  outcome: 6,
  corner: 7,
  shooter: 8,
  passer: 9,
  source: 10,
  keeper: 11,
} as const;
export const FO = { fouledSide: 0, cell: 1, fouler: 2, fouled: 3, cardMinute: 4 } as const;
export const CA = { minute: 0, side: 1, player: 2 } as const;

const POSITIONS: readonly Position[] = [
  'GK',
  'CB',
  'LB',
  'RB',
  'DM',
  'CM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
];
const ROLES: readonly RoleId[] = [
  'keeper',
  'sweeperKeeper',
  'centreBack',
  'ballPlayingDefender',
  'fullBack',
  'overlappingFullBack',
  'invertedFullBack',
  'anchor',
  'boxToBox',
  'mezzala',
  'ballWinner',
  'wideMidfielder',
  'traditionalWinger',
  'invertedWinger',
  'falseNine',
  'poacher',
  'targetMan',
];
const FORMATIONS: readonly FormationId[] = ['4-3-3', '4-4-2'];
const STYLES: readonly Style[] = ['possession', 'counter'];

const fail = (where: string, what: string): never => {
  throw new Error(`settled ${where}: ${what}`);
};
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const inRange = (x: unknown, lo: number, hi: number) => isInt(x) && x >= lo && x <= hi;
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Each column's check: an integer range, `num` for any finite number. */
type Column = readonly [number, number] | 'num';
const PLAYER: Column = [0, 21];
const OPT_PLAYER: Column = [-1, 21];
const CELL: Column = [0, 39];
const MINUTE: Column = [0, 200];
const BIT: Column = [0, 1];
const SIDE: Column = [0, 1];
const code = (list: readonly unknown[]): Column => [0, list.length - 1];

function rows(where: string, value: unknown, columns: readonly Column[]): number[][] {
  if (!Array.isArray(value)) return fail(where, 'not a list');
  value.forEach((row, i) => {
    const at = `${where}[${i}]`;
    if (!Array.isArray(row) || row.length !== columns.length)
      fail(at, `length ${Array.isArray(row) ? row.length : 'none'}, not ${columns.length}`);
    columns.forEach((c, j) => {
      const x = (row as unknown[])[j];
      const ok = c === 'num' ? typeof x === 'number' && Number.isFinite(x) : inRange(x, c[0], c[1]);
      if (!ok) fail(at, `column ${j} is ${String(x)}`);
    });
  });
  return value as number[][];
}

function side(where: string, value: unknown): SettledSide {
  if (!isObject(value)) return fail(where, 'not an object');
  if (!FORMATIONS.includes(value.formation as FormationId)) fail(where, 'formation');
  if (!STYLES.includes(value.style as Style)) fail(where, 'style');
  const players = value.players;
  if (!Array.isArray(players) || players.length !== 11) return fail(where, 'not eleven players');
  players.forEach((p, i) => {
    const at = `${where}.players[${i}]`;
    if (!isObject(p)) return fail(at, 'not an object');
    if (!POSITIONS.includes(p.position as Position)) fail(at, `position ${String(p.position)}`);
    if (!ROLES.includes(p.role as RoleId)) fail(at, `role ${String(p.role)}`);
    if (!inRange(p.number, 1, 99)) fail(at, 'number');
    if (
      !Array.isArray(p.attrs) ||
      p.attrs.length !== SETTLED_ATTRS.length ||
      !p.attrs.every((x) => inRange(x, 0, 100))
    )
      fail(at, 'attrs');
  });
  return value as unknown as SettledSide;
}

/**
 * A settled match from parsed JSON: the version, every row's length, every code and index range
 * are checked, and the first fault throws naming its row. The record is not recomputed.
 */
export function readSettled(json: unknown): Settled {
  if (!isObject(json)) return fail('file', 'not an object');
  if (json.version !== 1) fail('version', String(json.version));
  if (typeof json.id !== 'string') fail('id', 'not a string');
  const source = json.source;
  if (
    !isObject(source) ||
    typeof source.seed !== 'string' ||
    typeof source.fixture !== 'string' ||
    !isInt(source.year) ||
    !isInt(source.revision)
  )
    fail('source', 'malformed');
  if (!Array.isArray(json.sides) || json.sides.length !== 2) fail('sides', 'not two');
  const sides = json.sides as unknown[];
  side('sides[0]', sides[0]);
  side('sides[1]', sides[1]);
  rows('score', [json.score], [MINUTE, MINUTE]);
  rows('added', [json.added], [MINUTE, MINUTE]);
  const events = rows('events', json.events, [
    SIDE,
    [0, 100000],
    code(EVENT_KINDS),
    code(SET_PIECES),
    CELL,
    CELL,
    PLAYER,
    code(EVENT_RESULTS),
    BIT,
    OPT_PLAYER,
  ]);
  rows('shots', json.shots, [
    SIDE,
    MINUTE,
    CELL,
    code(SHOT_KINDS),
    BIT,
    'num',
    code(SHOT_OUTCOMES),
    BIT,
    PLAYER,
    OPT_PLAYER,
    [-1, Math.max(-1, events.length - 1)],
    PLAYER,
  ]);
  rows('fouls', json.fouls, [SIDE, CELL, PLAYER, PLAYER, [-1, 200]]);
  rows('cards', json.cards, [MINUTE, SIDE, PLAYER]);
  const record = json.record;
  if (!isObject(record)) return fail('record', 'not an object');
  if (!Array.isArray(record.team) || record.team.length !== 2) fail('record.team', 'not two');
  rows('record.team', record.team, Array<Column>(TEAM_ROW.length).fill([0, 100000]));
  rows('record.players', record.players, Array<Column>(PLAYER_ROW.length).fill([0, 100000]));
  if ((record.players as unknown[]).length !== 22) fail('record.players', 'not 22 players');
  return json as unknown as Settled;
}

/** The prototype's fixture of a settled match: its 22 players in slot order, H at home, A away. */
export function fixtureOf(settled: Settled): Fixture {
  const teams = ([0, 1] as const).map((id: TeamId): TeamSpec => {
    const s = settled.sides[id];
    const players: PlayerSpec[] = s.players.map((p, slot) => {
      const attrs = {} as Attrs;
      SETTLED_ATTRS.forEach((key, i) => (attrs[key] = p.attrs[i]));
      return {
        index: id * 11 + slot,
        team: id,
        slot,
        number: p.number,
        position: p.position,
        role: p.role,
        attrs,
      };
    });
    return { id, code: id === 0 ? 'H' : 'A', formation: s.formation, style: s.style, players };
  }) as [TeamSpec, TeamSpec];
  return { teams, players: [...teams[0].players, ...teams[1].players] };
}
