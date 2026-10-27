import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { validateThemePack } from '../presentation/contracts';
import { createThemeResolver } from '../presentation/theme';
import { TrophyCabinet } from './CareerRecordBook';
import { TrophyIcon } from './TrophyIcon';

let theme: ReturnType<typeof createThemeResolver>;
vi.mock('../presentation/react', async (original) => ({
  ...(await original<typeof import('../presentation/react')>()),
  useOptionalTheme: () => theme,
}));
vi.mock('./App', () => ({
  Panel: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));
vi.mock('./PlayerSheet', () => ({ PlayerLink: () => null }));

function selectTheme(id: string) {
  theme = createThemeResolver(
    validateThemePack(
      JSON.parse(
        readFileSync(
          new URL(`../../public/presentation/themes/${id}.json`, import.meta.url),
          'utf8',
        ),
      ),
    ),
    { url: `/presentation/themes/${id}.json` },
  );
}

// Synthetic archive-only input: no founding, simulation or persisted game is needed for rendering.
function cabinetWorld(code = 'ENG', tiers = [0, 1, 2, 3, 4]): World {
  return {
    playerClub: 'own',
    clubs: [{ id: 'own', country: code, tier: 0 }],
    history: tiers.map((tier, index) => ({
      year: 1950 + index,
      tier,
      group: 0,
      rank: 1,
      played: 20,
      runs: [{ key: 'cup', champion: true, reached: '결승' }],
      europe:
        index === 0
          ? ['ucl', 'cwc', 'uel', 'uecl', 'super'].map((kind) => ({
              kind,
              name: `Synthetic ${kind}`,
              winner: 'own',
            }))
          : [],
    })),
  } as unknown as World;
}

beforeEach(() => selectTheme('pixel'));

describe('competition trophy selection', () => {
  it.each(['matchday-print', 'standard', 'pixel', 'sticker-club'])(
    'renders distinct division and continental resources with the %s pack',
    (id) => {
      selectTheme(id);
      const markup = renderToStaticMarkup(createElement(TrophyCabinet, { w: cabinetWorld() }));
      const images = [...markup.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => match[1]);
      const names = [
        'league',
        'league-tier-2',
        'league-tier-3',
        'league-tier-4',
        'league-amateur',
        'cup',
        'continental',
        'continental-cwc',
        'continental-uel',
        'continental-uecl',
        'continental-super',
        'final',
        'promotion',
        'relegation',
        'best',
      ];
      expect(images).toEqual(names.map((name) => `/art/trophies/${id}/${name}.webp`));
      expect(new Set(images).size).toBe(15);
    },
  );

  it('identifies amateur titles using the country pyramid instead of a fixed tier number', () => {
    const markup = renderToStaticMarkup(
      createElement(TrophyCabinet, { w: cabinetWorld('ESP', [0, 1, 2]) }),
    );
    expect(markup).toContain('/pixel/league-amateur.webp');
    expect(markup).not.toContain('/pixel/league-tier-3.webp');
  });

  it('retains the selected silhouette when the honour is unearned', () => {
    const markup = renderToStaticMarkup(
      createElement(TrophyIcon, { kind: 'league', variant: 'tier-2', earned: false }),
    );
    expect(markup).toContain('/pixel/league-tier-2.webp');
    expect(markup).toContain('data-earned="false"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('falls back to the same honour when a future variant is unavailable', () => {
    const markup = renderToStaticMarkup(
      createElement(TrophyIcon, { kind: 'continental', variant: 'future-competition' }),
    );
    expect(markup).toContain('/pixel/continental.webp');
  });
});
