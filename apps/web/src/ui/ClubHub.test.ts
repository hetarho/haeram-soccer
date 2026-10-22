import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { MatchAction, NextMatchCard } from './ClubHub';

const matchView = vi.hoisted(() => ({ matchId: undefined as string | undefined, finished: false }));
vi.mock('../runtime/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../runtime/store')>();
  return {
    ...original,
    useGameState: (selector: (state: ClientState) => unknown) =>
      selector(original.gameStore.getState()),
  };
});
vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  useMatchView: () => matchView,
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

function matchAction(next = true, critical = false) {
  return createElement(MatchAction, {
    critical,
    next,
    onWatch: vi.fn(async () => {}),
    onReturn: vi.fn(),
  });
}

beforeEach(() => {
  matchView.matchId = undefined;
  matchView.finished = false;
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
  it('keeps opponent context, observation and preparation together', () => {
    const markup = renderToStaticMarkup(
      createElement(NextMatchCard, { w: world(), onPrepare: vi.fn(), matchAction: matchAction() }),
    );
    expect(markup).toContain('NEXT MATCH');
    expect(markup).toContain('A Very Long Opponent Athletic Club');
    expect(markup).toContain('감독 자동 선발');
    expect(markup).toContain('전술·선발 준비</button>');
    expect(markup).toContain('aria-label="다음 경기 관전"');
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
        matchAction: matchAction(false, true),
      }),
    );
    expect(markup).toContain('다음 시즌을 준비해요');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>전술·선발 준비<\/button>/);
  });

  it('keeps home observation and next-season labels with readonly protection', () => {
    const props = { critical: false, onWatch: vi.fn(async () => {}), onReturn: vi.fn() };
    gameStore.setState({ readonly: true });
    const markup = renderToStaticMarkup(createElement(MatchAction, { ...props, next: true }));
    expect(markup).toContain('data-testid="home-watch"');
    expect(markup).toMatch(/aria-label="다음 경기 관전"[^>]*disabled=""/);
    expect(renderToStaticMarkup(createElement(MatchAction, { ...props, next: false }))).toContain(
      'aria-label="다음 시즌 시작"',
    );
  });

  it('returns to an unfinished playback instead of offering another match', () => {
    matchView.matchId = 'live';
    gameStore.setState({ playback: { record: { id: 'live' } } as ClientState['playback'] });
    const markup = renderToStaticMarkup(
      createElement(MatchAction, {
        critical: false,
        next: true,
        onWatch: vi.fn(async () => {}),
        onReturn: vi.fn(),
      }),
    );
    expect(markup).toContain('aria-label="관전 이어보기"');
    expect(markup).not.toContain('다음 경기 관전');
  });
});
