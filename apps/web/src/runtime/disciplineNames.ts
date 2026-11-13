import type { World } from '../../../../packages/contracts/src/types';
import { clubPlayers } from '../../../../packages/engine/src/world';

/** Only players named by the discipline table travel, never the other clubs' whole squads. */
export function disciplineNames(w: World) {
  const ids = new Set([
    ...Object.keys(w.discipline?.yellows ?? {}),
    ...(w.discipline?.bans ?? []).map((ban) => ban.player),
  ]);
  const names: [string, { name: string; club: string }][] = [];
  if (ids.size)
    for (const club of w.clubs)
      for (const player of clubPlayers(w, club))
        if (ids.has(player.id)) names.push([player.id, { name: player.name, club: club.id }]);
  return Object.fromEntries(names);
}
