import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { PLAYER_DETAIL_SIZE, TEAM_DETAIL_SIZE } from '../../../../packages/contracts/src/detail';
import {
  carriesMatchModel,
  isMatchModelRevision,
  type MatchModelRevision,
  type MatchModelState,
  type NpcCompetitionStats,
  type NpcSeasonStats,
} from '../../../../packages/contracts/src/match-model';
import type { Fixture, Position, World } from '../../../../packages/contracts/src/types';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { packBitColumns, rangeBits, readBitColumns, type BitColumns } from './bitpacking';

/**
 * Container-3 match-model streams (→SAVE-23, HIST-17; spec/ssot/SAVE.md): the world's model
 * metadata, its current-season NPC aggregates and each own record's model, beside the compact
 * world. Strings (club, player, competition group, name, position) are refs into the packer's shared
 * dictionary; every scalar is stored exactly, a zero as zero and an absent value as absent.
 */
export interface PackedMatchModel {
  version: 1;
  /** Every revision the streams name, literally and once, so a newer one is refused unread. */
  revisions: string[];
  /** `[revision, activated year, day, revision, tracked year, day, round, coverage]`. */
  state?: number[];
  /** Own records' models as runs `[ref, length, …]`: ref 0 absent, n `revisions[n - 1]`. */
  records?: number[];
  season?: PackedNpcSeason;
}
/** One column of a sparse table: its values, or a 0|1 presence column and the nonzero values. */
export type SparseColumn = [BitColumns] | [BitColumns, BitColumns];
export interface SparseTable {
  rows: number;
  columns: SparseColumn[];
}
export interface PackedNpcSeason {
  /** `[year, revision, tracked year, day, round]`. */
  header: number[];
  /** Per competition `[kind, groupKey, club rows, player rows]`. */
  competitions: SparseTable;
  /** `[club, matches, xg, xga, …metrics(12), …detail(TD)]` per club row, competitions in order. */
  clubs: SparseTable;
  /** `[id, name, position, contribution rows]` per player row, competitions in order. */
  players: SparseTable;
  /** `[club, appearances, starts, …metrics(12), …detail(PD)]` per contribution, players in order. */
  contributions: SparseTable;
  /** Optional presence/value pairs preserve pre-tracking absence. */
  cleanSheets?: [number, number][];
}

const VERSION = 1;
const METRICS = 12;
const STATE_WIDTH = 8;
const HEADER_WIDTH = 5;
const COMPETITION_WIDTH = 4;
const CLUB_WIDTH = 4 + METRICS + TEAM_DETAIL_SIZE;
const PLAYER_WIDTH = 4;
const CONTRIBUTION_WIDTH = 3 + METRICS + PLAYER_DETAIL_SIZE;
/** Bounds of the world schema's NPC season and own records; no stream is larger. */
const MAX_REVISIONS = 16;
const MAX_RECORDS = 100000;
const MAX_COMPETITIONS = 1000;
const MAX_CLUBS = 1000;
const MAX_PLAYERS = 100000;
const MAX_CONTRIBUTIONS = 50;
/** Total rows of one table, the bit-column stream bound. */
const MAX_ROWS = 1_000_000;
/** Stored by position: a code once removed (the amateur league's `lower`, last) shifts none. */
const KINDS: readonly Fixture['kind'][] = ['league', 'cup', 'europe', 'playoff'];
const COVERAGES: readonly MatchModelState['coverage'][] = ['founding', 'activation'];

const corrupt = (detail: string) =>
  new Error(sourceMessage('copy.matchModelPacking.ce010eae47', { p0: detail }));
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** Bits per row `packBitColumns` stores for a column of these values. */
function bitsOf(values: readonly number[]) {
  if (!values.length) return 0;
  let min = values[0],
    max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return rangeBits(max - min);
}
/**
 * Rows of `width` non-negative safe integers, column by column: a mostly-zero column stores a
 * presence bit per row and only its nonzero values when that is smaller than the plain column.
 */
export function packSparseTable(values: readonly number[], width: number): SparseTable {
  const rows = values.length / width;
  if (!Number.isInteger(rows) || rows > MAX_ROWS)
    throw corrupt(sourceMessage('copy.matchModelPacking.8d0e0187ba'));
  const columns = Array.from({ length: width }, (_, column): SparseColumn => {
    const cells = Array.from({ length: rows }, (_, row) => values[row * width + column]);
    if (cells.some((n) => !Number.isSafeInteger(n) || n < 0))
      throw corrupt(sourceMessage('copy.matchModelPacking.bc66548488'));
    const nonzero = cells.filter((n) => n !== 0);
    const dense = rows * bitsOf(cells);
    const sparse = (nonzero.length < rows ? rows : 0) + nonzero.length * bitsOf(nonzero);
    if (sparse >= dense) return [packBitColumns(cells, 1, 'planes')];
    return [
      packBitColumns(
        cells.map((n) => (n === 0 ? 0 : 1)),
        1,
      ),
      packBitColumns(nonzero, 1, 'planes'),
    ];
  });
  return { rows, columns };
}
/** The rows of a sparse table as one row-major array; every stream is read to its end. */
export function readSparseTable(table: unknown, width: number, maxRows = MAX_ROWS): number[] {
  if (
    !isObject(table) ||
    !isCount(table.rows, maxRows) ||
    !Array.isArray(table.columns) ||
    table.columns.length !== width
  )
    throw corrupt(sourceMessage('copy.matchModelPacking.8d0e0187ba'));
  const rows = table.rows;
  const out = Array<number>(rows * width);
  table.columns.forEach((column: unknown, c) => {
    if (!Array.isArray(column) || (column.length !== 1 && column.length !== 2))
      throw corrupt(sourceMessage('copy.matchModelPacking.95f1fc0f2d'));
    const first = readBitColumns(column[0] as BitColumns, 1);
    if ((column[0] as BitColumns).count !== rows)
      throw corrupt(sourceMessage('copy.matchModelPacking.3d18832123'));
    const cells = first.take(rows);
    first.done();
    if (column.length === 2) {
      if (cells.some((n) => n > 1))
        throw corrupt(sourceMessage('copy.matchModelPacking.3b3c384121'));
      const present = cells.filter(Boolean).length;
      if ((column[1] as BitColumns).count !== present)
        throw corrupt(sourceMessage('copy.matchModelPacking.9cfe6b8dc7'));
      const values = readBitColumns(column[1] as BitColumns, 1);
      const nonzero = values.take(present);
      values.done();
      if (nonzero.some((n) => n === 0))
        throw corrupt(sourceMessage('copy.matchModelPacking.7596eb8985'));
      let next = 0;
      cells.forEach((flag, row) => (cells[row] = flag ? nonzero[next++] : 0));
    }
    cells.forEach((value, row) => (out[row * width + c] = value));
  });
  return out;
}

/** Throws unless every key is distinct: a ledger never counts one club, player or scope twice. */
function assertDistinct(keys: readonly string[], what: string) {
  if (new Set(keys).size !== keys.length)
    throw corrupt(sourceMessage('copy.matchModelPacking.2feed9abe5', { p0: what }));
}
/** The aggregate ledger's uniqueness rules, shared by the writer and the reader. */
function assertLedgerKeys(season: NpcSeasonStats) {
  assertDistinct(
    season.competitions.map((c) => `${c.kind}\u0000${c.groupKey}`),
    sourceMessage('copy.matchModelPacking.7255709b1f'),
  );
  for (const competition of season.competitions) {
    assertDistinct(
      competition.clubs.map((c) => c.club),
      sourceMessage('copy.matchModelPacking.6d641f69b7'),
    );
    assertDistinct(
      competition.players.map((p) => p.id),
      sourceMessage('team.column.player'),
    );
    for (const player of competition.players)
      assertDistinct(
        player.clubs.map((c) => c.club),
        sourceMessage('copy.matchModelPacking.1ecc2e7814'),
      );
  }
}
function exactRow(values: readonly number[], width: number, what: string) {
  if (!Array.isArray(values) || values.length !== width)
    throw corrupt(sourceMessage('copy.managerHistoryPacking.bcccd541ad', { p0: what }));
  return values;
}

/**
 * The model streams of `w`, or none for a world without model data (containers 1 and 2). `ref`
 * is the packer's dictionary; the caller removes `matchModel` and `npcSeason` from its world copy.
 */
export function packMatchModel(
  w: Pick<World, 'matchModel' | 'npcSeason' | 'ownMatches'>,
  ref: (value: string) => number,
): PackedMatchModel | undefined {
  if (!carriesMatchModel(w)) return undefined;
  const revisions: string[] = [];
  const revision = (value: MatchModelRevision) => {
    let n = revisions.indexOf(value);
    if (n < 0) n = revisions.push(value) - 1;
    return n;
  };
  const packed: PackedMatchModel = { version: VERSION, revisions };
  if (w.matchModel) {
    const m = w.matchModel;
    packed.state = [
      revision(m.revision),
      m.activated.year,
      m.activated.day,
      m.activated.revision,
      m.trackedFrom.year,
      m.trackedFrom.day,
      m.trackedFrom.round,
      COVERAGES.indexOf(m.coverage),
    ];
  }
  if (w.ownMatches.some((m) => m.model !== undefined)) {
    const runs: number[] = [];
    for (const m of w.ownMatches) {
      const r = m.model === undefined ? 0 : revision(m.model) + 1;
      if (runs.length && runs[runs.length - 2] === r) runs[runs.length - 1]++;
      else runs.push(r, 1);
    }
    packed.records = runs;
  }
  if (w.npcSeason) packed.season = packSeason(w.npcSeason, revision, ref);
  return packed;
}
function packSeason(
  season: NpcSeasonStats,
  revision: (value: MatchModelRevision) => number,
  ref: (value: string) => number,
): PackedNpcSeason {
  assertLedgerKeys(season);
  const competitions: number[] = [],
    clubs: number[] = [],
    players: number[] = [],
    contributions: number[] = [],
    cleanSheets: [number, number][] = [];
  for (const c of season.competitions) {
    const kind = KINDS.indexOf(c.kind);
    if (kind < 0) throw corrupt(sourceMessage('copy.matchModelPacking.5472360f2b'));
    competitions.push(kind, ref(c.groupKey), c.clubs.length, c.players.length);
    for (const club of c.clubs)
      clubs.push(
        ref(club.club),
        club.matches,
        club.xg,
        club.xga,
        ...exactRow(club.metrics, METRICS, sourceMessage('copy.matchModelPacking.c19717224b')),
        ...exactRow(
          club.detail,
          TEAM_DETAIL_SIZE,
          sourceMessage('copy.matchModelPacking.47b07fca58'),
        ),
      );
    for (const player of c.players) {
      players.push(ref(player.id), ref(player.name), ref(player.position), player.clubs.length);
      for (const share of player.clubs) {
        if (share.cleanSheets !== undefined) cleanSheets.push([contributions.length / CONTRIBUTION_WIDTH, share.cleanSheets]);
        contributions.push(
          ref(share.club),
          share.appearances,
          share.starts,
          ...exactRow(share.metrics, METRICS, sourceMessage('copy.matchModelPacking.3ca967cecc')),
          ...exactRow(
            share.detail,
            PLAYER_DETAIL_SIZE,
            sourceMessage('copy.matchModelPacking.91b477874c'),
          ),
        );
      }
    }
  }
  return {
    ...(cleanSheets.length ? { cleanSheets } : {}),
    header: [
      season.year,
      revision(season.model),
      season.trackedFrom.year,
      season.trackedFrom.day,
      season.trackedFrom.round,
    ],
    competitions: packSparseTable(competitions, COMPETITION_WIDTH),
    clubs: packSparseTable(clubs, CLUB_WIDTH),
    players: packSparseTable(players, PLAYER_WIDTH),
    contributions: packSparseTable(contributions, CONTRIBUTION_WIDTH),
  };
}

/**
 * Bounded preflight of a compact payload's model section, before anything is unpacked: a newer
 * section version or an unknown revision is a compatibility failure (→SAVE-11), anything else
 * malformed in the header or revision table is corruption. Returns the revision table.
 */
export function readMatchModelFormat(section: unknown): MatchModelRevision[] {
  if (!isObject(section)) throw corrupt(sourceMessage('copy.identityPacking.d1a42ea591'));
  const { version, revisions } = section;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > VERSION)
    throw new SaveCompatibilityError(sourceMessage('copy.matchModelPacking.9e11622b4f'));
  if (version !== VERSION) throw corrupt(sourceMessage('copy.identityPacking.002f73c32e'));
  if (!Array.isArray(revisions) || revisions.length < 1 || revisions.length > MAX_REVISIONS)
    throw corrupt(sourceMessage('copy.matchModelPacking.b461aeb630'));
  for (const value of revisions) {
    if (typeof value !== 'string')
      throw corrupt(sourceMessage('copy.matchModelPacking.b461aeb630'));
    if (!isMatchModelRevision(value))
      throw new SaveCompatibilityError(sourceMessage('copy.matchModelPacking.248f2751b7'));
  }
  assertDistinct(revisions as string[], sourceMessage('copy.matchModelPacking.f9f4d4113a'));
  return revisions as MatchModelRevision[];
}

export interface UnpackedMatchModel {
  matchModel?: MatchModelState;
  npcSeason?: NpcSeasonStats;
  /** Per own record in order: its model, or undefined for none. */
  records: (MatchModelRevision | undefined)[];
}
/**
 * The world fields and record models of a model section. Every dimension, ref, run and stream is
 * checked and read to its end; the revision table must be used entirely, so a section has exactly
 * one encoding. Ranges of the rebuilt values stay with the world schema.
 */
export function unpackMatchModel(
  section: unknown,
  str: (n: number) => string,
  recordCount: number,
): UnpackedMatchModel {
  const revisions = readMatchModelFormat(section);
  const p = section as unknown as PackedMatchModel;
  const used = new Set<number>();
  const revision = (n: number) => {
    if (!isCount(n, revisions.length - 1))
      throw corrupt(sourceMessage('copy.matchModelPacking.5319918337'));
    used.add(n);
    return revisions[n];
  };
  const out: UnpackedMatchModel = { records: [] };
  if (p.state !== undefined) {
    const s = p.state;
    if (
      !Array.isArray(s) ||
      s.length !== STATE_WIDTH ||
      !s.every((n) => isCount(n, Number.MAX_SAFE_INTEGER))
    )
      throw corrupt(sourceMessage('copy.matchModelPacking.f2e2e18951'));
    const coverage = COVERAGES[s[7]];
    if (!coverage) throw corrupt(sourceMessage('copy.managerHistoryPacking.c6e7a8f342'));
    out.matchModel = {
      revision: revision(s[0]),
      activated: { year: s[1], day: s[2], revision: s[3] },
      trackedFrom: { year: s[4], day: s[5], round: s[6] },
      coverage,
    };
  }
  if (p.records !== undefined) {
    const runs = p.records;
    if (!Array.isArray(runs) || runs.length % 2 || runs.length > 2 * MAX_RECORDS)
      throw corrupt(sourceMessage('copy.matchModelPacking.513f5dfd2a'));
    for (let i = 0; i < runs.length; i += 2) {
      const [r, length] = [runs[i], runs[i + 1]];
      if (
        !isCount(r, revisions.length) ||
        !isCount(length, MAX_RECORDS) ||
        length < 1 ||
        (i && runs[i - 2] === r) ||
        out.records.length + length > recordCount
      )
        throw corrupt(sourceMessage('copy.matchModelPacking.513f5dfd2a'));
      const model = r === 0 ? undefined : revision(r - 1);
      for (let n = 0; n < length; n++) out.records.push(model);
    }
    if (out.records.length !== recordCount || out.records.every((m) => m === undefined))
      throw corrupt(sourceMessage('copy.matchModelPacking.513f5dfd2a'));
  } else out.records = Array<undefined>(recordCount).fill(undefined);
  if (p.season !== undefined) out.npcSeason = unpackSeason(p.season, revision, str);
  // A section without data names no model, so this also refuses an empty one.
  if (used.size !== revisions.length)
    throw corrupt(sourceMessage('copy.matchModelPacking.448ba1ac6f'));
  return out;
}
function unpackSeason(
  season: unknown,
  revision: (n: number) => MatchModelRevision,
  str: (n: number) => string,
): NpcSeasonStats {
  if (!isObject(season)) throw corrupt(sourceMessage('copy.matchModelPacking.41eb0fa63e'));
  const header = season.header;
  if (
    !Array.isArray(header) ||
    header.length !== HEADER_WIDTH ||
    !header.every((n) => isCount(n, Number.MAX_SAFE_INTEGER))
  )
    throw corrupt(sourceMessage('copy.matchModelPacking.0bb66e687c'));
  // Each table is bounded by the rows the one before it declares, so a crafted count is refused
  // before its rows are allocated.
  const competitionRows = readSparseTable(season.competitions, COMPETITION_WIDTH, MAX_COMPETITIONS);
  let clubTotal = 0,
    playerTotal = 0,
    contributionTotal = 0;
  for (let at = 0; at < competitionRows.length; at += COMPETITION_WIDTH) {
    const [, , clubCount, playerCount] = competitionRows.slice(at, at + COMPETITION_WIDTH);
    if (clubCount > MAX_CLUBS || playerCount > MAX_PLAYERS)
      throw corrupt(sourceMessage('copy.matchModelPacking.9b23012615'));
    clubTotal += clubCount;
    playerTotal += playerCount;
  }
  const clubRows = readSparseTable(season.clubs, CLUB_WIDTH, Math.min(clubTotal, MAX_ROWS));
  const playerRows = readSparseTable(season.players, PLAYER_WIDTH, Math.min(playerTotal, MAX_ROWS));
  // A player row ends with the number of clubs he played for.
  for (let at = PLAYER_WIDTH - 1; at < playerRows.length; at += PLAYER_WIDTH) {
    if (playerRows[at] < 1 || playerRows[at] > MAX_CONTRIBUTIONS)
      throw corrupt(sourceMessage('copy.matchModelPacking.29a64c5766'));
    contributionTotal += playerRows[at];
  }
  const contributionRows = readSparseTable(
    season.contributions,
    CONTRIBUTION_WIDTH,
    Math.min(contributionTotal, MAX_ROWS),
  );
  const cleanSheets = new Map<number, number>();
  if (season.cleanSheets !== undefined) {
    if (!Array.isArray(season.cleanSheets) || season.cleanSheets.length > contributionTotal) throw corrupt(sourceMessage('copy.packing.5ccd8ed532'));
    for (const row of season.cleanSheets) {
      if (!Array.isArray(row) || row.length !== 2 || !isCount(row[0], contributionTotal - 1) ||
        !isCount(row[1], 1000) || cleanSheets.has(row[0])) throw corrupt(sourceMessage('copy.packing.5ccd8ed532'));
      cleanSheets.set(row[0], row[1]);
    }
  }
  let club = 0,
    player = 0,
    contribution = 0;
  const row = (rows: number[], width: number, index: number, what: string) => {
    if ((index + 1) * width > rows.length)
      throw corrupt(sourceMessage('copy.matchModelPacking.588faabe8c', { p0: what }));
    return rows.slice(index * width, (index + 1) * width);
  };
  const competitions: NpcCompetitionStats[] = [];
  for (let c = 0; c * COMPETITION_WIDTH < competitionRows.length; c++) {
    const [kindIndex, groupKey, clubCount, playerCount] = row(
      competitionRows,
      COMPETITION_WIDTH,
      c,
      sourceMessage('copy.matchModelPacking.7255709b1f'),
    );
    const kind = KINDS[kindIndex];
    if (!kind) throw corrupt(sourceMessage('copy.matchModelPacking.5472360f2b'));
    competitions.push({
      kind,
      groupKey: str(groupKey),
      clubs: Array.from({ length: clubCount }, () => {
        const r = row(
          clubRows,
          CLUB_WIDTH,
          club++,
          sourceMessage('copy.matchModelPacking.6d641f69b7'),
        );
        return {
          club: str(r[0]),
          matches: r[1],
          metrics: r.slice(4, 4 + METRICS),
          detail: r.slice(4 + METRICS),
          xg: r[2],
          xga: r[3],
        };
      }),
      players: Array.from({ length: playerCount }, () => {
        const [id, name, position, shares] = row(
          playerRows,
          PLAYER_WIDTH,
          player++,
          sourceMessage('team.column.player'),
        );
        return {
          id: str(id),
          name: str(name),
          position: str(position) as Position,
          clubs: Array.from({ length: shares }, () => {
            const r = row(
              contributionRows,
              CONTRIBUTION_WIDTH,
              contribution++,
              sourceMessage('copy.matchModelPacking.1ecc2e7814'),
            );
            return {
              club: str(r[0]),
              appearances: r[1],
              starts: r[2],
              ...(cleanSheets.has(contribution - 1) ? { cleanSheets: cleanSheets.get(contribution - 1)! } : {}),
              metrics: r.slice(3, 3 + METRICS),
              detail: r.slice(3 + METRICS),
            };
          }),
        };
      }),
    });
  }
  if (
    club * CLUB_WIDTH !== clubRows.length ||
    player * PLAYER_WIDTH !== playerRows.length ||
    contribution * CONTRIBUTION_WIDTH !== contributionRows.length
  )
    throw corrupt(sourceMessage('copy.matchModelPacking.d4cd094752'));
  const out: NpcSeasonStats = {
    year: header[0],
    model: revision(header[1]),
    trackedFrom: { year: header[2], day: header[3], round: header[4] },
    competitions,
  };
  assertLedgerKeys(out);
  return out;
}
