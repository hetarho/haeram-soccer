import type { Event, MatchRecord, World } from '../../contracts/src/types';
import { PD, TD } from '../../contracts/src/detail';
import { country } from '../../catalogs/src/index';
import { clubOf } from './world';
import { STYLE_INFO } from './styles';

/**
 * Club news (→HIST-11): headlines derived from recorded facts only, the way football media write
 * them, from streaks and records to possession and xG splits. Nothing is stored: the same career
 * always produces the same feed, and a fact never claims a cause.
 */
export type NewsTag = '경기' | '기록' | '선수' | '순위' | '분석' | '구단' | '이적' | '유스';
export type NewsTone = 'good' | 'neutral' | 'bad';
export type NewsWeight = 'major' | 'notable' | 'minor';
export interface NewsItem {
  /** Stable across reloads: season, source and kind. */
  id: string;
  year: number;
  round: number;
  /** Higher is newer within the feed. */
  order: number;
  tag: NewsTag;
  tone: NewsTone;
  weight: NewsWeight;
  title: string;
  detail?: string;
  /** Achievements the club celebrates (→WEB-52). */
  celebrate?: boolean;
}

/** Items one match may add besides its result line; majors and celebrations always stay. */
export const NEWS_PER_MATCH = 4;
const WEIGHT_RANK: Record<NewsWeight, number> = { major: 0, notable: 1, minor: 2 };

interface Played {
  m: MatchRecord;
  side: 0 | 1;
  gf: number;
  ga: number;
  result: 'W' | 'D' | 'L';
  home: boolean;
  opponent: string;
  possession: number;
  xg?: number;
  xga?: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const one = (value: number) => value.toFixed(1);
const two = (value: number) => value.toFixed(2);

function played(w: World, m: MatchRecord, clubNames: Map<string, string>): Played {
  const side = m.home === w.playerClub ? 0 : 1,
    other = side === 0 ? 1 : 0;
  const gf = side === 0 ? m.score.home : m.score.away,
    ga = side === 0 ? m.score.away : m.score.home;
  const minutes = m.metrics[0][11] + m.metrics[1][11];
  return {
    m,
    side,
    gf,
    ga,
    result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
    home: side === 0,
    opponent: clubNames.get(side === 0 ? m.away : m.home) ?? '상대',
    possession: minutes ? m.metrics[side][11] / minutes : 0.5,
    ...(m.xg ? { xg: m.xg[side], xga: m.xg[other] } : {}),
  };
}

/** The running score through the recorded goals: deficits, leads, and who settled it when. */
function goalStory(p: Played) {
  const goals = p.m.highlights.filter((h) => h.action === '골').sort((a, b) => a.minute - b.minute);
  let us = 0,
    them = 0,
    deficit = 0,
    lead = 0;
  let decisive: { minute: number; player: string } | undefined;
  let equaliser: { minute: number; player: string } | undefined;
  let early: { minute: number; player: string } | undefined;
  for (const goal of goals) {
    const ours = goal.side === p.side;
    const level = us === them;
    if (ours) us++;
    else them++;
    deficit = Math.max(deficit, them - us);
    lead = Math.max(lead, us - them);
    if (ours && level && us > them) decisive = { minute: goal.minute, player: goal.player };
    if (ours && us === them) equaliser = { minute: goal.minute, player: goal.player };
    if (ours && goal.minute <= 2 && !early) early = { minute: goal.minute, player: goal.player };
  }
  const first = goals[0] ? (goals[0].side === p.side ? 'us' : 'them') : undefined;
  return { deficit, lead, decisive, equaliser, early, first };
}

/** Promotion and relegation places of the club's current division. */
function zones(w: World) {
  const own = clubOf(w),
    profile = country(own.country);
  if (w.lower) return { promotion: 1, relegation: 0 };
  return {
    promotion: own.tier > 0 ? profile.automatic[own.tier - 1] : 0,
    relegation: own.tier < profile.groups.length - 1 ? profile.moves[own.tier] : 2,
  };
}

type Candidate = Omit<NewsItem, 'id' | 'year' | 'round' | 'order'> & { kind: string };

export function clubNews(w: World): NewsItem[] {
  const news: NewsItem[] = [];
  const own = clubOf(w);
  const name = own.name;
  const people = new Map(w.players.map((p) => [p.id, p.name]));
  const who = (id: string) => people.get(id) ?? '선수';
  const clubNames = new Map(w.clubs.map((c) => [c.id, c.name]));

  // Club records and runs before this season; streaks continue across the summer.
  const earlier = w.ownMatches.filter((m) => m.year < w.year).map((m) => played(w, m, clubNames));
  const hasHistory = earlier.length > 0;
  let unbeaten = 0,
    winning = 0,
    winless = 0,
    losing = 0,
    scoring = 0,
    clean = 0,
    bestUnbeaten = 0,
    bestWins = 0,
    totalWins = 0,
    biggestMargin = 0;
  const appeared = new Set<string>(),
    careerGoals = new Map<string, number>();
  for (const p of earlier) {
    unbeaten = p.result === 'L' ? 0 : unbeaten + 1;
    winning = p.result === 'W' ? winning + 1 : 0;
    winless = p.result === 'W' ? 0 : winless + 1;
    losing = p.result === 'L' ? losing + 1 : 0;
    scoring = p.gf > 0 ? scoring + 1 : 0;
    clean = p.ga === 0 ? clean + 1 : 0;
    bestUnbeaten = Math.max(bestUnbeaten, unbeaten);
    bestWins = Math.max(bestWins, winning);
    if (p.result === 'W') totalWins++;
    biggestMargin = Math.max(biggestMargin, p.gf - p.ga);
    for (const line of p.m.players) {
      appeared.add(line.id);
      if (line.metrics[0])
        careerGoals.set(line.id, (careerGoals.get(line.id) || 0) + line.metrics[0]);
    }
  }
  const unbeatenRecord = bestUnbeaten,
    winsRecord = bestWins;

  const season = w.ownMatches.filter((m) => m.year === w.year).map((m) => played(w, m, clubNames));
  const scorerRun = new Map<string, number>(),
    drought = new Map<string, number>(),
    seasonGoals = new Map<string, number>(),
    seasonBest = new Map<string, number>(),
    crossed = new Set<string>();
  const possessionGames: Played[] = [],
    ahead: Played[] = [],
    scoredFirst: Played[] = [];
  let homePossessionRun = 0,
    homeUnbeaten = 0,
    awayUnbeaten = 0,
    awayWithoutWin = 0,
    awayWins = 0,
    goalsFor = 0,
    goalsAgainst = 0,
    xgFor = 0,
    xgAgainst = 0,
    xgSample = 0;
  const record = (games: Played[]) => {
    const count = (r: Played['result']) => games.filter((g) => g.result === r).length;
    return `${games.length}전 ${count('W')}승 ${count('D')}무 ${count('L')}패`;
  };

  season.forEach((p, index) => {
    const candidates: Candidate[] = [];
    const add = (
      kind: string,
      tag: NewsTag,
      tone: NewsTone,
      weight: NewsWeight,
      title: string,
      detail?: string,
      celebrate?: boolean,
    ) =>
      candidates.push({
        kind,
        tag,
        tone,
        weight,
        title,
        ...(detail ? { detail } : {}),
        ...(celebrate ? { celebrate } : {}),
      });
    const score = `${p.gf}-${p.ga}`,
      versus = `${p.home ? '홈' : '원정'} ${p.opponent}전`,
      story = goalStory(p);
    const shots = `${p.m.metrics[p.side][4]}-${p.m.metrics[p.side === 0 ? 1 : 0][4]}`;
    const facts = [
      `점유율 ${percent(p.possession)}`,
      `슈팅 ${shots}`,
      ...(p.xg !== undefined ? [`xG ${two(p.xg)}-${two(p.xga!)}`] : []),
    ].join(' · ');

    // One result line for every match; the most telling story wins it.
    if (p.result === 'W' && story.deficit > 0)
      add(
        'result',
        '경기',
        'good',
        story.deficit >= 2 ? 'notable' : 'minor',
        `${name}, ${versus} ${score} 역전승`,
        `${story.deficit}골 차 열세를 뒤집었다 · ${facts}`,
      );
    else if (p.result === 'W' && story.decisive && story.decisive.minute >= 88)
      add(
        'result',
        '경기',
        'good',
        'notable',
        `'${story.decisive.minute}분 극장골' ${story.decisive.player}… ${name}, ${versus} ${score} 승리`,
        facts,
      );
    else if (p.result !== 'W' && story.lead >= 2)
      add(
        'result',
        '경기',
        'bad',
        'notable',
        `${name}, 2골 차 리드 못 지켜… ${versus} ${score} ${p.result === 'D' ? '무승부' : '역전패'}`,
        facts,
      );
    else if (p.result === 'D' && story.equaliser && story.equaliser.minute >= 88 && p.gf > 0)
      add(
        'result',
        '경기',
        'good',
        'minor',
        `${story.equaliser.minute}분 동점골… ${name}, ${versus} ${score} 기사회생`,
        facts,
      );
    else if (p.result === 'W' && p.gf - p.ga >= 3)
      add('result', '경기', 'good', 'notable', `${name}, ${versus} ${score} 대승`, facts);
    else if (p.result === 'L' && p.ga - p.gf >= 3)
      add('result', '경기', 'bad', 'notable', `${name}, ${versus} ${score} 완패`, facts);
    else if (p.result === 'W' && p.ga === 0)
      add('result', '경기', 'good', 'minor', `${name}, ${versus} ${score} 무실점 승리`, facts);
    else
      add(
        'result',
        '경기',
        p.result === 'W' ? 'good' : p.result === 'L' ? 'bad' : 'neutral',
        'minor',
        `${name}, ${versus} ${score} ${p.result === 'W' ? '승리' : p.result === 'D' ? '무승부' : '패배'}`,
        facts,
      );
    if (story.early)
      add(
        'early-goal',
        '경기',
        'good',
        'minor',
        `킥오프 ${story.early.minute}분 만에 골망… ${story.early.player} 번개포`,
        versus,
      );

    // Club records and milestones.
    if (p.result === 'W' && totalWins === 0)
      add(
        'first-win',
        '기록',
        'good',
        'major',
        `${name}, 창단 첫 공식전 승리!`,
        `${versus} ${score}`,
        true,
      );
    if (p.result === 'W') {
      totalWins++;
      if (totalWins % 50 === 0)
        add(
          'win-milestone',
          '기록',
          'good',
          'major',
          `${name}, 구단 통산 ${totalWins}승 금자탑`,
          `${versus} ${score}`,
          totalWins % 100 === 0,
        );
    }
    if (p.result === 'W' && p.gf - p.ga > biggestMargin && p.gf - p.ga >= 3 && hasHistory)
      add(
        'record-margin',
        '기록',
        'good',
        'major',
        `${name}, ${p.opponent} ${score} 대파… 구단 역대 최다 점수 차 승리`,
        `종전 기록 ${biggestMargin}골 차`,
        true,
      );
    biggestMargin = Math.max(biggestMargin, p.gf - p.ga);

    // Runs across all official matches, news at milestone lengths only.
    const wasUnbeaten = unbeaten,
      wasWinless = winless;
    unbeaten = p.result === 'L' ? 0 : unbeaten + 1;
    winning = p.result === 'W' ? winning + 1 : 0;
    winless = p.result === 'W' ? 0 : winless + 1;
    losing = p.result === 'L' ? losing + 1 : 0;
    scoring = p.gf > 0 ? scoring + 1 : 0;
    clean = p.ga === 0 ? clean + 1 : 0;
    const unbeatenRecordBroken = hasHistory && unbeatenRecord >= 5 && unbeaten > unbeatenRecord;
    if (unbeatenRecordBroken && unbeaten === unbeatenRecord + 1)
      add(
        `unbeaten-record-${unbeaten}`,
        '기록',
        'good',
        'major',
        `${name}, 공식전 ${unbeaten}경기 무패… 구단 최다 기록 경신`,
        `종전 기록 ${unbeatenRecord}경기`,
        unbeaten >= 8,
      );
    else if ([5, 10, 15, 20, 25, 30].includes(unbeaten))
      add(
        `unbeaten-${unbeaten}`,
        '기록',
        'good',
        unbeaten >= 10 ? 'notable' : 'minor',
        `${name}, 최근 ${unbeaten}경기 무패 행진${unbeatenRecordBroken ? '… 구단 최다 기록 진행 중' : ''}`,
        `${versus} ${score}`,
      );
    bestUnbeaten = Math.max(bestUnbeaten, unbeaten);
    if (p.result === 'L' && wasUnbeaten >= 5)
      add(
        'unbeaten-ended',
        '기록',
        'neutral',
        'notable',
        `${name}의 ${wasUnbeaten}경기 무패 행진, ${p.opponent}에 막혀 마감`,
        `${versus} ${score}`,
      );
    const winsRecordBroken = hasHistory && winsRecord >= 3 && winning > winsRecord;
    if (winsRecordBroken && winning === winsRecord + 1)
      add(
        `wins-record-${winning}`,
        '기록',
        'good',
        'major',
        `${name}, 공식전 ${winning}연승… 구단 최다 연승 기록 경신`,
        `종전 기록 ${winsRecord}연승`,
        winning >= 5,
      );
    else if ([3, 5, 7, 10].includes(winning))
      add(
        `wins-${winning}`,
        '기록',
        'good',
        winning >= 5 ? 'major' : 'notable',
        winning >= 5 ? `${name}, 파죽의 ${winning}연승` : `${name}, 공식전 ${winning}연승`,
        `${versus} ${score}`,
        winning === 5 && !hasHistory,
      );
    bestWins = Math.max(bestWins, winning);
    if (p.result === 'W' && wasWinless >= 4)
      add(
        'winless-ended',
        '기록',
        'good',
        'notable',
        `${name}, ${wasWinless + 1}경기 만에 승리… 무승 탈출`,
        `${versus} ${score}`,
      );
    if ([5, 8, 10, 15].includes(winless))
      add(
        `winless-${winless}`,
        '기록',
        'bad',
        'notable',
        `${name}, ${winless}경기째 무승… 길어지는 부진`,
      );
    if ([3, 4, 5, 7].includes(losing))
      add(
        `losing-${losing}`,
        '기록',
        'bad',
        'notable',
        `${name}, ${losing}연패 수렁… 반등 실마리 찾아야`,
        `${versus} ${score}`,
      );
    if ([3, 5, 7].includes(clean))
      add(
        `clean-${clean}`,
        '기록',
        'good',
        'notable',
        `${name}, ${clean}경기 연속 클린시트… '짠물 수비'`,
      );
    if ([10, 15, 20].includes(scoring))
      add(
        `scoring-${scoring}`,
        '기록',
        'good',
        'minor',
        `${name}, ${scoring}경기 연속 득점… 식지 않는 화력`,
      );
    if (index === 4) {
      const opening = season.slice(0, 5);
      if (opening.every((g) => g.result !== 'L'))
        add(
          'opening-unbeaten',
          '기록',
          'good',
          'notable',
          `${name}, 개막 5경기 무패 순항`,
          record(opening),
        );
      else if (opening.every((g) => g.result !== 'W'))
        add(
          'opening-winless',
          '기록',
          'bad',
          'notable',
          `${name}, 개막 5경기 무승… 출발부터 삐걱`,
          record(opening),
        );
    }

    // Home and away runs.
    if (p.home) {
      homeUnbeaten = p.result === 'L' ? 0 : homeUnbeaten + 1;
      if ([5, 10, 15].includes(homeUnbeaten))
        add(
          `home-unbeaten-${homeUnbeaten}`,
          '기록',
          'good',
          'minor',
          `${name}, 홈 ${homeUnbeaten}경기 무패… 안방 불패`,
        );
    } else {
      awayUnbeaten = p.result === 'L' ? 0 : awayUnbeaten + 1;
      if ([5, 8, 10].includes(awayUnbeaten))
        add(
          `away-unbeaten-${awayUnbeaten}`,
          '기록',
          'good',
          'minor',
          `${name}, 원정 ${awayUnbeaten}경기 무패`,
        );
      if (p.result === 'W') {
        if (!awayWins && awayWithoutWin >= 3)
          add(
            'first-away-win',
            '기록',
            'good',
            'minor',
            `${name}, ${awayWithoutWin + 1}번째 원정서 마수걸이 승리`,
            `${versus} ${score}`,
          );
        awayWins++;
        awayWithoutWin = 0;
      } else awayWithoutWin++;
    }

    // Possession, first goals and expected goals.
    if (p.home) {
      homePossessionRun = p.possession >= 0.6 ? homePossessionRun + 1 : 0;
      if ([3, 5, 8].includes(homePossessionRun))
        add(
          `home-possession-${homePossessionRun}`,
          '분석',
          'neutral',
          'minor',
          `홈 ${homePossessionRun}경기 연속 점유율 60% 이상… 점유율 축구 안착`,
          `이번 경기 점유율 ${percent(p.possession)}`,
        );
    }
    if (p.possession >= 0.6) {
      possessionGames.push(p);
      const won = possessionGames.filter((g) => g.result === 'W').length,
        rate = won / possessionGames.length;
      // A coin flip is not news: only a strong pattern either way is.
      if ([5, 10, 15, 20].includes(possessionGames.length) && (rate >= 0.7 || rate <= 0.2))
        add(
          `possession-split-${possessionGames.length}`,
          '분석',
          rate >= 0.7 ? 'good' : 'bad',
          'notable',
          `점유율 60% 넘긴 경기 승률 ${percent(rate)}${rate >= 0.7 ? "… '공 잡으면 이긴다'" : '… 점유는 하는데'}`,
          record(possessionGames),
        );
    }
    if (p.possession > 0.5) {
      ahead.push(p);
      if ([10, 20, 30].includes(ahead.length)) {
        const won = ahead.filter((g) => g.result === 'W').length;
        add(
          `possession-ahead-${ahead.length}`,
          '분석',
          'neutral',
          'minor',
          `점유율에서 앞선 경기 승률 ${percent(won / ahead.length)}`,
          record(ahead),
        );
      }
    }
    if (p.result === 'W' && p.possession <= 0.35)
      add(
        'low-possession-win',
        '분석',
        'good',
        'minor',
        `점유율 ${percent(p.possession)}로 승리… 실리 축구의 정석`,
        `${versus} ${score}`,
      );
    if (p.result === 'L' && p.possession >= 0.65)
      add(
        'possession-loss',
        '분석',
        'bad',
        'minor',
        `점유율 ${percent(p.possession)}에도 패배… 결정력에 발목`,
        `${versus} ${score}`,
      );
    if (story.first === 'us') {
      scoredFirst.push(p);
      if ([5, 10, 15, 20].includes(scoredFirst.length)) {
        const dropped = scoredFirst.filter((g) => g.result !== 'W').length;
        add(
          `scored-first-${scoredFirst.length}`,
          '분석',
          dropped ? 'neutral' : 'good',
          'minor',
          dropped
            ? `선제골 넣은 경기 ${record(scoredFirst)}`
            : `선제골 넣은 ${scoredFirst.length}경기 전승… 리드를 지키는 팀`,
        );
      }
    }
    if (p.xg !== undefined && p.xga !== undefined) {
      xgFor += p.xg;
      xgAgainst += p.xga;
      xgSample++;
      goalsFor += p.gf;
      goalsAgainst += p.ga;
      if (p.result === 'L' && p.xg - p.xga >= 1)
        add(
          'xg-loss',
          '분석',
          'bad',
          'notable',
          `xG ${two(p.xg)} 대 ${two(p.xga)}에도 패배… 지독한 불운`,
          `${versus} ${score}`,
        );
      else if (p.result === 'W' && p.xga - p.xg >= 1)
        add(
          'xg-steal',
          '분석',
          'good',
          'minor',
          `기대득점 열세 딛고 승리… 효율 축구 빛났다`,
          `xG ${two(p.xg)}-${two(p.xga)} · ${versus} ${score}`,
        );
      const finishing = goalsFor - xgFor,
        keeping = xgAgainst - goalsAgainst;
      // Each gap level is news once a season, after enough matches to mean something.
      const once = (key: string, reached: boolean, write: () => void) => {
        if (!reached || crossed.has(key) || xgSample < 8) return;
        crossed.add(key);
        write();
      };
      for (const level of [5, 8, 12]) {
        once(`finishing-hot-${level}`, finishing >= level, () =>
          add(
            `finishing-hot-${level}`,
            '분석',
            'good',
            'notable',
            `기대득점보다 ${one(finishing)}골 더… 매서운 결정력`,
            `${goalsFor}골 · xG ${one(xgFor)}`,
          ),
        );
        once(`finishing-cold-${level}`, -finishing >= level, () =>
          add(
            `finishing-cold-${level}`,
            '분석',
            'bad',
            'notable',
            `xG 대비 −${one(-finishing)}골… 결정력 빨간불`,
            `${goalsFor}골 · xG ${one(xgFor)}`,
          ),
        );
        once(`keeping-hot-${level}`, keeping >= level, () =>
          add(
            `keeping-hot-${level}`,
            '분석',
            'good',
            'notable',
            `기대실점보다 ${one(keeping)}골 덜 내줘… 골문 철벽`,
            `${goalsAgainst}실점 · xGA ${one(xgAgainst)}`,
          ),
        );
      }
    }

    // Season highs and lows of the team (from the fourth match on).
    const best = (key: string, value: number | undefined, higher: boolean, write: () => void) => {
      if (value === undefined) return;
      const previous = seasonBest.get(key);
      seasonBest.set(
        key,
        previous === undefined
          ? value
          : higher
            ? Math.max(previous, value)
            : Math.min(previous, value),
      );
      if (index >= 3 && previous !== undefined && (higher ? value > previous : value < previous))
        write();
    };
    const attempts = p.m.metrics[p.side][2],
      completed = p.m.metrics[p.side][3],
      shotCount = p.m.metrics[p.side][4];
    best('possession', p.possession, true, () => {
      if (p.possession >= 0.6)
        add(
          'season-possession',
          '분석',
          'neutral',
          'minor',
          `점유율 ${percent(p.possession)}… 시즌 최고 점유율`,
          `${versus} ${score}`,
        );
    });
    best('passing', attempts >= 150 ? completed / attempts : undefined, true, () => {
      if (completed / attempts >= 0.82)
        add(
          'season-passing',
          '분석',
          'good',
          'minor',
          `패스 성공률 ${percent(completed / attempts)}… 시즌 최고`,
          `${completed}/${attempts} · ${versus}`,
        );
    });
    best('shots', shotCount, true, () => {
      if (shotCount >= 12)
        add(
          'season-shots',
          '분석',
          'good',
          'minor',
          `슈팅 ${shotCount}개 폭격… 시즌 최다`,
          `${versus} ${score}`,
        );
    });
    best('xg', p.xg, true, () => {
      if (p.xg! >= 2)
        add(
          'season-xg',
          '분석',
          'good',
          'minor',
          `기대득점(xG) ${two(p.xg!)}… 시즌 최고 화력`,
          `${versus} ${score}`,
        );
    });
    const detail = p.m.detail;
    if (detail) {
      const t = detail[p.side],
        o = detail[p.side === 0 ? 1 : 0];
      const ppda = t[TD.pressActions] ? o[TD.buildUpPasses] / t[TD.pressActions] : undefined;
      best('ppda', ppda, false, () => {
        if (ppda! <= 7)
          add(
            'season-ppda',
            '분석',
            'good',
            'minor',
            `PPDA ${one(ppda!)}… 시즌 가장 강한 전방 압박`,
            `상대 빌드업 패스 ${o[TD.buildUpPasses]}회 · 압박 수비 ${t[TD.pressActions]}회`,
          );
      });
      best('high-turnovers', t[TD.highTurnovers], true, () => {
        if (t[TD.highTurnovers] >= 9)
          add(
            'season-high-turnovers',
            '분석',
            'good',
            'minor',
            `하이 턴오버 ${t[TD.highTurnovers]}회… 시즌 최다`,
            versus,
          );
      });
      best('key-passes', t[TD.keyPasses], true, () => {
        if (t[TD.keyPasses] >= 10)
          add(
            'season-key-passes',
            '분석',
            'good',
            'minor',
            `키패스 ${t[TD.keyPasses]}개… 시즌 최다 찬스 메이킹`,
            versus,
          );
      });
      if (t[TD.bigChances] >= 4 && t[TD.bigChancesScored] === 0)
        add(
          'big-chances-missed',
          '분석',
          'bad',
          'minor',
          `빅찬스 ${t[TD.bigChances]}번 모두 놓쳤다`,
          versus,
        );
    }

    // Our players. In the club's very first match everyone debuts, which is no news.
    const clubHasPlayed = appeared.size > 0;
    for (const line of p.m.players) {
      const player = who(line.id),
        goals = line.metrics[0],
        assists = line.metrics[1],
        debut = clubHasPlayed && !appeared.has(line.id);
      appeared.add(line.id);
      if (goals >= 3)
        add(
          `hat-trick:${line.id}`,
          '선수',
          'good',
          'major',
          `${player} 해트트릭 폭발… ${name}, ${versus} ${score}`,
          undefined,
          true,
        );
      else if (goals >= 1 && goals + assists >= 3)
        add(
          `one-man-show:${line.id}`,
          '선수',
          'good',
          'notable',
          `${player}, ${goals}골 ${assists}도움 원맨쇼`,
          `${versus} ${score}`,
        );
      else if (goals === 2)
        add(
          `brace:${line.id}`,
          '선수',
          'good',
          'notable',
          p.result === 'W'
            ? `'${player} 멀티골' ${name}, ${versus} ${score} 승리`
            : `${player} 멀티골에도… ${versus} ${score} ${p.result === 'D' ? '무승부' : '패배'}`,
        );
      if (assists >= 3)
        add(
          `assists:${line.id}`,
          '선수',
          'good',
          'notable',
          `${player}, 도움 해트트릭… 특급 도우미`,
          versus,
        );
      const careerBefore = careerGoals.get(line.id) || 0;
      if (goals && careerBefore === 0 && line.id.includes(':academy:'))
        add(
          `academy-goal:${line.id}`,
          '유스',
          'good',
          'major',
          `'성골 유스' ${player}, 1군 데뷔골`,
          versus,
          true,
        );
      else if (goals && debut)
        add(
          `debut-goal:${line.id}`,
          '선수',
          'good',
          'notable',
          `${player}, 데뷔전 데뷔골… 화려한 신고식`,
          versus,
        );
      const run = goals > 0 ? (scorerRun.get(line.id) || 0) + 1 : 0;
      scorerRun.set(line.id, run);
      if ([3, 4, 5, 7, 10].includes(run))
        add(
          `scoring-run:${line.id}:${run}`,
          '선수',
          'good',
          run >= 5 ? 'notable' : 'minor',
          `${player}, ${run}경기 연속골… 물오른 득점 감각`,
        );
      const before = seasonGoals.get(line.id) || 0,
        after = before + goals;
      seasonGoals.set(line.id, after);
      if (goals) {
        for (const mark of [10, 15, 20, 25, 30])
          if (before < mark && after >= mark)
            add(
              `season-goals:${line.id}:${mark}`,
              '선수',
              'good',
              'notable',
              `${player}, 시즌 ${mark}호골… ${mark === 10 ? '두 자릿수 득점 고지' : '득점 행진'}`,
            );
        careerGoals.set(line.id, careerBefore + goals);
        for (const mark of [50, 100, 150, 200])
          if (careerBefore < mark && careerBefore + goals >= mark)
            add(
              `career-goals:${line.id}:${mark}`,
              '선수',
              'good',
              'major',
              `${player}, 구단 통산 ${mark}호골 대기록`,
              undefined,
              true,
            );
      }
      const dry = goals ? 0 : (drought.get(line.id) || 0) + 1;
      drought.set(line.id, dry);
      if (after >= 5 && [6, 10].includes(dry))
        add(
          `drought:${line.id}:${dry}`,
          '선수',
          'bad',
          'minor',
          `${player}, ${dry}경기째 침묵… 골 가뭄 길어진다`,
        );
      if (line.metrics[2] >= 50 && line.metrics[3] / line.metrics[2] >= 0.95)
        add(
          `passing:${line.id}`,
          '선수',
          'good',
          'minor',
          `${player}, 패스 성공률 ${percent(line.metrics[3] / line.metrics[2])}… 중원 사령관`,
          `${line.metrics[3]}/${line.metrics[2]}`,
        );
      if (line.metrics[6] + line.metrics[7] >= 10)
        add(
          `hoover:${line.id}`,
          '선수',
          'good',
          'minor',
          `${player}, 태클·인터셉트 ${line.metrics[6] + line.metrics[7]}회… '진공청소기'`,
          versus,
        );
      if (line.metrics[9] >= 7 || (line.metrics[9] >= 5 && p.ga === 0))
        add(
          `keeper:${line.id}`,
          '선수',
          'good',
          'notable',
          `${player}, 선방 ${line.metrics[9]}회 '거미손'`,
          `${versus} ${score}`,
        );
      const d = line.detail;
      if (d) {
        if (d[PD.keyPasses] >= 5)
          add(
            `key-passes:${line.id}`,
            '선수',
            'good',
            'minor',
            `${player}, 키패스 ${d[PD.keyPasses]}개로 찬스 메이킹`,
            `xA ${two(d[PD.xa] / 100)}`,
          );
        if (d[PD.xg] >= 150 && goals === 0)
          add(
            `xg-blank:${line.id}`,
            '선수',
            'bad',
            'minor',
            `${player}, xG ${two(d[PD.xg] / 100)}에도 무득점`,
            versus,
          );
      }
    }

    // Keep the result line, every major item and celebration, then the strongest of the rest.
    const [result, ...rest] = candidates;
    const kept = rest
      .map((candidate, at) => ({ candidate, at }))
      .sort(
        (a, b) =>
          Number(!!b.candidate.celebrate) - Number(!!a.candidate.celebrate) ||
          WEIGHT_RANK[a.candidate.weight] - WEIGHT_RANK[b.candidate.weight] ||
          a.at - b.at,
      )
      .filter(
        ({ candidate }, rank) =>
          candidate.celebrate || candidate.weight === 'major' || rank < NEWS_PER_MATCH,
      )
      .sort((a, b) => a.at - b.at)
      .map(({ candidate }) => candidate);
    const order = p.m.round * 1000 + index * 10;
    [result, ...kept].forEach(({ kind, ...item }, seq) =>
      news.push({
        ...item,
        id: `${w.year}:${p.m.id}:${kind}`,
        year: w.year,
        round: p.m.round,
        order: order + seq,
      }),
    );
  });

  tableNews(w, name).forEach((item) => news.push(item));
  w.events.forEach((event, index) => {
    const item = eventNews(w, name, event, index);
    if (item) news.push(item);
  });
  for (const honour of honours(w)) news.push(honour);
  return news.sort((a, b) => b.year - a.year || b.order - a.order);
}

/** League position from the round snapshots of this season. */
function tableNews(w: World, name: string): NewsItem[] {
  const own = clubOf(w),
    ownIndex = w.clubs.findIndex((c) => c.id === w.playerClub),
    items: NewsItem[] = [];
  const snapshots = (w.rankHistory || []).filter(
    (s) => s.year === w.year && s.round > 0 && s.tier === own.tier && s.group === own.group,
  );
  const { promotion, relegation } = zones(w);
  let previousRank: number | undefined,
    topRounds = 0,
    beenTop = false;
  const leadMarks = new Set<number>();
  for (const snapshot of snapshots) {
    const rank = snapshot.rows.findIndex((row) => row[0] === ownIndex) + 1;
    if (!rank) continue;
    const size = snapshot.rows.length;
    const item = (
      kind: string,
      tone: NewsTone,
      weight: NewsWeight,
      title: string,
      detail?: string,
      celebrate?: boolean,
    ) =>
      items.push({
        id: `${w.year}:round-${snapshot.round}:${kind}`,
        year: w.year,
        round: snapshot.round,
        order: snapshot.round * 1000 + 900 + (items.length % 50),
        tag: '순위',
        tone,
        weight,
        title,
        ...(detail ? { detail } : {}),
        ...(celebrate ? { celebrate } : {}),
      });
    topRounds = rank === 1 ? topRounds + 1 : 0;
    if (previousRank !== undefined && snapshot.round >= 3) {
      const second = snapshot.rows[1];
      if (rank === 1 && previousRank > 1) {
        item(
          'top',
          'good',
          'major',
          beenTop ? `${name}, 선두 탈환` : `${name}, 리그 선두 등극!`,
          second ? `2위와 승점 ${snapshot.rows[0][1] - second[1]}점 차` : undefined,
          !beenTop,
        );
        beenTop = true;
      } else if ([5, 10, 15, 20].includes(topRounds))
        item(`top-${topRounds}`, 'good', 'notable', `${name}, ${topRounds}라운드째 선두 질주`);
      if (rank === 1 && second && snapshot.round >= 15) {
        const gap = snapshot.rows[0][1] - second[1];
        for (const mark of [6, 10, 15])
          if (gap >= mark && !leadMarks.has(mark)) {
            leadMarks.add(mark);
            item(`lead-${mark}`, 'good', 'notable', `${name}, 2위와 승점 ${gap}점 차… 독주 체제`);
          }
      }
      if (promotion && rank <= promotion && previousRank > promotion && rank !== 1)
        item('promotion-zone', 'good', 'notable', `${name}, 자동 승격권 진입… ${rank}위`);
      if (relegation && rank > size - relegation && previousRank <= size - relegation)
        item('relegation-zone', 'bad', 'notable', `${name}, 강등권 추락… ${rank}위`);
      if (relegation && rank <= size - relegation && previousRank > size - relegation)
        item('escape', 'good', 'notable', `${name}, 강등권 탈출… ${rank}위`);
      if (previousRank - rank >= 3 && rank !== 1)
        item(
          'climb',
          'good',
          'minor',
          `${name}, 단숨에 ${previousRank - rank}계단 도약… ${rank}위`,
        );
    }
    previousRank = rank;
  }
  return items;
}

/** Trophies of the season that just closed: the league, the domestic cup and continental cups. */
function honours(w: World): NewsItem[] {
  const last = w.history.at(-1);
  if (!last || last.year !== w.year - 1) return [];
  const name = clubOf(w).name,
    items: NewsItem[] = [];
  const base = (kind: string) => ({
    id: `${last.year}:honour:${kind}`,
    year: last.year,
    round: 46,
    order: 46 * 1000 + 990,
    tag: '기록' as const,
    tone: 'good' as const,
    weight: 'major' as const,
    celebrate: true,
  });
  if (last.rank === 1)
    items.push({
      ...base('league'),
      title: `${name}, ${last.tier === 0 ? '리그 우승!' : `${last.tier + 1}부 우승!`}`,
      detail: `승점 ${last.points} · ${last.won}승 ${last.drawn}무 ${last.lost}패`,
    });
  const cup = last.champions.find((c) => c.cup === w.playerClub);
  if (cup) items.push({ ...base('cup'), title: `${name}, ${country(cup.country).name} 컵 우승!` });
  for (const europe of last.europe)
    if (europe.winner === w.playerClub)
      items.push({ ...base(`europe-${europe.kind}`), title: `${name}, ${europe.name} 정상!` });
  return items;
}

/** Club decisions and outcomes worth a headline; the rest of the ledger stays in the archive. */
function eventNews(w: World, name: string, event: Event, index: number): NewsItem | undefined {
  const recent =
    event.year === w.year ||
    (event.year === w.year - 1 && ['promotion', 'relegation'].includes(event.kind));
  if (!recent) return undefined;
  const base = {
    id: `${event.year}:event-${index}:${event.kind}`,
    year: event.year,
    round: event.round,
    order: event.round * 1000 + 500 + (index % 400),
  };
  const first = (text: string) => text.split(' · ')[0];
  switch (event.kind) {
    case 'transfer-in':
      return {
        ...base,
        tag: '이적',
        tone: 'good',
        weight: 'notable',
        title: `[오피셜] ${event.title} 완료`,
        detail: first(event.detail),
      };
    case 'transfer-out':
      return {
        ...base,
        tag: '이적',
        tone: 'neutral',
        weight: 'notable',
        title: `[오피셜] ${event.title.replace('의 새로운 도전', '')}, 팀 떠난다`,
        detail: first(event.detail),
      };
    case 'manager-hire': {
      const style = Object.values(STYLE_INFO).find((info) => event.detail.startsWith(info.label));
      return {
        ...base,
        tag: '구단',
        tone: 'neutral',
        weight: 'major',
        title: `[오피셜] ${event.title}`,
        detail: style ? style.school : first(event.detail),
      };
    }
    case 'manager-departure':
      return {
        ...base,
        tag: '구단',
        tone: 'bad',
        weight: 'major',
        title: event.title,
        detail: event.detail,
      };
    case 'youth-intake':
      return {
        ...base,
        tag: '유스',
        tone: 'neutral',
        weight: 'minor',
        title: event.title,
        detail: event.detail,
      };
    case 'youth-promotion':
      return {
        ...base,
        tag: '유스',
        tone: 'good',
        weight: 'notable',
        title: `'유스 출신' ${event.title}`,
        detail: first(event.detail),
      };
    case 'facility':
      return {
        ...base,
        tag: '구단',
        tone: 'good',
        weight: 'minor',
        title: `${name}, 구장 시설 확장`,
        detail: first(event.detail),
      };
    case 'sponsor-sign':
      return {
        ...base,
        tag: '구단',
        tone: 'neutral',
        weight: 'minor',
        title: `${name}, 새 메인 스폰서와 계약`,
        detail: first(event.detail),
      };
    // Older saves record a vision; both read as the club announcing its direction.
    case 'vision':
    case 'build': {
      const label = event.title.split(' · ')[1] ?? event.title;
      return {
        ...base,
        tag: '구단',
        tone: 'neutral',
        weight: 'notable',
        title: `${name}, ${event.kind === 'build' ? '구단 빌드' : '구단 비전'} '${label}' 발표`,
        ...(event.kind === 'build' ? { detail: event.detail } : {}),
      };
    }
    case 'care:backing':
      return {
        ...base,
        tag: '구단',
        tone: 'neutral',
        weight: 'notable',
        title: '구단주, 감독 재신임 발표',
      };
    case 'care:win-bonus':
      return {
        ...base,
        tag: '구단',
        tone: 'neutral',
        weight: 'minor',
        title: '구단주, 다음 5경기 승리 수당 걸었다',
      };
    case 'promotion':
      return {
        ...base,
        tag: '순위',
        tone: 'good',
        weight: 'major',
        title: `${name}, 승격 확정!`,
        detail: event.detail,
        celebrate: true,
      };
    case 'relegation':
      return {
        ...base,
        tag: '순위',
        tone: 'bad',
        weight: 'major',
        title: `${name}, 강등`,
        detail: event.detail,
      };
    default:
      return undefined;
  }
}
