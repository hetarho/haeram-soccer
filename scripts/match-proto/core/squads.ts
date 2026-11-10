// Synthetic demo data, not catalog data (-> ARCH-21): two invented squads shaped so the prototype
// can show distinct roles. No real club or player is represented.
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

/** One table row, listed in slot order: shirt number, position, role, attributes in `ATTR_ORDER`. */
type Row = readonly [number, Position, RoleId, readonly number[]];

const ATTR_ORDER = [
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

const HOME: readonly Row[] = [
  [1, 'GK', 'sweeperKeeper', [70, 62, 20, 40, 55, 72, 76, 30, 60, 74]],
  [3, 'LB', 'invertedFullBack', [82, 78, 45, 68, 70, 80, 74, 72, 58, 76]],
  [5, 'CB', 'ballPlayingDefender', [78, 70, 35, 55, 66, 76, 80, 80, 80, 74]],
  [4, 'CB', 'centreBack', [66, 58, 30, 48, 68, 72, 82, 84, 84, 70]],
  [2, 'RB', 'overlappingFullBack', [72, 64, 48, 72, 86, 70, 68, 70, 60, 66]],
  [6, 'DM', 'anchor', [80, 74, 50, 62, 62, 82, 84, 82, 72, 78]],
  [8, 'CM', 'mezzala', [80, 80, 68, 78, 74, 78, 66, 60, 58, 74]],
  [10, 'CM', 'boxToBox', [76, 72, 70, 70, 76, 74, 72, 72, 70, 72]],
  [11, 'LW', 'invertedWinger', [76, 76, 78, 86, 84, 86, 58, 40, 50, 80]],
  [9, 'ST', 'falseNine', [86, 88, 72, 80, 66, 84, 60, 42, 62, 82]],
  [7, 'RW', 'traditionalWinger', [78, 70, 64, 82, 88, 66, 56, 44, 52, 68]],
];

const AWAY: readonly Row[] = [
  [1, 'GK', 'keeper', [58, 50, 20, 35, 52, 70, 78, 30, 62, 72]],
  [3, 'LB', 'fullBack', [64, 56, 40, 60, 74, 66, 72, 76, 62, 64]],
  [5, 'CB', 'centreBack', [60, 52, 30, 45, 64, 70, 80, 82, 84, 68]],
  [4, 'CB', 'centreBack', [62, 54, 32, 46, 66, 68, 78, 82, 82, 66]],
  [2, 'RB', 'overlappingFullBack', [68, 60, 46, 70, 84, 64, 66, 70, 58, 62]],
  [11, 'LM', 'traditionalWinger', [72, 66, 62, 80, 86, 62, 54, 48, 50, 64]],
  [6, 'CM', 'ballWinner', [66, 58, 48, 58, 72, 70, 78, 86, 70, 68]],
  [8, 'CM', 'boxToBox', [72, 66, 64, 66, 74, 70, 70, 72, 68, 70]],
  [7, 'RM', 'wideMidfielder', [72, 64, 60, 74, 78, 66, 60, 56, 54, 66]],
  [9, 'ST', 'poacher', [58, 54, 84, 72, 86, 32, 70, 30, 66, 76]],
  [10, 'ST', 'targetMan', [66, 60, 74, 58, 55, 45, 68, 40, 88, 70]],
];

const attrsOf = (values: readonly number[]): Attrs => {
  const attrs = {} as Attrs;
  ATTR_ORDER.forEach((key, i) => {
    attrs[key] = values[i];
  });
  return attrs;
};

const team = (
  id: TeamId,
  code: 'H' | 'A',
  formation: FormationId,
  style: Style,
  rows: readonly Row[],
): TeamSpec => {
  const players: PlayerSpec[] = rows.map(([number, position, role, values], slot) => ({
    index: id * 11 + slot,
    team: id,
    slot,
    number,
    position,
    role,
    attrs: attrsOf(values),
  }));
  return { id, code, formation, style, players };
};

/** The two synthetic demo teams: H (4-3-3, possession) at home against A (4-4-2, counter). */
export function demoFixture(): Fixture {
  const teams = [
    team(0, 'H', '4-3-3', 'possession', HOME),
    team(1, 'A', '4-4-2', 'counter', AWAY),
  ] as const;
  return { teams, players: [...teams[0].players, ...teams[1].players] };
}

/** Team code and shirt number, e.g. `H9`: an identifier built from data. */
export function playerLabel(fixture: Fixture, index: number): string {
  const player = fixture.players[index];
  return `${fixture.teams[player.team].code}${player.number}`;
}
