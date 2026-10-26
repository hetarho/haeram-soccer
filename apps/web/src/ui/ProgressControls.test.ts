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
import { ProgressControls, ProgressOverview } from './ProgressControls';

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
    'separates %s mode text from the change action and keeps the correct controls',
    (mode) => {
      gameStore.getState().view!.world.settings!.mode = mode;
      const markup = renderToStaticMarkup(createElement(ProgressControls, { client, controller }));
      const switcher = markup.match(
        /<button[^>]*data-ui="primary"[^>]*data-progress-mode[^>]*>(.*?)<\/button>/,
      )?.[1];
      expect(switcher).toBe('진행 방식 변경');
      expect(markup.indexOf('data-progress-mode')).toBeLessThan(
        markup.indexOf('data-testid="progression-mode"'),
      );
      expect(markup).toMatch(
        new RegExp(`data-testid="progression-mode"[^>]*>${mode === 'manual' ? 'MANUAL' : 'AUTO'}<`),
      );
      expect(markup).toContain('data-ui="season-transport"');
      expect(markup).not.toContain('수동 진행 · 다음 이벤트를 선택하세요');
      expect(markup).not.toContain('재생하면 날짜가 흐릅니다');
      expect(markup.includes('다음 이벤트')).toBe(mode === 'manual');
      expect(markup.includes('aria-label="자동 진행 시작"')).toBe(mode === 'automatic');
      expect(markup.includes('aria-label="자동 진행 배속"')).toBe(mode === 'automatic');
    },
  );

  it.each([
    ['match', '경기 진행 중…'],
    ['day', '진행 중…'],
  ] as const)(
    'renders a %s late step in its reserved slot without a live region',
    (lateStep, caption) => {
      gameStore.getState().view!.world.settings!.mode = 'automatic';
      const late = {
        store: createStore(() => ({ running: true, pace: 'x10', reason: '', lateStep })),
      } as unknown as ProgressionController;
      const markup = renderToStaticMarkup(
        createElement(ProgressControls, { client, controller: late }),
      );
      const slot = markup.match(/<span[^>]*data-testid="late-step"[^>]*>(.*?)<\/span><\/div>/)?.[0];
      expect(slot).toContain(`data-state="${lateStep}"`);
      expect(slot).toContain(`>${caption}<`);
      expect(slot).toMatch(/<i[^>]*aria-hidden="true"/);
      expect(slot).not.toContain('aria-live');
      // Off, the slot stays reserved and empty; manual mode has none.
      const idle = renderToStaticMarkup(createElement(ProgressControls, { client, controller }));
      expect(idle).toMatch(/data-testid="late-step"[^>]*data-state="off"[^>]*><\/span>/);
      expect(idle).not.toContain('진행 중…');
      gameStore.getState().view!.world.settings!.mode = 'manual';
      const manual = renderToStaticMarkup(
        createElement(ProgressControls, { client, controller: late }),
      );
      expect(manual).not.toContain('late-step');
      expect(manual).not.toContain('진행 중…');
    },
  );

  it('keeps date and round metadata free of mode controls', () => {
    const markup = renderToStaticMarkup(createElement(ProgressOverview, { compact: true }));
    expect(markup).toContain('data-testid="game-date"');
    expect(markup).toContain('data-testid="game-round"');
    expect(markup).toContain('data-testid="mini-clock"');
    expect(markup).not.toContain('progress-mode');
    expect(markup).not.toContain('MANUAL');
    expect(markup).not.toContain('AUTO');
  });
});
