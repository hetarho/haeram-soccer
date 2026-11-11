import type { Beat, Script } from './types';

/** Small on-ball scenes; all defaults are synthetic and no world or staging is built. */
export const materialBeat = (values: Partial<Beat> = {}): Beat => ({
  index: 0,
  possession: 0,
  side: 0,
  phase: 'progression',
  move: 'short',
  kind: 'pass',
  actor: 1,
  receiver: 2,
  from: [60, 34],
  to: [75, 34],
  loft: false,
  through: false,
  header: false,
  outcome: 'complete',
  hold: 0,
  clock: 0,
  period: 1,
  ...values,
});
export const materialScript = (beats: Beat[]): Script => ({
  version: 1,
  seed: 'synthetic-material',
  bound: true,
  beats: beats.map((b, index) => ({ ...b, index })),
});
