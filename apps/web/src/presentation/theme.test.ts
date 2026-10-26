import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import registryData from '../../public/presentation/themes/index.json';
import standardData from '../../public/presentation/themes/standard.json';
import printData from '../../public/presentation/themes/matchday-print.json';
import stickerData from '../../public/presentation/themes/sticker-club.json';
import { createPresentationResources } from '../adapters/presentationResources';
import { FACILITY_ERAS, FACILITY_KINDS, THEME_ICON_ROLES, validateThemePack } from './contracts';
import { facilityStageTop } from './facilityImages';
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
  it('defaults to shipped matchday print while retaining every saved alternative', async () => {
    const loader = resources();
    const registry = await loader.loadRegistry('theme');
    expect(resolvePackEntry(registry).id).toBe('matchday-print');
    expect(resolvePackEntry(registry, 'missing-theme').id).toBe('matchday-print');
    for (const id of ['matchday-print', 'standard', 'pixel', 'sticker-club']) {
      const entry = resolvePackEntry(registry, id);
      expect(entry.id).toBe(id);
      const resource = await loader.loadPack('theme', entry);
      expect(resource.pack.id).toBe(id);
    }
  });

  it.each([standardData, printData, stickerData])(
    'keeps every $id icon and completed facility scene independent from pixel assets',
    (data) => {
      const standard = createThemeResolver(validateThemePack(data), {
        url: `/presentation/themes/${data.id}.json`,
      });
      const original = createThemeResolver(pixel, { url });
      for (const role of THEME_ICON_ROLES) {
        expect(standard.icon(role), role).not.toEqual(original.icon(role));
        if (role.startsWith('trophy.')) {
          expect(standard.icon(role, 'unearned'), role).not.toEqual(
            original.icon(role, 'unearned'),
          );
        }
      }
      for (const era of FACILITY_ERAS)
        for (const kind of FACILITY_KINDS) {
          const artwork = new Set<string>();
          for (let stage = 0; stage <= facilityStageTop(kind); stage++) {
            const selection = { era, kind, stage };
            const scene = standard.facility(selection);
            expect(scene.src).not.toBe(original.facility(selection).src);
            expect(scene.treatment.imageRendering).toBe('auto');
            const content = readFileSync(new URL(`../../public${scene.src}`, import.meta.url));
            expect(content.toString('ascii', 8, 12), scene.src).toBe('WEBP');
            artwork.add(createHash('sha256').update(content).digest('hex'));
          }
          expect(artwork.size, `${era}/${kind} has distinct completed-stage artwork`).toBe(
            facilityStageTop(kind) + 1,
          );
        }
    },
  );

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

  it('resolves overview roles through the selected theme, including shared era overrides', () => {
    const theme = createThemeResolver(pixel, { url });
    for (const era of FACILITY_ERAS) {
      expect(theme.facility({ era, kind: 'manager', stage: 0 }).src).toBe(
        '/art/scenes/manager-office-v2.webp',
      );
      expect(theme.facility({ era, kind: 'staff', stage: 0 }).src).toBe(
        '/art/scenes/staff-office-v2.webp',
      );
      for (let stage = 0; stage <= 5; stage++)
        expect(theme.facility({ era, kind: 'academy', stage }).src).toBe(
          `/art/scenes/${era}/academy-${stage}.webp`,
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
    expect(other.facility({ era: 'heritage', kind: 'academy', stage: 0 }).src).toBe(
      '/presentation/themes/rooms/heritage/academy-0.webp',
    );
    expect(other.facility({ era: 'contemporary', kind: 'academy', stage: 5 }).src).toBe(
      '/presentation/themes/rooms/contemporary/academy-5.webp',
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

  it('preserves current pixel font weights', () => {
    expect(pixel.fonts.map((font) => font.weight)).toEqual(['400', '400', '600 900']);
  });

  it('ships distinct transparent WebP trophy artwork for every registered theme and honour', () => {
    const artwork = new Set<string>();
    for (const entry of validateRegistry(registryData, 'theme').entries) {
      const packUrl = `/presentation/themes/${entry.resource}`;
      const pack = JSON.parse(
        readFileSync(new URL(`../../public${packUrl}`, import.meta.url), 'utf8'),
      );
      const theme = createThemeResolver(pack, { url: packUrl });
      for (const role of THEME_ICON_ROLES.filter((role) => role.startsWith('trophy.'))) {
        const resource = theme.icon(role);
        if (resource.type !== 'image')
          throw new Error(`Expected trophy artwork: ${entry.id}/${role}`);
        const image = readFileSync(new URL(`../../public${resource.resource}`, import.meta.url));
        expect(image.toString('ascii', 8, 12), resource.resource).toBe('WEBP');
        expect(image.toString('ascii', 12, 16), resource.resource).toBe('VP8X');
        expect(image[20] & 0x10, `${resource.resource} keeps transparency`).toBe(0x10);
        expect(image.length, `${resource.resource} stays compact`).toBeLessThan(100_000);
        artwork.add(createHash('sha256').update(image).digest('hex'));
        // Unearned treatment is applied by TrophyIcon while reusing the same image.
        expect(theme.icon(role, 'unearned')).toEqual(resource);
      }
    }
    expect(artwork.size).toBe(
      registryData.entries.length *
        THEME_ICON_ROLES.filter((role) => role.startsWith('trophy.')).length,
    );
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
