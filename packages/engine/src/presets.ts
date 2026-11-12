import { message as sourceMessage } from '../../contracts/src/messages';
import { BUDGET_RESPONSIBILITIES, DEFAULT_REQUEST } from './delegation-info';
import type { ClubPolicy, Direction, World } from '../../contracts/src/types';
import { BUILD_SLOTS, type ClubBuild } from '../../contracts/src/build';
import { BUILD_PRESETS, cardOf } from './build';
import { POLICY_DEFAULTS, POLICY_KEYS } from './policy';
import { DIRECTION_DEFAULT, DIRECTION_KEYS } from './direction';
import { addEvent } from './events';

/** The founding ticket price, every preset's default (→ECON-17). */
export const DEFAULT_TICKET = 0.05;
/** The five ticket presets, cheapest first, in 1901 base prices (→ECON-17). */
export const TICKET_PRESETS = [0.02, 0.035, DEFAULT_TICKET, 0.08, 0.12] as const;
/** Everything a direction sets (→ECON-25): cards, dials, ticket and direction rows. */
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
 * default — what founding with it puts in force.
 */
export function presetBoard(preset: Pick<Preset, 'build' | 'rows'>): DirectionBoard {
  return {
    build: { ...preset.build },
    policy: { ...POLICY_DEFAULTS, ...preset.rows.policy },
    ticket: preset.rows.ticket ?? DEFAULT_TICKET,
    direction: { ...preset.rows.direction },
  };
}

/**
 * A new club's direction (→ECON-22, →WEB-15): the preset's whole board put in force on the
 * founding day and recorded as one direction event, so the history starts with the founding and
 * the direction chosen; absent is 기본 방향, every row at its default. Defaults are not stored: a
 * dial or row at its default stays absent, as a club that never chose reads (→ECON-16, →ECON-25).
 * No owner action or staff rule changes the rows afterwards.
 */
export function foundWithPreset(w: World, id: string | undefined) {
  if (id === undefined) return;
  const preset = presetById(id);
  if (!preset) throw new Error(sourceMessage('copy.presets.c7db97e536'));
  const board = presetBoard(preset);
  const build = board.build;
  if (Object.keys(build).length) {
    w.build = build;
    const cards = BUILD_SLOTS.filter((slot) => build[slot]).map(
      (slot) => cardOf(build, slot).label,
    );
    addEvent(
      w,
      'build',
      sourceMessage('copy.build.018abc891d', { p0: preset.label }),
      cards.join(' · '),
    );
  }
  if (POLICY_KEYS.some((key) => board.policy[key] !== POLICY_DEFAULTS[key]))
    w.policy = { ...POLICY_DEFAULTS, ...board.policy };
  w.ticket = board.ticket;
  const direction = Object.fromEntries(
    DIRECTION_KEYS.flatMap((key) => {
      const option = board.direction[key] ?? DIRECTION_DEFAULT[key];
      return option === DIRECTION_DEFAULT[key] ? [] : [[key, option]];
    }),
  ) as Direction;
  if (Object.keys(direction).length) w.direction = direction;
  const request = preset.rows.request;
  if (request !== undefined && request !== DEFAULT_REQUEST)
    w.delegationRequests = Object.fromEntries(BUDGET_RESPONSIBILITIES.map((key) => [key, request]));
}
