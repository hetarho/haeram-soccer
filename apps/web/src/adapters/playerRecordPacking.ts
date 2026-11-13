import { packSquads, unpackSquads, type PackedSquads } from './squadPacking';
import type { Player, PlayerMove, World } from '../../../../packages/contracts/src/types';
import { message } from '../../../../packages/contracts/src/messages';

type Records = NonNullable<World['playerRecords']>;
type LineRow = [number, number, number, number, number, number | null, number | null];
type MoveRow = [number, number, number, number, string, (0 | 1)?];
export interface PackedPlayerRecords {
  version: 1;
  ids: string[];
  clubs: string[];
  counts: number[];
  moves: MoveRow[];
  lines?: [number, LineRow[]][];
  linked?: [number, 0 | 1][];
  retirees?: { rows: [number, number, number | null][]; profiles: PackedSquads };
  loans: [number, number, number, string, number, number, 1 | null, number | null][];
}
const invalid = () => new Error(message('copy.packing.5ccd8ed532'));

/** Club references are shared; fees stay decimal strings, including above Number's exact range. */
export function packPlayerRecords(records: Records): PackedPlayerRecords {
  const ids = Object.keys(records), clubs: string[] = [], index = new Map<string, number>();
  const club = (id: string) => {
    let at = index.get(id);
    if (at === undefined) {
      at = clubs.length;
      clubs.push(id);
      index.set(id, at);
    }
    return at;
  };
  const lines: NonNullable<PackedPlayerRecords['lines']> = [],
    linked: NonNullable<PackedPlayerRecords['linked']> = [],
    rows: NonNullable<PackedPlayerRecords['retirees']>['rows'] = [],
    profiles: Player[] = [];
  for (const [i, id] of ids.entries()) {
    const record = records[id]!;
    if (record.lines !== undefined) lines.push([i, record.lines.map((line): LineRow => [
      line.year, club(line.club), line.appearances, line.goals, line.assists,
      line.saves ?? null, line.cleanSheets ?? null,
    ])]);
    if (record.linked !== undefined) linked.push([i, record.linked ? 1 : 0]);
    if (record.retired) {
      rows.push([i, record.retired.year, record.retired.club === undefined ? null : club(record.retired.club)]);
      profiles.push(record.retired.profile);
    }
  }
  return {
    ...(lines.length ? { lines } : {}),
    ...(linked.length ? { linked } : {}),
    ...(rows.length ? { retirees: { rows, profiles: packSquads({ retired: profiles }) } } : {}),
    version: 1,
    ids,
    clubs,
    counts: ids.map((id) => records[id]!.moves.length),
    moves: ids.flatMap((id) => records[id]!.moves.map((m): MoveRow => {
      const row: MoveRow = [m.year, m.day, club(m.from), club(m.to), m.fee];
      if (m.loan !== undefined) row[5] = m.loan ? 1 : 0;
      return row;
    })),
    loans: ids.flatMap((id, i) => {
      const loan = records[id]!.loan;
      return loan ? [[i, club(loan.club), loan.until, loan.wage, loan.contractUntil, loan.year,
        loan.graduate ? 1 : null, loan.joined ?? null]] as PackedPlayerRecords['loans'] : [];
    }),
  };
}

export function unpackPlayerRecords(p: PackedPlayerRecords): Records {
  if (!p || p.version !== 1 || !Array.isArray(p.ids) || !Array.isArray(p.clubs) ||
    !Array.isArray(p.counts) || !Array.isArray(p.moves) || !Array.isArray(p.loans) ||
    p.ids.length > 1_000_000 || p.moves.length > 10_000_000 || p.loans.length > p.ids.length ||
    p.ids.length !== p.counts.length ||
    [p.ids, p.clubs].some((ids) => new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !id.length)) ||
    p.counts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    p.counts.reduce((a, b) => a + b, 0) !== p.moves.length) throw invalid();
  const club = (at: number) => {
    if (!Number.isSafeInteger(at) || at < 0 || at >= p.clubs.length) throw invalid();
    return p.clubs[at]!;
  };
  const integer = (n: number, low: number, high: number) => Number.isSafeInteger(n) && n >= low && n <= high;
  const money = (n: string) => typeof n === 'string' && /^\d{1,80}$/.test(n);
  let cursor = 0;
  const records: Records = Object.fromEntries(p.ids.map((id, i) => [id, {
    moves: p.moves.slice(cursor, cursor += p.counts[i]!).map((row): PlayerMove => {
      if (!Array.isArray(row) || row.length < 5 || row.length > 6 || !integer(row[0], 1901, 4000) ||
        !integer(row[1], 0, 365) || !money(row[4]) ||
        (row.length === 6 && row[5] !== 0 && row[5] !== 1)) throw invalid();
      return { year: row[0], day: row[1], from: club(row[2]), to: club(row[3]), fee: row[4],
        ...(row.length === 6 ? { loan: row[5] === 1 } : {}) };
    }),
  }]));
  const seen = new Set<number>();
  for (const row of p.loans) {
    if (!Array.isArray(row) || row.length !== 8 || !integer(row[0], 0, p.ids.length - 1) ||
      seen.has(row[0]) || !integer(row[2], 1901, 4000) || !money(row[3]) ||
      !integer(row[4], 1901, 4000) || !integer(row[5], 1901, 4000) ||
      (row[6] !== 1 && row[6] !== null) || (row[7] !== null && !integer(row[7], 1901, 4000))) throw invalid();
    seen.add(row[0]);
    records[p.ids[row[0]]!]!.loan = {
      club: club(row[1]), until: row[2], wage: row[3], contractUntil: row[4], year: row[5],
      ...(row[6] === 1 ? { graduate: true as const } : {}),
      ...(row[7] === null ? {} : { joined: row[7] }),
    };
  }
  const indexes = (rows: unknown): [number, unknown][] => {
    if (!Array.isArray(rows) || rows.length > p.ids.length) throw invalid();
    const seen = new Set<number>();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || !integer(row[0], 0, p.ids.length - 1) || seen.has(row[0])) throw invalid();
      seen.add(row[0]);
    }
    return rows;
  };
  if (p.lines !== undefined) for (const [i, value] of indexes(p.lines)) {
    if (!Array.isArray(value) || value.length > 100000) throw invalid();
    records[p.ids[i]!]!.lines = value.map((row: LineRow) => {
      if (!Array.isArray(row) || row.length !== 7 || !integer(row[0], 1901, 4000) ||
        !integer(row[2], 1, 10000) || !integer(row[3], 0, Number.MAX_SAFE_INTEGER) ||
        !integer(row[4], 0, Number.MAX_SAFE_INTEGER) ||
        (row[5] !== null && !integer(row[5], 0, Number.MAX_SAFE_INTEGER)) ||
        (row[6] !== null && !integer(row[6], 0, row[2]))) throw invalid();
      return { year: row[0], club: club(row[1]), appearances: row[2], goals: row[3], assists: row[4],
        ...(row[5] === null ? {} : { saves: row[5] }),
        ...(row[6] === null ? {} : { cleanSheets: row[6] }) };
    });
  }
  if (p.linked !== undefined) for (const [i, value] of indexes(p.linked)) {
    if (value !== 0 && value !== 1) throw invalid();
    records[p.ids[i]!]!.linked = value === 1;
  }
  if (p.retirees !== undefined) {
    if (!p.retirees || !Array.isArray(p.retirees.rows) || p.retirees.rows.length > p.ids.length) throw invalid();
    const profiles = unpackSquads(p.retirees.profiles);
    if (Object.keys(profiles).length !== 1 || !profiles.retired || profiles.retired.length !== p.retirees.rows.length) throw invalid();
    const seen = new Set<number>();
    p.retirees.rows.forEach((row, at) => {
      if (!Array.isArray(row) || row.length !== 3 || !integer(row[0], 0, p.ids.length - 1) ||
        seen.has(row[0]) || !integer(row[1], 1901, 4000)) throw invalid();
      seen.add(row[0]);
      const profile = profiles.retired![at]!;
      if (profile.id !== p.ids[row[0]]) throw invalid();
      records[profile.id]!.retired = { year: row[1], ...(row[2] === null ? {} : { club: club(row[2]) }), profile };
    });
  }
  return records;
}
