import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import registryData from '../../public/presentation/themes/index.json';
import { FACILITY_ERAS, validateThemePack } from './contracts';
import { validateRegistry, resolvePackEntry } from './registry';
import {
  collectThemeImageResources,
  createThemeResolver,
  THEME_FONT_ALIASES,
  validateThemeTypography,
} from './theme';

const pixel = validateThemePack(pixelData);
const url = '/presentation/themes/pixel.json';

describe('theme resource resolution', () => {
  it('ships only the registered pixel baseline with the existing image/font assets', () => {
    const registry = validateRegistry(registryData, 'theme');
    expect(registry.entries).toHaveLength(1);
    expect(resolvePackEntry(registry)).toEqual({
      id: 'pixel',
      label: '픽셀아트',
      resource: 'pixel.json',
    });
    expect(pixel.fonts.map((font) => font.resource)).toEqual([
      '/fonts/galmuri14.woff2',
      '/fonts/galmuri11.woff2',
      '/fonts/galmuri11-bold.woff2',
    ]);
    for (const font of pixel.fonts)
      expect(
        readFileSync(new URL(`../../public${font.resource}`, import.meta.url)).length,
      ).toBeGreaterThan(0);
  });

  it('resolves the current era and stage paths', () => {
    const theme = createThemeResolver(pixel, { url });
    const manifest = JSON.parse(
      readFileSync(new URL('../../public/art/manifest.json', import.meta.url), 'utf8'),
    ) as { assets: { era: string; kind: string; stage: number; file: string }[] };
    const resolved = [];
    for (const era of FACILITY_ERAS)
      for (const [kind, count] of [
        ['stadium', 9],
        ['locker', 9],
        ['training', 6],
      ] as const)
        for (let stage = 0; stage < count; stage++) {
          const image = theme.facility({ era, kind, stage });
          expect(manifest.assets).toContainEqual(
            expect.objectContaining({ era, kind, stage, file: image.src }),
          );
          resolved.push(image.src);
        }
    expect(new Set(resolved).size).toBe(72);
    expect(() => theme.facility({ era: 'heritage', kind: 'stadium', stage: -1 })).toThrow();
  });

  it('resolves an unseen theme from data', () => {
    const candidate = structuredClone(pixel);
    candidate.id = 'unseen-test';
    candidate.images.facility = {
      pattern: '../illustrations/{era}/{kind}/{stage}.avif',
      overrides: { 'contemporary.locker.2': '../special/room.svg' },
    };
    candidate.icons.home = {
      default: { type: 'image', resource: '../symbols/start.webp', width: 32, height: 32 },
    };
    candidate.fonts = candidate.fonts.map((font) => ({ ...font, family: `New ${font.family}` }));
    candidate.tokens.typography.body = "'New Galmuri14', 'New Galmuri11', sans-serif";
    candidate.tokens.typography.display = "'New Galmuri11', sans-serif";
    candidate.tokens.palette.bg = '#eeeeee';
    const theme = createThemeResolver(candidate, { url: '/packs/unseen/theme.json' });
    expect(theme.facility({ era: 'heritage', kind: 'stadium', stage: 1 }).src).toBe(
      '/packs/illustrations/heritage/stadium/1.avif',
    );
    expect(theme.facility({ era: 'contemporary', kind: 'locker', stage: 2 }).src).toBe(
      '/packs/special/room.svg',
    );
    expect(theme.icon('home')).toEqual({
      type: 'image',
      resource: '/packs/symbols/start.webp',
      width: 32,
      height: 32,
    });
    expect(theme.token('bg')).toBe('#eeeeee');
    expect(theme.token('display')).toBe(`'${THEME_FONT_ALIASES.display}', sans-serif`);
    expect(
      theme.fonts
        .filter((font) => font.family === THEME_FONT_ALIASES.display)
        .map((font) => font.weight),
    ).toEqual(['400', '600 900']);
  });

  it('preserves current icon layers and font weights', () => {
    const theme = createThemeResolver(pixel, { url });
    expect(pixel.fonts.map((font) => font.weight)).toEqual(['400', '400', '600 900']);
    const league = theme.icon('trophy.league');
    expect(league).toMatchObject({
      type: 'svg',
      viewBox: '0 0 24 24',
      shapeRendering: 'crispEdges',
      layers: [
        { fill: '#805529', fillRule: 'evenodd' },
        { fill: '#c69a48', fillRule: 'evenodd' },
        { fill: '#ffe3a0', fillRule: 'evenodd' },
      ],
    });
    const unearned = theme.icon('trophy.league', 'unearned');
    if (unearned.type !== 'svg' || league.type !== 'svg') throw new Error('Expected layered SVG');
    expect(unearned.layers.map((layer) => layer.d)).toEqual(league.layers.map((layer) => layer.d));
    expect(unearned.layers.map((layer) => layer.fill)).toEqual([
      'currentColor',
      'currentColor',
      'currentColor',
    ]);
    expect(theme.icon('trophy.promotion')).toMatchObject({
      layers: [{ opacity: 0.4 }, {}, { opacity: 0.5 }],
    });
    expect(theme.icon('trophy.promotion', 'unearned')).toMatchObject({
      layers: [{ opacity: 0.4 }, {}, { opacity: 0.15 }],
    });
    expect(theme.icon('trophy.best')).toEqual(theme.icon('star'));
  });

  it('applies image treatment from the selected pack', () => {
    const candidate = structuredClone(pixel);
    candidate.tokens.imageTreatment = {
      objectFit: 'contain',
      objectPosition: 'top left',
      imageRendering: 'auto',
      filter: 'none',
      overlay: 'transparent',
    };
    const theme = createThemeResolver(candidate, { url });
    expect(theme.facility({ era: 'terraces', kind: 'training', stage: 3 }).treatment).toEqual(
      candidate.tokens.imageTreatment,
    );
    expect(createThemeResolver(pixel, { url }).imageTreatment).toEqual({
      objectFit: 'cover',
      objectPosition: 'center',
      imageRendering: 'pixelated',
      filter: 'saturate(0.7) contrast(0.92)',
      overlay: 'rgb(9 15 12 / 24%)',
    });
  });

  it('rejects missing required roles and uses same-role defaults for optional variants', () => {
    const candidate = structuredClone(pixel);
    delete candidate.icons.home;
    expect(() => createThemeResolver(candidate, { url })).toThrow('Missing required semantic icon');
    const theme = createThemeResolver(pixel, { url });
    expect(theme.icon('home', 'unearned')).toEqual(theme.icon('home'));
    expect(theme.icon('home', 'toString')).toEqual(theme.icon('home'));
    expect(() => theme.icon('unknown')).toThrow('Unknown semantic icon');
    expect(() => theme.token('unknown')).toThrow('Unknown semantic token');
    delete candidate.tokens.palette.bg;
    expect(() => createThemeResolver(candidate, { url })).toThrow(
      'Missing required semantic token',
    );
  });

  it('exports shared typography compatibility validation for resource tooling', () => {
    const candidate = structuredClone(pixel);
    candidate.tokens.typography.display = 'Missing Face, sans-serif';
    expect(() => validateThemeTypography(candidate)).toThrow('declared font family');
    candidate.tokens.typography.display = 'var(--score)';
    expect(() => validateThemeTypography(candidate)).toThrow('Cyclic typography aliases');
  });

  it('collects candidate image resources only for supplied mounted semantic needs', () => {
    const candidate = structuredClone(pixel);
    candidate.icons.home = { default: { type: 'image', resource: 'new-home.svg' } };
    candidate.images.facility.pattern = 'new/{era}/{kind}-{stage}.webp';
    const resolver = createThemeResolver(candidate, { url });
    expect(
      collectThemeImageResources(resolver, [
        { type: 'icon', role: 'home' },
        { type: 'icon', role: 'home' },
        { type: 'icon', role: 'ball' },
        { type: 'facility', era: 'heritage', kind: 'stadium', stage: 2 },
      ]),
    ).toEqual([
      '/presentation/themes/new-home.svg',
      '/presentation/themes/new/heritage/stadium-2.webp',
    ]);
    expect(collectThemeImageResources(resolver, [])).toEqual([]);
  });
});
