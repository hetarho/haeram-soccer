import type { CrestDesign } from '../../../../packages/contracts/src/identity';
import type { World } from '../../../../packages/contracts/src/types';
import { legacyCrestMap } from '../../../../packages/engine/src/identity-legacy';

/**
 * WEB-49: the crest each club wears now, shared by slot summaries and the UI. The catalog lives in
 * the identity contract and the legacy generator in the engine's legacy leaf (KIT-15); nothing here
 * reads the selected theme or browser state.
 */

/** A crest as drawn: its secondary and accent are optional, an absent one is negative space. */
export type Crest = CrestDesign;

const FALLBACK: Crest = {
  primary: '#455a64',
  secondary: '#f3e3c3',
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
};

/**
 * Every club's current crest: its applied identity's, else the exact legacy assignment of
 * `legacyCrestMap` (KIT-15). Built on each call and read from the identities first, so the legacy
 * cache — keyed on seed, clubs and the own colour — never hides a replaced identity. Current
 * identities only: a played match draws the crest it recorded (KIT-12).
 */
export function crestMap(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>) {
  const legacy = w.clubs.every((club) => club.identity) ? undefined : legacyCrestMap(w);
  return new Map<string, Crest>(
    w.clubs.map((club) => [club.id, club.identity?.crest ?? legacy?.get(club.id) ?? FALLBACK]),
  );
}
export function crestOf(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, id: string | undefined) {
  const club = id ? w.clubs.find((c) => c.id === id) : undefined;
  if (!club) return FALLBACK;
  return club.identity?.crest ?? legacyCrestMap(w).get(club.id) ?? FALLBACK;
}
