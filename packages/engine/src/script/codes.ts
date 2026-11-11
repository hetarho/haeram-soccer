import { AGGREGATE_MOVE_KINDS } from '../aggregate/types';

export const EVENT_KINDS = AGGREGATE_MOVE_KINDS;
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
export const SHOT_KINDS = ['open', 'corner', 'freeKick', 'penalty'] as const;
export const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
export const INCIDENT_KINDS = ['yellow', 'secondYellow', 'red', 'sub', 'injury'] as const;
export const CARD_REASONS = [
  'reckless',
  'tactical',
  'dissent',
  'dogso',
  'serious',
  'violent',
] as const;
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
  period: 10,
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
export const FO = {
  fouledSide: 0,
  cell: 1,
  fouler: 2,
  fouled: 3,
  cardMinute: 4,
  penalty: 5,
  period: 6,
} as const;
export const IN = { minute: 0, side: 1, kind: 2, line: 3, otherLine: 4, reason: 5 } as const;
