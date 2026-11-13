// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metrics, Player, World } from '../../../../../../packages/contracts/src/types';
import registry from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import { PersonCareer } from '../../../features/person-career';
import type { ClientState, GameClient } from '../../../runtime/client';
import type { PersonCareerDetail } from '../../../runtime/personCareer';
import { gameStore } from '../../../runtime/store';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setTextLocale } from '../../../presentation/text';
import { OwnPlayerSheet } from './OwnPlayerSheet';

// Isolate the sheet's copy from dialog animation and unrelated profile/training panels.
vi.mock('../../../shared/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));
vi.mock('../../../entities/player', async (original) => ({
  ...(await original<typeof import('../../../entities/player')>()),
  PlayerProfile: () => null,
  PlayerPerformance: () => null,
  PlayerAdvancedStats: () => null,
  Attributes: () => null,
  playerCallLine: () => undefined,
}));

const loaded = (pack: typeof korean | typeof english) =>
  createLoadedLocale(
    validateRegistry(registry, 'locale'),
    pack as LocalePack,
    korean as LocalePack,
  );
const ko = loaded(korean),
  en = loaded(english);
const initialState = gameStore.getState();
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setTextLocale(ko);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  gameStore.setState(initialState, true);
  setTextLocale();
  vi.unstubAllGlobals();
});

/** A single prepared player and empty history; no world generation or progression. */
function player(extra: Partial<Player>): Player {
  return {
    id: 'age-player',
    name: 'Synthetic Player',
    position: 'CM',
    born: 1930,
    agent: 1,
    season: Array(11).fill(0) as Metrics,
    career: Array(11).fill(0) as Metrics,
    status: 'active',
    ...extra,
  } as Player;
}

describe('player and person ages (→WEB-59)', () => {
  it.each([
    { status: 'active' },
    { status: 'sold' },
    { status: 'retired' },
    { status: 'retired', loanUntil: 1950 },
  ] as const)('shows a season age for an own player with %o', async (extra) => {
    const p = player(extra);
    const w = { year: 1951, players: [p], history: [] } as unknown as World;
    await act(async () =>
      root.render(
        createElement(OwnPlayerSheet, {
          w,
          player: p,
          scope: 'season',
          onClose: () => {},
          client: {} as GameClient,
        }),
      ),
    );

    const summary = container.querySelector('section > p')!;
    expect(summary.textContent).toContain('21세');
    expect(summary.textContent).not.toContain('1930');
    expect(container.textContent).not.toContain('년생');

    // The mounted source-label component follows locale changes too.
    await act(async () => setTextLocale(en));
    expect(summary.textContent).toContain('21');
    expect(summary.textContent).not.toContain('1930');
    expect(summary.textContent).not.toContain('Born');
  });

  it.each([
    [1968, '38세'],
    [2040, '110세'],
  ])('uses the person career response season %i for age', async (year, age) => {
    const detail = {
      person: {
        id: 'age-person',
        name: 'Synthetic Person',
        born: 1930,
        employment: [],
        mentors: [],
      },
      at: { year, day: 0 },
      service: { days: 0, qualified: false },
      overlap: false,
      tenures: [],
    } as unknown as PersonCareerDetail;
    const personCareer = vi.fn().mockResolvedValue(detail);
    // A different ambient world year must not replace the response's season year.
    gameStore.setState({ view: { world: { year: 2001 } } } as Partial<ClientState>);
    await act(async () =>
      root.render(
        createElement(PersonCareer, {
          id: detail.person.id,
          client: { personCareer } as unknown as GameClient,
          onClose: () => {},
        }),
      ),
    );

    expect(personCareer).toHaveBeenCalledWith(detail.person.id);
    expect(container.querySelector('h2 + p')?.textContent).toBe(age);
    expect(container.textContent).not.toContain('1930');
    expect(container.textContent).not.toContain('년생');
  });
});
