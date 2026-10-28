import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { clubMilestones, createWorld, transferOffers } from '../../../../packages/engine/src/index';
import { sponsorSlots } from '../../../../packages/engine/src/operations';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import korean from '../../public/presentation/locales/ko-KR.json';
import { AcademyPanel } from './AcademyPanel';
import { BusinessWorkbench } from './BusinessWorkbench';
import { ClubDesignView } from './ClubDesignView';
import { CoachingStaff } from './ClubStaff';
import { ProgressControls } from './ProgressControls';
import { ProgressModeSwitch } from './ProgressModeSwitch';
import { RecruitmentDesk } from './RecruitmentDesk';
import Rich from './Rich';
import { StrategyBoard } from './StrategyBoard';
import { TrainingOrderSheet } from './TrainingOrderSheet';

vi.mock('../presentation/react', async (original) => ({
  ...(await original<typeof import('../presentation/react')>()),
  useLocale: () => ({
    t: (id: string) => korean.messages[id as keyof typeof korean.messages] ?? id,
  }),
}));

const { drafts } = vi.hoisted(() => ({ drafts: {} as Record<string, unknown> }));
vi.mock('../runtime/store', async (original) => ({
  ...(await original<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('./taskMemory', async (original) => ({
  ...(await original<typeof import('./taskMemory')>()),
  useTaskState: (_world: string, key: string, initial: unknown) => [
    drafts[key] ?? (typeof initial === 'function' ? initial() : initial),
    vi.fn(),
  ],
}));
// Exercise dialog contents without a DOM or a portal implementation.
vi.mock('./Dialog', () => ({
  Dialog: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) =>
    createElement('section', { role: 'dialog' }, children, actions),
}));
vi.mock('./FacilityArt', () => ({
  FacilityArt: () => createElement('img', { alt: 'Club room' }),
}));

const world = createWorld({
  country: 'ENG',
  name: 'Calendar Lock',
  color: '#224466',
  seed: 'calendar-lock',
  level: 'easy',
});
world.cash = '999999999999';
const controller = {
  store: createStore(() => ({ running: true, pace: 'x1', reason: '' })),
} as unknown as ProgressionController;
const client = {} as GameClient;
function state(): ClientState {
  return {
    ...initialClientState,
    busy: false,
    processing: false,
    readonly: false,
    clockRunning: true,
    view: {
      world,
      careers: {},
      coaches: {},
      totalMatches: 0,
      supportUsed: 0,
      milestones: clubMilestones(world),
      managers: [],
      transfers: transferOffers(world),
      sponsors: sponsorSlots(world),
      annualCost: '0',
      coefficient: 0,
      news: [],
      tallies: { players: {}, leagueReds: {} },
    } as View,
  };
}
const buttons = (markup: string) =>
  [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributes, body]) => ({
    label: /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? body.replace(/<[^>]*>/g, ''),
    disabled: attributes.includes('disabled=""'),
  }));
const render = (element: ReactElement) => buttons(renderToStaticMarkup(element));
function expectLocked(element: () => ReactElement, label: RegExp) {
  for (const processing of [false, true, false]) {
    gameStore.setState({ processing });
    const actions = render(element()).filter((button) => label.test(button.label));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((button) => button.disabled)).toBe(true);
  }
  gameStore.setState({ clockRunning: false, processing: true });
  expect(
    render(element())
      .filter((button) => label.test(button.label))
      .every((button) => button.disabled),
  ).toBe(true);
  gameStore.setState({ processing: false });
  expect(render(element()).some((button) => label.test(button.label) && !button.disabled)).toBe(
    true,
  );
  gameStore.setState({ clockRunning: true });
}
beforeEach(() => {
  gameStore.setState(state(), true);
  vi.stubGlobal('location', {
    origin: 'https://game.test',
    pathname: '/first-team',
    search: '?view=players',
  });
  for (const key of Object.keys(drafts)) delete drafts[key];
});
afterEach(() => {
  gameStore.setState(initialClientState, true);
  vi.unstubAllGlobals();
});

describe('management screen calendar locks', () => {
  it('locks squad transfer-state changes while roster inspection remains available', () => {
    expectLocked(
      () =>
        createElement(Rich, {
          state: gameStore.getState(),
          client,
          page: 'firstTeam',
          controller,
        }),
      /이적 상태/,
    );
  });
  it('locks staff appointment and renewal entries over automatic ticks', () => {
    expectLocked(() => createElement(CoachingStaff, { w: world, client }), /^(선임|교체|재계약)$/);
  });
  it('keeps recruitment filters and candidate inspection available while the calendar runs', () => {
    const entries = render(createElement(RecruitmentDesk, { state: gameStore.getState(), client }));
    expect(entries.find((button) => button.label === '영입 필터')?.disabled).toBe(false);
    const details = entries.filter((button) => button.label.endsWith('상세 보기'));
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((button) => !button.disabled)).toBe(true);
  });
  it.each(['finance', 'build', 'sponsor'] as const)(
    'locks %s actions over automatic ticks',
    (part) => {
      expectLocked(
        () =>
          createElement(BusinessWorkbench, {
            state: gameStore.getState(),
            client,
            part,
          }),
        part === 'finance' ? /추가 출자/ : part === 'build' ? /공사 검토/ : / 계약$/,
      );
    },
  );
  it('locks training suggestions and orders while their costs and probabilities remain visible', () => {
    expectLocked(
      () =>
        createElement(TrainingOrderSheet, {
          w: world,
          client,
          coach: 'assistant',
          onClose: vi.fn(),
        }),
      /제안|강행/,
    );
  });
  it('locks youth release decisions while prospect inspection stays available', () => {
    const w = {
      ...world,
      academy: { players: [{ ...world.players[0]!, id: 'prospect', born: world.year - 16 }] },
    };
    expectLocked(() => createElement(AcademyPanel, { w, client }), / 방출$/);
  });
  it('locks manager requests while navigation and replacement-market inspection remain available', () => {
    vi.stubGlobal('location', {
      origin: 'https://game.test',
      pathname: '/first-team',
      search: '?view=manager',
    });
    expectLocked(
      () =>
        createElement(Rich, {
          state: gameStore.getState(),
          client,
          page: 'firstTeam',
          controller,
        }),
      /감독에게 제안하기/,
    );
    const entries = render(
      createElement(Rich, {
        state: gameStore.getState(),
        client,
        page: 'firstTeam',
        controller,
      }),
    );
    expect(entries.find((button) => button.label === '교체')?.disabled).toBe(false);
  });
  it('locks policy application while leaving preset drafts and reset usable', () => {
    drafts['board-draft'] = { policy: { support: 5 } };
    expectLocked(() => createElement(StrategyBoard, { w: world, client }), /^적용$/);
    const entries = render(createElement(StrategyBoard, { w: world, client }));
    expect(entries.find((button) => button.label === '되돌리기')?.disabled).toBe(false);
    expect(entries.filter((button) => !button.disabled).length).toBeGreaterThan(2);
  });
  it('locks club-design application while keeping its draft editable and discardable', () => {
    const entry = identityOf(world, world.playerClub);
    const draft = structuredClone(entry);
    draft.colours[0] = '#abcdef';
    drafts['club-identity-draft'] = { worldId: world.id, entry, draft };
    expectLocked(
      () => createElement(ClubDesignView, { state: gameStore.getState(), client }),
      /^적용$/,
    );
    const entries = render(createElement(ClubDesignView, { state: gameStore.getState(), client }));
    expect(entries.find((button) => button.label === '되돌리기')?.disabled).toBe(false);
  });
  it('locks mode changes and retains stop and pace during worker calculation', () => {
    gameStore.setState({ processing: true });
    const switcher = render(createElement(ProgressModeSwitch, { client, controller }));
    expect(switcher.find((button) => button.label.startsWith('진행 방식 변경'))?.disabled).toBe(
      true,
    );
    const transport = render(createElement(ProgressControls, { client, controller }));
    expect(transport.find((button) => button.label === '자동 진행 정지')?.disabled).toBe(false);
    expect(transport.find((button) => button.label === '자동 진행 배속')?.disabled).toBe(false);
  });
});
