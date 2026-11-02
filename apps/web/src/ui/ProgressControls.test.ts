import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { World } from '../../../../packages/contracts/src/types';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { openOwnerOffice } from './state';
import { useTaskMemory } from './taskMemory';
import { nextEventPlace, ProgressControls, ProgressOverview } from './ProgressControls';

vi.mock('../runtime/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('../presentation/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presentation/react')>()),
  useLocale: () => ({ t: (key: string) => key }),
}));

const world = () =>
  ({
    id: 'bottom-controls',
    year: 1950,
    round: 0,
    calendar: { day: 0 },
    playerClub: 'own',
    clubs: [{ id: 'own', country: 'ENG', tier: 0 }],
    fixtures: [],
    cups: [],
    europe: [],
    players: [],
    manager: {},
    settings: defaultSettings(),
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

describe('unified bottom progression controls', () => {
  const client = {} as GameClient;
  const controller = {
    store: createStore(() => ({ running: false, pace: 'x1', reason: '' })),
  } as unknown as ProgressionController;

  it.each(['manual', 'automatic'] as const)(
    'combines %s mode text with its change action and keeps the correct controls',
    (mode) => {
      gameStore.getState().view!.world.settings!.mode = mode;
      const markup = renderToStaticMarkup(createElement(ProgressControls, { client, controller }));
      const switcher = markup.match(
        /<button[^>]*data-ui="primary"[^>]*data-progress-mode[^>]*>(.*?)<\/button>/,
      )?.[1];
      expect(switcher).toContain('MODE:');
      expect(switcher).toContain(`>${mode === 'manual' ? 'MANUAL' : 'AUTO'}</span>`);
      expect(switcher).toContain('data-testid="progression-mode"');
      expect(markup).toContain('data-ui="season-transport"');
      expect(markup).not.toContain('수동 진행 · 다음 이벤트를 선택하세요');
      expect(markup).not.toContain('재생하면 날짜가 흐릅니다');
      expect(markup.includes('다음 이벤트')).toBe(mode === 'manual');
      expect(markup.includes('aria-label="자동 진행 시작"')).toBe(mode === 'automatic');
      expect(markup.includes('aria-label="자동 진행 배속"')).toBe(mode === 'automatic');
    },
  );

  it.each(['manual', 'automatic'] as const)(
    'keeps %s mode and approval controls together without a match-day animation',
    (mode) => {
      gameStore.getState().view!.world.settings!.mode = mode;
      const running = {
        store: createStore(() => ({ running: true, pace: 'x10', reason: '' })),
      } as unknown as ProgressionController;
      const markup = renderToStaticMarkup(
        createElement(ProgressControls, { client, controller: running }),
      );
      expect(markup).not.toContain('match-moment');
      expect(markup).toMatch(/data-testid="progression-mode"[^>]*>(AUTO|MANUAL)<\/span><\/button>/);
    },
  );

  it('shows the result notice with both clubs and the score while the store holds one', () => {
    const w = gameStore.getState().view!.world;
    w.settings!.mode = 'automatic';
    w.clubs = [
      { id: 'own', name: 'Clock Club', country: 'ENG', tier: 0 },
      { id: 'opp', name: 'Rival Town', country: 'ENG', tier: 0 },
    ] as World['clubs'];
    w.ownMatches = [
      { id: 'm1', home: 'opp', away: 'own', score: { home: 1, away: 3 } },
    ] as World['ownMatches'];
    const noticed = {
      store: createStore(() => ({
        running: true,
        pace: 'x1',
        reason: '',
        resultNotice: { matchId: 'm1' },
      })),
    } as unknown as ProgressionController;
    const markup = renderToStaticMarkup(
      createElement(ProgressControls, { client, controller: noticed }),
    );
    expect(markup).toMatch(
      /<button[^>]*data-testid="result-notice"[^>]*>Rival Town 1–3 Clock Club</,
    );
    expect(
      renderToStaticMarkup(createElement(ProgressControls, { client, controller })),
    ).not.toContain('result-notice');
  });

  it('keeps round metadata free of mode controls, leaving today to the HUD', () => {
    const markup = renderToStaticMarkup(createElement(ProgressOverview, { compact: true }));
    expect(markup).not.toContain('data-testid="game-date"');
    expect(markup).toContain('data-testid="game-round"');
    expect(markup).toContain('data-testid="mini-clock"');
    expect(markup).not.toContain('progress-mode');
    expect(markup).not.toContain('MANUAL');
    expect(markup).not.toContain('AUTO');
  });
});

describe('manual 다음 이벤트 from the owner office (→WEB-39/83)', () => {
  it('moves to the clubhouse, since the office draws no observation it reaches or reopens', () => {
    expect(nextEventPlace('business')).toBe('dashboard');
  });

  it('stays in place wherever a report can open', () => {
    for (const page of ['dashboard', 'firstTeam', 'staff', 'operations', 'league'] as const)
      expect(nextEventPlace(page)).toBeUndefined();
  });
});

describe('controller approval overview', () => {
  it.each(['manual', 'automatic'] as const)(
    'offers the shared modal entry in %s mode even while changes are locked',
    (mode) => {
      gameStore.getState().view!.world.settings!.mode = mode;
      const controller = {
        store: createStore(() => ({ running: true, pace: 'x1' })),
      } as unknown as ProgressionController;
      gameStore.setState({ busy: true, readonly: true });
      const markup = renderToStaticMarkup(
        createElement(ProgressControls, { client: {} as GameClient, controller }),
      );
      expect(markup).toMatch(
        /<button(?![^>]*disabled)[^>]*aria-haspopup="dialog"[^>]*>결재 설정<\/button>/,
      );
      expect(markup).toMatch(/<button[^>]*data-progress-mode[^>]*disabled=""/);
      if (mode === 'automatic') {
        expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*aria-label="자동 진행 정지"/);
        expect(markup).toMatch(/<button[^>]*aria-label="자동 진행 배속"[^>]*disabled=""/);
      } else {
        expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>다음 이벤트/);
      }
      useTaskMemory.getState().activate('overview-test');
      useTaskMemory.setState({ values: { 'market-role': 'DF' } });
      openOwnerOffice();
      expect(useTaskMemory.getState().values).toEqual({
        'market-role': 'DF',
        'office-overview': true,
      });
      expect(controller.store.getState().running).toBe(true);
    },
  );
});

describe('controller 결재함 (→WEB-18)', () => {
  const inbox = (markup: string) =>
    markup.match(/<button[^>]*data-testid="approval-inbox"[^>]*>(.*?)<\/button>/)?.[0] ?? '';
  it.each([
    ['manual', false],
    ['automatic', true],
  ] as const)(
    'stays enabled in %s mode, also with nothing waiting and while running',
    (mode, running) => {
      gameStore.getState().view!.world.settings!.mode = mode;
      gameStore.setState({ busy: true, readonly: true });
      const controller = {
        store: createStore(() => ({ running, pace: 'x1' })),
      } as unknown as ProgressionController;
      const button = inbox(
        renderToStaticMarkup(
          createElement(ProgressControls, { client: {} as GameClient, controller }),
        ),
      );
      expect(button).toContain('aria-label="결재함 · 대기 0건"');
      expect(button).not.toContain('disabled');
      expect(button).toContain('<b data-ui="count" aria-hidden="true">0</b>');
      expect(button).not.toContain('지연');
    },
  );
  it('counts what waits and marks the overdue ones', () => {
    const w = gameStore.getState().view!.world;
    w.settings!.responsibilities.manager = 'direct';
    w.manager.interim = true;
    w.manager.id = 'boss';
    w.approvalWaits = { 'decision:manager:boss:1950': 8 };
    const controller = {
      store: createStore(() => ({ running: true, pace: 'x1' })),
    } as unknown as ProgressionController;
    const button = inbox(
      renderToStaticMarkup(
        createElement(ProgressControls, { client: {} as GameClient, controller }),
      ),
    );
    expect(button).toContain('aria-label="결재함 · 대기 1건 · 지연 1건"');
    expect(button).toContain('data-overdue="true"');
    expect(button).toMatch(/>지연 <!-- -->1<\/b>|>지연 1<\/b>/);
  });
});
