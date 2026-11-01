import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { approvalRequests, overdueSummary } from '../runtime/progression';
import {
  ClubHub,
  ClubSituation,
  NextMatchCard,
  OfficeEntrance,
  OfficeTeam,
  SeasonCard,
  CupBriefing,
} from './ClubHub';
import type { GameClient } from '../runtime/client';
import korean from '../../public/presentation/locales/ko-KR.json';
import { clubSituation, type SituationFact } from './teamState';
import { openCupSeason } from './state';
import { ownLeagueProgress } from './league';

vi.mock('./state', async (original) => ({
  ...(await original<typeof import('./state')>()),
  openCupSeason: vi.fn(),
}));

vi.mock('../presentation/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presentation/react')>()),
  useLocale: () => ({
    t: (key: string) => korean.messages[key as keyof typeof korean.messages] ?? key,
  }),
}));
vi.mock('../runtime/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../runtime/store')>();
  return {
    ...original,
    useGameState: (selector: (state: ClientState) => unknown) =>
      selector(original.gameStore.getState()),
  };
});
vi.mock('./teamState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./teamState')>()),
  clubSituation: vi.fn(),
}));
// The artwork adapter resolves theme resources; these units only place its reserved slot.
vi.mock('./FacilityArt', () => ({
  FacilityArt: ({ kind }: { kind: string }) => createElement('span', { 'data-facility-art': kind }),
}));
// The quick actions' own sheets and commands are their module's; here only where they stand.
vi.mock('./QuickActions', () => ({
  QuickActions: () => createElement('section', { 'data-testid': 'quick-actions' }),
}));
// The approval read model is the queue's own; the entrance only states its counts.
vi.mock('../runtime/progression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/progression')>()),
  approvalRequests: vi.fn(() => []),
  overdueSummary: vi.fn(() => ({ overdue: 0, morale: 0 })),
}));

// Only the card/calendar fields; no generated world or season simulation is needed.
const world = () =>
  ({
    id: 'compact-card',
    seed: 'compact-card',
    year: 1950,
    round: 0,
    playerClub: 'own',
    tactic: 'balanced',
    clubs: [
      { id: 'own', name: 'Our Club', country: 'ENG', color: '#225588' },
      { id: 'opponent', name: 'A Very Long Opponent Athletic Club', color: '#aa5533' },
    ],
    fixtures: [{ id: 'next', year: 1950, round: 1, kind: 'league', home: 'own', away: 'opponent' }],
    europe: [],
    cups: [],
    ownMatches: [],
  }) as unknown as World;

beforeEach(() => {
  gameStore.setState(
    {
      ...initialClientState,
      busy: false,
      processing: false,
      readonly: false,
      view: { world: world() } as View,
    },
    true,
  );
});
afterEach(() => gameStore.setState(initialClientState, true));

describe('contextual home match access', () => {
  it.each(['home', 'away'] as const)(
    'keeps the %s venue, opponent and preparation without a future observation shortcut',
    (venue) => {
      const w = world();
      if (venue === 'away') {
        w.fixtures[0].home = 'opponent';
        w.fixtures[0].away = 'own';
      }
      const markup = renderToStaticMarkup(createElement(NextMatchCard, { w, onPrepare: vi.fn() }));
      expect(markup).toContain(
        `data-ui="home-away-badge" data-side="${venue}">${venue === 'home' ? '홈' : '원정'}</span>`,
      );
      expect(markup).toContain('NEXT MATCH');
      expect(markup).toContain('A Very Long Opponent Athletic Club');
      expect(markup).not.toContain('hub-preparation');
      expect(markup).toContain('상세 리포트</button>');
      expect(markup).not.toContain('data-testid="home-watch"');
      expect(markup).not.toContain('경기로 돌아가기');
    },
  );

  it('keeps preparation for an empty schedule and preserves critical-state protection', () => {
    const w = world();
    w.fixtures = [];
    w.critical = '결정을 먼저 처리해 주세요';
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, {
        w,
        onPrepare: vi.fn(),
      }),
    );
    expect(markup).toContain('다음 시즌을 준비해요');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>상세 리포트<\/button>/);
  });

  it('keeps unfinished observation out of the upcoming-match card', () => {
    gameStore.setState({ playback: { record: { id: 'live' } } as ClientState['playback'] });
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn() }),
    );
    expect(markup).toContain('A Very Long Opponent Athletic Club');
    expect(markup).toContain('상세 리포트');
    expect(markup).not.toContain('관전 이어보기');
    expect(markup).not.toContain('home-watch');
  });
});

describe('home season card', () => {
  // The amateur league reads its field and rounds from its own fixtures.
  const lower = () => {
    const w = world();
    w.lower = true;
    w.round = 1;
    w.fixtures = [
      {
        id: 'r1',
        year: 1950,
        round: 1,
        kind: 'lower',
        home: 'own',
        away: 'opponent',
        played: true,
      },
      { id: 'r2', year: 1950, round: 2, kind: 'lower', home: 'opponent', away: 'own' },
    ] as World['fixtures'];
    w.tables = {
      own: { played: 1, won: 1, drawn: 0, lost: 0, gf: 2, ga: 0, points: 3 },
      opponent: { played: 1, won: 0, drawn: 0, lost: 1, gf: 0, ga: 2, points: 0 },
    } as unknown as World['tables'];
    return w;
  };
  const render = (active: boolean) =>
    renderToStaticMarkup(createElement(SeasonCard, { w: lower(), active }));

  it('reads the round, our rank and the record above the progress rule without opening anything', () => {
    const markup = render(true);
    // The links below the card open the league and the cups; the card itself only reads.
    expect(markup).not.toContain('<button');
    for (const label of ['라운드', '리그 순위']) expect(markup).toContain(label);
    expect(markup).toContain('data-testid="hub-rank"');
    expect(markup).toContain('1-0-0');
    expect(markup).toContain('승점 3');
    expect(markup).toMatch(/data-testid="game-round"[^>]*>1</);
    expect(markup).toMatch(/data-testid="game-round-total"[^>]*>\/ 2</);
    expect(markup).toContain('aria-label="리그 진행률"');
    expect(markup.indexOf('<progress')).toBeGreaterThan(markup.indexOf('data-testid="hub-record"'));
  });

  it('fills league progress a day at a time from the first to the last league match day', () => {
    const progress = (day: number) => {
      const w = lower();
      w.calendar = { ...w.calendar, day } as World['calendar'];
      return ownLeagueProgress(w);
    };
    // Rounds 1 and 2 are played on days 7 and 14.
    expect([6, 7, 9, 14, 20].map(progress)).toEqual([0, 0, 28.6, 100, 100]);
  });

  it('leaves the round ids to the information row while home is hidden', () => {
    const markup = render(false);
    expect(markup).not.toContain('data-testid="game-round"');
    expect(markup).not.toContain('data-testid="game-round-total"');
    expect(markup).toContain('라운드');
  });

  it('reserves one separate cup slot and counts retained unfinished competitions only', () => {
    const w = lower();
    w.cups = [
      {
        country: 'ENG',
        name: 'Domestic Cup',
        clubs: ['own'],
        fixtures: [],
        rounds: [],
      },
    ] as unknown as World['cups'];
    w.europe = [
      { key: 'ucl', name: 'European Cup', clubs: [], fixtures: [], rounds: [] },
      {
        key: 'uel',
        name: 'Completed Cup',
        clubs: ['own'],
        fixtures: [],
        rounds: [],
        winner: 'own',
      },
    ] as unknown as World['europe'];
    const markup = renderToStaticMarkup(createElement(SeasonCard, { w, active: true }));
    expect(markup).toMatch(
      /data-home-part="cup-summary"[^>]*><span>컵대회<\/span><b>2<small>개<\/small><\/b>/,
    );
    expect(markup).not.toContain('European Cup 현재 대회 보기');
    expect(render(true)).not.toContain('진행 중 없음');
  });
});

describe('the office current-club summary (→WEB-44)', () => {
  const facts: SituationFact[] = [
    { key: 'strength', label: '팀 전력', value: '31', note: '리그 14/16위', tone: 'warn' },
    {
      key: 'squad',
      label: '출전 가능',
      value: '16/19',
      note: '부상 2 · 정지 1',
      tone: 'warn',
      warning: '주의',
    },
    { key: 'fatigue', label: '선발 피로', value: '12', note: '상쾌', tone: 'good' },
    { key: 'morale', label: '분위기', value: '34', note: '위기', tone: 'bad', warning: '위험' },
    { key: 'manager', label: '감독 입지', value: '대행', note: '대행 체제', tone: 'warn' },
  ];
  const render = (items: SituationFact[]) => {
    vi.mocked(clubSituation).mockReturnValue(items);
    return renderToStaticMarkup(createElement(ClubSituation, { w: world() }));
  };

  it('reads every fact as text, strength first, with no tile to press', () => {
    const markup = render(facts);
    // A readable summary, not a grid of redirect buttons.
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('aria-haspopup');
    expect(markup).toContain('aria-label="클럽 현황"');
    expect(markup.indexOf('data-fact="strength"')).toBeLessThan(
      markup.indexOf('data-fact="squad"'),
    );
    for (const text of ['팀 전력', '리그 14/16위', '출전 가능', '16/19', '부상 2 · 정지 1'])
      expect(markup).toContain(text);
    expect(markup).toContain('<dt>감독 입지</dt><dd><b>대행</b>');
  });

  it('names warnings in plain words beside their fact and drops them once the state recovers', () => {
    const markup = render(facts);
    expect(markup).toMatch(/data-testid="situation-warning-squad"[^>]*> · 주의</);
    expect(markup).toMatch(/data-testid="situation-warning-morale"[^>]*> · 위험</);
    // Strength compares; it never carries a repair badge.
    expect(markup).not.toContain('situation-warning-strength');
    const calm = render(facts.map((fact) => ({ ...fact, warning: undefined })));
    expect(calm).not.toContain('situation-warning-');
  });
});

describe('home office entrance (→WEB-11/72)', () => {
  const entrance = () => renderToStaticMarkup(createElement(OfficeEntrance, { w: world() }));

  it('states the actual waiting and overdue approvals as live text over the manager room', () => {
    vi.mocked(approvalRequests).mockReturnValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ] as ReturnType<typeof approvalRequests>);
    vi.mocked(overdueSummary).mockReturnValue({ overdue: 1, morale: 1 });
    const markup = entrance();
    expect(markup).toContain('aria-label="구단주 사무실"');
    // The art leads in its reserved slot; the caption and the way in are HTML after it.
    expect(markup.match(/data-facility-art="[^"]+"/g)).toEqual(['data-facility-art="manager"']);
    expect(markup.indexOf('data-facility-art')).toBeLessThan(markup.indexOf('결재 대기'));
    expect(markup).toMatch(/결재 대기 <b data-ui="count"[^>]*>3<\/b>건/);
    expect(markup).toContain('지연 1건');
    expect(markup).toContain('>들어가기</button>');
    // The office holds the team summary and the quick actions, not its entrance.
    expect(markup).not.toContain('quick-actions');
    expect(markup).not.toContain('club-situation');
  });

  it('reads 0 with nothing waiting and invents no work', () => {
    vi.mocked(approvalRequests).mockReturnValue([]);
    vi.mocked(overdueSummary).mockReturnValue({ overdue: 0, morale: 0 });
    const markup = entrance();
    expect(markup).toContain('결재 대기 0건');
    expect(markup).not.toContain('data-ui="count"');
    expect(markup).not.toContain('지연');
  });
});

describe('the home briefing and the office team content (→WEB-11/39)', () => {
  const client = {} as GameClient;
  const facts: SituationFact[] = [
    { key: 'strength', label: '팀 전력', value: '31', note: '리그 14/16위', tone: 'ok' },
  ];

  it('keeps the season card, NEXT MATCH and the illustrated entrance only on home', () => {
    vi.mocked(approvalRequests).mockReturnValue([]);
    vi.mocked(clubSituation).mockReturnValue(facts);
    const w = world();
    w.tables = {} as World['tables'];
    const markup = renderToStaticMarkup(createElement(ClubHub, { w, client }));
    const season = markup.indexOf('data-home-part="season-card"'),
      fixture = markup.indexOf('data-home-part="fixture"'),
      office = markup.indexOf('data-home-part="office"');
    expect(season).toBeGreaterThan(-1);
    expect(season).toBeLessThan(fixture);
    expect(fixture).toBeLessThan(office);
    expect(markup).toContain('data-facility-art="manager"');
    // No section bar, team summary or quick-action tiles stay on home.
    for (const moved of ['club-situation', 'quick-actions', 'role="tablist"', '팀 전력'])
      expect(markup, moved).not.toContain(moved);
  });

  it('places the summary, then the quick actions in the compact office band, once each', () => {
    vi.mocked(clubSituation).mockReturnValue(facts);
    const markup = renderToStaticMarkup(createElement(OfficeTeam, { w: world(), client }));
    expect(markup).toContain('aria-label="팀 현황"');
    expect(markup.match(/data-testid="club-situation"/g)).toHaveLength(1);
    expect(markup.match(/data-testid="quick-actions"/g)).toHaveLength(1);
    expect(markup.indexOf('club-situation')).toBeLessThan(markup.indexOf('quick-actions'));
    // The band names the office so the themes keep its compact icon-free tiles (→WEB-91).
    expect(markup).toMatch(/data-home-part="office"><section data-testid="quick-actions"/);
    // The summary reads; the quick actions are the only controls.
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('data-facility-art');
  });
});

describe('current competition briefing markup', () => {
  it('closes the originating overview before opening the exact cup and season', () => {
    const w = world();
    w.europe = [
      { key: 'ucl', name: 'European Cup', clubs: [], fixtures: [], rounds: [] },
    ] as unknown as World['europe'];
    const close = vi.fn();
    const overview = CupBriefing({ w, onOpen: close });
    const entries = overview.props.children;
    entries[1].props.actions.props.onClick();
    expect(close).toHaveBeenCalledOnce();
    expect(openCupSeason).toHaveBeenCalledWith(w.year, 'ucl', w.year);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(openCupSeason).mock.invocationCallOrder[0],
    );
  });
  it('names each precise competition and its actual participation state', () => {
    const w = world();
    w.clubs[0].country = 'ENG';
    w.europe = [
      {
        key: 'ucl',
        name: 'Champions League',
        clubs: [],
        rounds: [],
        fixtures: [],
        stage: '조별 리그',
      },
    ] as unknown as World['europe'];
    const markup = renderToStaticMarkup(createElement(CupBriefing, { w }));
    expect(markup).toContain('aria-label="잉글랜드 컵 현재 대회 보기"');
    expect(markup).toContain('aria-label="Champions League 현재 대회 보기"');
    expect(markup).toContain('대진 정보 없음');
    expect(markup.match(/data-ui="card"/g)).toHaveLength(2);
    expect(markup.match(/미참가/g)).toHaveLength(1);
  });
});
