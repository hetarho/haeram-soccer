import { describe, expect, it } from 'vitest';
import type { MatchRecord, World } from '../../contracts/src/types';
import { newsJournalSchema } from '../../contracts/src/news';
import {
  clubNews,
  deriveClubNews,
  initializeNewsJournal,
  newsPage,
  refreshNewsJournal,
} from './news';

/** Synthetic facts only: no simulation or browser setup. */
function facts(): World {
  return {
    year: 1930,
    round: 0,
    playerClub: 'own',
    lower: true,
    clubs: [
      { id: 'own', name: 'Town', country: 'ENG', tier: 0, group: 0 },
      { id: 'rival', name: 'City', country: 'ENG', tier: 0, group: 0 },
    ],
    players: [{ id: 'scorer', name: 'First Name' }],
    ownMatches: [],
    events: [],
    history: [],
    rankHistory: [],
  } as unknown as World;
}
function result(w: World, n: number, goals = 1): MatchRecord {
  const metrics = () => Array<number>(12).fill(0);
  const player = metrics();
  player[0] = goals;
  player[10] = 90;
  return {
    id: `${w.year}:league:${n}`,
    year: w.year,
    round: n,
    kind: 'league',
    home: 'own',
    away: 'rival',
    score: { home: goals, away: 0 },
    metrics: [metrics(), metrics()],
    highlights: [],
    players: [{ id: 'scorer', metrics: player }],
  } as unknown as MatchRecord;
}
function play(w: World, n: number, goals = 1) {
  w.round = n;
  w.ownMatches.push(result(w, n, goals));
  refreshNewsJournal(w);
}

describe('incremental news journal', () => {
  it('matches the fact reader for a current season, with stable IDs and no duplicate settlement', () => {
    const w = facts();
    initializeNewsJournal(w);
    for (let n = 1; n <= 12; n++) play(w, n, n === 8 ? 3 : 1);
    expect(newsPage(w)).toEqual(deriveClubNews(w).slice(0, 50));
    const before = JSON.stringify(w.newsJournal);
    refreshNewsJournal(w);
    clubNews(w);
    newsPage(w);
    expect(JSON.stringify(w.newsJournal)).toBe(before);
  });
  it('keeps names and published wording frozen after a later roster change', () => {
    const w = facts();
    initializeNewsJournal(w);
    play(w, 1, 3);
    const headline = clubNews(w).find((item) => item.id.includes('hat-trick'))!;
    expect(headline.title).toContain('First Name');
    w.players[0].name = 'New Name';
    play(w, 2, 3);
    expect(newsPage(w).find((item) => item.id === headline.id)).toEqual(headline);
    expect(newsPage(w).find((item) => item.id.includes('league:2:hat-trick'))?.title).toContain(
      'New Name',
    );
  });
  it('continues runs and record baselines across seasons and retains old news', () => {
    const w = facts();
    initializeNewsJournal(w);
    for (let n = 1; n <= 5; n++) play(w, n);
    w.year++;
    w.round = 0;
    refreshNewsJournal(w);
    play(w, 1);
    const news = newsPage(w);
    expect(news.some((item) => item.id.endsWith('unbeaten-record-6'))).toBe(true);
    expect(news.some((item) => item.year === 1930)).toBe(true);
    expect(w.newsJournal?.state.totalWins).toBe(6);
    expect(w.newsJournal?.state.careerGoals).toEqual([['scorer', 6]]);
  });
  it('rebuilds once, resumes persisted counters and never revisits already consumed matches/events', () => {
    const w = facts();
    for (let n = 1; n <= 10; n++) {
      w.round = n;
      w.ownMatches.push(result(w, n));
    }
    initializeNewsJournal(w);
    const loaded = structuredClone(w);
    const oldMatches = loaded.ownMatches.length;
    loaded.ownMatches = new Proxy(loaded.ownMatches, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < oldMatches)
          throw new Error('archived match revisited');
        return Reflect.get(target, key, receiver);
      },
    });
    expect(() => play(loaded, 11, 3)).not.toThrow();
    expect(loaded.newsJournal?.state.totalWins).toBe(11);
    expect(newsPage(loaded).length).toBeGreaterThan(0);
  });
  it('records each event at its source index and preserves its original wording', () => {
    const w = facts();
    initializeNewsJournal(w);
    w.events.push({
      year: 1930,
      round: 1,
      kind: 'transfer-in',
      title: 'Player',
      detail: 'Fee · Club',
    });
    refreshNewsJournal(w);
    const item = newsPage(w).find((row) => row.id === '1930:event-0:transfer-in');
    expect(item?.title).toContain('Player');
    w.events[0].title = 'Changed';
    refreshNewsJournal(w);
    expect(newsPage(w).find((row) => row.id === item?.id)).toEqual(item);
  });
  it('validates persisted state and query bounds', () => {
    const w = facts();
    initializeNewsJournal(w);
    expect(newsJournalSchema.parse(w.newsJournal)).toEqual(w.newsJournal);
    expect(() => newsJournalSchema.parse({ ...w.newsJournal, format: 2 })).toThrow();
    expect(() => newsJournalSchema.parse({ ...w.newsJournal, matches: -1 })).toThrow();
    expect(() => newsPage(w, -1)).toThrow();
    expect(() => newsPage(w, 0, 51)).toThrow();
  });
});
