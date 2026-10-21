import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../contracts/src/detail';
import type { NpcCompetitionStats } from '../../contracts/src/match-model';
import type { Fixture, MatchPlayback, MatchRecord, Player, World } from '../../contracts/src/types';
import { withCandidateModel } from '../../../tests/fixtures/worlds';
import { M } from './grid/record';
import { simulateMatch } from './match';
import { npcCompetition, playerTotals, settleNpcSeason } from './npc-stats';
import { recordMatch } from './season';
import { founded } from './season.testkit';

/** A 2024 world (substitutes, cups, Europe) on the candidate model from its first day. */
const candidate = () => withCandidateModel(founded(2024));
/** One league group of clubs nobody owns, its fixtures in round order. */
function groupFixtures(w: World) {
  const own = (f: Fixture) => f.home === w.playerClub || f.away === w.playerClub;
  const key = w.fixtures.find((f) => f.kind === 'league' && !own(f))!.groupKey;
  return w.fixtures.filter((f) => f.groupKey === key).sort((a, b) => a.round - b.round);
}
/** Plays and settles a scheduled fixture as the season's round does. */
function settle(w: World, f: Fixture, playback = simulateMatch(w, f)) {
  f.score = playback.record.score;
  recordMatch(w, playback, true);
  return playback;
}
const linesOf = (r: MatchRecord, side: 0 | 1) =>
  side === 0 ? r.players.slice(0, r.lineCounts![0]) : r.players.slice(r.lineCounts![0]);
const SHARED = (Object.keys(PD) as (keyof typeof PD)[]).filter(
  (key): key is keyof typeof PD & keyof typeof TD => key in TD,
);
/** Every club's totals are its contributors' to the count, departed and transferred ones included. */
function expectReconciled(c: NpcCompetitionStats) {
  for (const club of c.clubs) {
    const parts = c.players.flatMap((p) => p.clubs.filter((part) => part.club === club.club));
    for (let i = 0; i < M.minutes; i++)
      expect(parts.reduce((n, part) => n + part.metrics[i]!, 0)).toBe(club.metrics[i]);
    for (const key of SHARED)
      expect(parts.reduce((n, part) => n + part.detail[PD[key]]!, 0)).toBe(club.detail[TD[key]]);
    const appearances = parts.reduce((n, part) => n + part.appearances, 0);
    expect(appearances).toBeGreaterThanOrEqual(11 * club.matches);
    expect(appearances).toBeLessThanOrEqual(16 * club.matches);
  }
}
/**
 * Synthetic and marked as such: the playback with `person` in the place of `side`'s line `line`,
 * as if he had moved to that club before the match. The record stays the same football.
 */
function playedBy(p: MatchPlayback, side: 0 | 1, line: number, person: Player): MatchPlayback {
  const out = structuredClone(p);
  const index = (side === 0 ? 0 : out.record.lineCounts![0]) + line;
  const old = out.record.players[index]!.id;
  out.record.players[index]!.id = person.id;
  for (const x of out.record.incidents ?? []) {
    if (x.player === old) x.player = person.id;
    if (x.other === old) x.other = person.id;
  }
  out.squads[side] = out.squads[side].map((q) => (q.id === old ? structuredClone(person) : q));
  return out;
}

describe('complete current-season aggregates (→HIST-3, HIST-13, HIST-17)', () => {
  it('counts substitute appearances', () => {
    const w = candidate();
    const fixtures = groupFixtures(w).filter((f) => f.round === groupFixtures(w)[0]!.round);
    const plays = fixtures.map((f) => settle(w, f));
    const c = npcCompetition(w.npcSeason, fixtures[0]!)!;
    let substitutes = 0;
    for (const { record, squads } of plays)
      for (const side of [0, 1] as const) {
        const club = side === 0 ? record.home : record.away;
        const lines = linesOf(record, side);
        const came = new Set(
          (record.incidents ?? []).flatMap((x) =>
            x.kind === 'sub' && x.side === side ? [x.other!] : [],
          ),
        );
        substitutes += came.size;
        // Starters and every substitute who came on: one appearance and his own counters.
        for (const line of lines) {
          const part = c.players
            .find((p) => p.id === line.id)!
            .clubs.find((part) => part.club === club)!;
          expect(part.appearances).toBe(1);
          expect(part.metrics).toEqual(line.metrics);
          expect(part.detail).toEqual(line.detail);
          if (came.has(line.id)) expect(line.metrics[M.minutes]).toBeLessThan(90);
        }
        // A named substitute who never came on gains no appearance.
        const unused = squads[side].slice(11).filter((p) => !came.has(p.id));
        for (const p of unused) expect(c.players.some((row) => row.id === p.id)).toBe(false);
        const row = c.clubs.find((r) => r.club === club)!;
        expect(row.matches).toBe(1);
        expect(row.metrics).toEqual(record.metrics[side]);
        expect(row.xg).toBe(Math.round(record.xg![side] * 100));
        expect(row.xga).toBe(Math.round(record.xg![side === 0 ? 1 : 0] * 100));
      }
    // A 2024 round: substitutes come on in nearly every match.
    expect(substitutes).toBeGreaterThan(plays.length * 4);
    expectReconciled(c);
  });

  it('conserves transferred-player contributions', () => {
    const w = candidate();
    const fixtures = groupFixtures(w);
    const first = fixtures[0]!;
    const opening = settle(w, first);
    // A home starter of the first match later plays for a club that met neither side.
    const mover = opening.squads[0][5]!;
    const later = fixtures.find(
      (f) =>
        f.round > first.round &&
        ![f.home, f.away].some((club) => club === first.home || club === first.away),
    )!;
    const there = playedBy(simulateMatch(w, later), 0, 5, mover);
    settle(w, later, there);
    const c = npcCompetition(w.npcSeason, first)!;
    const row = () => c.players.find((p) => p.id === mover.id)!;
    expect(row().clubs.map((part) => part.club)).toEqual([first.home, later.home]);
    expect(row().clubs.map((part) => part.appearances)).toEqual([1, 1]);
    expect(row().name).toBe(mover.name);
    const total = playerTotals(row());
    expect(total.appearances).toBe(2);
    expect(total.metrics[M.minutes]).toBe(
      row().clubs.reduce((n, part) => n + part.metrics[M.minutes]!, 0),
    );
    expectReconciled(c);
    // He departs (neither club fields him again): the matches after him leave his contributions
    // as they were, and every club still reconciles with its contributors.
    const kept = structuredClone(row());
    const without = fixtures.filter(
      (f) =>
        f.round > later.round &&
        ![f.home, f.away].some((club) => club === first.home || club === later.home),
    );
    for (const f of without.slice(0, 12)) settle(w, f);
    expect(row()).toEqual(kept);
    expectReconciled(c);
    // Nothing but identity and counters is kept for him.
    expect(Object.keys(row()).sort()).toEqual(['clubs', 'id', 'name', 'position']);
  });

  it('leaves results the season does not track absent', () => {
    const w = candidate();
    const [f, g] = groupFixtures(w);
    const p = simulateMatch(w, f!);
    // A pre-feature result, another season's or one without an open ledger counts nothing.
    settleNpcSeason(w, { ...p, record: { ...p.record, model: undefined } });
    settleNpcSeason(w, { ...p, record: { ...p.record, year: w.year - 1 } });
    expect(w.npcSeason!.competitions).toEqual([]);
    const closed = structuredClone(w);
    delete closed.npcSeason;
    settleNpcSeason(closed, p);
    expect(closed.npcSeason).toBeUndefined();
    settleNpcSeason(w, simulateMatch(w, g!));
    expect(w.npcSeason!.competitions).toHaveLength(1);
    expect(w.npcSeason!.trackedFrom).toEqual({ year: w.year, day: 1, round: 1 });
  });
});
