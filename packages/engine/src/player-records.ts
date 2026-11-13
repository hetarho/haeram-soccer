/** Season-and-club records and the profiles every retained player link can still open. */
import type { MatchRecord, Player, PlayerRecord, PlayerSeasonLine, World } from '../../contracts/src/types';
import { M } from './match/record';

export function playerRecord(w: World, id: string): PlayerRecord {
  return ((w.playerRecords ??= {})[id] ??= { moves: [], lines: [], linked: false });
}

/** Called by the writer of a retained identity link, never by a profile read. */
export function linkPlayer(w: World, id: string) {
  playerRecord(w, id).linked = true;
}

/** The own writer keeps participants and the opponents named by its retained incidents. */
export function linkOwnMatchPlayers(w: World, match: MatchRecord) {
  for (const line of match.players) if (line.metrics[M.minutes]! > 0) linkPlayer(w, line.id);
  for (const incident of match.incidents ?? []) {
    if (incident.player) linkPlayer(w, incident.player);
    if (incident.other) linkPlayer(w, incident.other);
  }
}

/** The season's settled competitions share one line per player and club, including winter moves. */
export function closePlayerLines(w: World) {
  if (w.npcSeason?.year !== w.year) return;
  const playable = new Set(w.clubs.filter((c) => !c.representative).map((c) => c.id));
  const lines = new Map<string, Map<string, PlayerSeasonLine>>();
  for (const competition of w.npcSeason.competitions)
    for (const p of competition.players)
      for (const part of p.clubs) {
        if (!playable.has(part.club) || !part.appearances) continue;
        let clubs = lines.get(p.id);
        if (!clubs) lines.set(p.id, (clubs = new Map()));
        let line = clubs.get(part.club);
        if (!line) {
          line = { year: w.year, club: part.club, appearances: 0, goals: 0, assists: 0 };
          if (p.position === 'GK') {
            line.saves = 0;
            if (part.cleanSheets !== undefined) line.cleanSheets = 0;
          }
          clubs.set(part.club, line);
        }
        line.appearances += part.appearances;
        line.goals += part.metrics[M.goals]!;
        line.assists += part.metrics[M.assists]!;
        if (line.saves !== undefined) line.saves += part.metrics[M.saves]!;
        // If any competition predates tracking, the whole season's value remains unavailable.
        if (part.cleanSheets === undefined) delete line.cleanSheets;
        else if (line.cleanSheets !== undefined) line.cleanSheets += part.cleanSheets;
      }
  for (const [id, clubs] of lines) {
    const record = playerRecord(w, id);
    record.lines = [...(record.lines ?? []).filter((line) => line.year !== w.year), ...clubs.values()];
  }
}

/** Snapshot before annual development changes the last season's player; own rows have their own lifetime. */
export function retirePlayerRecord(w: World, p: Player, club?: string): boolean {
  const record = w.playerRecords?.[p.id];
  if (!record?.linked && !w.players.some((own) => own.id === p.id)) {
    if (w.playerRecords) delete w.playerRecords[p.id];
    return false;
  }
  const kept = record ?? playerRecord(w, p.id);
  if (!kept.retired) {
    const profile = structuredClone(p);
    // A free agent extends Player for the pool; the retirement profile is the canonical Player.
    delete (profile as Player & { freeSince?: number }).freeSince;
    kept.retired = { year: w.year, ...(club ? { club } : {}), profile };
  }
  return true;
}

/** T864 may have left unlinked move rows for someone already removed. Never invent his profile. */
export function settleAbsentPlayerRecords(w: World) {
  const live = new Set([
    ...w.players.map((p) => p.id),
    ...Object.values(w.squads ?? {}).flatMap((squad) => squad.map((p) => p.id)),
    ...(w.freeAgents ?? []).map((p) => p.id),
  ]);
  for (const [id, record] of Object.entries(w.playerRecords ?? {}))
    if (!live.has(id) && !record.retired && !record.linked) delete w.playerRecords![id];
}
