import type { World } from '../../../../packages/contracts/src/types';
import { contractRenewalChance, talkFor } from '../../../../packages/engine/src/contracts';
import { activePlayers } from '../../../../packages/engine/src/player-state';

/** Only current own talks, resolved before the view drops NPC and career registries. */
export function contractRenewalReads(
  w: World,
): Record<string, ReturnType<typeof contractRenewalChance>> {
  return Object.fromEntries(
    activePlayers(w).flatMap((p) => {
      const talk = talkFor(w, p);
      return talk ? [[p.id, contractRenewalChance(w, p, talk)]] : [];
    }),
  );
}
