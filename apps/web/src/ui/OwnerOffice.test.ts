import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { OfficeRow, OwnerOffice, PendingHandover } from './OwnerOfficeView';
import { DESK_RESPONSIBILITIES } from './officeDesks';
import { officeBulkChange, officeProposal, officeSettings } from './officeChanges';
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
  store: createStore(() => ({ background: { hidden: true, away: 'season', resultNotice: false } })),
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
  it('keeps every report/delegation/background edit disabled across automatic day calculations', () => {
    for (const processing of [false, true, false]) {
      gameStore.setState({ clockRunning: true, processing });
      const markup = render();
      const buttons = [...markup.matchAll(/<button([^>]*)>/g)];
      expect(buttons).toHaveLength(21);
      expect(buttons.every(([, attributes]) => attributes.includes('disabled=""'))).toBe(true);
      expect(markup).toMatch(/<input[^>]*disabled=""/);
      expect(markup).toMatch(/role="combobox"[^>]*disabled=""|disabled=""[^>]*role="combobox"/);
    }
    gameStore.setState({ clockRunning: false, processing: true });
    expect(render()).toMatch(/<button[^>]*disabled=""/);
    gameStore.setState({ processing: false });
    expect(render()).not.toMatch(/<button[^>]*disabled=""/);
  });
  it('renders applied authority pairs with no enclosing dialog or global apply footer', () => {
    const markup = render();
    expect(markup).toContain('data-testid="owner-office"');
    expect(markup).toContain('data-facility-art="manager"');
    expect(markup).toContain('aria-label="선수 영입"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>직접/);
    expect(markup.match(/>보고받기<\/button>/g)).toHaveLength(2);
    expect(markup.match(/>위임<\/button>/g)).toHaveLength(2);
    expect(markup.indexOf('전체 직접')).toBeLessThan(markup.indexOf('data-facility-art'));
    expect(markup).not.toContain('진행 방식 변경');
    expect(markup).not.toContain('진행 모드');
    expect(markup).toMatch(/aria-pressed="false"[^>]*>전체 직접/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>전체 자동/);
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('>적용</button>');
    // The result notice preference sits on its own, above the 자리를 비운 동안 section.
    expect(markup).toMatch(/<input type="checkbox"[^>]*\/>경기 결과 알림/);
    expect(markup.indexOf('경기 결과 알림')).toBeLessThan(markup.indexOf('자리를 비운 동안'));
  });
  it('allows manual with match eve off and hides only background controls', () => {
    const settings = gameStore.getState().view!.world.settings!;
    settings.mode = 'manual';
    settings.observations.matchEve = false;
    const before = structuredClone(settings),
      markup = render();
    expect(markup).toContain('aria-label="경기 전날 보고"');
    expect(markup).toContain('aria-label="이적시장 개장 보고"');
    expect(markup).toContain('aria-label="보고·위임 설정"');
    expect(markup).not.toContain('aria-label="자동 모드의 백그라운드 진행"');
    expect(markup).not.toContain('경기 결과 알림');
    expect(markup).not.toContain('경기 이벤트가 필요');
    expect(markup).not.toContain('모달');
    expect(markup).not.toContain('멈추기');
    expect(markup).toContain('위임</button>');
    expect(markup).not.toContain('받지 않기');
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
    expect(markup).toContain('공동 승인 1건은 다른 업무의 구단주 승인이 필요해 대기해요.');
  });
  it.each(['direct', 'delegated'] as const)(
    'marks the bulk choice only when all rows are %s',
    (value) => {
      const w = gameStore.getState().view!.world;
      w.settings = officeSettings(w, officeBulkChange(w, value)!);
      const markup = render();
      expect(markup).toMatch(
        new RegExp(`aria-pressed="true"[^>]*>${value === 'direct' ? '전체 직접' : '전체 자동'}`),
      );
      expect(markup).toContain(`${value === 'direct' ? 0 : 9} / 9개 자동`);
    },
  );
  it('shares the editor with each desk without exposing unrelated authority or background settings', () => {
    const before = structuredClone(gameStore.getState().view!.world.settings);
    for (const desk of ['players', 'staff', 'sponsor'] as const) {
      const markup = renderToStaticMarkup(
        createElement(OwnerOffice, {
          client: {} as GameClient,
          controller,
          scope: DESK_RESPONSIBILITIES[desk],
        }),
      );
      expect(markup.match(/>직접<\/button>/g)).toHaveLength(DESK_RESPONSIBILITIES[desk].length);
      expect(markup.match(/>자동<\/button>/g)).toHaveLength(DESK_RESPONSIBILITIES[desk].length);
      expect(markup).not.toContain('전체 직접');
      expect(markup).not.toContain('경기 전날 보고');
      expect(markup).not.toContain('경기 결과 알림');
    }
    expect(gameStore.getState().view!.world.settings).toEqual(before);
  });
  it('only proposes a changed explicit choice; inspecting an applied choice submits nothing', () => {
    const select = vi.fn();
    const row = OfficeRow({
      label: '선수 계약',
      detail: '계약',
      delegated: true,
      blocked: false,
      onSelect: select,
    });
    const choices = row.props.children[1].props.children;
    choices[1].props.onClick();
    expect(select).not.toHaveBeenCalled();
    choices[0].props.onClick();
    expect(select).toHaveBeenCalledExactlyOnceWith(false);
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
