import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState, GameClient } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { NextMatchCard, TeamState } from './ClubHub';
import { cashState, teamStates, type TeamStateItem } from './teamState';

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
      { id: 'own', name: 'Our Club', color: '#225588' },
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
  it('keeps opponent and preparation without a future observation shortcut', () => {
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn() }),
    );
    expect(markup).toContain('NEXT MATCH');
    expect(markup).toContain('A Very Long Opponent Athletic Club');
    expect(markup).toContain('감독 자동 선발');
    expect(markup).toContain('전술·선발 준비</button>');
    expect(markup).not.toContain('data-testid="home-watch"');
    expect(markup).not.toContain('경기로 돌아가기');
  });

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
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>전술·선발 준비<\/button>/);
  });

  it('plays the match-day moment in place of its content while the store holds one', () => {
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn(), moment: true }),
    );
    const moment = markup.match(/<span[^>]*data-testid="next-match-moment"[^>]*>.*?<\/span>/)?.[0];
    expect(moment).toContain('aria-hidden="true"');
    expect(moment).toMatch(/<i class="[^"]*"><\/i>/);
    expect(moment).not.toContain('A Very Long Opponent Athletic Club');
    // The content stays laid out under the moment, unseen, so the card keeps its size.
    expect(markup).toMatch(/<section class="[^"]*momentOn[^"]*"/);
    expect(markup).toContain('전술·선발 준비');
    // It comes last: the themes style the card's first child, which stays its content.
    expect(markup.indexOf('next-match-moment')).toBeGreaterThan(markup.indexOf('전술·선발 준비'));
    const idle = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn() }),
    );
    expect(idle).not.toContain('next-match-moment');
    expect(idle).not.toContain('momentOn');
  });

  it('keeps unfinished observation out of the upcoming-match card', () => {
    gameStore.setState({ playback: { record: { id: 'live' } } as ClientState['playback'] });
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn() }),
    );
    expect(markup).toContain('A Very Long Opponent Athletic Club');
    expect(markup).toContain('전술·선발 준비');
    expect(markup).not.toContain('관전 이어보기');
    expect(markup).not.toContain('home-watch');
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
