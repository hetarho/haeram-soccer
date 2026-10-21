import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import registryData from '../../public/presentation/themes/index.json';
import { createPresentationResources } from '../adapters/presentationResources';
import { FACILITY_ERAS, validateThemePack } from './contracts';
import { getFontSources } from './fonts';
import { validateRegistry, resolvePackEntry } from './registry';
import {
  collectThemeImageResources,
  createThemeResolver,
  THEME_FONT_ALIASES,
  validateThemeTypography,
} from './theme';

const pixel = validateThemePack(pixelData);
const url = '/presentation/themes/pixel.json';

function resources(overrides: Record<string, unknown> = {}) {
  return createPresentationResources({
    baseUrl: '/',
    fetch: async (resource) => ({
      ok: true,
      status: 200,
      json: async () =>
        Object.hasOwn(overrides, resource)
          ? overrides[resource]
          : JSON.parse(readFileSync(new URL(`../../public${resource}`, import.meta.url), 'utf8')),
    }),
  });
}

describe('theme resource resolution', () => {
  it('validates every shipped theme and preserves baseline licensed assets', async () => {
    const loader = resources();
    const registry = await loader.loadRegistry('theme');
    expect(resolvePackEntry(registry).id).toBe(registry.defaultId);
    expect(registry.entries).toContainEqual({
      id: 'pixel',
      label: '픽셀아트',
      resource: 'pixel.json',
    });
    for (const entry of registry.entries) {
      const loaded = await loader.loadPack('theme', entry);
      const resolver = createThemeResolver(loaded.pack, { url: loaded.url });
      expect(resolver.id).toBe(entry.id);
      for (const font of resolver.fonts)
        for (const source of getFontSources(font))
          expect(
            readFileSync(new URL(`../../public${source.resource}`, import.meta.url)).length,
          ).toBeGreaterThan(0);
    }
    expect(pixel.fonts.map((font) => font.resource)).toEqual([
      '/fonts/galmuri14.woff2',
      '/fonts/galmuri11.woff2',
      '/fonts/galmuri11-bold.woff2',
    ]);
  });

  it('accepts a resource-only registry addition without changing shared consumers or checks', async () => {
    const registryInput = structuredClone(registryData);
    let id = 'resource-only-test';
    while (registryInput.entries.some((registered) => registered.id === id)) id += '-extra';
    const entry = { id, label: 'Test pack', resource: `${id}.json` };
    registryInput.entries.push(entry);
    const candidate = structuredClone(pixelData);
    candidate.id = entry.id;
    const loader = resources({
      '/presentation/themes/index.json': registryInput,
      [`/presentation/themes/${entry.resource}`]: candidate,
    });
    const registry = await loader.loadRegistry('theme');
    const resolvedIds = [];
    for (const registered of registry.entries) {
      const loaded = await loader.loadPack('theme', registered);
      resolvedIds.push(createThemeResolver(loaded.pack, { url: loaded.url }).id);
    }
    expect(resolvedIds).toEqual(registry.entries.map((registered) => registered.id));
    expect(resolvedIds).toContain(entry.id);
    expect(resolvePackEntry(registry).id).toBe(registry.defaultId);
    expect(validateRegistry(registryInput, 'theme')).toEqual(registry);
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

  it('resolves office roles through the selected theme, including shared era overrides', () => {
    const theme = createThemeResolver(pixel, { url });
    for (const era of FACILITY_ERAS) {
      expect(theme.facility({ era, kind: 'manager', stage: 0 }).src).toBe(
        '/art/scenes/manager-office-v1.webp',
      );
      expect(theme.facility({ era, kind: 'staff', stage: 0 }).src).toBe(
        '/art/scenes/staff-office-v1.webp',
      );
    }
    const candidate = structuredClone(pixel);
    candidate.id = 'office-theme';
    candidate.images.facility = {
      pattern: './rooms/{era}/{kind}-{stage}.webp',
      overrides: { 'heritage.manager.0': './private-office.webp' },
    };
    const other = createThemeResolver(candidate, { url });
    expect(other.facility({ era: 'heritage', kind: 'manager', stage: 0 }).src).toBe(
      '/presentation/themes/private-office.webp',
    );
    expect(other.facility({ era: 'heritage', kind: 'staff', stage: 0 }).src).toBe(
      '/presentation/themes/rooms/heritage/staff-0.webp',
    );
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
