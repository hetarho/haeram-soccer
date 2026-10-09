import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { advanceRound, clubNews, closeSeason, createWorld } from './index';

const world = (seed = 'news') =>
  createWorld({ country: 'ENG', name: 'News United', color: '#24664f', seed, difficulty: 2 });
const results = (w: World) =>
  w.ownMatches
    .filter((m) => m.year === w.year)
    .map((m) => {
      const own = m.home === w.playerClub ? m.score.home : m.score.away,
        other = m.home === w.playerClub ? m.score.away : m.score.home;
      return { m, result: own > other ? 'W' : own === other ? 'D' : 'L' };
    });

describe('club news', () => {
  const w = world();
  for (let round = 0; round < 30; round++) advanceRound(w, undefined, false);
  const news = clubNews(w);

  it('derives the same feed from the same facts, newest first, with unique stable IDs', () => {
    expect(news.length).toBeGreaterThan(10);
    expect(canonical(clubNews(structuredClone(w)))).toBe(canonical(news));
    expect(new Set(news.map((item) => item.id)).size).toBe(news.length);
    for (let i = 1; i < news.length; i++)
      expect(
        news[i - 1].year > news[i].year ||
          (news[i - 1].year === news[i].year && news[i - 1].order >= news[i].order),
      ).toBe(true);
  });

  it('celebrates the first win and reports streaks when they reach a milestone', () => {
    const first = results(w).find((row) => row.result === 'W')!;
    const item = news.find((n) => n.id === `${w.year}:${first.m.id}:first-win`)!;
    expect(item).toMatchObject({ celebrate: true, weight: 'major', tag: '기록' });
    let run = 0;
    for (const row of results(w)) {
      run = row.result === 'L' ? 0 : run + 1;
      if (run === 5)
        expect(news.some((n) => n.id === `${w.year}:${row.m.id}:unbeaten-5`)).toBe(true);
    }
  });

  it('never celebrates routine business such as a transfer window opening', () => {
    expect(news.some((n) => n.title.includes('이적시장'))).toBe(false);
    for (const n of news.filter((item) => item.celebrate))
      expect(['기록', '선수', '순위']).toContain(n.tag);
  });

  it('turns a won league into a celebrated honour at the start of the next season', () => {
    const champion = world('news-title');
    while (champion.round < 46) advanceRound(champion, undefined, false);
    for (const id of Object.keys(champion.tables))
      if (id !== champion.playerClub) champion.tables[id].points = 0;
    champion.tables[champion.playerClub].points = 999;
    closeSeason(champion);
    const honour = clubNews(champion).find((n) => n.id === `${champion.year - 1}:honour:league`);
    expect(honour).toMatchObject({ celebrate: true });
    expect(honour!.title).toContain('우승');
  });
});
