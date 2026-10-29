import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonical, validateWorld } from '../../../../packages/contracts/src/index';
import { LOAD_CATALOG } from '../../../../packages/catalogs/src/index';
import { PLAYER_DETAIL_SIZE, TEAM_DETAIL_SIZE } from '../../../../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type MatchModelState,
  type NpcSeasonStats,
} from '../../../../packages/contracts/src/match-model';
import type { Founding, World } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { packBitColumns } from './bitpacking';
import { pack, unpack } from './packing';
import {
  packMatchModel,
  packSparseTable,
  readMatchModelFormat,
  readSparseTable,
  unpackMatchModel,
  type PackedMatchModel,
  type SparseColumn,
  type SparseTable,
} from './matchModelPacking';

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Ledger Rovers',
  color: '#2a4f7a',
  seed: 'full-model-ledger',
  level: 'normal',
};
/**
 * Two unobserved rounds into the founded career, played before the full model (release off) so its
 * model data is only what a case adds; a fresh copy per call.
 */
const career = () => simulatedWorld(FOUNDING, { rounds: 2 }, DISABLED_RELEASE);
const state = (w: World): MatchModelState => ({
  revision: MATCH_MODEL_REVISION,
  activated: { year: w.year, day: 9, revision: w.revision },
  trackedFrom: { year: w.year, day: 10, round: 2 },
  coverage: 'activation',
});
/** A small deterministic stream: mostly zeros with occasional large counters, as sparse data is. */
function counters(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s % 5 ? 0 : s % 4000;
  };
}
/**
 * Synthetic current-season aggregates over the world's real competition scopes and clubs: named
 * players under stable IDs, one transferred between two clubs, one departed (in no roster) and one
 * scope with no rows yet. Values are synthetic, not settled football.
 */
function npcSeason(w: World): NpcSeasonStats {
  const next = counters(17);
  const row = (width: number) => Array.from({ length: width }, next);
  const scopes = new Map<string, { kind: World['fixtures'][number]['kind']; groupKey: string }>();
  for (const f of w.fixtures) scopes.set(`${f.kind}:${f.groupKey}`, f);
  const [league, ...others] = [...scopes.values()];
  const clubs = [
    ...new Set(w.fixtures.filter((f) => f.groupKey === league.groupKey).map((f) => f.home)),
  ];
  const position = (i: number) => w.players[i % w.players.length].position;
  return {
    year: w.year,
    model: MATCH_MODEL_REVISION,
    trackedFrom: { year: w.year, day: 10, round: 2 },
    competitions: [
      {
        kind: league.kind,
        groupKey: league.groupKey,
        clubs: clubs.map((club, i) => ({
          club,
          matches: i % 3,
          metrics: row(12),
          detail: row(TEAM_DETAIL_SIZE),
          xg: next(),
          xga: next(),
        })),
        players: [
          ...clubs.slice(0, 6).map((club, i) => ({
            id: `${club}:npc:${i}`,
            name: `Synthetic Player ${i}`,
            position: position(i),
            clubs: [
              {
                club,
                appearances: 2,
                // A real zero (two substitute appearances) beside starters.
                starts: i % 3,
                metrics: row(12),
                detail: row(PLAYER_DETAIL_SIZE),
              },
            ],
          })),
          {
            id: 'ENG:transferred:1',
            name: 'Moved Midseason',
            position: position(7),
            clubs: [clubs[1], clubs[0]].map((club, i) => ({
              club,
              appearances: 1 + i,
              starts: i,
              metrics: row(12),
              detail: row(PLAYER_DETAIL_SIZE),
            })),
          },
          {
            id: 'ENG:departed:1',
            name: 'Retired Since',
            position: position(8),
            clubs: [
              {
                club: clubs[2],
                appearances: 1,
                starts: 1,
                metrics: row(12),
                detail: row(PLAYER_DETAIL_SIZE),
              },
            ],
          },
        ],
      },
      ...others
        .slice(0, 1)
        .map(({ kind, groupKey }) => ({ kind, groupKey, clubs: [], players: [] })),
    ],
  };
}
/** A world carrying every kind of model data: metadata, NPC aggregates and a full record. */
function modelWorld() {
  const w = career();
  w.matchModel = state(w);
  w.npcSeason = npcSeason(w);
  w.ownMatches[w.ownMatches.length - 1].model = MATCH_MODEL_REVISION;
  return w;
}
const roundTrip = (w: World) => unpack(JSON.parse(JSON.stringify(pack(w))));
const sectionOf = (w: World) => structuredClone(pack(w).model!) as PackedMatchModel;
const dict = (w: World) => pack(w).dict;
const reader = (strings: string[]) => (n: number) => {
  if (typeof strings[n] !== 'string') throw new Error('사전 참조 손상');
  return strings[n];
};

describe('container-3 match-model streams (→SAVE-23, HIST-17)', () => {
  it('round trips full aggregate and coverage metadata exactly', () => {
    const w = modelWorld();
    const packed = pack(w);
    expect(packed.model).toBeDefined();
    // Model data lives only in its streams, never inline in the compact world.
    expect(packed.world).not.toHaveProperty('matchModel', expect.anything());
    expect(packed.world).not.toHaveProperty('npcSeason', expect.anything());
    const restored = roundTrip(w);
    expect(canonical(restored)).toBe(canonical(w));
    expect(restored.matchModel).toEqual(w.matchModel);
    // Order of competitions, clubs, players and contributions is the original one.
    expect(restored.npcSeason).toStrictEqual(w.npcSeason);
    expect(restored.ownMatches.map((m) => m.model)).toEqual(w.ownMatches.map((m) => m.model));
    // The rebuilt world passes the world schema as a load would.
    expect(canonical(validateWorld(restored, LOAD_CATALOG))).toBe(canonical(w));
    // Packing is deterministic: the round-tripped world packs to the same bytes.
    expect(canonical(pack(restored))).toBe(canonical(pack(w)));
  });

  it('distinguishes missing from zero', () => {
    const w = modelWorld();
    const zero = w.npcSeason!.competitions[0];
    zero.clubs[0] = {
      ...zero.clubs[0],
      matches: 0,
      xg: 0,
      xga: 0,
      metrics: Array<number>(12).fill(0),
      detail: Array<number>(TEAM_DETAIL_SIZE).fill(0),
    };
    zero.players[0].clubs[0].detail = Array<number>(PLAYER_DETAIL_SIZE).fill(0);
    const restored = roundTrip(w);
    expect(restored.npcSeason!.competitions[0].clubs[0]).toEqual(zero.clubs[0]);
    expect(restored.npcSeason!.competitions[0].players[0].clubs[0].detail).toEqual(
      zero.players[0].clubs[0].detail,
    );
    // An empty scope stays an empty scope, not a missing one.
    expect(restored.npcSeason!.competitions.at(-1)).toEqual(w.npcSeason!.competitions.at(-1));
    // Older records keep no model; only the full record names one.
    const models = restored.ownMatches.map((m) => ('model' in m ? m.model : 'absent'));
    expect(models.slice(0, -1).every((m) => m === 'absent')).toBe(true);
    expect(models.at(-1)).toBe(MATCH_MODEL_REVISION);
    // Each kind of model data alone keeps the others absent.
    const base = career();
    for (const only of [
      { matchModel: state(base) },
      { npcSeason: npcSeason(base) },
      {
        ownMatches: base.ownMatches.map((m, i) => (i ? { ...m, model: MATCH_MODEL_REVISION } : m)),
      },
    ]) {
      const one = { ...structuredClone(base), ...structuredClone(only) } as World;
      const back = roundTrip(one);
      expect(canonical(back)).toBe(canonical(one));
      expect('matchModel' in back).toBe('matchModel' in only);
      expect('npcSeason' in back).toBe('npcSeason' in only);
    }
    // A world without model data has no model section: containers 1 and 2 are unchanged.
    expect(pack(base)).not.toHaveProperty('model');
  });

  it('preserves departed and transferred contributors', () => {
    const w = modelWorld();
    const restored = roundTrip(w).npcSeason!.competitions[0];
    const moved = restored.players.find((p) => p.id === 'ENG:transferred:1')!;
    const original = w.npcSeason!.competitions[0].players.find(
      (p) => p.id === 'ENG:transferred:1',
    )!;
    // Both clubs' actual contributions, in their recorded order.
    expect(moved.clubs).toEqual(original.clubs);
    expect(moved.clubs.map((c) => c.club)).toEqual(original.clubs.map((c) => c.club));
    // A player no roster holds keeps his name, position and contributions.
    const departed = restored.players.find((p) => p.id === 'ENG:departed:1')!;
    expect(w.players.some((p) => p.id === departed.id)).toBe(false);
    expect(departed).toEqual(
      w.npcSeason!.competitions[0].players.find((p) => p.id === 'ENG:departed:1'),
    );
  });

  it('keeps large counts exactly, including the safe-integer limit', () => {
    const w = modelWorld();
    const c = w.npcSeason!.competitions[0];
    c.clubs[0].xg = Number.MAX_SAFE_INTEGER;
    c.clubs[0].metrics[11] = 2 ** 40 + 3;
    c.players[0].clubs[0].detail[PLAYER_DETAIL_SIZE - 1] = 2 ** 33;
    w.matchModel!.activated.revision = Number.MAX_SAFE_INTEGER;
    expect(canonical(roundTrip(w))).toBe(canonical(w));
  });

  it('round trips sparse and dense tables of any shape', () => {
    const next = counters(3);
    for (const [rows, width] of [
      [0, 1],
      [0, 38],
      [1, 1],
      [7, 3],
      [300, 47],
    ]) {
      const values = Array.from({ length: rows * width }, next);
      const table = JSON.parse(JSON.stringify(packSparseTable(values, width)));
      expect(readSparseTable(table, width)).toEqual(values);
    }
    // All-zero, all-equal and one-nonzero columns use the cheapest exact form.
    const columns = [
      Array<number>(50).fill(0),
      Array<number>(50).fill(9),
      [5, ...Array(49).fill(0)],
    ];
    for (const cells of columns)
      expect(readSparseTable(packSparseTable(cells, 1), 1)).toEqual(cells);
    expect(packSparseTable(columns[2], 1).columns[0]).toHaveLength(2);
    expect(packSparseTable(columns[1], 1).columns[0]).toHaveLength(1);
    expect(() => packSparseTable([1, -1], 1)).toThrow();
    expect(() => packSparseTable([0.5], 1)).toThrow();
  });

  it('round trips arbitrary ledgers and tables exactly (property)', () => {
    const value = fc.oneof(
      fc.constant(0),
      fc.nat({ max: 40 }),
      fc.nat(),
      fc.constant(Number.MAX_SAFE_INTEGER),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 47 }),
        fc.nat({ max: 30 }),
        fc.infiniteStream(value),
        (width, rows, stream) => {
          const values = [...stream.take(width * rows)];
          const table = JSON.parse(JSON.stringify(packSparseTable(values, width)));
          expect(readSparseTable(table, width)).toEqual(values);
        },
      ),
      { numRuns: 200 },
    );
    const row = (width: number) => fc.array(value, { minLength: width, maxLength: width });
    const ids = (max: number) =>
      fc.uniqueArray(fc.stringMatching(/^[A-Z]{3}:[a-z0-9:]{1,12}$/), { maxLength: max });
    const competition = fc.record({
      kind: fc.constantFrom('league', 'cup', 'europe', 'playoff', 'lower' as const),
      groupKey: fc.stringMatching(/^[A-Za-z0-9:-]{1,10}$/),
      clubs: ids(4).chain((clubs) =>
        fc.tuple(
          ...clubs.map((club) =>
            fc.record({
              club: fc.constant(club),
              matches: fc.nat({ max: 1000 }),
              metrics: row(12),
              detail: row(TEAM_DETAIL_SIZE),
              xg: value,
              xga: value,
            }),
          ),
        ),
      ),
      players: ids(4).chain((players) =>
        fc.tuple(
          ...players.map((id) =>
            fc.record({
              id: fc.constant(id),
              name: fc.string({ maxLength: 12 }),
              position: fc.constantFrom('GK', 'CB', 'CM', 'ST'),
              clubs: fc
                .uniqueArray(fc.stringMatching(/^[A-Z]{3}:[0-9]{1,3}$/), {
                  minLength: 1,
                  maxLength: 3,
                })
                .chain((clubs) =>
                  fc.tuple(
                    ...clubs.map((club) =>
                      fc
                        .record({
                          club: fc.constant(club),
                          counts: fc.tuple(fc.nat({ max: 1000 }), fc.nat({ max: 1000 })),
                          metrics: row(12),
                          detail: row(PLAYER_DETAIL_SIZE),
                        })
                        // Starts are some of the appearances, none included.
                        .map(({ counts: [a, b], ...part }) => ({
                          ...part,
                          appearances: Math.max(a, b),
                          starts: Math.min(a, b),
                        })),
                    ),
                  ),
                ),
            }),
          ),
        ),
      ),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(competition, {
          maxLength: 4,
          selector: (c) => `${c.kind}:${c.groupKey}`,
        }),
        fc.array(fc.boolean(), { maxLength: 6 }),
        (competitions, records) => {
          const season = {
            year: 1990,
            model: MATCH_MODEL_REVISION,
            trackedFrom: { year: 1990, day: 0, round: 0 },
            competitions,
          } as NpcSeasonStats;
          const w = {
            npcSeason: season,
            ownMatches: records.map((full) => (full ? { model: MATCH_MODEL_REVISION } : {})),
          } as unknown as World;
          const strings: string[] = [];
          const ref = (text: string) => {
            const at = strings.indexOf(text);
            return at < 0 ? strings.push(text) - 1 : at;
          };
          const packed = JSON.parse(JSON.stringify(packMatchModel(w, ref)));
          const back = unpackMatchModel(packed, reader(strings), records.length);
          // fast-check records have no prototype, so compare by value and by canonical bytes.
          expect(back.npcSeason).toEqual(season);
          expect(canonical(back.npcSeason)).toBe(canonical(season));
          expect(back.records).toEqual(
            records.map((full) => (full ? MATCH_MODEL_REVISION : undefined)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects malformed indexes, counts, runs and truncated streams', () => {
    const w = modelWorld();
    const strings = dict(w);
    const str = reader(strings);
    const count = w.ownMatches.length;
    const ok = sectionOf(w);
    expect(canonical(unpackMatchModel(ok, str, count).npcSeason)).toBe(canonical(w.npcSeason));
    const fails = (damage: (p: PackedMatchModel) => void, records = count) => {
      const p = sectionOf(w);
      damage(p);
      let error: unknown;
      try {
        unpackMatchModel(JSON.parse(JSON.stringify(p)), str, records);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
      expect(isSaveCompatibilityError(error)).toBe(false);
    };
    const season = (p: PackedMatchModel) => p.season!;
    // Header, state and run shapes.
    fails((p) => (p.version = 0 as 1));
    fails((p) => (p.revisions = []));
    fails((p) => (p.revisions = [MATCH_MODEL_REVISION, MATCH_MODEL_REVISION]));
    fails((p) => p.state!.pop());
    fails((p) => (p.state![0] = 1));
    fails((p) => (p.state![7] = 2));
    fails((p) => (p.state![1] = -1));
    fails((p) => (season(p).header = [1, 0, 0, 0]));
    fails((p) => (season(p).header[1] = 3));
    fails((p) => (p.records = [0, count - 1, 1, 2]));
    fails((p) => (p.records = [0, count - 1]));
    fails((p) => (p.records = [0, count]));
    fails((p) => (p.records = [0, 1, 0, count - 2, 1, 1]));
    fails((p) => (p.records = [0, count - 1, 2, 1]));
    fails((p) => (p.records = [0, count - 1, 1, 0]));
    fails(() => {}, count + 1);
    // An unused revision, or a section without data.
    fails((p) => {
      delete p.state;
      delete p.records;
      delete p.season;
    });
    // Table dimensions, widths and counts.
    fails((p) => (season(p).clubs.rows += 1));
    fails((p) => season(p).clubs.columns.pop());
    fails((p) => (season(p).competitions.columns[0] = [] as unknown as SparseColumn));
    fails((p) => (season(p).players = packSparseTable([0, 0, 0, 0], 4)));
    // A tiny crafted table of a million empty rows is refused before its rows are allocated.
    const empty = (width: number, rows: number) => ({
      rows,
      columns: Array.from({ length: width }, () => [{ count: rows, headers: [[0, 0]], data: '' }]),
    });
    const crafted = sectionOf(w);
    crafted.season!.clubs = empty(4 + 12 + TEAM_DETAIL_SIZE, 1_000_000) as SparseTable;
    expect(() => unpackMatchModel(crafted, str, count)).toThrow('표 차원');
    fails(
      (p) =>
        (p.season!.contributions = empty(2 + 12 + PLAYER_DETAIL_SIZE, 1_000_000) as SparseTable),
    );
    const competitions = (p: PackedMatchModel) =>
      readSparseTable(season(p).competitions, 4) as number[];
    const replace = (
      p: PackedMatchModel,
      table: 'competitions' | 'players',
      width: number,
      edit: (rows: number[]) => void,
    ) => {
      const rows = readSparseTable(season(p)[table], width);
      edit(rows);
      season(p)[table] = packSparseTable(rows, width);
    };
    expect(competitions(ok)[2]).toBeGreaterThan(0);
    fails((p) => replace(p, 'competitions', 4, (rows) => (rows[0] = 9)));
    fails((p) => replace(p, 'competitions', 4, (rows) => (rows[2] += 1)));
    fails((p) => replace(p, 'competitions', 4, (rows) => (rows[3] -= 1)));
    fails((p) => replace(p, 'competitions', 4, (rows) => (rows[2] = 1001)));
    fails((p) => replace(p, 'players', 4, (rows) => (rows[3] = 0)));
    fails((p) => replace(p, 'players', 4, (rows) => (rows[3] = 51)));
    fails((p) => replace(p, 'players', 4, (rows) => (rows[0] = strings.length + 5)));
    // Duplicate ledger keys: a scope, a club, a player and a player's club twice.
    fails((p) =>
      replace(p, 'competitions', 4, (rows) => rows.splice(4, 4, ...rows.slice(0, 2), 0, 0)),
    );
    fails((p) => {
      const rows = readSparseTable(season(p).clubs, 4 + 12 + TEAM_DETAIL_SIZE);
      rows[4 + 12 + TEAM_DETAIL_SIZE] = rows[0];
      season(p).clubs = packSparseTable(rows, 4 + 12 + TEAM_DETAIL_SIZE);
    });
    fails((p) => replace(p, 'players', 4, (rows) => (rows[4] = rows[0])));
    fails((p) => {
      // [club, appearances, starts, metrics, detail]
      const width = 3 + 12 + PLAYER_DETAIL_SIZE;
      const rows = readSparseTable(season(p).contributions, width);
      // The transferred player's two shares, in order after the six single-club players.
      rows[7 * width] = rows[6 * width];
      season(p).contributions = packSparseTable(rows, width);
    });
    // Presence and value columns that disagree, a present zero and truncated or padded data.
    const sparseColumn = (p: PackedMatchModel) =>
      season(p).contributions.columns.find((column) => column.length === 2)!;
    expect(sparseColumn(ok)).toBeDefined();
    fails((p) => (sparseColumn(p)[1]!.count += 1));
    fails((p) => {
      const column = sparseColumn(p);
      const values = readSparseTable({ rows: column[1]!.count, columns: [[column[1]]] }, 1);
      values[0] = 0;
      column[1] = packBitColumns(values, 1, 'planes');
    });
    fails((p) => {
      const column = season(p).clubs.columns.find((c) => c[0].headers[0][1] > 0)!;
      column[0].data = column[0].data.slice(0, -4);
    });
    fails((p) => {
      const column = season(p).clubs.columns[0];
      column[0] = { ...column[0], data: column[0].data + 'AAAA' };
    });
  });

  it('refuses a future model container section or revision as a compatibility failure', () => {
    const w = modelWorld();
    for (const damage of [
      (p: PackedMatchModel) => (p.version = 2 as 1),
      (p: PackedMatchModel) => (p.revisions = ['continuous-aggregate-11']),
      (p: PackedMatchModel) => p.revisions.push('continuous-aggregate-11'),
    ]) {
      const p = sectionOf(w);
      damage(p);
      expect(() => readMatchModelFormat(p)).toThrow(SaveCompatibilityError);
      expect(() => unpackMatchModel(p, reader(dict(w)), w.ownMatches.length)).toThrow(
        SaveCompatibilityError,
      );
    }
    for (const malformed of [null, [], 'section', { version: '1', revisions: [] }])
      expect(() => readMatchModelFormat(malformed)).toThrow(/손상/);
  });

  it('refuses model data inline in the compact world and packs nothing for older worlds', () => {
    const w = modelWorld();
    const packed = pack(w);
    packed.world = { ...packed.world, matchModel: w.matchModel };
    expect(() => unpack(JSON.parse(JSON.stringify(packed)))).toThrow('압축 스트림');
    const plain = career();
    expect(packMatchModel(plain, () => 0)).toBeUndefined();
    expect(canonical(roundTrip(plain))).toBe(canonical(plain));
  });
});
