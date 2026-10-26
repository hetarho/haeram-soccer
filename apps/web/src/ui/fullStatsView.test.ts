import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD } from '../../../../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type FullStatsRead,
  type NpcContribution,
} from '../../../../packages/contracts/src/match-model';
import type { MatchRecord, Metrics, World } from '../../../../packages/contracts/src/types';
import { seasonDayLabel } from '../../../../packages/engine/src/calendar';
import { fullStatsRead } from '../../../../packages/engine/src/npc-stats';
import { transferredScorerWorld } from '../../../../tests/fixtures/transferred-scorer';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { simulatedWorld, withCandidateModel } from '../../../../tests/fixtures/worlds';
import { hundredths, recordCounters } from './advanced';
import {
  fullStatsAdvanced,
  fullStatsAppearances,
  fullStatsClubs,
  fullStatsCoverage,
  fullStatsPlayers,
  fullStatsRates,
  leaders,
  leagueStatsScope,
  orderClubs,
  perMatch,
} from './fullStatsView';
import { FullLeaders } from './LeagueFullStats';
import s from './LeagueInsights.module.css';
import { appearanceText, performanceRows } from './playerAnalysis';

/** Synthetic, marked rows: values chosen to read easily, not settled football. */
const metrics = (values: Partial<Record<number, number>> = {}): Metrics =>
  Array.from({ length: 12 }, (_, i) => values[i] ?? 0);
const part = (
  club: string,
  appearances: number,
  starts: number,
  m: Metrics,
  d = emptyPlayerDetail(),
): NpcContribution => ({
  club,
  appearances,
  starts,
  metrics: m,
  detail: d,
});
/** A founded world, built once and shared (→ARCH-21); each call is a fresh copy. */
const fresh = () =>
  simulatedWorld({
    country: 'ENG',
    name: 'Synthetic Full Stats',
    color: '#335544',
    seed: 'full-stats-view',
    level: 'normal',
  });
function syntheticRead(w: World, change: Partial<FullStatsRead> = {}): FullStatsRead {
  const own = w.players[0]!,
    other = w.clubs.find((c) => c.id !== w.playerClub)!.id;
  const detail = emptyPlayerDetail();
  detail[PD.xg] = 145;
  detail[PD.xa] = 30;
  detail[PD.keyPasses] = 4;
  return {
    year: w.year,
    trackedFrom: { year: w.year, day: 1, round: 1 },
    untracked: 0,
    competition: {
      kind: 'league',
      groupKey: 'ENG:0:0',
      clubs: [
        {
          club: w.playerClub,
          matches: 3,
          metrics: metrics({ 0: 4, 2: 300, 3: 240, 4: 30, 5: 12, 10: 270 }),
          detail: emptyTeamDetail(),
          xg: 512,
          xga: 233,
        },
        {
          club: other,
          matches: 3,
          metrics: metrics({ 0: 2, 4: 21 }),
          detail: emptyTeamDetail(),
          xg: 233,
          xga: 512,
        },
      ],
      players: [
        {
          id: own.id,
          name: own.name,
          position: own.position,
          clubs: [part(w.playerClub, 3, 2, metrics({ 0: 2, 1: 1, 4: 7, 10: 200 }), detail)],
        },
        {
          id: 'npc:synthetic:9',
          name: 'Synthetic Rival',
          position: 'ST',
          clubs: [
            part(other, 3, 3, metrics({ 0: 2, 1: 1, 4: 7, 10: 200 }), structuredClone(detail)),
          ],
        },
      ],
    },
    ...change,
  };
}
/** Throws on any write, so a mapping that changes its read fails. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) frozen(inner);
    Object.freeze(value);
  }
  return value;
}

describe('complete statistics in existing views (→WEB-89, HIST-6, HIST-17)', () => {
  it('compares own and aggregate rows in the same units', () => {
    const w = fresh();
    const read = frozen(syntheticRead(w));
    const [ours, rival] = fullStatsPlayers(read, w);
    expect([ours!.ours, rival!.ours]).toEqual([true, false]);
    // The same production gives the same per-90 rows the own-player views print.
    expect(fullStatsRates(ours!)).toEqual(fullStatsRates(rival!));
    const own = performanceRows(ours!.metrics).map((row) => row.per90!.toFixed(2));
    expect(
      fullStatsRates(ours!)
        .slice(0, own.length)
        .map((row) => row.text),
    ).toEqual(own);
    expect(fullStatsRates(rival!).find((row) => row.label === 'xG')!.text).toBe(
      ((1.45 * 90) / 200).toFixed(2),
    );
    // Appearances read as own players' do: starts plus substitute appearances.
    expect(fullStatsAppearances(ours!)).toBe(
      appearanceText({ apps: [3, 9], sub: [1, 4], yellow: [0, 0], red: [0, 0] }, 'season'),
    );
    expect(fullStatsAppearances(rival!)).toBe('3경기');
    // Every advanced counter counts over all his matches, as for a grid-engine own match.
    expect(fullStatsAdvanced(rival!)).toEqual({
      matches: 3,
      minutes: 200,
      totals: rival!.detail,
      spatialMatches: 3,
      spatialMinutes: 200,
    });
    // Club xG in hundredths prints as a record's xG does.
    const [home] = fullStatsClubs(read, [w.playerClub]);
    expect(hundredths(home!.xg)).toBe((5.12).toFixed(2));
    expect(perMatch(home!.shots, home!.matches)).toBe('10.00');
    expect(orderClubs(fullStatsClubs(read, []), 'xgd').map((row) => row.club)[0]).toBe(
      w.playerClub,
    );
  });

  it('shows a real zero separately from unavailable history', () => {
    const w = fresh();
    // No ledger for the season, or one of another season: unavailable, never zeros.
    for (const read of [undefined, syntheticRead(w, { year: w.year - 1 })])
      expect(fullStatsCoverage(read, w.year).status).toBe('unavailable');
    // Tracked with nothing settled yet: zero matches, a club row of zeros without ratios.
    const empty = frozen(
      syntheticRead(w, {
        competition: { kind: 'league', groupKey: 'ENG:0:0', clubs: [], players: [] },
      }),
    );
    const coverage = fullStatsCoverage(empty, w.year);
    expect(coverage).toMatchObject({ status: 'whole', matches: 0, untracked: 0 });
    expect(coverage.text).toContain('0경기');
    const [club] = fullStatsClubs(empty, [w.playerClub]);
    expect(club).toMatchObject({ club: w.playerClub, matches: 0, goals: 0, xg: 0 });
    expect(perMatch(club!.goals, club!.matches)).toBe('—');
    expect(leaders(fullStatsPlayers(empty, w), 'goals')).toEqual([]);
    // A tracked player without a goal has a goal rate of zero, not a missing one.
    const [, rival] = fullStatsPlayers(frozen(syntheticRead(w)), w);
    const zero = { ...rival!, metrics: metrics({ 10: 90 }) };
    expect(fullStatsRates(zero)[0]).toEqual({ label: '골', text: '0.00' });
  });

  it('names partial tracking and samples', () => {
    const w = fresh();
    const partial = frozen(
      syntheticRead(w, { trackedFrom: { year: w.year, day: 40, round: 6 }, untracked: 20 }),
    );
    const coverage = fullStatsCoverage(partial, w.year);
    expect(coverage).toMatchObject({ status: 'partial', matches: 3, untracked: 20 });
    expect(coverage.text).toBe(
      `${seasonDayLabel(w.year, 40)}부터 기록 · 리그 3경기 · 그 전 20경기는 기록 없음`,
    );
    // Activated after the final round: the day names the start, never a clamped round.
    const late = fullStatsCoverage(
      syntheticRead(w, { trackedFrom: { year: w.year, day: 330, round: 46 }, untracked: 380 }),
      w.year,
    );
    expect(late.text).toContain(seasonDayLabel(w.year, 330));
    expect(late.text).not.toContain('46');
    // Whole seasons say so, with the sample counted.
    expect(fullStatsCoverage(syntheticRead(w), w.year).text).toContain(
      '시즌 전체 기록 · 리그 3경기',
    );
    // Leaders keep their samples: every rate travels with the minutes it divides.
    const rows = fullStatsPlayers(partial, w);
    const [first] = leaders(rows, 'goals');
    expect(first).toMatchObject({ total: '2', rate: ((2 * 90) / 200).toFixed(2), sample: '200분' });
    // A substitute's goal in 30 minutes: on a phone the appearances column folds away, while the
    // rate cell, which stays, still names the 30 minutes behind "3.00".
    const sub = {
      ...rows[1]!,
      id: 'npc:synthetic:sub',
      name: 'Synthetic Substitute',
      appearances: 1,
      starts: 0,
      minutes: 30,
    };
    sub.metrics = metrics({ 0: 1, 10: 30 });
    const html = renderToStaticMarkup(
      createElement(FullLeaders, {
        w,
        rows: [sub, ...rows],
        order: 'goals',
        onOrder: () => {},
      }),
    );
    // `optional` is the class LeagueInsights.module.css hides at 760 px and below.
    expect(s.optional).toBeTruthy();
    const cells = (row: string) =>
      [...row.matchAll(/<td( class="([^"]*)")?>(.*?)<\/td>/g)].map((m) => ({
        folds: !!m[2] && m[2].split(' ').includes(s.optional!),
        text: m[3]!.replace(/<[^>]+>/g, ''),
      }));
    const subRow = html.split('<tr').find((row) => row.includes(sub.name))!;
    const kept = cells(subRow).filter((cell) => !cell.folds);
    expect(kept.map((cell) => cell.text)).toContain('3.00 · 30분');
    expect(cells(subRow).find((cell) => cell.folds)!.text).toBe('1경기 · 교체 1');
  });

  it('preserves a transferred contributor', () => {
    // The real in-league sale (tests/fixtures/transferred-scorer.ts) on the candidate model.
    const { w, playerId, buyer } = cachedWorld('transferred scorer on the candidate model', () =>
      transferredScorerWorld((world) => withCandidateModel(world)),
    );
    const read = fullStatsRead(w, leagueStatsScope(w))!;
    expect(read).toBeDefined();
    const row = fullStatsPlayers(read, w).find((p) => p.id === playerId)!;
    // One identity: both clubs in recorded order, the buyer the latest, still one of ours.
    expect(row.clubs).toEqual([w.playerClub, buyer]);
    expect(row.ours).toBe(true);
    expect(w.players.find((p) => p.id === playerId)!.status).toBe('sold');
    const parts = read.competition.players.find((p) => p.id === playerId)!.clubs;
    expect(row.appearances).toBe(parts.reduce((n, p) => n + p.appearances, 0));
    // His per-club goals and appearances are the league scorer table's for each club.
    const scorer = w.scorerSeason!.players.find((p) => p.id === playerId)!;
    expect(parts.map((p) => [p.club, p.metrics[0], p.appearances])).toEqual(
      scorer.clubs!.map((p) => [p.club, p.goals, p.appearances]),
    );
    // Each club's totals still reconcile with every contributor, departed ones included.
    for (const club of read.competition.clubs) {
      const goals = read.competition.players
        .flatMap((p) => p.clubs.filter((c) => c.club === club.club))
        .reduce((n, c) => n + c.metrics[0]!, 0);
      expect(goals).toBe(club.metrics[0]);
    }
  });

  it('marks a match by its rules, never by the engine that settled it', () => {
    const line = { id: 'p', metrics: metrics(), detail: emptyPlayerDetail() };
    const base = {
      metrics: [metrics(), metrics()],
      players: [line],
    } as unknown as MatchRecord;
    const full = { ...base, model: MATCH_MODEL_REVISION, lineCounts: [1, 0] } as MatchRecord;
    expect(recordCounters(full)).toBe('all');
    expect(recordCounters({ ...base, lineCounts: [1, 0] } as MatchRecord)).toBe('all');
    expect(recordCounters({ ...base, detail: [emptyTeamDetail(), emptyTeamDetail()] })).toBe(
      'advanced',
    );
    expect(recordCounters(base)).toBe('basic');
  });

  it('reads our league, the amateur league or any chosen league', () => {
    const w = fresh();
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    expect(leagueStatsScope({ ...w, lower: false })).toEqual({
      kind: 'league',
      groupKey: `${own.country}:${own.tier}:${own.group}`,
    });
    expect(leagueStatsScope({ ...w, lower: true })).toEqual({ kind: 'lower', groupKey: 'lower' });
    expect(leagueStatsScope({ ...w, lower: true }, { code: 'GER', tier: 0, group: 0 })).toEqual({
      kind: 'league',
      groupKey: 'GER:0:0',
    });
  });
});
