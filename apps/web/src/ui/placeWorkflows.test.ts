import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { World } from '../../../../packages/contracts/src/types';
import { clubMilestones, transferOffers } from '../../../../packages/engine/src/index';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import { sponsorSlots } from '../../../../packages/engine/src/operations';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { useTaskMemory } from './taskMemory';
import { PersonnelHub } from './PersonnelHubs';
import Rich from './Rich';
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
// Server rendering reads the store's initial snapshot; these units read the state they prepare.
vi.mock('../runtime/store', async (original) => {
  const store = await original<typeof import('../runtime/store')>();
  return {
    ...store,
    useGameState: (selector: (state: ClientState) => unknown) =>
      selector(store.gameStore.getState()),
  };
});
vi.mock('./FacilityOverview', () => ({
  FacilityOverview: ({
    kind,
    title,
    children,
  }: {
    kind: string;
    title: string;
    children?: ReactNode;
  }) => createElement('figure', { 'data-scene': kind, 'data-title': title }, children),
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
afterEach(() => {
  useTaskMemory.getState().activate('clean');
  gameStore.setState(initialClientState, true);
  vi.unstubAllGlobals();
});

describe('live place composition', () => {
  const leadsBackToTeam =
    /^<div[^>]*data-ui="team-return"><button[^>]*>team\.back<\/button><\/div><section aria-label="authoritative personnel">/;
  const hub = (page: 'firstTeam' | 'staff', tab: string) => {
    const f = fixture();
    selection.tab = tab;
    const before = structuredClone(f.world);
    const html = renderToStaticMarkup(
      createElement(PersonnelHub, {
        page,
        state: f.state,
        panel: () => createElement('section', { 'aria-label': 'authoritative personnel' }),
        market: () => null,
      }),
    );
    expect(f.command).not.toHaveBeenCalled();
    expect(f.world).toEqual(before);
    return html;
  };

  it('opens 1군 on its panel, the people with their rooms, with no room menu or office bar', () => {
    const html = hub('firstTeam', 'players');
    // One quiet way back to 팀 (→WEB-112), then the panel, which places each room beside its own
    // people (→ the Rich composition below).
    expect(html).toMatch(leadsBackToTeam);
    // The market is an entry of its own, with no way back to a Team list.
    expect(hub('firstTeam', 'market')).not.toContain('team-return');
    for (const scaffold of [
      '<figure',
      'role="tablist"',
      'data-ui="office-bar"',
      'place-activities',
    ])
      expect(html).not.toContain(scaffold);
  });

  it('opens 코치진 on its people, whose manager office and coaching room only read (→WEB-102)', () => {
    const html = hub('staff', 'coaches');
    // The actual manager and posts lead after the way back to 팀; no room menu stands before them.
    expect(html).toMatch(leadsBackToTeam);
    expect(html).not.toContain('<figure');
    expect(html).not.toContain('data-ui="office-bar"');
    // No request panel follows the people: the owner asks the manager and the staff nothing.
    for (const removed of ['place-activities', '감독에게 요청', '스태프에게 요청', '검토</button>'])
      expect(html, removed).not.toContain(removed);
    // The coaches set training by their own rules: no training choice anywhere (→WEB-70).
    expect(html).not.toContain('훈련 제안·강행');
  });

  it.each(['training', 'academy'] as const)(
    "reads the coaches' %s calls; only the academy is a place with decisions",
    (view) => {
      const f = fixture();
      const html = renderToStaticMarkup(
        createElement(TrainingView, { state: f.state, client: f.client, view }),
      );
      if (view === 'training') {
        // The training ground only reads (→WEB-102): no request panel of its own.
        expect(html).not.toContain('place-activities');
        expect(html).not.toContain('훈련장에서 할 일');
        // The assistant's call reads; the owner has no training action (→STAFF-19 withdrawn).
        expect(html).not.toContain('훈련 제안·강행');
        expect(html).not.toContain('개별 훈련</button>');
        // Composition order only; physical viewport/target/focus checks belong to the browser gate.
        const focus = html.indexOf('id="training-focus"');
        const advice = html.indexOf('data-testid="training-advice"');
        const coach = html.indexOf('담당 수석코치');
        const reference = html.indexOf('훈련 효과·자동 판단 기준');
        expect(focus).toBeGreaterThan(html.indexOf('</figure>'));
        const panel = html.slice(focus, html.indexOf('</section>', focus));
        expect(focus).toBeLessThan(advice);
        expect(advice).toBeLessThan(coach);
        expect(coach).toBeLessThan(reference);
        expect(panel).toContain('Synthetic Assistant · 보기');
        expect(panel).toContain('지금 균형 · 코치 판단');
        expect(panel).not.toContain('<details open');
        expect(reference).toBeLessThan(html.indexOf('data-testid="adaptation-list"'));
      } else {
        expect(html).toContain('place-activities-academy');
        expect(html.match(/aria-label="유소년 아카데미"/g)).toHaveLength(1);
        // The youth director's call reads, with the 데뷔 시점 and 육성 목표 he works to.
        expect(html).not.toContain('훈련 제안·강행');
        expect(html).toContain('data-testid="youth-focus"');
        expect(html).toMatch(/유스 디렉터가 데뷔 시점 .+ · 육성 목표 .+에 맞춰 다시 정해요/);
        expect(html).toContain('아직 아카데미 선수가 없어요');
      }
      expect(f.command).not.toHaveBeenCalled();
    },
  );
});

describe('rooms beside their people (→WEB-43/72)', () => {
  // The authoritative panels read a whole generated club; the artwork stays the stub above.
  const world = careerWorld({ country: 'ENG', seed: 'personnel-rooms' });
  const controller = {
    store: createStore(() => ({ running: false, pace: 'x1', reason: '' })),
  } as unknown as ProgressionController;
  const rich = (page: 'firstTeam' | 'staff', tab: string) => {
    selection.tab = tab;
    vi.stubGlobal('location', {
      origin: 'https://game.test',
      pathname: page === 'staff' ? '/staff' : '/first-team',
      search: `?view=${tab}`,
    });
    const state: ClientState = {
      ...initialClientState,
      busy: false,
      view: {
        world,
        coaches: {},
        totalMatches: 0,
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
    gameStore.setState(state, true);
    useTaskMemory.getState().activate(world.id);
    const command = vi.fn<GameClient['command']>();
    const html = renderToStaticMarkup(
      createElement(Rich, {
        state,
        client: { state, command } as unknown as GameClient,
        page,
        controller,
      }),
    );
    expect(command).not.toHaveBeenCalled();
    return html;
  };
  const scenes = (html: string) =>
    [...html.matchAll(/data-scene="([^"]+)" data-title="([^"]+)"/g)].map(
      ([, kind, title]) => `${kind}:${title}`,
    );
  const coach = `감독 ${world.manager.name} · ${tacticLabel[world.tactic]}`;

  it('heads the 1군 roster with the current locker room and keeps the market free of art', () => {
    const html = rich('firstTeam', 'players');
    expect(scenes(html)).toEqual(['locker:드레싱 룸']);
    // A live caption, then the actual roster at once.
    expect(html).toContain(`data-title="드레싱 룸">${coach}</figure>`);
    expect(html.indexOf('data-scene="locker"')).toBeLessThan(html.indexOf(world.players[0].name));
    expect(scenes(rich('firstTeam', 'market'))).toEqual([]);
  });

  it('heads the manager with his office and the posts with the coaching workroom in 코치진', () => {
    const html = rich('staff', 'coaches');
    expect(scenes(html)).toEqual(['manager:감독실', 'staff:스태프 사무실']);
    expect(html).toContain(`data-title="감독실">${coach}</figure>`);
    expect(html).toContain(`data-title="스태프 사무실">스태프 ${world.staff!.length}명</figure>`);
    const office = html.indexOf('data-scene="manager"'),
      manager = html.indexOf('data-testid="manager-card"'),
      workroom = html.indexOf('data-scene="staff"'),
      post = html.indexOf(`id="staff-post-${world.staff![0].role}"`);
    // Each room heads its own people, so neither pushes the other's list down.
    expect(office).toBeGreaterThan(-1);
    expect(office).toBeLessThan(manager);
    expect(manager).toBeLessThan(workroom);
    expect(workroom).toBeLessThan(post);
    expect(html).not.toContain('role="tablist"');
  });
});
