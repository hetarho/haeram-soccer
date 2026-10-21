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
import { packBitColumns, readBitColumns, type BitColumns } from './bitpacking';

/**
 * Container-3 match-model streams (→SAVE-23, HIST-17; docs/SAVE-FORMAT.md): the world's model
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
  /** `[club, appearances, …metrics(12), …detail(PD)]` per contribution, players in order. */
  contributions: SparseTable;
}

const VERSION = 1;
const METRICS = 12;
const STATE_WIDTH = 8;
const HEADER_WIDTH = 5;
const COMPETITION_WIDTH = 4;
const CLUB_WIDTH = 4 + METRICS + TEAM_DETAIL_SIZE;
const PLAYER_WIDTH = 4;
const CONTRIBUTION_WIDTH = 2 + METRICS + PLAYER_DETAIL_SIZE;
/** Bounds of the world schema's NPC season and own records; no stream is larger. */
const MAX_REVISIONS = 16;
const MAX_RECORDS = 100000;
const MAX_COMPETITIONS = 1000;
const MAX_CLUBS = 1000;
const MAX_PLAYERS = 100000;
const MAX_CONTRIBUTIONS = 50;
/** Total rows of one table, the bit-column stream bound. */
const MAX_ROWS = 1_000_000;
const KINDS: readonly Fixture['kind'][] = ['league', 'cup', 'europe', 'playoff', 'lower'];
const COVERAGES: readonly MatchModelState['coverage'][] = ['founding', 'activation'];

const corrupt = (detail: string) => new Error(`경기 모델 압축 데이터 손상: ${detail}`);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** Bits of `max - min`, as `packBitColumns` stores a column. */
function bitsOf(values: readonly number[]) {
  if (!values.length) return 0;
  let min = values[0],
    max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  let bits = 0;
  for (let range = max - min; range > 0; range = Math.floor(range / 2)) bits++;
  return bits;
}
/**
 * Rows of `width` non-negative safe integers, column by column: a mostly-zero column stores a
 * presence bit per row and only its nonzero values when that is smaller than the plain column.
 */
export function packSparseTable(values: readonly number[], width: number): SparseTable {
  const rows = values.length / width;
  if (!Number.isInteger(rows) || rows > MAX_ROWS) throw corrupt('표 차원');
  const columns = Array.from({ length: width }, (_, column): SparseColumn => {
    const cells = Array.from({ length: rows }, (_, row) => values[row * width + column]);
    if (cells.some((n) => !Number.isSafeInteger(n) || n < 0)) throw corrupt('정수가 아닌 값');
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
    throw corrupt('표 차원');
  const rows = table.rows;
  const out = Array<number>(rows * width);
  table.columns.forEach((column: unknown, c) => {
    if (!Array.isArray(column) || (column.length !== 1 && column.length !== 2))
      throw corrupt('열 형식');
    const first = readBitColumns(column[0] as BitColumns, 1);
    if ((column[0] as BitColumns).count !== rows) throw corrupt('열 길이');
    const cells = first.take(rows);
    first.done();
    if (column.length === 2) {
      if (cells.some((n) => n > 1)) throw corrupt('존재 표시');
      const present = cells.filter(Boolean).length;
      if ((column[1] as BitColumns).count !== present) throw corrupt('값 개수');
      const values = readBitColumns(column[1] as BitColumns, 1);
      const nonzero = values.take(present);
      values.done();
      if (nonzero.some((n) => n === 0)) throw corrupt('존재하는 0');
      let next = 0;
      cells.forEach((flag, row) => (cells[row] = flag ? nonzero[next++] : 0));
    }
    cells.forEach((value, row) => (out[row * width + c] = value));
  });
  return out;
}

/** Throws unless every key is distinct: a ledger never counts one club, player or scope twice. */
function assertDistinct(keys: readonly string[], what: string) {
  if (new Set(keys).size !== keys.length) throw corrupt(`중복 ${what}`);
}
/** The aggregate ledger's uniqueness rules, shared by the writer and the reader. */
function assertLedgerKeys(season: NpcSeasonStats) {
  assertDistinct(
    season.competitions.map((c) => `${c.kind}\u0000${c.groupKey}`),
    '대회',
  );
  for (const competition of season.competitions) {
    assertDistinct(
      competition.clubs.map((c) => c.club),
      '클럽',
    );
    assertDistinct(
      competition.players.map((p) => p.id),
      '선수',
    );
    for (const player of competition.players)
      assertDistinct(
        player.clubs.map((c) => c.club),
        '소속 기여',
      );
  }
}
function exactRow(values: readonly number[], width: number, what: string) {
  if (!Array.isArray(values) || values.length !== width) throw corrupt(`${what} 차원`);
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
    contributions: number[] = [];
  for (const c of season.competitions) {
    const kind = KINDS.indexOf(c.kind);
    if (kind < 0) throw corrupt('대회 종류');
    competitions.push(kind, ref(c.groupKey), c.clubs.length, c.players.length);
    for (const club of c.clubs)
      clubs.push(
        ref(club.club),
        club.matches,
        club.xg,
        club.xga,
        ...exactRow(club.metrics, METRICS, '클럽 지표'),
        ...exactRow(club.detail, TEAM_DETAIL_SIZE, '클럽 고급 지표'),
      );
    for (const player of c.players) {
      players.push(ref(player.id), ref(player.name), ref(player.position), player.clubs.length);
      for (const share of player.clubs)
        contributions.push(
          ref(share.club),
          share.appearances,
          ...exactRow(share.metrics, METRICS, '선수 지표'),
          ...exactRow(share.detail, PLAYER_DETAIL_SIZE, '선수 고급 지표'),
        );
    }
  }
  return {
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
  if (!isObject(section)) throw corrupt('형식');
  const { version, revisions } = section;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > VERSION)
    throw new SaveCompatibilityError(
      '이 저장은 더 새로운 경기 모델 형식으로 기록되었습니다. 원본 파일을 내보내 보관하세요.',
    );
  if (version !== VERSION) throw corrupt('버전');
  if (!Array.isArray(revisions) || revisions.length < 1 || revisions.length > MAX_REVISIONS)
    throw corrupt('모델 목록');
  for (const value of revisions) {
    if (typeof value !== 'string') throw corrupt('모델 목록');
    if (!isMatchModelRevision(value))
      throw new SaveCompatibilityError(
        '이 저장은 더 새로운 경기 모델로 기록되었습니다. 원본 파일을 내보내 보관하세요.',
      );
  }
  assertDistinct(revisions as string[], '모델');
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
    if (!isCount(n, revisions.length - 1)) throw corrupt('모델 참조');
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
      throw corrupt('모델 상태');
    const coverage = COVERAGES[s[7]];
    if (!coverage) throw corrupt('관측 범위');
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
      throw corrupt('기록 모델 구간');
    for (let i = 0; i < runs.length; i += 2) {
      const [r, length] = [runs[i], runs[i + 1]];
      if (
        !isCount(r, revisions.length) ||
        !isCount(length, MAX_RECORDS) ||
        length < 1 ||
        (i && runs[i - 2] === r) ||
        out.records.length + length > recordCount
      )
        throw corrupt('기록 모델 구간');
      const model = r === 0 ? undefined : revision(r - 1);
      for (let n = 0; n < length; n++) out.records.push(model);
    }
    if (out.records.length !== recordCount || out.records.every((m) => m === undefined))
      throw corrupt('기록 모델 구간');
  } else out.records = Array<undefined>(recordCount).fill(undefined);
  if (p.season !== undefined) out.npcSeason = unpackSeason(p.season, revision, str);
  // A section without data names no model, so this also refuses an empty one.
  if (used.size !== revisions.length) throw corrupt('사용되지 않은 모델');
  return out;
}
function unpackSeason(
  season: unknown,
  revision: (n: number) => MatchModelRevision,
  str: (n: number) => string,
): NpcSeasonStats {
  if (!isObject(season)) throw corrupt('시즌 집계 형식');
  const header = season.header;
  if (
    !Array.isArray(header) ||
    header.length !== HEADER_WIDTH ||
    !header.every((n) => isCount(n, Number.MAX_SAFE_INTEGER))
  )
    throw corrupt('시즌 집계 머리');
  const competitionRows = readSparseTable(season.competitions, COMPETITION_WIDTH, MAX_COMPETITIONS);
  const clubRows = readSparseTable(season.clubs, CLUB_WIDTH);
  const playerRows = readSparseTable(season.players, PLAYER_WIDTH);
  const contributionRows = readSparseTable(season.contributions, CONTRIBUTION_WIDTH);
  let club = 0,
    player = 0,
    contribution = 0;
  const row = (rows: number[], width: number, index: number, what: string) => {
    if ((index + 1) * width > rows.length) throw corrupt(`${what} 행 부족`);
    return rows.slice(index * width, (index + 1) * width);
  };
  const competitions: NpcCompetitionStats[] = [];
  for (let c = 0; c * COMPETITION_WIDTH < competitionRows.length; c++) {
    const [kindIndex, groupKey, clubCount, playerCount] = row(
      competitionRows,
      COMPETITION_WIDTH,
      c,
      '대회',
    );
    const kind = KINDS[kindIndex];
    if (!kind || clubCount > MAX_CLUBS || playerCount > MAX_PLAYERS) throw corrupt('대회 차원');
    competitions.push({
      kind,
      groupKey: str(groupKey),
      clubs: Array.from({ length: clubCount }, () => {
        const r = row(clubRows, CLUB_WIDTH, club++, '클럽');
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
        const [id, name, position, shares] = row(playerRows, PLAYER_WIDTH, player++, '선수');
        if (shares < 1 || shares > MAX_CONTRIBUTIONS) throw corrupt('소속 기여 차원');
        return {
          id: str(id),
          name: str(name),
          position: str(position) as Position,
          clubs: Array.from({ length: shares }, () => {
            const r = row(contributionRows, CONTRIBUTION_WIDTH, contribution++, '소속 기여');
            return {
              club: str(r[0]),
              appearances: r[1],
              metrics: r.slice(2, 2 + METRICS),
              detail: r.slice(2 + METRICS),
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
    throw corrupt('잔여 행');
  const out: NpcSeasonStats = {
    year: header[0],
    model: revision(header[1]),
    trackedFrom: { year: header[2], day: header[3], round: header[4] },
    competitions,
  };
  assertLedgerKeys(out);
  return out;
}
