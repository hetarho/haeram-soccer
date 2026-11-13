import type { World } from '../../../../packages/contracts/src/types';
import { message } from '../../../../packages/contracts/src/messages';
import { foundSquads } from '../../../../packages/engine/src/persisted-squads';
import { restorePlayerLinks } from '../../../../packages/engine/src/player-records';

/** Writer activation only; an inspection must never call this compatibility step. */
export function adoptSquads(w: World, revised: boolean): World {
  if (w.squads !== undefined) return w;
  const candidate = structuredClone(w);
  foundSquads(candidate);
  restorePlayerLinks(candidate);
  if (!revised) {
    if (!Number.isSafeInteger(candidate.revision + 1))
      throw new Error(message('copy.host.b53dad7fec'));
    candidate.revision++;
  }
  return candidate;
}
