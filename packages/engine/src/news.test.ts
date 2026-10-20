import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { MatchRecord, Player, TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceCups,
  advanceRound,
  clubNews,
  clubOf,
  closeSeason,
  currentDay,
  dayCountedFrom,
  prepareCups,
  respondBid,
  retireAtClose,
  seasonDayLabel,
  trainingInjuries,
} from './index';
import type { NewsItem } from './news';
import { cachedWorld, simulatedWorld } from '../../../tests/fixtures/worlds';

const founding = (seed = 'news') =>
  ({
    country: 'ENG',
    name: 'News United',
    color: '#24664f',
    seed,
    level: 'easy',
  }) as const;
const world = (seed = 'news') => simulatedWorld(founding(seed));
const results = (w: World) =>
  w.ownMatches
    .filter((m) => m.year === w.year)
    .map((m) => {
      const own = m.home === w.playerClub ? m.score.home : m.score.away,
        other = m.home === w.playerClub ? m.score.away : m.score.home;
      return { m, result: own > other ? 'W' : own === other ? 'D' : 'L' };
    });

describe('club news', () => {
  const w = simulatedWorld(founding(), { rounds: 30 });
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
    // Any season's last round will do: the league table is forced below.
    const champion = cachedWorld('last-round', () => {
      const w = simulatedWorld(founding(), { rounds: 30 });
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
    for (const id of Object.keys(champion.tables))
      if (id !== champion.playerClub) champion.tables[id].points = 0;
    champion.tables[champion.playerClub].points = 999;
    closeSeason(champion);
    const honour = clubNews(champion).find((n) => n.id === `${champion.year - 1}:honour:league`);
    expect(honour).toMatchObject({ celebrate: true });
    expect(honour!.title).toContain('우승');
  });
});

const blank = () => Array<number>(12).fill(0);
const find = (news: NewsItem[], id: string) => news.find((n) => n.id === id);

/** A hand-made own match of this season, `us`–`them` from the club's side, even possession. */
function ownMatch(w: World, round: number, us: number, them: number, away = false): MatchRecord {
  const rival = w.clubs.find((c) => c.id !== w.playerClub)!;
  const ours = blank(),
    theirs = blank();
  ours[11] = theirs[11] = 45;
  return {
    id: `hand:${round}`,
    year: w.year,
    round,
    kind: 'league',
    home: away ? rival.id : w.playerClub,
    away: away ? w.playerClub : rival.id,
    country: clubOf(w).country,
    groupKey: 'hand',
    score: away ? { home: them, away: us } : { home: us, away: them },
    metrics: away ? [theirs, ours] : [ours, theirs],
    players: [],
    highlights: [],
    tactics: [w.tactic, w.tactic],
  };
}
/** A player's line with the given metrics (by index) set. */
function playerLine(p: Player, metrics: Record<number, number>) {
  const line = blank();
  for (const [i, value] of Object.entries(metrics)) line[Number(i)] = value;
  return { id: p.id, metrics: line };
}

describe('club news builders on hand-made matches', () => {
  const setup = (seed: string) => {
    const w = world(seed);
    return { w, name: clubOf(w).name, rival: w.clubs.find((c) => c.id !== w.playerClub)!.name };
  };

  it('writes one result line from the goal story, and an early goal', () => {
    const { w, name, rival } = setup('news-result');
    const m = ownMatch(w, 1, 3, 2);
    m.metrics[0][4] = 12;
    m.metrics[1][4] = 7;
    m.highlights = [
      { minute: 2, side: 0, player: 'Early Bird', action: '골' },
      { minute: 30, side: 1, player: 'Them One', action: '골' },
      { minute: 40, side: 1, player: 'Them Two', action: '골' },
      { minute: 60, side: 0, player: 'Us Two', action: '골' },
      { minute: 75, side: 0, player: 'Us Three', action: '골' },
    ];
    w.ownMatches = [m];
    const news = clubNews(w);
    expect(find(news, `${w.year}:hand:1:result`)).toMatchObject({
      order: 1000,
      tag: '경기',
      tone: 'good',
      weight: 'minor',
      title: `${name}, 홈 ${rival}전 3-2 역전승`,
      detail: '1골 차 열세를 뒤집었다 · 점유율 50% · 슈팅 12-7',
    });
    expect(find(news, `${w.year}:hand:1:early-goal`)?.title).toBe(
      '킥오프 2분 만에 골망… Early Bird 번개포',
    );
  });

  it('celebrates the first win and marks a winning run at its milestone lengths', () => {
    const { w, name } = setup('news-runs');
    w.ownMatches = [1, 2, 3, 4, 5].map((round) => ownMatch(w, round, 2, 1));
    const news = clubNews(w);
    const at = (round: number, kind: string) => find(news, `${w.year}:hand:${round}:${kind}`);
    expect(at(1, 'first-win')).toMatchObject({
      weight: 'major',
      celebrate: true,
      title: `${name}, 창단 첫 공식전 승리!`,
    });
    expect(at(2, 'first-win')).toBeUndefined();
    expect(at(3, 'wins-3')?.title).toBe(`${name}, 공식전 3연승`);
    expect(at(4, 'wins-4')).toBeUndefined();
    expect(at(5, 'wins-5')).toMatchObject({
      weight: 'major',
      celebrate: true,
      title: `${name}, 파죽의 5연승`,
    });
    expect(at(5, 'unbeaten-5')?.title).toBe(`${name}, 최근 5경기 무패 행진`);
  });

  it('counts away runs apart from home ones', () => {
    const { w, name, rival } = setup('news-away');
    w.ownMatches = [
      ownMatch(w, 1, 1, 1, true),
      ownMatch(w, 2, 1, 1, true),
      ownMatch(w, 3, 1, 1, true),
      ownMatch(w, 4, 2, 1, true),
      ownMatch(w, 5, 1, 1, true),
    ];
    const news = clubNews(w);
    expect(find(news, `${w.year}:hand:4:first-away-win`)).toMatchObject({
      title: `${name}, 4번째 원정서 마수걸이 승리`,
      detail: `원정 ${rival}전 2-1`,
    });
    expect(find(news, `${w.year}:hand:5:away-unbeaten-5`)?.title).toBe(`${name}, 원정 5경기 무패`);
    expect(news.some((n) => n.id.includes(':home-'))).toBe(false);
  });

  it('reads a dominant home defeat through possession and xG', () => {
    const { w, name, rival } = setup('news-xg');
    const m = ownMatch(w, 1, 0, 1);
    m.metrics[0][11] = 63;
    m.metrics[1][11] = 27;
    m.xg = [2.1, 0.4];
    w.ownMatches = [m];
    const news = clubNews(w);
    expect(find(news, `${w.year}:hand:1:result`)).toMatchObject({
      tone: 'bad',
      title: `${name}, 홈 ${rival}전 0-1 패배`,
      detail: '점유율 70% · 슈팅 0-0 · xG 2.10-0.40',
    });
    expect(find(news, `${w.year}:hand:1:possession-loss`)?.title).toBe(
      '점유율 70%에도 패배… 결정력에 발목',
    );
    expect(find(news, `${w.year}:hand:1:xg-loss`)).toMatchObject({
      weight: 'notable',
      title: 'xG 2.10 대 0.40에도 패배… 지독한 불운',
    });
  });

  it("names a hat-trick and a keeper's saves behind a clean sheet", () => {
    const { w, name, rival } = setup('news-players');
    const scorer = w.players.find((p) => p.position !== 'GK' && !p.id.includes(':academy:'))!,
      keeper = w.players.find((p) => p.position === 'GK')!;
    const m = ownMatch(w, 1, 3, 0);
    m.players = [playerLine(scorer, { 0: 3, 10: 90 }), playerLine(keeper, { 9: 5, 10: 90 })];
    w.ownMatches = [m];
    const news = clubNews(w);
    expect(find(news, `${w.year}:hand:1:hat-trick:${scorer.id}`)).toMatchObject({
      weight: 'major',
      celebrate: true,
      title: `${scorer.name} 해트트릭 폭발… ${name}, 홈 ${rival}전 3-0`,
    });
    expect(find(news, `${w.year}:hand:1:keeper:${keeper.id}`)).toMatchObject({
      title: `${keeper.name}, 선방 5회 '거미손'`,
      detail: `홈 ${rival}전 3-0`,
    });
  });
});

describe('club news from the event texts their producers write', () => {
  const eventItem = (w: World, kind: string, match: (title: string) => boolean) => {
    const index = w.events.findIndex((e) => e.kind === kind && match(e.title));
    expect(index).toBeGreaterThanOrEqual(0);
    return find(clubNews(w), `${w.year}:event-${index}:${kind}`);
  };

  it('reads the week count an injury is written with', () => {
    const w = world('news-injury');
    let hurt: Player | undefined;
    while (!hurt && w.round < 200) {
      w.round++;
      trainingInjuries(w, activePlayers(w));
      hurt = w.players.find((p) => p.injury);
    }
    const injury = hurt!.injury!;
    // Weeks out from the stored return day, at least one: a reworded event would read as 0.
    const weeks = Math.max(1, Math.round((injury.day - dayCountedFrom(w, w.year)) / 7));
    const item = eventItem(w, 'injury', (title) => title.startsWith(hurt!.name));
    expect(item).toMatchObject({
      tag: '선수',
      weight: weeks >= 6 ? 'notable' : 'minor',
      detail: `${seasonDayLabel(w.year, injury.day)} 복귀 예상`,
    });
    expect(item!.title).toMatch(new RegExp(`… 약 ${weeks}주 결장$`));
  });

  it('names the buying club of a 새로운 도전 transfer', () => {
    const w = world('news-transfer');
    w.calendar = { day: 1 };
    const p = activePlayers(w).find((x) => x.position !== 'GK')!,
      club = w.clubs.find((c) => c.id !== w.playerClub && !c.representative)!;
    const bid: TransferBid = {
      id: `sale:${p.id}`,
      direction: 'in',
      playerId: p.id,
      club: club.id,
      fee: '100000',
      year: w.year,
      day: currentDay(w),
      due: currentDay(w) + 3,
      status: 'pending',
    };
    (w.bids ??= []).push(bid);
    respondBid(w, bid.id, true);
    expect(eventItem(w, 'transfer-out', (title) => title.includes(p.name))).toMatchObject({
      tag: '이적',
      title: `[오피셜] ${p.name}, 팀 떠난다`,
      detail: `${club.name} 이적`,
    });
  });

  it('turns a 은퇴 retirement into news', () => {
    const w = world('news-retirement');
    const p = activePlayers(w)[0];
    p.retiring = w.year;
    retireAtClose(w);
    expect(eventItem(w, 'retirement', (title) => title.includes(p.name))).toMatchObject({
      tag: '선수',
      title: `${p.name}, 현역 은퇴`,
    });
  });

  it('turns a passed semi-final into the final and a 64강 pass into itself', () => {
    const w = world('news-cup'),
      name = clubOf(w).name;
    if (!w.cups) prepareCups(w);
    const cup = w.cups!.find((c) => c.country === clubOf(w).country)!;
    const passed = (label: string) => (title: string) => title === `${cup.name} ${label} 통과`;
    // Every tie goes to its home side, every own tie to the club, a round per pass.
    for (let round = 0; round < 10; round++) {
      if (w.events.some((e) => e.kind === 'cup-prize' && passed('4강')(e.title))) break;
      for (const f of cup.fixtures)
        f.score ??= f.away === w.playerClub ? { home: 0, away: 1 } : { home: 1, away: 0 };
      advanceCups(w);
    }
    expect(eventItem(w, 'cup-prize', passed('64강'))).toMatchObject({
      weight: 'minor',
      title: `${name}, ${cup.name} 64강 통과`,
    });
    expect(eventItem(w, 'cup-prize', passed('8강'))).toMatchObject({
      weight: 'notable',
      title: `${name}, ${cup.name} 4강 진출`,
    });
    expect(eventItem(w, 'cup-prize', passed('4강'))).toMatchObject({
      weight: 'major',
      title: `${name}, ${cup.name} 결승 진출`,
    });
  });
});
