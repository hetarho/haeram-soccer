// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerProfileRead, World } from '../../../../../../packages/contracts/src/types';
import registry from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setTextLocale } from '../../../presentation/text';
import type { GameClient } from '../../../runtime/client';
import { OtherPlayerSheet } from './OtherPlayerSheet';

vi.mock('../../../shared/ui/Dialog', () => ({
  Dialog: ({ children, label }: { children: ReactNode; label: string }) => createElement('section', { 'aria-label': label }, children),
}));
vi.mock('../../../entities/club', () => ({
  ClubLink: ({ id }: { id: string }) => createElement('button', { 'data-club': id }, id),
}));
vi.mock('../../../features/person-career', () => ({ PersonCareerLink: () => null }));
vi.mock('../../../entities/player', async (original) => ({
  ...(await original<typeof import('../../../entities/player')>()),
  PlayerProfile: ({ player }: { player: PlayerProfileRead['player'] }) => createElement('output', null, `${player.name}: ${player.attrs.passing}`),
}));

const loaded = (pack: typeof korean | typeof english) => createLoadedLocale(
  validateRegistry(registry, 'locale'), pack as LocalePack, korean as LocalePack,
);
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setTextLocale(loaded(korean));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setTextLocale();
  vi.unstubAllGlobals();
});

describe('other player sheets with prepared read models', () => {
  it.each(['retired', 'free'] as const)('shows the %s profile, season-club lines and derived podium honours', async (kind) => {
    const player = { id: 'record-player', name: 'Synthetic Player', born: 1930, position: 'CM', attrs: { passing: 61.25 } } as PlayerProfileRead['player'];
    const value: PlayerProfileRead = {
      player, kind,
      ...(kind === 'retired' ? { club: 'foreign', retired: { year: 1959, club: 'foreign' } } : {}),
      lines: [{ year: 1955, club: 'foreign', appearances: 2, goals: 1, assists: 0 }],
    };
    const w = { year: 1960, history: [{ year: 1955, ballonDor: [{ id: player.id }] }] } as World;
    await act(async () => root.render(createElement(OtherPlayerSheet, {
      w, id: player.id, read: { status: 'ready', value }, client: {} as GameClient, onClose: () => {},
    })));
    expect(container.querySelector('output')!.textContent).toBe('Synthetic Player: 61.25');
    expect(container.textContent).toContain('30세');
    expect(container.textContent).toContain(kind === 'retired' ? '은퇴' : '자유계약');
    if (kind === 'retired') expect(container.textContent).toContain('1959/60');
    expect(container.querySelector('tbody tr')!.textContent).toContain('1955/56');
    expect(container.querySelector('tbody tr [data-club="foreign"]')).not.toBeNull();
    expect(container.textContent).toContain('발롱도르');
    expect(container.textContent).not.toContain('지금 어느 1군에도 없는');
    await act(async () => setTextLocale(loaded(english)));
    expect(container.textContent).toContain(kind === 'retired' ? 'Retired' : english.messages['copy.PlayerCompare.f201ec1d4f']);
    expect(container.textContent).toContain('Record by season and club');
    expect(container.textContent).not.toContain('1930');
  });
});
