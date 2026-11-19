// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { worldMarketFixture } from '../../../../../../packages/engine/src/world-market.testkit';
import registry from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setTextLocale } from '../../../presentation/text';
import type { GameClient } from '../../../runtime/client';
import { PlayerProfile } from '../../../entities/player';
const { OtherPlayerSheet } = await import('../../../widgets/player-detail/ui/OtherPlayerSheet');
import { PlayerCompare } from './PlayerCompare';

vi.mock('../../../shared/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));
vi.mock('../../../features/person-career', () => ({ PersonCareerLink: () => null }));

const loaded = (pack: typeof korean | typeof english) =>
  createLoadedLocale(
    validateRegistry(registry, 'locale'),
    pack as LocalePack,
    korean as LocalePack,
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

describe('the four personality traits (→PLAYER-7/18)', () => {
  it.each(['own', 'other', 'compare'] as const)(
    'shows loyalty with the existing grade rules and live translations in %s',
    async (view) => {
      const w = worldMarketFixture();
      const player = w.players[0]!;
      player.personality.loyalty = 4;
      const before = structuredClone(w);
      await act(async () =>
        root.render(
          view === 'own'
            ? createElement(PlayerProfile, { w, player, own: true })
            : view === 'other'
              ? createElement(OtherPlayerSheet, {
                  w,
                  id: player.id,
                  read: { status: 'ready', value: { player, kind: 'free', lines: [] } },
                  client: {} as GameClient,
                  onClose: () => {},
                })
              : createElement(PlayerCompare, {
                  w,
                  label: player.name,
                  sides: [
                    { label: player.name, player, own: true },
                    { label: player.name, player: { ...player, id: 'external' }, own: false },
                  ],
                }),
        ),
      );
      const labels = () =>
        view === 'compare'
          ? [...container.querySelectorAll('table:last-child tbody th')].slice(-4)
          : [...container.querySelectorAll('[data-testid="profile-personality"] dt')];
      expect(labels().map((node) => node.textContent)).toEqual([
        '프로의식',
        '적응력',
        '야망',
        '충성심',
      ]);
      const loyalty = labels().at(-1)!;
      expect(loyalty.getAttribute('title')).toBe(
        korean.messages['player.personality.loyalty.description'],
      );
      const grades =
        view === 'compare'
          ? [...loyalty.parentElement!.querySelectorAll('td b')].map((node) => node.textContent)
          : [loyalty.nextElementSibling!.textContent];
      expect(grades).toEqual(
        view === 'compare'
          ? ['높음', '낮음~매우 높음']
          : [view === 'own' ? '높음' : '낮음~매우 높음'],
      );
      await act(async () => setTextLocale(loaded(english)));
      expect(labels().at(-1)!.textContent).toBe(english.messages['player.personality.loyalty']);
      expect(labels().at(-1)!.getAttribute('title')).toBe(
        english.messages['player.personality.loyalty.description'],
      );
      expect(w).toEqual(before);
    },
  );
});
