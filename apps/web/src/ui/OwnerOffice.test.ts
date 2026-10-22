import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { OwnerOffice, PendingHandover } from './OwnerOfficeView';
import { officeProposal } from './officeChanges';
vi.mock('../runtime/store', async (original) => ({
  ...(await original<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('../../../../packages/engine/src/pending-work-preview', () => ({
  pendingWorkPreview: () => [],
}));
vi.mock('./FacilityArt', () => ({
  FacilityArt: ({ kind }: { kind: string }) => createElement('img', { 'data-facility-art': kind }),
}));
const controller = {
  store: createStore(() => ({ background: { hidden: true, away: 'season' } })),
} as unknown as ProgressionController;
const render = () =>
  renderToStaticMarkup(createElement(OwnerOffice, { client: {} as GameClient, controller }));
beforeEach(() =>
  gameStore.setState(
    {
      ...initialClientState,
      busy: false,
      processing: false,
      readonly: false,
      view: { world: { id: 'office', settings: defaultSettings() } } as View,
    },
    true,
  ),
);
afterEach(() => gameStore.setState(initialClientState, true));
describe('owner office page', () => {
  it('renders applied authority pairs with no enclosing dialog or global apply footer', () => {
    const markup = render();
    expect(markup).toContain('data-testid="owner-office"');
    expect(markup).toContain('data-facility-art="manager"');
    expect(markup).toContain('aria-label="선수 영입"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>직접 결정/);
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('>적용</button>');
  });
  it('allows manual with match eve off and hides only background controls', () => {
    const settings = gameStore.getState().view!.world.settings!;
    settings.mode = 'manual';
    settings.observations.matchEve = false;
    const before = structuredClone(settings),
      markup = render();
    expect(markup).toContain('aria-label="경기 전날 보고"');
    expect(markup).toContain('aria-label="이적시장 개장 보고"');
    expect(markup).toContain('aria-label="업무 위임"');
    expect(markup).not.toContain('aria-label="자동 모드의 백그라운드 진행"');
    expect(markup).not.toContain('경기 이벤트가 필요');
    expect(markup).not.toContain('모달');
    expect(markup).not.toContain('멈추기');
    expect(markup).toContain('받지 않기</button>');
    expect(settings).toEqual(before);
  });
  it('discloses transferred and jointly held work before confirmation', () => {
    const proposal = officeProposal(gameStore.getState().view!.world, {
      responsibilities: { recruitment: 'delegated' },
    });
    proposal.pending = [
      { key: 'recruitment', to: 'delegated', count: 2, held: 1, refs: ['one', 'two'] },
    ];
    const markup = renderToStaticMarkup(createElement(PendingHandover, { proposal }));
    expect(markup).toContain('대기 중인 선수 영입 2건도 위임됩니다.');
    expect(markup).toContain('공동 승인 1건은 다른 직접 결정이 남아 대기해요.');
  });
  it('disables every mutation in readonly state', () => {
    gameStore.setState({ readonly: true });
    const markup = render();
    expect(markup).toContain('읽기 전용');
    expect(
      [...markup.matchAll(/<button[^>]*>/g)].every(([tag]) => tag.includes('disabled=""')),
    ).toBe(true);
  });
});
