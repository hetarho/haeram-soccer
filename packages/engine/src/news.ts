import { linkPlayer } from './player-records';
import { message as sourceMessage } from '../../contracts/src/messages';
import { eventsInSeason } from './season-index';
import type { Event, MatchRecord, Player, World } from '../../contracts/src/types';
import { PD, TD } from '../../contracts/src/detail';
import { country } from '../../catalogs/src/index';
import { clubOf, lastOwnSeason } from './player-state';
import { STYLE_INFO } from './styles';
import { buildTitleName } from './build';

/**
 * Club news (→HIST-11): headlines derived from recorded facts only, the way football media write
 * them, from streaks and records to possession and xG splits. A maintained journal records each
 * source once; legacy pure reads support reconstruction. A fact never claims a cause.
 */
export type { NewsItem } from '../../contracts/src/news';
import {
  NEWS_LIMITS,
  type NewsItem,
  type NewsState,
  type NewsResult,
  type NewsJournal,
} from '../../contracts/src/news';
export type NewsTag = NewsItem['tag'];
export type NewsTone = NewsItem['tone'];
export type NewsWeight = NewsItem['weight'];

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
    opponent:
      clubNames.get(side === 0 ? m.away : m.home) ?? sourceMessage('copy.MatchBriefing.6a3b6fa71b'),
    possession: minutes ? m.metrics[side][11] / minutes : 0.5,
    ...(m.xg ? { xg: m.xg[side], xga: m.xg[other] } : {}),
  };
}

/** The running score through the recorded goals: deficits, leads, and who settled it when. */
function goalStory(p: Played) {
  const goals = p.m.highlights
    .filter((h) => h.action === sourceMessage('copy.summary.68a6cf8ed8'))
    .sort((a, b) => a.minute - b.minute);
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

/**
 * Promotion and relegation places of the club's current division; the last division relegates
 * nobody (→LEAGUE-16).
 */
function zones(w: World) {
  const own = clubOf(w),
    profile = country(own.country);
  return {
    promotion: own.tier > 0 ? profile.automatic[own.tier - 1] : 0,
    relegation: own.tier < profile.groups.length - 1 ? profile.moves[own.tier] : 0,
  };
}

type Candidate = Omit<NewsItem, 'id' | 'year' | 'round' | 'order'> & { kind: string };
type Line = MatchRecord['players'][number];

const record = (games: NewsResult[]) => {
  const count = (r: NewsResult) => games.filter((g) => g === r).length;
  return sourceMessage('copy.CareerClubDetail.bb90701b0c', {
    p0: games.length,
    p1: count('W'),
    p2: count('D'),
    p3: count('L'),
  });
};

/**
 * What the builders read, and the runs and tallies they carry from one match to the next: built
 * once per `clubNews` call, then moved on by every match of the season in order.
 */
interface NewsContext {
  w: World;
  name: string;
  who: (id: string) => string;
  season: NewsResult[];
  /** Records before this season; a record needs history to be broken. */
  hasHistory: boolean;
  unbeatenRecord: number;
  winsRecord: number;
  /** Runs across all official matches; they continue across the summer. */
  unbeaten: number;
  winning: number;
  winless: number;
  losing: number;
  scoring: number;
  clean: number;
  totalWins: number;
  biggestMargin: number;
  /** Everyone who has played for the club, and his goals for it. */
  appeared: Set<string>;
  careerGoals: Map<string, number>;
  /** This season's tallies. */
  scorerRun: Map<string, number>;
  drought: Map<string, number>;
  seasonGoals: Map<string, number>;
  seasonBest: Map<string, number>;
  crossed: Set<string>;
  possessionGames: NewsResult[];
  ahead: NewsResult[];
  scoredFirst: NewsResult[];
  homePossessionRun: number;
  homeUnbeaten: number;
  awayUnbeaten: number;
  awayWithoutWin: number;
  awayWins: number;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  xgSample: number;
}

/** One match being written up: its facts and the candidates its builders push, in order. */
interface MatchNews {
  p: Played;
  index: number;
  score: string;
  versus: string;
  story: ReturnType<typeof goalStory>;
  candidates: Candidate[];
  add: (
    kind: string,
    tag: NewsTag,
    tone: NewsTone,
    weight: NewsWeight,
    title: string,
    detail?: string,
    celebrate?: boolean,
  ) => void;
}

/** A result moves every run on by one match. */
function advanceRuns(ctx: NewsContext, p: Played) {
  ctx.unbeaten = p.result === 'L' ? 0 : ctx.unbeaten + 1;
  ctx.winning = p.result === 'W' ? ctx.winning + 1 : 0;
  ctx.winless = p.result === 'W' ? 0 : ctx.winless + 1;
  ctx.losing = p.result === 'L' ? ctx.losing + 1 : 0;
  ctx.scoring = p.gf > 0 ? ctx.scoring + 1 : 0;
  ctx.clean = p.ga === 0 ? ctx.clean + 1 : 0;
}

/** Club records and runs before this season; streaks continue across the summer. */
function newsContext(w: World): NewsContext {
  const people = new Map(w.players.map((p) => [p.id, p.name]));
  const clubNames = new Map(w.clubs.map((c) => [c.id, c.name]));
  const earlier = w.ownMatches.filter((m) => m.year < w.year).map((m) => played(w, m, clubNames));
  const ctx: NewsContext = {
    w,
    name: clubOf(w).name,
    who: (id) => people.get(id) ?? sourceMessage('team.column.player'),
    season: [],
    hasHistory: earlier.length > 0,
    unbeatenRecord: 0,
    winsRecord: 0,
    unbeaten: 0,
    winning: 0,
    winless: 0,
    losing: 0,
    scoring: 0,
    clean: 0,
    totalWins: 0,
    biggestMargin: 0,
    appeared: new Set(),
    careerGoals: new Map(),
    scorerRun: new Map(),
    drought: new Map(),
    seasonGoals: new Map(),
    seasonBest: new Map(),
    crossed: new Set(),
    possessionGames: [],
    ahead: [],
    scoredFirst: [],
    homePossessionRun: 0,
    homeUnbeaten: 0,
    awayUnbeaten: 0,
    awayWithoutWin: 0,
    awayWins: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    xgFor: 0,
    xgAgainst: 0,
    xgSample: 0,
  };
  for (const p of earlier) {
    advanceRuns(ctx, p);
    ctx.unbeatenRecord = Math.max(ctx.unbeatenRecord, ctx.unbeaten);
    ctx.winsRecord = Math.max(ctx.winsRecord, ctx.winning);
    if (p.result === 'W') ctx.totalWins++;
    ctx.biggestMargin = Math.max(ctx.biggestMargin, p.gf - p.ga);
    for (const line of p.m.players) {
      ctx.appeared.add(line.id);
      if (line.metrics[0])
        ctx.careerGoals.set(line.id, (ctx.careerGoals.get(line.id) || 0) + line.metrics[0]);
    }
  }
  return ctx;
}

function matchNews(p: Played, index: number): MatchNews {
  const candidates: Candidate[] = [];
  return {
    p,
    index,
    score: `${p.gf}-${p.ga}`,
    versus: sourceMessage('copy.news.0474708ae9', {
      p0: p.home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
      p1: p.opponent,
    }),
    story: goalStory(p),
    candidates,
    add: (kind, tag, tone, weight, title, detail, celebrate) => {
      candidates.push({
        kind,
        tag,
        tone,
        weight,
        title,
        ...(detail ? { detail } : {}),
        ...(celebrate ? { celebrate } : {}),
      });
    },
  };
}

/** The builders of one match's news, in the order their candidates are pushed. */
const MATCH_BUILDERS = [
  resultLine,
  milestoneNews,
  runNews,
  homeAwayNews,
  possessionNews,
  xgNews,
  seasonHighs,
  playerNews,
];

export function deriveClubNews(w: World): NewsItem[] {
  const ctx = newsContext(w),
    news: NewsItem[] = [];
  const clubNames = new Map(w.clubs.map((c) => [c.id, c.name]));
  w.ownMatches
    .filter((m) => m.year === w.year)
    .map((m) => played(w, m, clubNames))
    .forEach((p, index) => {
      ctx.season.push(p.result);
      const m = matchNews(p, index);
      for (const build of MATCH_BUILDERS) build(ctx, m);
      news.push(...keptNews(ctx, m));
    });
  news.push(...tableNews(w, ctx.name));
  w.events.forEach((event, index) => {
    const item = eventNews(w, ctx.name, event, index);
    if (item) news.push(item);
  });
  news.push(...honours(w));
  return news.sort((a, b) => b.year - a.year || b.order - a.order);
}

/** One result line for every match; the most telling story wins it. */
function resultLine({ name }: NewsContext, { p, score, versus, story, add }: MatchNews) {
  const shots = `${p.m.metrics[p.side][4]}-${p.m.metrics[p.side === 0 ? 1 : 0][4]}`;
  const facts = [
    sourceMessage('copy.news.a9fe900936', { p0: percent(p.possession) }),
    sourceMessage('copy.news.94bba32f25', { p0: shots }),
    ...(p.xg !== undefined ? [`xG ${two(p.xg)}-${two(p.xga!)}`] : []),
  ].join(' · ');
  if (p.result === 'W' && story.deficit > 0)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      story.deficit >= 2 ? 'notable' : 'minor',
      sourceMessage('copy.news.9059dcde82', { p0: name, p1: versus, p2: score }),
      sourceMessage('copy.news.30e9f61a0b', { p0: story.deficit, p1: facts }),
    );
  else if (p.result === 'W' && story.decisive && story.decisive.minute >= 88)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      'notable',
      sourceMessage('copy.news.b94a9fb0d2', {
        p0: story.decisive.minute,
        p1: story.decisive.player,
        p2: name,
        p3: versus,
        p4: score,
      }),
      facts,
    );
  else if (p.result !== 'W' && story.lead >= 2)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'bad',
      'notable',
      sourceMessage('copy.news.88eaaea8b3', {
        p0: name,
        p1: versus,
        p2: score,
        p3:
          p.result === 'D'
            ? sourceMessage('result.draw.label')
            : sourceMessage('copy.news.2d89546311'),
      }),
      facts,
    );
  else if (p.result === 'D' && story.equaliser && story.equaliser.minute >= 88 && p.gf > 0)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      'minor',
      sourceMessage('copy.news.970b8605e8', {
        p0: story.equaliser.minute,
        p1: name,
        p2: versus,
        p3: score,
      }),
      facts,
    );
  else if (p.result === 'W' && p.gf - p.ga >= 3)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      'notable',
      sourceMessage('copy.news.2f0f8e7128', { p0: name, p1: versus, p2: score }),
      facts,
    );
  else if (p.result === 'L' && p.ga - p.gf >= 3)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'bad',
      'notable',
      sourceMessage('copy.news.f68c2f911a', { p0: name, p1: versus, p2: score }),
      facts,
    );
  else if (p.result === 'W' && p.ga === 0)
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      'minor',
      sourceMessage('copy.news.a0748f37e4', { p0: name, p1: versus, p2: score }),
      facts,
    );
  else
    add(
      'result',
      sourceMessage('copy.LabPage.e56314e9a1'),
      p.result === 'W' ? 'good' : p.result === 'L' ? 'bad' : 'neutral',
      'minor',
      `${name}, ${versus} ${score} ${p.result === 'W' ? sourceMessage('result.win.label') : p.result === 'D' ? sourceMessage('result.draw.label') : sourceMessage('result.loss.label')}`,
      facts,
    );
  if (story.early)
    add(
      'early-goal',
      sourceMessage('copy.LabPage.e56314e9a1'),
      'good',
      'minor',
      sourceMessage('copy.news.d6974eb6e6', { p0: story.early.minute, p1: story.early.player }),
      versus,
    );
}

/** Club records and milestones. */
function milestoneNews(ctx: NewsContext, { p, score, versus, add }: MatchNews) {
  const { name } = ctx;
  if (p.result === 'W' && ctx.totalWins === 0)
    add(
      'first-win',
      sourceMessage('navigation.history'),
      'good',
      'major',
      sourceMessage('copy.news.6c7b4fc12e', { p0: name }),
      `${versus} ${score}`,
      true,
    );
  if (p.result === 'W') {
    ctx.totalWins++;
    if (ctx.totalWins % 50 === 0)
      add(
        'win-milestone',
        sourceMessage('navigation.history'),
        'good',
        'major',
        sourceMessage('copy.news.5dc18c6840', { p0: name, p1: ctx.totalWins }),
        `${versus} ${score}`,
        ctx.totalWins % 100 === 0,
      );
  }
  if (p.result === 'W' && p.gf - p.ga > ctx.biggestMargin && p.gf - p.ga >= 3 && ctx.hasHistory)
    add(
      'record-margin',
      sourceMessage('navigation.history'),
      'good',
      'major',
      sourceMessage('copy.news.11bbf53f34', { p0: name, p1: p.opponent, p2: score }),
      sourceMessage('copy.news.fed51b0e0b', { p0: ctx.biggestMargin }),
      true,
    );
  ctx.biggestMargin = Math.max(ctx.biggestMargin, p.gf - p.ga);
}

/** Runs across all official matches, news at milestone lengths only. */
function runNews(ctx: NewsContext, { p, index, score, versus, add }: MatchNews) {
  const { name, hasHistory, unbeatenRecord, winsRecord } = ctx;
  const wasUnbeaten = ctx.unbeaten,
    wasWinless = ctx.winless;
  advanceRuns(ctx, p);
  const { unbeaten, winning, winless, losing, scoring, clean } = ctx;
  const unbeatenRecordBroken = hasHistory && unbeatenRecord >= 5 && unbeaten > unbeatenRecord;
  if (unbeatenRecordBroken && unbeaten === unbeatenRecord + 1)
    add(
      `unbeaten-record-${unbeaten}`,
      sourceMessage('navigation.history'),
      'good',
      'major',
      sourceMessage('copy.news.c857150180', { p0: name, p1: unbeaten }),
      sourceMessage('copy.news.3ff45fe415', { p0: unbeatenRecord }),
      unbeaten >= 8,
    );
  else if ([5, 10, 15, 20, 25, 30].includes(unbeaten))
    add(
      `unbeaten-${unbeaten}`,
      sourceMessage('navigation.history'),
      'good',
      unbeaten >= 10 ? 'notable' : 'minor',
      sourceMessage('copy.news.9b6dea118c', {
        p0: name,
        p1: unbeaten,
        p2: unbeatenRecordBroken ? sourceMessage('copy.news.4ca57fa497') : '',
      }),
      `${versus} ${score}`,
    );
  if (p.result === 'L' && wasUnbeaten >= 5)
    add(
      'unbeaten-ended',
      sourceMessage('navigation.history'),
      'neutral',
      'notable',
      sourceMessage('copy.news.183be1f7c8', { p0: name, p1: wasUnbeaten, p2: p.opponent }),
      `${versus} ${score}`,
    );
  const winsRecordBroken = hasHistory && winsRecord >= 3 && winning > winsRecord;
  if (winsRecordBroken && winning === winsRecord + 1)
    add(
      `wins-record-${winning}`,
      sourceMessage('navigation.history'),
      'good',
      'major',
      sourceMessage('copy.news.e4623ef597', { p0: name, p1: winning }),
      sourceMessage('copy.news.93388ed69a', { p0: winsRecord }),
      winning >= 5,
    );
  else if ([3, 5, 7, 10].includes(winning))
    add(
      `wins-${winning}`,
      sourceMessage('navigation.history'),
      'good',
      winning >= 5 ? 'major' : 'notable',
      winning >= 5
        ? sourceMessage('copy.news.2a5b9f911b', { p0: name, p1: winning })
        : sourceMessage('copy.news.c4157251a9', { p0: name, p1: winning }),
      `${versus} ${score}`,
      winning === 5 && !hasHistory,
    );
  if (p.result === 'W' && wasWinless >= 4)
    add(
      'winless-ended',
      sourceMessage('navigation.history'),
      'good',
      'notable',
      sourceMessage('copy.news.73ad33bec0', { p0: name, p1: wasWinless + 1 }),
      `${versus} ${score}`,
    );
  if ([5, 8, 10, 15].includes(winless))
    add(
      `winless-${winless}`,
      sourceMessage('navigation.history'),
      'bad',
      'notable',
      sourceMessage('copy.news.50af76c81e', { p0: name, p1: winless }),
    );
  if ([3, 4, 5, 7].includes(losing))
    add(
      `losing-${losing}`,
      sourceMessage('navigation.history'),
      'bad',
      'notable',
      sourceMessage('copy.news.266ccdc11b', { p0: name, p1: losing }),
      `${versus} ${score}`,
    );
  if ([3, 5, 7].includes(clean))
    add(
      `clean-${clean}`,
      sourceMessage('navigation.history'),
      'good',
      'notable',
      sourceMessage('copy.news.d00b44066f', { p0: name, p1: clean }),
    );
  if ([10, 15, 20].includes(scoring))
    add(
      `scoring-${scoring}`,
      sourceMessage('navigation.history'),
      'good',
      'minor',
      sourceMessage('copy.news.5be413e697', { p0: name, p1: scoring }),
    );
  if (index === 4) {
    const opening = ctx.season.slice(0, 5);
    if (opening.every((g) => g !== 'L'))
      add(
        'opening-unbeaten',
        sourceMessage('navigation.history'),
        'good',
        'notable',
        sourceMessage('copy.news.c035523129', { p0: name }),
        record(opening),
      );
    else if (opening.every((g) => g !== 'W'))
      add(
        'opening-winless',
        sourceMessage('navigation.history'),
        'bad',
        'notable',
        sourceMessage('copy.news.1eaad06f5e', { p0: name }),
        record(opening),
      );
  }
}

/** Home and away runs. */
function homeAwayNews(ctx: NewsContext, { p, score, versus, add }: MatchNews) {
  const { name } = ctx;
  if (p.home) {
    ctx.homeUnbeaten = p.result === 'L' ? 0 : ctx.homeUnbeaten + 1;
    if ([5, 10, 15].includes(ctx.homeUnbeaten))
      add(
        `home-unbeaten-${ctx.homeUnbeaten}`,
        sourceMessage('navigation.history'),
        'good',
        'minor',
        sourceMessage('copy.news.24465f44de', { p0: name, p1: ctx.homeUnbeaten }),
      );
  } else {
    ctx.awayUnbeaten = p.result === 'L' ? 0 : ctx.awayUnbeaten + 1;
    if ([5, 8, 10].includes(ctx.awayUnbeaten))
      add(
        `away-unbeaten-${ctx.awayUnbeaten}`,
        sourceMessage('navigation.history'),
        'good',
        'minor',
        sourceMessage('copy.news.cae5542fb6', { p0: name, p1: ctx.awayUnbeaten }),
      );
    if (p.result === 'W') {
      if (!ctx.awayWins && ctx.awayWithoutWin >= 3)
        add(
          'first-away-win',
          sourceMessage('navigation.history'),
          'good',
          'minor',
          sourceMessage('copy.news.6e680afcfc', { p0: name, p1: ctx.awayWithoutWin + 1 }),
          `${versus} ${score}`,
        );
      ctx.awayWins++;
      ctx.awayWithoutWin = 0;
    } else ctx.awayWithoutWin++;
  }
}

/** Possession and first goals. */
function possessionNews(ctx: NewsContext, { p, score, versus, story, add }: MatchNews) {
  const { possessionGames, ahead, scoredFirst } = ctx;
  if (p.home) {
    ctx.homePossessionRun = p.possession >= 0.6 ? ctx.homePossessionRun + 1 : 0;
    if ([3, 5, 8].includes(ctx.homePossessionRun))
      add(
        `home-possession-${ctx.homePossessionRun}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'neutral',
        'minor',
        sourceMessage('copy.news.1499674cac', { p0: ctx.homePossessionRun }),
        sourceMessage('copy.news.6b07c3ddda', { p0: percent(p.possession) }),
      );
  }
  if (p.possession >= 0.6) {
    possessionGames.push(p.result);
    const won = possessionGames.filter((g) => g === 'W').length,
      rate = won / possessionGames.length;
    // A coin flip is not news: only a strong pattern either way is.
    if ([5, 10, 15, 20].includes(possessionGames.length) && (rate >= 0.7 || rate <= 0.2))
      add(
        `possession-split-${possessionGames.length}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        rate >= 0.7 ? 'good' : 'bad',
        'notable',
        sourceMessage('copy.news.1b8e7181a3', {
          p0: percent(rate),
          p1:
            rate >= 0.7
              ? sourceMessage('copy.news.af111c5ae5')
              : sourceMessage('copy.news.0d34984f39'),
        }),
        record(possessionGames),
      );
  }
  if (p.possession > 0.5) {
    ahead.push(p.result);
    if ([10, 20, 30].includes(ahead.length)) {
      const won = ahead.filter((g) => g === 'W').length;
      add(
        `possession-ahead-${ahead.length}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'neutral',
        'minor',
        sourceMessage('copy.news.3b21578b94', { p0: percent(won / ahead.length) }),
        record(ahead),
      );
    }
  }
  if (p.result === 'W' && p.possession <= 0.35)
    add(
      'low-possession-win',
      sourceMessage('copy.NewsFeed.45ec3425c8'),
      'good',
      'minor',
      sourceMessage('copy.news.ed1bc306dd', { p0: percent(p.possession) }),
      `${versus} ${score}`,
    );
  if (p.result === 'L' && p.possession >= 0.65)
    add(
      'possession-loss',
      sourceMessage('copy.NewsFeed.45ec3425c8'),
      'bad',
      'minor',
      sourceMessage('copy.news.f236aed084', { p0: percent(p.possession) }),
      `${versus} ${score}`,
    );
  if (story.first === 'us') {
    scoredFirst.push(p.result);
    if ([5, 10, 15, 20].includes(scoredFirst.length)) {
      const dropped = scoredFirst.filter((g) => g !== 'W').length;
      add(
        `scored-first-${scoredFirst.length}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        dropped ? 'neutral' : 'good',
        'minor',
        dropped
          ? sourceMessage('copy.news.96c7e30dc9', { p0: record(scoredFirst) })
          : sourceMessage('copy.news.48db594333', { p0: scoredFirst.length }),
      );
    }
  }
}

/** Expected goals: a match against its xG, then the season's finishing and keeping. */
function xgNews(ctx: NewsContext, { p, score, versus, add }: MatchNews) {
  if (p.xg === undefined || p.xga === undefined) return;
  ctx.xgFor += p.xg;
  ctx.xgAgainst += p.xga;
  ctx.xgSample++;
  ctx.goalsFor += p.gf;
  ctx.goalsAgainst += p.ga;
  const { xgFor, xgAgainst, xgSample, goalsFor, goalsAgainst, crossed } = ctx;
  if (p.result === 'L' && p.xg - p.xga >= 1)
    add(
      'xg-loss',
      sourceMessage('copy.NewsFeed.45ec3425c8'),
      'bad',
      'notable',
      sourceMessage('copy.news.0ffbd3b4e8', { p0: two(p.xg), p1: two(p.xga) }),
      `${versus} ${score}`,
    );
  else if (p.result === 'W' && p.xga - p.xg >= 1)
    add(
      'xg-steal',
      sourceMessage('copy.NewsFeed.45ec3425c8'),
      'good',
      'minor',
      sourceMessage('copy.news.9c0f06cac9'),
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
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'good',
        'notable',
        sourceMessage('copy.news.8d09fc99a8', { p0: one(finishing) }),
        sourceMessage('copy.news.c6d20d6a5a', { p0: goalsFor, p1: one(xgFor) }),
      ),
    );
    once(`finishing-cold-${level}`, -finishing >= level, () =>
      add(
        `finishing-cold-${level}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'bad',
        'notable',
        sourceMessage('copy.news.98cf3dd770', { p0: one(-finishing) }),
        sourceMessage('copy.news.c6d20d6a5a', { p0: goalsFor, p1: one(xgFor) }),
      ),
    );
    once(`keeping-hot-${level}`, keeping >= level, () =>
      add(
        `keeping-hot-${level}`,
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'good',
        'notable',
        sourceMessage('copy.news.2951325a43', { p0: one(keeping) }),
        sourceMessage('copy.news.d00493f3dd', { p0: goalsAgainst, p1: one(xgAgainst) }),
      ),
    );
  }
}

/** Season highs and lows of the team (from the fourth match on). */
function seasonHighs({ seasonBest }: NewsContext, { p, index, score, versus, add }: MatchNews) {
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
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'neutral',
        'minor',
        sourceMessage('copy.news.06c87d46d5', { p0: percent(p.possession) }),
        `${versus} ${score}`,
      );
  });
  best('passing', attempts >= 150 ? completed / attempts : undefined, true, () => {
    if (completed / attempts >= 0.82)
      add(
        'season-passing',
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'good',
        'minor',
        sourceMessage('copy.news.04944b2486', { p0: percent(completed / attempts) }),
        `${completed}/${attempts} · ${versus}`,
      );
  });
  best('shots', shotCount, true, () => {
    if (shotCount >= 12)
      add(
        'season-shots',
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'good',
        'minor',
        sourceMessage('copy.news.c15fbe8f48', { p0: shotCount }),
        `${versus} ${score}`,
      );
  });
  best('xg', p.xg, true, () => {
    if (p.xg! >= 2)
      add(
        'season-xg',
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'good',
        'minor',
        sourceMessage('copy.news.2a1f038866', { p0: two(p.xg!) }),
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
          sourceMessage('copy.NewsFeed.45ec3425c8'),
          'good',
          'minor',
          sourceMessage('copy.news.5b55a18101', { p0: one(ppda!) }),
          sourceMessage('copy.news.a034192c2a', {
            p0: o[TD.buildUpPasses],
            p1: t[TD.pressActions],
          }),
        );
    });
    best('high-turnovers', t[TD.highTurnovers], true, () => {
      if (t[TD.highTurnovers] >= 9)
        add(
          'season-high-turnovers',
          sourceMessage('copy.NewsFeed.45ec3425c8'),
          'good',
          'minor',
          sourceMessage('copy.news.ae96de7951', { p0: t[TD.highTurnovers] }),
          versus,
        );
    });
    best('key-passes', t[TD.keyPasses], true, () => {
      if (t[TD.keyPasses] >= 10)
        add(
          'season-key-passes',
          sourceMessage('copy.NewsFeed.45ec3425c8'),
          'good',
          'minor',
          sourceMessage('copy.news.6020e1eb7d', { p0: t[TD.keyPasses] }),
          versus,
        );
    });
    if (t[TD.bigChances] >= 4 && t[TD.bigChancesScored] === 0)
      add(
        'big-chances-missed',
        sourceMessage('copy.NewsFeed.45ec3425c8'),
        'bad',
        'minor',
        sourceMessage('copy.news.9791d4afe2', { p0: t[TD.bigChances] }),
        versus,
      );
  }
}

/** Our players. In the club's very first match everyone debuts, which is no news. */
function playerNews(ctx: NewsContext, m: MatchNews) {
  const clubHasPlayed = ctx.appeared.size > 0;
  for (const line of m.p.m.players) {
    const start = m.candidates.length;
    const debut = clubHasPlayed && !ctx.appeared.has(line.id);
    ctx.appeared.add(line.id);
    playerGoalNews(ctx, m, line, debut);
    playerPlayNews(ctx, m, line);
    for (const item of m.candidates.slice(start)) item.players = [line.id];
  }
}

/** A player's goals and assists: hat-tricks, debut goals, scoring runs, tallies and droughts. */
function playerGoalNews(
  ctx: NewsContext,
  { p, score, versus, add }: MatchNews,
  line: Line,
  debut: boolean,
) {
  const { name, careerGoals, scorerRun, seasonGoals, drought } = ctx;
  const player = ctx.who(line.id),
    goals = line.metrics[0],
    assists = line.metrics[1];
  if (goals >= 3)
    add(
      `hat-trick:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'major',
      sourceMessage('copy.news.857a4c0986', { p0: player, p1: name, p2: versus, p3: score }),
      undefined,
      true,
    );
  else if (goals >= 1 && goals + assists >= 3)
    add(
      `one-man-show:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'notable',
      sourceMessage('copy.news.f4dee049d1', { p0: player, p1: goals, p2: assists }),
      `${versus} ${score}`,
    );
  else if (goals === 2)
    add(
      `brace:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'notable',
      p.result === 'W'
        ? sourceMessage('copy.news.baafba9728', { p0: player, p1: name, p2: versus, p3: score })
        : sourceMessage('copy.news.a88100141a', {
            p0: player,
            p1: versus,
            p2: score,
            p3:
              p.result === 'D'
                ? sourceMessage('result.draw.label')
                : sourceMessage('result.loss.label'),
          }),
    );
  if (assists >= 3)
    add(
      `assists:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'notable',
      sourceMessage('copy.news.fe5063189c', { p0: player }),
      versus,
    );
  const careerBefore = careerGoals.get(line.id) || 0;
  if (goals && careerBefore === 0 && line.id.includes(':academy:'))
    add(
      `academy-goal:${line.id}`,
      sourceMessage('copy.NewsFeed.690198ae20'),
      'good',
      'major',
      sourceMessage('copy.news.ff6d31daf6', { p0: player }),
      versus,
      true,
    );
  else if (goals && debut)
    add(
      `debut-goal:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'notable',
      sourceMessage('copy.news.6042a65038', { p0: player }),
      versus,
    );
  const run = goals > 0 ? (scorerRun.get(line.id) || 0) + 1 : 0;
  scorerRun.set(line.id, run);
  if ([3, 4, 5, 7, 10].includes(run))
    add(
      `scoring-run:${line.id}:${run}`,
      sourceMessage('team.column.player'),
      'good',
      run >= 5 ? 'notable' : 'minor',
      sourceMessage('copy.news.c9a9f9afec', { p0: player, p1: run }),
    );
  const before = seasonGoals.get(line.id) || 0,
    after = before + goals;
  seasonGoals.set(line.id, after);
  if (goals) {
    for (const mark of [10, 15, 20, 25, 30])
      if (before < mark && after >= mark)
        add(
          `season-goals:${line.id}:${mark}`,
          sourceMessage('team.column.player'),
          'good',
          'notable',
          sourceMessage('copy.news.6c45ba5afa', {
            p0: player,
            p1: mark,
            p2:
              mark === 10
                ? sourceMessage('copy.news.3ace1dc6b2')
                : sourceMessage('copy.news.abf9800db7'),
          }),
        );
    careerGoals.set(line.id, careerBefore + goals);
    for (const mark of [50, 100, 150, 200])
      if (careerBefore < mark && careerBefore + goals >= mark)
        add(
          `career-goals:${line.id}:${mark}`,
          sourceMessage('team.column.player'),
          'good',
          'major',
          sourceMessage('copy.news.7d1195adb1', { p0: player, p1: mark }),
          undefined,
          true,
        );
  }
  const dry = goals ? 0 : (drought.get(line.id) || 0) + 1;
  drought.set(line.id, dry);
  if (after >= 5 && [6, 10].includes(dry))
    add(
      `drought:${line.id}:${dry}`,
      sourceMessage('team.column.player'),
      'bad',
      'minor',
      sourceMessage('copy.news.36277518f8', { p0: player, p1: dry }),
    );
}

/** What a player did besides scoring: passing, defending, saves, chances and xG. */
function playerPlayNews({ who }: NewsContext, { p, score, versus, add }: MatchNews, line: Line) {
  const player = who(line.id),
    goals = line.metrics[0];
  if (line.metrics[2] >= 50 && line.metrics[3] / line.metrics[2] >= 0.95)
    add(
      `passing:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'minor',
      sourceMessage('copy.news.99562ba334', {
        p0: player,
        p1: percent(line.metrics[3] / line.metrics[2]),
      }),
      `${line.metrics[3]}/${line.metrics[2]}`,
    );
  if (line.metrics[6] + line.metrics[7] >= 10)
    add(
      `hoover:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'minor',
      sourceMessage('copy.news.cd77977438', { p0: player, p1: line.metrics[6] + line.metrics[7] }),
      versus,
    );
  if (line.metrics[9] >= 7 || (line.metrics[9] >= 5 && p.ga === 0))
    add(
      `keeper:${line.id}`,
      sourceMessage('team.column.player'),
      'good',
      'notable',
      sourceMessage('copy.news.59267aa2b4', { p0: player, p1: line.metrics[9] }),
      `${versus} ${score}`,
    );
  const d = line.detail;
  if (d) {
    if (d[PD.keyPasses] >= 5)
      add(
        `key-passes:${line.id}`,
        sourceMessage('team.column.player'),
        'good',
        'minor',
        sourceMessage('copy.news.3dc73a13ca', { p0: player, p1: d[PD.keyPasses] }),
        `xA ${two(d[PD.xa] / 100)}`,
      );
    if (d[PD.xg] >= 150 && goals === 0)
      add(
        `xg-blank:${line.id}`,
        sourceMessage('team.column.player'),
        'bad',
        'minor',
        sourceMessage('copy.news.980d25d5c1', { p0: player, p1: two(d[PD.xg] / 100) }),
        versus,
      );
  }
}

/** Keep the result line, every major item and celebration, then the strongest of the rest. */
function keptNews({ w }: NewsContext, { p, index, candidates }: MatchNews): NewsItem[] {
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
  return [result, ...kept].map(({ kind, ...item }, seq) => ({
    ...item,
    id: `${w.year}:${p.m.id}:${kind}`,
    year: w.year,
    round: p.m.round,
    order: order + seq,
  }));
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
        tag: sourceMessage('copy.BallonDorView.8f363885a3'),
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
          beenTop
            ? sourceMessage('copy.news.4d41acc29a', { p0: name })
            : sourceMessage('copy.news.a03cf66d6d', { p0: name }),
          second
            ? sourceMessage('copy.news.7cad1d42b7', { p0: snapshot.rows[0][1] - second[1] })
            : undefined,
          !beenTop,
        );
        beenTop = true;
      } else if ([5, 10, 15, 20].includes(topRounds))
        item(
          `top-${topRounds}`,
          'good',
          'notable',
          sourceMessage('copy.news.a325d5c16a', { p0: name, p1: topRounds }),
        );
      if (rank === 1 && second && snapshot.round >= 15) {
        const gap = snapshot.rows[0][1] - second[1];
        for (const mark of [6, 10, 15])
          if (gap >= mark && !leadMarks.has(mark)) {
            leadMarks.add(mark);
            item(
              `lead-${mark}`,
              'good',
              'notable',
              sourceMessage('copy.news.73b7bac2f6', { p0: name, p1: gap }),
            );
          }
      }
      if (promotion && rank <= promotion && previousRank > promotion && rank !== 1)
        item(
          'promotion-zone',
          'good',
          'notable',
          sourceMessage('copy.news.ba77450179', { p0: name, p1: rank }),
        );
      if (relegation && rank > size - relegation && previousRank <= size - relegation)
        item(
          'relegation-zone',
          'bad',
          'notable',
          sourceMessage('copy.news.b84d2b860c', { p0: name, p1: rank }),
        );
      if (relegation && rank <= size - relegation && previousRank > size - relegation)
        item(
          'escape',
          'good',
          'notable',
          sourceMessage('copy.news.35d51360f6', { p0: name, p1: rank }),
        );
      if (previousRank - rank >= 3 && rank !== 1)
        item(
          'climb',
          'good',
          'minor',
          sourceMessage('copy.news.1b09983e54', { p0: name, p1: previousRank - rank, p2: rank }),
        );
    }
    previousRank = rank;
  }
  return items;
}

/** Trophies of the season that just closed: the league, the domestic cup and continental cups. */
function honours(w: World): NewsItem[] {
  // The club's own season only: honours of the world's season before the takeover are not ours.
  const last = lastOwnSeason(w);
  if (!last || last.year !== w.year - 1) return [];
  const name = clubOf(w).name,
    items: NewsItem[] = [];
  const base = (kind: string) => ({
    id: `${last.year}:honour:${kind}`,
    year: last.year,
    round: 46,
    order: 46 * 1000 + 990,
    tag: sourceMessage('navigation.history'),
    tone: 'good' as const,
    weight: 'major' as const,
    celebrate: true,
  });
  if (last.rank === 1)
    items.push({
      ...base('league'),
      title: `${name}, ${last.tier === 0 ? sourceMessage('copy.news.a7e193f977') : sourceMessage('copy.news.e273562b7b', { p0: last.tier + 1 })}`,
      detail: sourceMessage('copy.news.6bf44c20c1', {
        p0: last.points,
        p1: last.won,
        p2: last.drawn,
        p3: last.lost,
      }),
    });
  // Cups decided in May are celebrated on the day of the final (their events); older seasons
  // without those events are celebrated here at the close.
  const won = (kind: string) => eventsInSeason(w, last.year).some((event) => event.kind === kind);
  const cup = last.champions.find((c) => c.cup === w.playerClub);
  if (cup && !won('cup-honor'))
    items.push({
      ...base('cup'),
      title: sourceMessage('copy.news.b295075154', { p0: name, p1: country(cup.country).name }),
    });
  for (const europe of last.europe)
    if (europe.winner === w.playerClub && !won('europe-honor'))
      items.push({
        ...base(`europe-${europe.kind}`),
        title: sourceMessage('copy.news.313915a09d', { p0: name, p1: europe.name }),
      });
  const award = ballonDorNews(w, last);
  if (award?.ours) items.push({ ...base('ballon-dor'), title: award.title, detail: award.detail, players: last.ballonDor!.map((p) => p.id) });
  else if (award) {
    const { id, year, round, order, tag } = base('ballon-dor');
    items.push({ id, year, round, order, tag, tone: 'neutral', weight: 'notable', ...award.text, players: last.ballonDor!.map((p) => p.id) });
  }
  return items;
}

/**
 * The closed season's Ballon d'Or (→HIST-11, PLAYER-27): one item naming the winner and the
 * podium; our winner is a major, celebrated item, anyone else's a notable fact.
 */
function ballonDorNews(w: World, last: World['history'][number]) {
  const podium = last.ballonDor;
  if (!podium?.length) return undefined;
  const clubName = (id: string) => w.clubs.find((club) => club.id === id)?.name ?? id;
  const winner = podium[0]!,
    ours = winner.club === w.playerClub;
  const detail = podium
    .map((place, i) =>
      sourceMessage('copy.news.f773f19b57', {
        p0: i + 1,
        p1: place.name,
        p2: clubName(place.club),
        p3: place.goals,
        p4: place.assists,
        p5: place.points,
      }),
    )
    .join(' · ');
  const title = ours
    ? sourceMessage('copy.news.acf8ebe63d', { p0: winner.name })
    : sourceMessage('copy.news.485919afba', { p0: winner.name, p1: clubName(winner.club) });
  return { ours, title, detail, text: { title, detail } };
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
        tag: sourceMessage('copy.NewsFeed.832934e8a8'),
        tone: 'good',
        weight: 'notable',
        title: sourceMessage('copy.news.8a1d91593b', { p0: event.title }),
        detail: first(event.detail),
      };
    case 'transfer-out':
      return {
        ...base,
        tag: sourceMessage('copy.NewsFeed.832934e8a8'),
        tone: 'neutral',
        weight: 'notable',
        title: sourceMessage('copy.news.1525e1ef66', {
          p0: event.title.replace(sourceMessage('copy.news.79f5163cc0'), ''),
        }),
        detail: first(event.detail),
      };
    case 'manager-hire': {
      const parts = event.detail.split(' · ');
      const style = Object.values(STYLE_INFO).find((info) => parts.includes(info.label));
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'neutral',
        weight: 'major',
        title: sourceMessage('copy.news.a6b1154b33', { p0: event.title }),
        detail: style ? style.school : first(event.detail),
      };
    }
    // Another club of our league let its manager go into the market (→STAFF-17).
    case 'rival-sacking':
      return {
        ...base,
        tag: sourceMessage('copy.NewsFeed.832934e8a8'),
        tone: 'neutral',
        weight: 'minor',
        title: event.title,
        detail: event.detail,
      };
    case 'manager-departure':
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'bad',
        weight: 'major',
        title: event.title,
        detail: event.detail,
      };
    case 'youth-intake':
      return {
        ...base,
        tag: sourceMessage('copy.NewsFeed.690198ae20'),
        tone: 'neutral',
        weight: 'minor',
        title: event.title,
        detail: event.detail,
      };
    case 'youth-promotion':
      return {
        ...base,
        tag: sourceMessage('copy.NewsFeed.690198ae20'),
        tone: 'good',
        weight: 'notable',
        title: sourceMessage('copy.news.d5c8935f87', { p0: event.title }),
        detail: first(event.detail),
      };
    case 'facility':
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'good',
        weight: 'minor',
        title: `${name}, ${event.title}`,
        detail: first(event.detail),
      };
    case 'facility-open':
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'good',
        weight: 'notable',
        title: `${name}, ${event.title}`,
        detail: first(event.detail),
      };
    case 'sponsor-sign':
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'neutral',
        weight: 'minor',
        title: sourceMessage('copy.news.36c4a61665', { p0: name }),
        // The event names the slot (→ECON-8) and its detail the partner.
        detail: `${event.title} · ${first(event.detail)}`,
      };
    // Older saves record a vision; both read as the club announcing its direction.
    case 'vision':
    case 'build': {
      const label =
        event.kind === 'build'
          ? buildTitleName(event.title)
          : (event.title.split(' · ')[1] ?? event.title);
      return {
        ...base,
        tag: sourceMessage('copy.InvestmentTotals.47dfdfd818'),
        tone: 'neutral',
        weight: 'notable',
        title: sourceMessage('copy.news.2811b23648', {
          p0: name,
          p1:
            event.kind === 'build'
              ? sourceMessage('copy.news.d7895d7647')
              : sourceMessage('copy.news.d3fab97084'),
          p2: label,
        }),
        ...(event.kind === 'build' ? { detail: event.detail } : {}),
      };
    }
    case 'promotion':
      return {
        ...base,
        tag: sourceMessage('copy.BallonDorView.8f363885a3'),
        tone: 'good',
        weight: 'major',
        title: sourceMessage('copy.news.1959b18c23', { p0: name }),
        detail: event.detail,
        celebrate: true,
      };
    case 'relegation':
      return {
        ...base,
        tag: sourceMessage('copy.BallonDorView.8f363885a3'),
        tone: 'bad',
        weight: 'major',
        title: sourceMessage('copy.news.3fdfd0292d', { p0: name }),
        detail: event.detail,
      };
    case 'cup-prize': {
      // "8강 통과" puts the club in the semi-finals; passing the semi-final reaches the final.
      // The round follows the cup name after a space, so "64강 통과" stays itself.
      const late = / (4강|8강) 통과/.test(event.title);
      return {
        ...base,
        tag: sourceMessage('copy.LabPage.e56314e9a1'),
        tone: 'good',
        weight: event.title.includes(sourceMessage('copy.news.6351bcdae5'))
          ? 'major'
          : late
            ? 'notable'
            : 'minor',
        title: `${name}, ${event.title.replace(sourceMessage('copy.news.6351bcdae5'), sourceMessage('copy.news.ae6c276293')).replace(sourceMessage('copy.news.05003ba521'), sourceMessage('copy.news.7166cb8a7f'))}`,
      };
    }
    case 'cup-exit':
      return {
        ...base,
        tag: sourceMessage('copy.LabPage.e56314e9a1'),
        tone: 'bad',
        weight: /결승|4강|8강/.test(event.title) ? 'notable' : 'minor',
        title: `${name}, ${event.title}`,
      };
    case 'cup-honor':
    case 'europe-honor':
      return {
        ...base,
        tag: sourceMessage('navigation.history'),
        tone: 'good',
        weight: 'major',
        title: `${name}, ${event.title.replace(/ 우승$/, '')} ${event.kind === 'cup-honor' ? sourceMessage('copy.CupsView.db1f9c8207') : sourceMessage('copy.news.9d48af84fb')}`,
        detail: event.detail,
        celebrate: true,
      };
    case 'retirement-announce':
      return {
        ...base,
        tag: sourceMessage('team.column.player'),
        tone: 'neutral',
        weight: 'notable',
        title: sourceMessage('copy.news.912cf487a1', { p0: event.title }),
        detail: event.detail,
      };
    case 'retirement':
      return event.detail.includes(sourceMessage('copy.Rich.fc798874df'))
        ? {
            ...base,
            tag: sourceMessage('team.column.player'),
            tone: 'neutral',
            weight: 'minor',
            title: sourceMessage('copy.news.a48c80fa59', {
              p0: event.title.replace(sourceMessage('copy.news.df7eb52b69'), ''),
            }),
            detail: event.detail,
          }
        : undefined;
    case 'injury': {
      const weeks = Number(/약 (\d+)주/.exec(event.detail)?.[1] || 0);
      return {
        ...base,
        tag: sourceMessage('team.column.player'),
        tone: 'bad',
        weight: weeks >= 6 ? 'notable' : 'minor',
        title: sourceMessage('copy.news.9804e35b15', { p0: event.title, p1: weeks }),
        detail: event.detail.split(' · ')[1],
      };
    }
    case 'unsettled':
      return {
        ...base,
        tag: sourceMessage('team.column.player'),
        tone: 'bad',
        weight: 'notable',
        title: event.title,
        detail: event.detail,
      };
    case 'potential-breakthrough':
    case 'potential-stall':
      return {
        ...base,
        tag: sourceMessage('copy.NewsFeed.690198ae20'),
        tone: event.kind === 'potential-breakthrough' ? 'good' : 'bad',
        weight: event.kind === 'potential-breakthrough' ? 'notable' : 'minor',
        title: event.title,
        detail: event.detail,
      };
    default:
      return undefined;
  }
}

/** Persisted map/set rows are changed in place, so a new result never copies career totals. */
class JournalMap extends Map<string, number> {
  private indices = new Map<string, number>();
  constructor(readonly rows: [string, number][]) {
    super();
    rows.forEach(([key, value], index) => {
      Map.prototype.set.call(this, key, value);
      this.indices.set(key, index);
    });
  }
  override set(key: string, value: number): this {
    const index = this.indices.get(key);
    if (index === undefined) {
      this.indices.set(key, this.rows.length);
      this.rows.push([key, value]);
    } else this.rows[index][1] = value;
    return super.set(key, value);
  }
}
class JournalSet extends Set<string> {
  constructor(readonly rows: string[]) {
    super();
    for (const key of rows) Set.prototype.add.call(this, key);
  }
  override add(key: string): this {
    if (!this.has(key)) this.rows.push(key);
    return super.add(key);
  }
}
const mapRows = (map: Map<string, number>) => (map instanceof JournalMap ? map.rows : [...map]);
const setRows = (set: Set<string>) => (set instanceof JournalSet ? set.rows : [...set]);

/** Snapshot the counters, without World references, names, closures or match graphs. */
function newsState(ctx: NewsContext): NewsState {
  const {
    w: _w,
    name: _name,
    who: _who,
    appeared,
    careerGoals,
    scorerRun,
    drought,
    seasonGoals,
    seasonBest,
    crossed,
    ...values
  } = ctx;
  void _w;
  void _name;
  void _who;
  return {
    ...values,
    appeared: setRows(appeared),
    careerGoals: mapRows(careerGoals),
    scorerRun: mapRows(scorerRun),
    drought: mapRows(drought),
    seasonGoals: mapRows(seasonGoals),
    seasonBest: mapRows(seasonBest),
    crossed: setRows(crossed),
  };
}
function journalContext(w: World, state: NewsState): NewsContext {
  const names = new Map(w.players.map((p) => [p.id, p.name]));
  return {
    ...state,
    w,
    name: clubOf(w).name,
    who: (id) => names.get(id) ?? sourceMessage('team.column.player'),
    appeared: new JournalSet(state.appeared),
    careerGoals: new JournalMap(state.careerGoals),
    scorerRun: new JournalMap(state.scorerRun),
    drought: new JournalMap(state.drought),
    seasonGoals: new JournalMap(state.seasonGoals),
    seasonBest: new JournalMap(state.seasonBest),
    crossed: new JournalSet(state.crossed),
  };
}
const journalContexts = new WeakMap<NewsJournal, NewsContext>();
const bucketIds = new WeakMap<NewsItem[], Set<string>>();
const journalSources = new WeakMap<NewsJournal, { table: string; honour: number | undefined }>();
/** Older journal representations keep their text while acquiring stable unread ordinals once. */
function numberJournal(j: NewsJournal) {
  if (j.count !== undefined) return;
  let count = 0;
  for (const year of j.years)
    for (let index = j.seasons[year].length - 1; index >= 0; index--)
      j.seasons[year][index].sequence = ++count;
  j.count = count;
}
export function newsTotal(w: World): number {
  const j = w.newsJournal;
  return j
    ? (j.count ?? j.years.reduce((n, year) => n + j.seasons[year].length, 0))
    : deriveClubNews(w).length;
}
function appendHeadline(w: World, j: NewsJournal, item: NewsItem) {
  let bucket = j.seasons[item.year];
  if (!bucket) {
    bucket = j.seasons[item.year] = [];
    j.years.push(item.year);
    j.years.sort((a, b) => a - b);
  }
  let ids = bucketIds.get(bucket);
  if (!ids) {
    ids = new Set(bucket.map((entry) => entry.id));
    bucketIds.set(bucket, ids);
  }
  if (ids.has(item.id)) return;
  if (bucket.length >= NEWS_LIMITS.perSeason)
    throw new Error(sourceMessage('copy.news.9b6c1eabd9'));
  numberJournal(j);
  ids.add(item.id);
  bucket.push({ ...item, sequence: ++j.count! });
  for (const id of item.players ?? []) linkPlayer(w, id);
  // Only the affected season is sorted, never the complete career.
  bucket.sort((a, b) => b.order - a.order);
}
function resetNewsSeason(w: World, j: NewsJournal, year: number, ctx: NewsContext) {
  // Season-scoped comparisons restart against the completed career's records.
  const empty = newsContext({ ...w, ownMatches: [] });
  const next: NewsContext = {
    ...empty,
    hasHistory: j.matches > 0,
    unbeatenRecord: j.peakUnbeaten,
    winsRecord: j.peakWinning,
    unbeaten: ctx.unbeaten,
    winning: ctx.winning,
    winless: ctx.winless,
    losing: ctx.losing,
    scoring: ctx.scoring,
    clean: ctx.clean,
    totalWins: ctx.totalWins,
    biggestMargin: ctx.biggestMargin,
    appeared: ctx.appeared,
    careerGoals: ctx.careerGoals,
  };
  j.year = year;
  j.state = newsState(next);
  const restored = journalContext(w, j.state);
  journalContexts.set(j, restored);
  return restored;
}
/** Explicit writer initialization. Legacy pure reads never create save data. */
export function initializeNewsJournal(w: World) {
  if (w.newsJournal) {
    numberJournal(w.newsJournal);
    return;
  }
  const firstYear = w.ownMatches[0]?.year ?? w.year;
  const ctx = newsContext({ ...w, ownMatches: [] });
  w.newsJournal = {
    format: 1,
    year: firstYear,
    matches: 0,
    events: 0,
    count: 0,
    peakUnbeaten: 0,
    peakWinning: 0,
    state: newsState(ctx),
    years: [],
    seasons: {},
  };
  journalContexts.set(w.newsJournal, journalContext(w, w.newsJournal.state));
  refreshNewsJournal(w);
}
/** Process only new facts; callers use this at canonical settlement boundaries, never on read. */
export function refreshNewsJournal(w: World) {
  const j = w.newsJournal;
  if (!j) return;
  const table = `${w.year}:${w.round}:${w.rankHistory?.length ?? 0}`;
  const honour = w.history.at(-1)?.year;
  const sources = journalSources.get(j);
  if (
    j.matches === w.ownMatches.length &&
    j.events === w.events.length &&
    j.year === w.year &&
    sources?.table === table &&
    sources.honour === honour
  )
    return;
  let ctx = journalContexts.get(j) ?? journalContext(w, j.state);
  ctx.w = w;
  ctx.name = clubOf(w).name;
  // Resolve names again after a signing; already recorded text stays frozen.
  const names = new Map(w.players.map((p) => [p.id, p.name]));
  ctx.who = (id) => names.get(id) ?? sourceMessage('team.column.player');
  const clubNames = new Map(w.clubs.map((c) => [c.id, c.name]));
  while (j.matches < w.ownMatches.length) {
    const m = w.ownMatches[j.matches];
    if (m.year !== j.year) ctx = resetNewsSeason(w, j, m.year, ctx);
    const p = played(w, m, clubNames),
      index = ctx.season.length;
    ctx.w = m.year === w.year ? w : { ...w, year: m.year };
    ctx.season.push(p.result);
    const match = matchNews(p, index);
    for (const build of MATCH_BUILDERS) build(ctx, match);
    for (const item of keptNews(ctx, match)) appendHeadline(w, j, item);
    j.peakUnbeaten = Math.max(j.peakUnbeaten, ctx.unbeaten);
    j.peakWinning = Math.max(j.peakWinning, ctx.winning);
    j.matches++;
  }
  if (j.year !== w.year) ctx = resetNewsSeason(w, j, w.year, ctx);
  ctx.w = w;
  while (j.events < w.events.length) {
    const index = j.events++,
      event = w.events[index];
    const item = eventNews(
      event.year === w.year ? w : { ...w, year: event.year },
      ctx.name,
      event,
      index,
    );
    if (item) appendHeadline(w, j, item);
  }
  // These reads are bounded to the retained round window and the last season's honour row.
  if (sources?.table !== table) for (const item of tableNews(w, ctx.name)) appendHeadline(w, j, item);
  if (!sources || sources.honour !== honour) for (const item of honours(w)) appendHeadline(w, j, item);
  journalSources.set(j, { table, honour });
  journalContexts.set(j, ctx);
  j.state = newsState(ctx);
}
/** Journal pages read at most their requested rows; routine publication never traverses old facts. */
export function newsPage(w: World, offset = 0, limit: number = NEWS_LIMITS.page): NewsItem[] {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > NEWS_LIMITS.page
  )
    throw new Error(sourceMessage('copy.news.15e329bc9e'));
  const j = w.newsJournal;
  if (!j) return deriveClubNews(w).slice(offset, offset + limit);
  const out: NewsItem[] = [];
  for (let i = j.years.length - 1; i >= 0; i--) {
    const bucket = j.seasons[j.years[i]];
    if (offset >= bucket.length) {
      offset -= bucket.length;
      continue;
    }
    const take = bucket.slice(offset, offset + limit - out.length);
    out.push(...take);
    offset = 0;
    if (out.length === limit) break;
  }
  return out;
}
export function clubNews(w: World): NewsItem[] {
  return w.newsJournal ? newsPage(w, 0, NEWS_LIMITS.recent) : deriveClubNews(w);
}

/** A source-ID cursor stays stable when newer headlines arrive between archive requests. */
export function newsBefore(w: World, before?: string, tag?: NewsTag): NewsItem[] {
  const j = w.newsJournal;
  if (!j) {
    const all = deriveClubNews(w);
    const at = before ? all.findIndex((item) => item.id === before) : -1;
    if (before && at < 0) throw new Error(sourceMessage('copy.news.534fe04a9e'));
    return all
      .slice(at + 1)
      .filter((item) => !tag || item.tag === tag)
      .slice(0, NEWS_LIMITS.page);
  }
  let index = j.years.length - 1,
    offset = 0;
  if (before) {
    const year = Number(before.split(':')[0]);
    index = j.years.indexOf(year);
    const at = j.seasons[year]?.findIndex((item) => item.id === before) ?? -1;
    if (index < 0 || at < 0) throw new Error(sourceMessage('copy.news.534fe04a9e'));
    offset = at + 1;
  }
  const result: NewsItem[] = [];
  for (; index >= 0 && result.length < NEWS_LIMITS.page; index--) {
    const bucket = j.seasons[j.years[index]];
    for (; offset < bucket.length && result.length < NEWS_LIMITS.page; offset++) {
      const item = bucket[offset];
      if (!tag || item.tag === tag) result.push(item);
    }
    offset = 0;
  }
  return result;
}

/** Retirement never creates its own eligibility link; its profile must already be retained. */
export function recordRetirementNews(w: World, player: Player, club?: string) {
  if (!w.newsJournal || !w.playerRecords?.[player.id]?.retired) return;
  appendHeadline(w, w.newsJournal, {
    id: `${w.year}:retirement:${player.id}`,
    year: w.year,
    round: w.round,
    order: w.round * 1000 + 900,
    tag: sourceMessage('team.column.player'),
    tone: 'neutral',
    weight: 'minor',
    title: sourceMessage('player.record.retirementNews', { player: player.name }),
    ...(club ? { detail: sourceMessage('player.record.lastClub', {
      club: w.clubs.find((c) => c.id === club)?.name ?? club,
    }) } : {}),
    players: [player.id],
  });
}
