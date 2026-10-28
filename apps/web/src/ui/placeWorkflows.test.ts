import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState, GameClient } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { initialClientState } from '../runtime/store';
import { useTaskMemory } from './taskMemory';
import { PersonnelHub } from './PersonnelHubs';
import { TrainingView } from './TrainingView';

const selection = vi.hoisted(() => ({ tab: 'manager' }));
// Address and artwork adapters are outside these composition units. The real activities and
// authoritative academy/training forms still render from a tiny world, without a worker or DOM.
vi.mock('./PageTabs', async (original) => ({
  ...(await original<typeof import('./PageTabs')>()),
  useAddressTab: () => [selection.tab, vi.fn()],
}));
vi.mock('../presentation/react', async (original) => ({
  ...(await original<typeof import('../presentation/react')>()),
  useLocale: () => ({ t: (key: string) => key }),
}));
vi.mock('./FacilityOverview', () => ({
  FacilityOverview: ({ children }: { children: ReactNode }) =>
    createElement('figure', {}, children),
}));

function fixture() {
  const world = {
    id: 'place-composition-unit',
    seed: 'place-composition-unit',
    revision: 0,
    year: 1950,
    round: 0,
    playerClub: 'own',
    clubs: [
      {
        id: 'own',
        name: 'Synthetic Own Club',
        country: 'ENG',
        tier: 0,
        group: 0,
        fans: 800,
        reputation: 10,
      },
    ],
    players: [],
    academy: { players: [], intakeYear: 1949 },
    manager: {
      id: 'manager',
      name: 'Synthetic Manager',
      ability: 50,
      youth: 50,
      flexibility: 50,
      pride: 50,
      trust: 50,
      wage: '0',
      philosophy: 'balanced',
    },
    staff: [
      { id: 'assistant', role: 'assistant', name: 'Synthetic Assistant', ability: 50, wage: '0' },
      { id: 'youth', role: 'youth', name: 'Synthetic Youth Director', ability: 50, wage: '0' },
    ],
    morale: 60,
    cash: '100000',
    income: '0',
    expense: '0',
    currency: 'GBP',
    events: [],
    ownMatches: [],
    fixtures: [],
    tables: {},
    tactic: 'balanced',
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
  } as unknown as World;
  const state: ClientState = { ...initialClientState, busy: false, view: { world } as View };
  const command = vi.fn<GameClient['command']>();
  const client = { state, command } as unknown as GameClient;
  useTaskMemory.getState().activate(world.id);
  return { world, state, client, command };
}
afterEach(() => useTaskMemory.getState().activate('clean'));

describe('live place composition', () => {
  it.each([
    ['firstTeam', 'manager', 'manager', '감독 재신임 발표'],
    ['staff', 'coaches', 'coaching', '회복 집중 지원'],
  ] as const)('mounts guarded choices with the real %s work', (page, tab, place, label) => {
    const f = fixture();
    selection.tab = tab;
    const before = structuredClone(f.world);
    const html = renderToStaticMarkup(
      createElement(PersonnelHub, {
        page,
        state: f.state,
        client: f.client,
        panel: () => createElement('section', { 'aria-label': 'authoritative personnel' }),
        market: () => null,
      }),
    );
    expect(html).toContain(`place-activities-${place}`);
    expect(html).toContain(`${label} 검토`);
    expect(html).toContain('authoritative personnel');
    expect(html.match(/이 장소에서 할 일/g)).toHaveLength(1);
    expect(f.command).not.toHaveBeenCalled();
    expect(f.world).toEqual(before);
  });

  it.each(['training', 'academy'] as const)(
    'keeps one authoritative %s workflow and a live place',
    (view) => {
      const f = fixture();
      const html = renderToStaticMarkup(
        createElement(TrainingView, { state: f.state, client: f.client, view }),
      );
      expect(html).toContain(`place-activities-${view}`);
      if (view === 'training') {
        expect(html.match(/수석코치에게 훈련 제안·강행/g)).toHaveLength(1);
        expect(html).toContain('휴식일 부여 요청 검토');
        expect(html).toContain('분위기 −2');
      } else {
        expect(html.match(/aria-label="유소년 아카데미"/g)).toHaveLength(1);
        expect(html.match(/유스 디렉터에게 훈련 제안·강행/g)).toHaveLength(1);
        expect(html).toContain('아직 아카데미 선수가 없어요');
      }
      expect(f.command).not.toHaveBeenCalled();
    },
  );
});
