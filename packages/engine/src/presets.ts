import type { ClubPolicy, Direction, DirectionKey, World } from '../../contracts/src/types';
import type { ClubBuild } from '../../contracts/src/build';
import { BUILD_PRESETS, buildOf, sameBuild, setBuild } from './build';
import { POLICY_DEFAULTS, POLICY_KEYS, policyOf, setPolicy } from './policy';
import { DIRECTION_DEFAULT, DIRECTION_KEYS, directionOf, setDirection } from './direction';

/** The founding ticket price, every preset's default (→ECON-17). */
export const DEFAULT_TICKET = 0.05;
/** Everything a direction sets on the board (→ECON-25): cards, dials, ticket and direction rows. */
export interface DirectionBoard {
  build: ClubBuild;
  policy: ClubPolicy;
  ticket: number;
  direction: Direction;
}
export type Preset = (typeof BUILD_PRESETS)[number];

/** The preset of this id, if any. */
export function presetById(id: string): Preset | undefined {
  return BUILD_PRESETS.find((preset) => preset.id === id);
}
/**
 * A preset's whole board (→ECON-22): its cards, the rows it names, and every other row at its
 * default — what applying it leaves in force.
 */
export function presetBoard(preset: Pick<Preset, 'build' | 'rows'>): DirectionBoard {
  return {
    build: { ...preset.build },
    policy: { ...POLICY_DEFAULTS, ...preset.rows.policy },
    ticket: preset.rows.ticket ?? DEFAULT_TICKET,
    direction: { ...preset.rows.direction },
  };
}
/** The board a world holds now. */
export function worldBoard(w: World): DirectionBoard {
  return {
    build: buildOf(w),
    policy: policyOf(w),
    ticket: w.ticket,
    direction: { ...w.direction },
  };
}
const sameDirection = (a: Direction, b: Direction) =>
  DIRECTION_KEYS.every(
    (key) => (a[key] ?? DIRECTION_DEFAULT[key]) === (b[key] ?? DIRECTION_DEFAULT[key]),
  );
/** Whether two boards hold the same option in every row. */
export function sameBoard(a: DirectionBoard, b: DirectionBoard) {
  return (
    sameBuild(a.build, b.build) &&
    POLICY_KEYS.every((key) => a.policy[key] === b.policy[key]) &&
    a.ticket === b.ticket &&
    sameDirection(a.direction, b.direction)
  );
}
/** The preset whose whole board the world holds, if any. */
export function matchingPreset(w: World): Preset | undefined {
  const board = worldBoard(w);
  return BUILD_PRESETS.find((preset) => sameBoard(presetBoard(preset), board));
}

/**
 * Puts a whole board in force through the same setters the commands use: the cards as one
 * direction event named `name`, then each dial, the ticket price and each direction row.
 */
export function applyBoard(w: World, board: DirectionBoard, name?: string) {
  setBuild(w, board.build, name);
  for (const key of POLICY_KEYS) setPolicy(w, key, board.policy[key]);
  w.ticket = board.ticket;
  for (const key of DIRECTION_KEYS)
    if (directionOf(w, key) !== (board.direction[key] ?? DIRECTION_DEFAULT[key]))
      setDirection(w, key as DirectionKey, board.direction[key] ?? DIRECTION_DEFAULT[key]);
}

/**
 * A new club's direction (→ECON-22, →WEB-15): the preset's whole board, recorded as one
 * direction event so the history starts with the founding and the direction chosen; absent is
 * 기본 방향, every row at its default.
 */
export function foundWithPreset(w: World, id: string | undefined) {
  if (id === undefined) return;
  const preset = presetById(id);
  if (!preset) throw new Error('구단 방향을 확인하세요.');
  const events = w.events.length;
  applyBoard(w, presetBoard(preset), preset.label);
  // Keep the one direction event; the dial and row changes it implies are part of founding.
  const named = w.events.slice(events).filter((event) => event.kind === 'build');
  w.events = [...w.events.slice(0, events), ...named];
}
