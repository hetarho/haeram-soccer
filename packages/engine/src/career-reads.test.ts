import { describe, expect, it } from 'vitest';
import { facts, result } from '../../../tests/fixtures/read-facts';
import { initializeReadModels, refreshReadModels } from './read-models';
import { initializeCareerReads } from './career-reads';
import { eventsInSeason, matchesInSeason } from './season-index';
import { europeanCoefficient } from './europe';
import { clubMilestones } from './goals';
import {
  appearanceCounts,
  cardCounts,
  leagueReds,
  tallies,
} from '../../../apps/web/src/runtime/playerTallies';
import { newsBefore, clubNews } from './news';
import type { MatchRecord, Player, SeasonArchive } from '../../contracts/src/types';

function assertCounts(w: ReturnType<typeof facts>) {
  const legacy = structuredClone(w);
  delete legacy.careerReads;
  delete legacy.newsJournal;
  expect(appearanceCounts(w)).toEqual(appearanceCounts(legacy));
  expect(cardCounts(w)).toEqual(cardCounts(legacy));
  expect(leagueReds(w)).toEqual(leagueReds(legacy));
  expect(tallies(w)).toEqual(tallies(legacy));
  expect(europeanCoefficient(w)).toBe(europeanCoefficient(legacy));
  expect(clubMilestones(w)).toEqual(clubMilestones(legacy));
}
describe('incremental career readers', () => {
  it('attributes cards by recorded side across transfers, venues and season rollover', () => {
    const w = facts();
    w.players = ['scorer', 'incoming', 'departed', 'never-own'].map((id) => ({ id }) as Player);
    const record = (
      n: number,
      year: number,
      kind: MatchRecord['kind'],
      ownSide: 0 | 1,
      ownPlayer: string,
      incidents: [string, 0 | 1, 'yellow' | 'secondYellow' | 'red'][],
    ) => {
      const m = result(w, n);
      Object.assign(m, {
        id: `${year}:${kind}:${n}`,
        year,
        kind,
        home: ownSide === 0 ? 'own' : 'rival',
        away: ownSide === 1 ? 'own' : 'rival',
        players: [{ ...m.players[0], id: ownPlayer }],
        incidents: incidents.map(([player, side, kind]) => ({ player, side, kind })),
      });
      return m;
    };
    const first = record(1, 1930, 'league', 0, 'scorer', [
      ['scorer', 0, 'yellow'],
      ['scorer', 0, 'secondYellow'],
      ['departed', 0, 'red'],
      ['incoming', 1, 'secondYellow'],
      ['never-own', 1, 'yellow'],
    ]);
    const second = record(2, 1930, 'cup', 1, 'incoming', [
      ['scorer', 0, 'red'],
      ['incoming', 1, 'yellow'],
      ['departed', 0, 'secondYellow'],
    ]);
    const nextSeason = record(1, 1931, 'league', 1, 'incoming', [
      ['scorer', 0, 'secondYellow'],
      ['incoming', 1, 'red'],
      ['incoming', 1, 'yellow'],
      ['departed', 0, 'red'],
      ['never-own', 0, 'secondYellow'],
    ]);
    initializeReadModels(w);
    for (const m of [first, second, nextSeason]) {
      w.year = m.year;
      w.ownMatches.push(m);
      refreshReadModels(w);
      assertCounts(w);
      const summary = structuredClone(w.careerReads);
      refreshReadModels(w);
      initializeCareerReads(w);
      expect(w.careerReads).toEqual(summary);
    }
    expect(cardCounts(w)).toEqual(
      new Map([
        ['scorer', { season: { yellow: 0, red: 0 }, career: { yellow: 2, red: 1 } }],
        ['departed', { season: { yellow: 0, red: 0 }, career: { yellow: 0, red: 1 } }],
        ['incoming', { season: { yellow: 1, red: 1 }, career: { yellow: 2, red: 1 } }],
      ]),
    );
    expect(w.careerReads!.players.scorer).toMatchObject({
      year: 1931,
      yellow: [0, 2],
      red: [0, 1],
      leagueReds: 1,
    });
    expect(w.careerReads!.players['never-own']).toMatchObject({
      year: 1931,
      yellow: [0, 0],
      red: [0, 0],
      leagueReds: 1,
    });
    expect(leagueReds(w)).toEqual({ scorer: 1, incoming: 1, departed: 1, 'never-own': 1 });
    // Rebuilding the complete history agrees with every incremental prefix/suffix.
    const rebuilt = structuredClone(w);
    delete rebuilt.careerReads;
    initializeCareerReads(rebuilt);
    expect(rebuilt.careerReads).toEqual(w.careerReads);
    // Present squad membership never changes previously recorded contributions.
    const afterDeparture = {
      ...w,
      players: w.players.filter((p) => p.id !== 'departed'),
      ownMatches: [...w.ownMatches],
    };
    expect(cardCounts(afterDeparture).get('departed')!.career.red).toBe(1);
    assertCounts(afterDeparture);
  });
  it('preserves appearances, subs, cards, maxima and competition scopes across rollover and reload', () => {
    const w = facts();
    initializeReadModels(w);
    for (let n = 1; n <= 4; n++) {
      const m = result(w, n);
      m.kind = n % 2 ? 'league' : 'europe';
      m.incidents = [
        { kind: 'sub', side: 0, player: 'unused', other: 'scorer' },
        { kind: 'secondYellow', side: 0, player: 'scorer' },
        { kind: 'red', side: 1, player: 'rival-player' },
      ] as typeof m.incidents;
      m.players.push({ ...m.players[0], id: 'unused', metrics: Array<number>(12).fill(0) });
      w.ownMatches.push(m);
      refreshReadModels(w);
    }
    assertCounts(w);
    w.history.push({
      year: w.year,
      tier: 1,
      played: 46,
      won: 8,
      fans: 3000,
      champions: [],
      europe: [],
    } as unknown as SeasonArchive);
    w.year++;
    refreshReadModels(w);
    assertCounts(w);
    const loaded = structuredClone(w);
    loaded.ownMatches.push(result(loaded, 1));
    refreshReadModels(loaded);
    assertCounts(loaded);
    expect(loaded.careerReads?.players.scorer.apps).toEqual([1, 5]);
  });
  it('uses stored totals without traversing retained match/event/archive arrays on read', () => {
    const w = facts();
    w.ownMatches.push(result(w, 1));
    initializeReadModels(w);
    const blocked = <T>(rows: T[]) =>
      new Proxy(rows, {
        get(target, key, receiver) {
          if (key === Symbol.iterator || key === 'filter' || key === 'map' || key === 'some')
            throw new Error('historical traversal');
          return Reflect.get(target, key, receiver);
        },
      });
    w.ownMatches = blocked(w.ownMatches);
    w.events = blocked(w.events);
    w.history = blocked(w.history);
    expect(() => [
      clubNews(w),
      tallies(w),
      clubMilestones(w),
      europeanCoefficient(w),
    ]).not.toThrow();
  });
  it('indexes actual event years, retains mutable installment references and consumes appended rows', () => {
    const w = facts();
    const installment = {
      year: 1930,
      round: 1,
      kind: 'wage',
      title: 'Wages',
      detail: '',
      currency: 'GBP',
      amount: '10',
    };
    w.events.push({ ...installment, year: 1920 }, installment);
    expect(eventsInSeason(w, 1930)).toEqual([installment]);
    installment.amount = '20';
    expect(eventsInSeason(w, 1930)[0].amount).toBe('20');
    w.events.push({ ...installment, year: 1929 });
    expect(eventsInSeason(w, 1929)).toHaveLength(1);
    w.ownMatches.push(result(w, 1));
    expect(matchesInSeason(w, 1930)).toHaveLength(1);
    w.ownMatches.push(result(w, 2));
    expect(matchesInSeason(w, 1930)).toHaveLength(2);
  });
  it('reconstructs absent statistics once and does not count a source twice', () => {
    const w = facts();
    w.ownMatches.push(result(w, 1));
    initializeCareerReads(w);
    const before = JSON.stringify(w.careerReads);
    initializeCareerReads(w);
    refreshReadModels(w);
    expect(JSON.stringify(w.careerReads)).toBe(before);
  });
  it('pages stored news with a stable source cursor and filters before paging', () => {
    const w = facts();
    initializeReadModels(w);
    for (let n = 1; n <= 80; n++) {
      w.events.push({
        year: w.year,
        round: n,
        kind: 'transfer-in',
        title: `Player ${n}`,
        detail: 'Fact',
      });
      refreshReadModels(w);
    }
    const first = clubNews(w);
    expect(first).toHaveLength(50);
    w.events.push({
      year: w.year,
      round: 81,
      kind: 'transfer-in',
      title: 'Newest',
      detail: 'Fact',
    });
    refreshReadModels(w);
    const second = newsBefore(w, first.at(-1)!.id, '이적');
    expect(second).toHaveLength(30);
    expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(80);
    expect(newsBefore(w, undefined, '경기')).toEqual([]);
    expect(() => newsBefore(w, '1901:unknown')).toThrow();
  });
});
