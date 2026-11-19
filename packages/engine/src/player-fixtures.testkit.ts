/** Explicit persisted-player setup for tests; real career defaults stay untouched. */
import { personOf } from './person-reads';
import type { Club, Player, World } from '../../contracts/src/types';
import { FREE_AGENT_CAP } from '../../contracts/src/player';
import { joinFreeAgents } from './free-agents';
import { movePerson } from './npc-continuity';
import { activePlayers, formationOf, overall } from './player-state';
import { LINE_MINIMUM, lineOf } from './player';
import { clubPlayers } from './world';
import { uncoveredSlots } from './takeover';
import { SQUAD_TARGET } from './squad-size';

/** The historical transfer fixture's order: clubs as stored, then two least able adults per club. */
export function releaseFixturePlayers(w: World): string[] {
  const released: string[] = [];
  for (const c of w.clubs) {
    if (c.id === w.playerClub || c.representative) continue;
    for (const p of [...(w.squads?.[c.id] ?? [])]
      .filter((p) => w.year - p.born >= 21)
      .sort((a, b) => overall(a) - overall(b))
      .slice(0, 2))
      if (joinFreeAgents(w, p, w.year)) released.push(p.id);
    if ((w.freeAgents?.length ?? 0) >= FREE_AGENT_CAP) break;
  }
  return released;
}

/** Select an actual retained NPC player; generated-place origins are not an eligibility rule. */
export function persistedFixturePlayer(w: World): { club: Club; player: Player } | undefined {
  for (const club of w.clubs) {
    if (club.id === w.playerClub || club.representative || !w.squads?.[club.id]) continue;
    const player = clubPlayers(w, club).find((p) => {
      const person = personOf(w, p.id);
      return p.status === 'active' && person?.playing === 'active' && person.club === club.id;
    });
    if (player) return { club, player };
  }
  return undefined;
}

/**
 * Prepare an explicit twenty-player threshold fixture, keeping formation and line cover. Spare
 * players move to an actual other club through the ordinary identity/roster API, so no parallel
 * registry or free-agent pool contradicts the selected squad. Insufficient input is unchanged.
 */
export function twentyPlayerFixture(w: World): Player[] | undefined {
  const players = activePlayers(w);
  if (players.length < SQUAD_TARGET) return undefined;
  const formation = formationOf(w.tactic);
  if (uncoveredSlots(players, formation).length) return undefined;
  const chosen = [...players];
  const covered = (squad: Player[]) =>
    Object.entries(LINE_MINIMUM).every(
      ([line, minimum]) => squad.filter((p) => lineOf(p.position) === line).length >= minimum,
    ) && uncoveredSlots(squad, formation).length === 0;
  if (!covered(chosen)) return undefined;
  // Keep original order and every necessary cover player; bench extras leave first.
  for (const player of players.toReversed()) {
    if (chosen.length <= SQUAD_TARGET) break;
    const next = chosen.filter((p) => p !== player);
    if (covered(next)) chosen.splice(chosen.indexOf(player), 1);
  }
  if (chosen.length !== SQUAD_TARGET) return undefined;
  const destination = w.clubs.find(
    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id],
  );
  const spare = players.filter((p) => !chosen.includes(p));
  if (spare.length && !destination) return undefined;
  for (const player of spare) movePerson(w, player, destination!.id, true);
  return activePlayers(w);
}
