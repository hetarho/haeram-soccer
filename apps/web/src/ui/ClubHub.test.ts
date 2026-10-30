import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState, GameClient } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { NextMatchCard, SeasonCard, TeamState, CupBriefing } from './ClubHub';
import korean from '../../public/presentation/locales/ko-KR.json';
import { cashState, teamStates, type TeamStateItem } from './teamState';
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
// Facility art reads the presentation packs; the markup checks need only its slot.
vi.mock('./FacilityArt', () => ({
  FacilityArt: ({ kind }: { kind: string }) => createElement('span', { 'data-facility-art': kind }),
}));
vi.mock('./teamState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./teamState')>()),
  teamStates: vi.fn(),
  cashState: vi.fn(),
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

describe('home condition warnings', () => {
  beforeEach(() => {
    vi.mocked(cashState).mockReturnValue({
      key: 'cash',
      label: '자금',
      value: '충분',
      status: '안정',
      tone: 'good',
    });
  });
  const states: TeamStateItem[] = [
    { key: 'fatigue', label: '피로', value: '10', status: '상쾌', tone: 'good' },
    {
      key: 'squad',
      label: '선수단',
      value: '19/40',
      status: '부족',
      tone: 'warn',
      advice: { text: '선수 19명 · 선발을 채우기 어려워요.', actions: [] },
    },
  ];

  function renderConditions(items: TeamStateItem[]) {
    vi.mocked(teamStates).mockReturnValue(items);
    return renderToStaticMarkup(
      createElement(TeamState, {
        w: world(),
        client: {} as GameClient,
        onPrepare: vi.fn(),
      }),
    );
  }

  it('marks the affected tile and names its warning without automatically rendering advice', () => {
    const markup = renderConditions(states);
    expect(markup).toContain('data-testid="state-warning-squad"');
    expect(markup).not.toContain('data-testid="state-warning-fatigue"');
    expect(markup).toContain('aria-label="선수단 19/40 · 부족 · 주의 · 대처 방법 보기"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain('선수 19명');
    expect(markup).not.toContain('team-state-alert');
  });

  it('marks every affected condition at once and clears the badges when the conditions recover', () => {
    const tired: TeamStateItem = {
      ...states[0],
      tone: 'bad',
      advice: { text: '회복이 필요해요.', actions: [] },
    };
    const warnings = renderConditions([tired, states[1]]);
    expect(warnings).toContain('data-testid="state-warning-fatigue"');
    expect(warnings).toContain('data-testid="state-warning-squad"');
    const recovered = renderConditions(states.map((state) => ({ ...state, advice: undefined })));
    expect(recovered).not.toContain('state-warning-');
    expect(recovered).toContain('팀이 안정적이에요.');
  });

  it('leads with team strength, which never carries a warning badge', () => {
    const markup = renderConditions([
      { key: 'strength', label: '팀 전력', value: '31', status: '리그 14/16위', tone: 'warn' },
      ...states,
    ]);
    expect(markup.indexOf('data-condition="strength"')).toBeLessThan(
      markup.indexOf('data-condition="fatigue"'),
    );
    expect(markup).toContain('aria-label="팀 전력 31 · 리그 14/16위 · 대처 방법 보기"');
    expect(markup).not.toContain('state-warning-strength');
  });

  it('does not call the team stable when the HUD cash needs attention', () => {
    vi.mocked(cashState).mockReturnValue({
      key: 'cash',
      label: '자금',
      value: '부족',
      status: '위기',
      tone: 'bad',
      advice: { text: '자금이 부족해요.', actions: [] },
    });
    expect(
      renderConditions(states.map((state) => ({ ...state, advice: undefined }))),
    ).not.toContain('팀이 안정적이에요.');
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
