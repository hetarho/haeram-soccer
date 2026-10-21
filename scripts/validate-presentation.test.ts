import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FACILITY_ERAS,
  FACILITY_KINDS,
  type PackRegistry,
  type ThemePack,
} from '../apps/web/src/presentation/contracts';
import { getFontSources } from '../apps/web/src/presentation/fonts';
import { resolvePackUrl, resolveRegistryUrl } from '../apps/web/src/presentation/registry';
import { createThemeResolver } from '../apps/web/src/presentation/theme';
import { partTop } from '../packages/engine/src/facilities';
import { facilityStageTop } from '../apps/web/src/presentation/facilityImages';
import {
  createSyntheticPresentation,
  readPresentationBaselines,
} from '../tests/fixtures/presentation';
import { validatePresentation } from './validate-presentation';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Each case owns a static synthetic deployment; no product registry or asset is modified. */
function deployment() {
  const baseline = readPresentationBaselines();
  const root = mkdtempSync(join(tmpdir(), 'haeram-presentation-'));
  temporaryRoots.push(root);
  const file = (url: string) => join(root, new URL(url, 'https://presentation.invalid').pathname);
  const write = (url: string, content: string) => {
    const path = file(url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const json = (url: string, value: unknown) => write(url, JSON.stringify(value));
  const localeRegistry: PackRegistry<'locale'> = {
    schemaVersion: 1,
    defaultId: baseline.locale.id,
    entries: [{ ...baseline.localeEntry, resource: 'base-locale.json' }],
  };
  const themeRegistry: PackRegistry<'theme'> = {
    schemaVersion: 1,
    defaultId: baseline.theme.id,
    entries: [{ ...baseline.themeEntry, resource: 'base-theme.json' }],
  };
  const localeUrl = resolvePackUrl(localeRegistry.entries[0], resolveRegistryUrl('locale'));
  const themeUrl = resolvePackUrl(themeRegistry.entries[0], resolveRegistryUrl('theme'));
  const theme = structuredClone(baseline.theme);
  function themeAssets(pack: ThemePack, url: string) {
    const resolver = createThemeResolver(pack, { url });
    for (const font of resolver.fonts)
      for (const source of getFontSources(font)) write(source.resource, 'synthetic font file');
    if (resolver.stylesheet) write(resolver.stylesheet, ':root {}');
    for (const era of FACILITY_ERAS)
      for (const kind of FACILITY_KINDS)
        for (let stage = 0; stage <= facilityStageTop(kind); stage++)
          write(resolver.facility({ era, kind, stage }).src, 'synthetic image file');
    for (const [role, icon] of Object.entries(pack.icons))
      for (const variant of [undefined, ...Object.keys(icon.variants ?? {})]) {
        const resource = resolver.icon(role, variant);
        if (resource.type === 'image') write(resource.resource, 'synthetic icon file');
      }
    return resolver;
  }
  const writeRegistries = () => {
    json(resolveRegistryUrl('locale'), localeRegistry);
    json(resolveRegistryUrl('theme'), themeRegistry);
  };
  writeRegistries();
  json(localeUrl, baseline.locale);
  json(themeUrl, theme);
  const resolver = themeAssets(theme, themeUrl);
  const added = createSyntheticPresentation({ ...baseline, themeUrl });
  return {
    root,
    file,
    write,
    json,
    localeRegistry,
    themeRegistry,
    localeUrl,
    themeUrl,
    theme,
    resolver,
    themeAssets,
    writeRegistries,
    added,
  };
}

describe('static presentation resource validation', () => {
  it('accepts a data-only added locale', async () => {
    const tree = deployment();
    tree.localeRegistry.entries.push(tree.added.localeEntry);
    tree.writeRegistries();
    tree.json(tree.added.localeUrl, tree.added.locale);
    const inventory = await validatePresentation(tree.root);
    expect(inventory.locales).toContainEqual({
      id: tree.added.locale.id,
      label: tree.added.localeEntry.label,
      url: tree.added.localeUrl,
    });
  });

  it('accepts a data-only added theme', async () => {
    const tree = deployment();
    tree.themeRegistry.entries.push(tree.added.themeEntry);
    tree.writeRegistries();
    tree.json(tree.added.themeUrl, tree.added.theme);
    const resolver = tree.themeAssets(tree.added.theme, tree.added.themeUrl);
    const inventory = await validatePresentation(tree.root);
    expect(inventory.themes).toContainEqual({
      id: tree.added.theme.id,
      label: tree.added.themeEntry.label,
      url: tree.added.themeUrl,
    });
    expect(inventory.assets).toContain(
      resolver.facility({ era: 'contemporary', kind: 'training', stage: partTop('training') }).src,
    );
    const icon = resolver.icon('home');
    expect(icon.type).toBe('image');
    if (icon.type === 'image') expect(inventory.assets).toContain(icon.resource);
  });

  it('rejects a missing default resource', async () => {
    for (const kind of ['locale', 'theme'] as const) {
      const tree = deployment();
      rmSync(tree.file(kind === 'locale' ? tree.localeUrl : tree.themeUrl));
      await expect(validatePresentation(tree.root)).rejects.toThrow(
        kind === 'locale' ? 'Missing default locale resource' : 'Missing theme resource',
      );
    }
  });

  it('rejects inconsistent message parameters', async () => {
    const tree = deployment();
    tree.localeRegistry.entries.push(tree.added.localeEntry);
    tree.writeRegistries();
    tree.added.locale.messages['shell.cashDetails'] = 'Budget {unexpected}';
    tree.json(tree.added.localeUrl, tree.added.locale);
    await expect(validatePresentation(tree.root)).rejects.toThrow(
      'Message parameters differ from the default: shell.cashDetails',
    );
  });

  it.each(['manager', 'staff', 'academy'] as const)(
    'reports a missing %s overview image',
    async (kind) => {
      const tree = deployment();
      const missing = tree.resolver.facility({ era: 'heritage', kind, stage: 0 }).src;
      rmSync(tree.file(missing));
      await expect(validatePresentation(tree.root)).rejects.toThrow(
        `Missing era stage asset ${tree.theme.id}/heritage.${kind}.0: ${missing}`,
      );
    },
  );

  it.each(['training', 'academy'] as const)(
    'reports a missing upper %s stage asset',
    async (kind) => {
      const tree = deployment();
      const stage = partTop(kind);
      const missing = tree.resolver.facility({ era: 'terraces', kind, stage }).src;
      rmSync(tree.file(missing));
      await expect(validatePresentation(tree.root)).rejects.toThrow(
        `Missing era stage asset ${tree.theme.id}/terraces.${kind}.${stage}: ${missing}`,
      );
    },
  );

  it('rejects malformed defaults and duplicate registry entries', async () => {
    const tree = deployment();
    tree.localeRegistry.entries.push(tree.localeRegistry.entries[0]);
    tree.writeRegistries();
    await expect(validatePresentation(tree.root)).rejects.toThrow('Duplicate registry ID');
    tree.localeRegistry.entries.pop();
    tree.localeRegistry.defaultId = 'removed-default';
    tree.writeRegistries();
    await expect(validatePresentation(tree.root)).rejects.toThrow('Registry default is absent');
  });

  it('rejects missing semantic icons and undeclared primary fonts', async () => {
    const tree = deployment();
    delete tree.theme.icons.home;
    tree.json(tree.themeUrl, tree.theme);
    await expect(validatePresentation(tree.root)).rejects.toThrow('Missing required semantic icon');
    tree.theme.icons.home = tree.added.theme.icons.home;
    tree.theme.tokens.typography.body = 'Undeclared Family, sans-serif';
    tree.json(tree.themeUrl, tree.theme);
    await expect(validatePresentation(tree.root)).rejects.toThrow(
      'Typography body must start with a declared font family',
    );
  });

  it('checks declared font, stylesheet and optional icon variant resources', async () => {
    const tree = deployment();
    const font = tree.resolver.fonts[0];
    rmSync(tree.file(font.resource));
    await expect(validatePresentation(tree.root)).rejects.toMatchObject({
      cause: { message: expect.stringContaining('Missing theme font') },
    });
    tree.write(font.resource, 'synthetic font');
    tree.theme.stylesheet = '/missing-concept.css';
    tree.json(tree.themeUrl, tree.theme);
    await expect(validatePresentation(tree.root)).rejects.toMatchObject({
      cause: { message: expect.stringContaining('Missing theme stylesheet') },
    });
    tree.write(tree.theme.stylesheet, ':root {}');
    tree.theme.icons.home.variants = { optional: { type: 'image', resource: '/missing-icon.svg' } };
    tree.json(tree.themeUrl, tree.theme);
    await expect(validatePresentation(tree.root)).rejects.toMatchObject({
      cause: { message: expect.stringContaining('Missing theme image') },
    });
  });

  it('checks every ordered font fallback even when the primary resource exists', async () => {
    const tree = deployment();
    tree.theme.fonts[0].fallbacks = [
      { resource: './formats/first.woff', format: 'woff' },
      { resource: './formats/second.woff', format: 'woff' },
    ];
    tree.json(tree.themeUrl, tree.theme);
    const resolver = tree.themeAssets(tree.theme, tree.themeUrl);
    const sources = getFontSources(resolver.fonts[0]);
    const inventory = await validatePresentation(tree.root);
    expect(inventory.assets).toEqual(
      expect.arrayContaining(sources.map(({ resource }) => resource)),
    );

    const missing = sources[2].resource;
    rmSync(tree.file(missing));
    await expect(validatePresentation(tree.root)).rejects.toMatchObject({
      cause: {
        message: `Missing theme font ${tree.theme.id}/${resolver.fonts[0].family}: ${missing}`,
      },
    });
  });
});
