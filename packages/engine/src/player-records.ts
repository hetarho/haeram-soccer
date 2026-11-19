/**
 * Season-and-club records and the profiles every retained player link can still open. A record the
 * current season no longer changes may leave memory at a save (→SAVE-32): every read goes through
 * `playerRecordOf`, `hasPlayerRecord` or `lastPlayerMove`, which read its cold row, and every writer
 * through `playerRecord`, which brings it back first.
 */
import { ownMatchesFrom } from './own-matches';
import { archiveSummaries } from './archives';
import { recordStoreOf } from '../../contracts/src/record-store';
import type {
  MatchRecord,
  Player,
  PlayerMove,
  PlayerRecord,
  PlayerSeasonLine,
  World,
} from '../../contracts/src/types';
import { M } from './match/record';

type Records = NonNullable<World['playerRecords']>;
/**
 * Each world's cold player records parsed from its record store, by ID. A cold row is immutable
 * while it is cold, so a parse stands until the record is brought back (`restorePlayerRecord`).
 */
const coldRecords = new WeakMap<World, Map<string, PlayerRecord>>();
/** The cold row of `id` in `w`'s attached store, parsed once; rows memory holds are not read. */
function coldRecord(w: World, id: string): PlayerRecord | undefined {
  const store = recordStoreOf(w);
  if (!store) return undefined;
  let parsed = coldRecords.get(w);
  const hit = parsed?.get(id);
  if (hit) return hit;
  const row = store.get('player_record', id);
  if (!row?.cold) return undefined;
  const record = JSON.parse(row.data) as PlayerRecord;
  if (!parsed) coldRecords.set(w, (parsed = new Map()));
  parsed.set(id, record);
  return record;
}
/**
 * The record of player `id`, wherever the world keeps it: in memory first, else as a cold row of
 * the attached record store (→SAVE-32, →ARCH-36). A read only: change it through `playerRecord`.
 */
export function playerRecordOf(w: World, id: string): PlayerRecord | undefined {
  return w.playerRecords?.[id] ?? coldRecord(w, id);
}
/** Whether the world keeps a record of player `id`, in memory or as a cold row. */
export function hasPlayerRecord(w: World, id: string): boolean {
  if (w.playerRecords?.[id]) return true;
  return !!recordStoreOf(w)?.get('player_record', id)?.cold;
}
/** The last recorded move of player `id`, wherever his record is kept. */
export function lastPlayerMove(w: World, id: string): PlayerMove | undefined {
  return playerRecordOf(w, id)?.moves.at(-1);
}
/**
 * Brings the cold record of `id` back into `w.playerRecords` for a write (→SAVE-32): at the place
 * its stored `seq` gives it among the records memory holds, so every scan reads the records in the
 * order a world that never moved it would. A record already in memory is returned as it is; one the
 * world does not keep returns undefined. It is saved like any current record until it leaves
 * memory again.
 */
export function restorePlayerRecord(w: World, id: string): PlayerRecord | undefined {
  const held = w.playerRecords?.[id];
  if (held) return held;
  const store = recordStoreOf(w);
  const stored = store?.get('player_record', id);
  if (!store || !stored?.cold) return undefined;
  const record = coldRecord(w, id)!;
  coldRecords.get(w)?.delete(id);
  // Memory holds records in stored `seq` order, then those not saved yet, which came after it.
  const records: Records = {};
  let placed = false;
  for (const [key, other] of Object.entries(w.playerRecords ?? {})) {
    if (!placed) {
      const seq = store.get('player_record', key)?.seq;
      if (seq === undefined || seq > stored.seq) {
        records[id] = record;
        placed = true;
      }
    }
    records[key] = other;
  }
  if (!placed) records[id] = record;
  w.playerRecords = records;
  return record;
}
/** The record of player `id` for a write: a cold one is brought back first, a missing one made. */
export function playerRecord(w: World, id: string): PlayerRecord {
  return (
    restorePlayerRecord(w, id) ??
    ((w.playerRecords ??= {})[id] = { moves: [], lines: [], linked: false })
  );
}
/**
 * Whether `record` of player `id` may leave memory at a save (→SAVE-32): his person is not in
 * memory (none, or one without a current role, once `moveColdPeople` has run), no squad, own
 * squad, academy or free-agent pool holds him (`held`: a squad player below coaching grade 4 has
 * no person), and it holds no loan and no move of this season. Every scan of `w.playerRecords`
 * reads only loans or this season's moves, so moving the others out changes no outcome. It also
 * stays while it is neither linked nor retired, the records `settleAbsentPlayerRecords` and
 * `retirePlayerRecord` may still delete.
 */
export function isColdPlayerRecord(
  w: World,
  id: string,
  record: PlayerRecord,
  held: ReadonlySet<string> = heldPlayerIds(w),
  leaving: ReadonlySet<string> = NONE,
): boolean {
  return (
    (!w.people?.[id] || leaving.has(id)) &&
    !held.has(id) &&
    !record.loan &&
    !record.moves.some((move) => move.year === w.year) &&
    (!!record.linked || !!record.retired)
  );
}
/** Everyone a squad, our squad, our academy or the free-agent pool holds now. */
function heldPlayerIds(w: World): Set<string> {
  const ids = heldProfileIds(w);
  for (const p of w.academy?.players ?? []) ids.add(p.id);
  return ids;
}
const NONE: ReadonlySet<string> = new Set();
/**
 * The IDs of the records in memory that may leave it at a save (`isColdPlayerRecord`), with the
 * people `leaving` memory at the same save counted as gone already.
 */
export function coldPlayerRecordIds(w: World, leaving: ReadonlySet<string> = NONE): string[] {
  const held = heldPlayerIds(w);
  return Object.entries(w.playerRecords ?? {})
    .filter(([id, record]) => isColdPlayerRecord(w, id, record, held, leaving))
    .map(([id]) => id);
}
/** Removes `ids` from `w.playerRecords` once their rows are saved cold, keeping the others' order. */
export function releasePlayerRecords(w: World, ids: Iterable<string>) {
  const records = w.playerRecords;
  if (!records) return;
  for (const id of ids) delete records[id];
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

/** Own departed rows remain profiles under the own-career retention rule. */
function heldProfileIds(w: World): Set<string> {
  return new Set([
    ...w.players.map((p) => p.id),
    ...Object.values(w.squads ?? {}).flatMap((players) => players.map((p) => p.id)),
    ...(w.freeAgents ?? []).map((p) => p.id),
  ]);
}

/** Absent-registry writer adoption recovers links only for profiles the legacy world still holds. */
export function restorePlayerLinks(w: World) {
  const available = heldProfileIds(w);
  const restore = (id: string | undefined) => {
    if (id && available.has(id)) linkPlayer(w, id);
  };
  for (const season of w.historyBase ? archiveSummaries(w) : w.history)
    for (const place of season.ballonDor ?? []) restore(place.id);
  for (const match of ownMatchesFrom(w, 0)) {
    for (const line of match.players) if (line.metrics[M.minutes]! > 0) restore(line.id);
    for (const incident of match.incidents ?? []) {
      restore(incident.player);
      restore(incident.other);
    }
  }
  for (const fact of w.transfers?.facts ?? []) restore(fact.player);
  for (const items of Object.values(w.newsJournal?.seasons ?? {}))
    for (const item of items) for (const id of item.players ?? []) restore(id);
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
    record.lines = [
      ...(record.lines ?? []).filter((line) => line.year !== w.year),
      ...clubs.values(),
    ];
  }
}

/** Snapshot before annual development changes the last season's player; own rows have their own lifetime. */
export function retirePlayerRecord(w: World, p: Player, club?: string): boolean {
  // A retiring player is in play, so his record is in memory (`isColdPlayerRecord`); one brought
  // back is linked or retired, so it is never deleted here.
  const record = restorePlayerRecord(w, p.id);
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

/**
 * T864 may have left unlinked move rows for someone already removed. Never invent his profile.
 * Memory holds every record this may delete: a cold one is linked or retired (`isColdPlayerRecord`).
 */
export function settleAbsentPlayerRecords(w: World) {
  const live = heldProfileIds(w);
  for (const [id, record] of Object.entries(w.playerRecords ?? {}))
    if (!live.has(id) && !record.retired && !record.linked) delete w.playerRecords![id];
}
