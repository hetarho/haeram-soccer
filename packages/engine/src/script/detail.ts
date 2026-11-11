/** Transient, integer action rows of one settled aggregate match (MATCH-38). */
import type { Position, RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
export * from './codes';

export interface DetailSide {
  tactic: Tactic;
  /** Participating lines in record order. Every row's line is a local index into this array;
   * an event's `other` is the opponent's line, except an offside's receiver (its own side). */
  lines: { id: string; slot: number; role: RoleId; position: Position }[];
}
export interface MatchDetail {
  version: 1;
  id: string;
  length: 90 | 120;
  added: number[];
  score: [number, number];
  sides: [DetailSide, DetailSide];
  /** [side, line, slot, fromMinute, toMinute]; half-open on-pitch intervals. */
  stints: number[][];
  /** Prototype's ten columns, then period (0 regulation, 1 extra). */
  events: number[][];
  /** Prototype's twelve columns; sources are event indexes, or -1. */
  shots: number[][];
  /** [fouledSide, cell, fouler, fouled, cardMinute or -1, penalty 0|1, period]. */
  fouls: number[][];
  /** [minute, side, kind, line, otherLine or -1, reason or -1], in time order. */
  incidents: number[][];
  /** [side, line, scored 0|1], in kicking order. */
  shootout: number[][];
  /** [foul row index, shot row index], one-to-one. Keeps both existing row layouts intact. */
  penalties: number[][];
}

export { matchDetail } from './build';
export { recordOf, detailIssues } from './recount';
