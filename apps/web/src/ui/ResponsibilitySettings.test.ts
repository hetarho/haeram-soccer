import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../packages/engine/src/pending-work-preview';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { ResponsibilitySettings } from './ResponsibilitySettings';
import { useTaskMemory } from './taskMemory';

vi.mock('../../../../packages/engine/src/pending-work-preview', () => ({
  pendingWorkPreview: vi.fn(() => []),
}));
vi.mock('../runtime/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../runtime/store')>();
  return {
    ...original,
    useGameState: (selector: (state: ClientState) => unknown) =>
      selector(original.gameStore.getState()),
  };
});
vi.mock('./Dialog', () => ({
  Dialog: ({ children, actions }: { children: ReactNode; actions: ReactNode }) =>
    createElement('main', null, children, createElement('footer', null, actions)),
}));

const client = {} as GameClient;
const controller = {
  store: createStore(() => ({ background: { hidden: true, away: 'season' } })),
} as unknown as ProgressionController;
const render = () =>
  renderToStaticMarkup(
    createElement(ResponsibilitySettings, { client, controller, onClose: vi.fn() }),
  );

beforeEach(() => {
  vi.mocked(pendingWorkPreview).mockReturnValue([]);
  gameStore.setState(
    {
      ...initialClientState,
      busy: false,
      processing: false,
      readonly: false,
      view: { world: { id: 'settings-test', settings: defaultSettings() } } as View,
    },
    true,
  );
});
afterEach(() => {
  gameStore.setState(initialClientState, true);
  useTaskMemory.setState({ world: undefined, values: {} });
});

describe('central settings presentation', () => {
  it('hides only background settings in manual mode without changing stored choices', () => {
    const settings = gameStore.getState().view!.world.settings!;
    settings.mode = 'manual';
    const before = structuredClone(settings);
    const background = structuredClone(controller.store.getState().background);
    const markup = render();
    expect(markup).toMatch(/aria-label="진행 모드"[^>]*data-value="manual"/);
    expect(markup).toContain('aria-label="경기 전날 이벤트"');
    expect(markup).toContain('aria-label="이적시장 개장 이벤트"');
    expect(markup).toContain('aria-label="업무 위임"');
    expect(markup).toMatch(/aria-label="스태프 인사"[^>]*data-value="delegated"/);
    expect(markup).not.toContain('aria-label="자동 모드의 백그라운드 진행"');
    expect(markup).toContain('업무 위임과 중지 조건은 아래에서 바꿀 수 있어요.');
    expect(settings).toEqual(before);
    expect(controller.store.getState().background).toEqual(background);
  });

  it('retains explicit match-eve repair alongside the visible manual observation controls', () => {
    const settings = gameStore.getState().view!.world.settings!;
    settings.mode = 'manual';
    settings.observations.matchEve = false;
    const markup = render();
    expect(markup).toContain('수동 모드에는 경기 이벤트가 필요해요');
    expect(markup).toContain('경기 전날 이벤트 켜기</button>');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>적용<\/button>/);
    expect(markup).toContain('aria-label="경기 전날 이벤트"');
    expect(settings.observations.matchEve).toBe(false);
  });

  it('discloses a pending handover alongside editable manual delegation controls', () => {
    gameStore.getState().view!.world.settings!.mode = 'manual';
    vi.mocked(pendingWorkPreview).mockReturnValue([
      { key: 'recruitment', to: 'delegated', count: 2, refs: ['one', 'two'] },
    ]);
    const markup = render();
    expect(markup).toContain('aria-label="대기 업무 이관 미리보기"');
    expect(markup).toContain('대기 중인 선수 영입 2건도 위임됩니다.');
    const recruitment = /<button[^>]*aria-label="선수 영입"[^>]*>/.exec(markup)![0];
    expect(recruitment).not.toContain('disabled');
    expect(markup).toContain('전체 위임</button>');
  });

  it('puts mode before delegation and background and offers only close/apply in the footer', () => {
    const markup = render();
    const sections = [...markup.matchAll(/<section[^>]*aria-label="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(sections).toEqual(['시간 진행 방식', '업무 위임', '자동 모드의 백그라운드 진행']);
    const footer = /<footer>(.*?)<\/footer>/.exec(markup)![1];
    expect([...footer.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[1])).toEqual([
      '닫기',
      '적용',
    ]);
    expect(markup).not.toContain('변경 버리기');
  });

  it('starts from applied settings without restoring or clearing other policy drafts', () => {
    const previousDraft = defaultSettings();
    previousDraft.mode = 'manual';
    previousDraft.responsibilities.recruitment = 'delegated';
    const values = {
      'responsibility-settings-draft': {
        game: previousDraft,
        background: { hidden: false, away: 'off' },
      },
      'policy-draft': { untouched: true },
    };
    useTaskMemory.setState({ world: 'settings-test', values });
    const markup = render();
    expect(markup).toMatch(/aria-label="진행 모드"[^>]*data-value="automatic"/);
    expect(markup).toMatch(/aria-label="선수 영입"[^>]*data-value="direct"/);
    expect(useTaskMemory.getState().values).toEqual(values);
  });

  it('keeps read-only controls and apply disabled while leaving close available', () => {
    gameStore.setState({ readonly: true });
    const markup = render();
    expect(markup).toContain('읽기 전용 상태에서는 설정을 적용할 수 없어요.');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>적용<\/button>/);
    expect(markup).toMatch(/<button>닫기<\/button>/);
    expect(/<button[^>]*aria-label="선수 영입"[^>]*>/.exec(markup)![0]).toContain('disabled=""');
  });
});
