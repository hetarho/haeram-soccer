import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PresentationPreferencesStore } from '../adapters/presentationPreferences';
import { createPresentationResources } from '../adapters/presentationResources';
import { installThemeResources, type ThemeInstallationPorts } from '../adapters/themeResources';
import type { LocalePack, ThemePack } from './contracts';
import { createPresentationController } from './controller';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baselineLocale = json('../../public/presentation/locales/ko-KR.json') as LocalePack;
const baselineTheme = json('../../public/presentation/themes/pixel.json') as ThemePack;
const localeRegistry = json('../../public/presentation/locales/index.json');
const themeRegistry = json('../../public/presentation/themes/index.json');
const syntheticTheme = (id: string): ThemePack => ({
  ...structuredClone(baselineTheme),
  id,
  fonts: baselineTheme.fonts.map((font) => ({ ...font, resource: `${font.resource}?theme=${id}` })),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function setup(saved = {}, portsOverride?: Partial<ThemeInstallationPorts>, baseUrl?: string) {
  const documents = new Map<string, unknown>([
    [
      '/presentation/locales/index.json',
      {
        ...localeRegistry,
        entries: [
          ...localeRegistry.entries,
          { id: 'en-US', label: 'Synthetic locale', direction: 'ltr', resource: 'en-US.json' },
        ],
      },
    ],
    [
      '/presentation/themes/index.json',
      {
        ...themeRegistry,
        entries: [
          ...themeRegistry.entries,
          { id: 'synthetic-one', label: 'Synthetic one', resource: 'synthetic-one.json' },
          { id: 'synthetic-two', label: 'Synthetic two', resource: 'synthetic-two.json' },
        ],
      },
    ],
    ['/presentation/locales/ko-KR.json', baselineLocale],
    [
      '/presentation/locales/en-US.json',
      { schemaVersion: 1, id: 'en-US', messages: { 'navigation.dashboard': 'Synthetic home' } },
    ],
    ['/presentation/themes/pixel.json', baselineTheme],
    ['/presentation/themes/synthetic-one.json', syntheticTheme('synthetic-one')],
    ['/presentation/themes/synthetic-two.json', syntheticTheme('synthetic-two')],
  ]);
  const fetch = vi.fn(async (url: string) => {
    const reference = url.startsWith('/') ? url : new URL(url).pathname;
    return {
      ok: documents.has(reference),
      status: documents.has(reference) ? 200 : 404,
      json: async () => await documents.get(reference),
    };
  });
  const storage = new Map<string, string>([
    ['haeram-soccor:presentation', JSON.stringify(saved)],
    ['haeram-soccor:manifest', 'unchanged checkpoint manifest'],
  ]);
  const writes = vi.fn((key: string, value: string) => {
    storage.set(key, value);
  });
  const preferences = new PresentationPreferencesStore(() => ({
    getItem: (key) => storage.get(key) ?? null,
    setItem: writes,
  }));
  const activations: string[] = [];
  const releases: string[] = [];
  const ports: ThemeInstallationPorts = {
    stageFont: async (font) => ({
      activate: () => {
        activations.push(font.resource);
      },
      dispose: () => {
        releases.push(font.resource);
      },
    }),
    stageStylesheet: async (url) => ({
      activate: () => {
        activations.push(url);
      },
      dispose: () => {
        releases.push(url);
      },
    }),
    installTokens: (theme) => ({
      dispose: () => {
        releases.push(`tokens:${theme.id}`);
      },
    }),
    ...portsOverride,
  };
  const applyLocale = vi.fn();
  const controller = createPresentationController({
    resources: createPresentationResources({ fetch, baseUrl }),
    preferences,
    installTheme: (theme, options) => installThemeResources(theme, { ...options, ports }),
    applyLocale,
  });
  return { controller, documents, storage, writes, applyLocale, activations, releases, fetch };
}

describe('one presentation controller', () => {
  it('preserves deployment-root image URLs for absolute browser JSON requests', async () => {
    const { controller } = setup({}, undefined, 'https://club.example/game/');
    await controller.initialize();
    expect(
      controller.getSnapshot().theme?.facility({ era: 'heritage', kind: 'stadium', stage: 0 }).src,
    ).toBe('/art/scenes/heritage/stadium-0.webp');
  });
  it('restores a registered selection and installs resources before readiness', async () => {
    const { controller, activations, applyLocale } = setup({
      localeId: 'en-US',
      themeId: 'synthetic-one',
    });
    expect(controller.getSnapshot().locale).toBeUndefined();
    await controller.initialize();
    const snapshot = controller.getSnapshot();
    expect(snapshot.pending).toBe(false);
    expect(snapshot.locale?.t('navigation.dashboard')).toBe('Synthetic home');
    expect(snapshot.locale?.t('navigation.league')).toBe('리그');
    expect(snapshot.theme?.id).toBe('synthetic-one');
    expect(activations.length).toBeGreaterThan(0);
    expect(applyLocale).toHaveBeenCalledExactlyOnceWith(snapshot.locale);
  });

  it('falls back after a pack is removed', async () => {
    const { controller, storage } = setup({ localeId: 'removed', themeId: 'removed' });
    await controller.initialize();
    expect(controller.getSnapshot().locale?.id).toBe(localeRegistry.defaultId);
    expect(controller.getSnapshot().theme?.id).toBe(themeRegistry.defaultId);
    expect(JSON.parse(storage.get('haeram-soccor:presentation')!)).toEqual({
      localeId: localeRegistry.defaultId,
      themeId: themeRegistry.defaultId,
    });
  });

  it('uses registered default values for optional semantic tokens without installing its fonts', async () => {
    const { controller, documents, activations } = setup({ themeId: 'synthetic-one' });
    const candidate = syntheticTheme('synthetic-one');
    delete candidate.tokens.typography['body-size'];
    delete candidate.tokens.shape['control-radius'];
    candidate.stylesheet = './synthetic.css';
    candidate.images.facility.pattern = './synthetic/{era}/{kind}/{stage}.webp';
    candidate.icons.home = { default: { type: 'image', resource: './synthetic-home.svg' } };
    documents.set('/presentation/themes/synthetic-one.json', candidate);
    await controller.initialize();
    expect(controller.getSnapshot().theme?.token('body-size')).toBe(
      baselineTheme.tokens.typography['body-size'],
    );
    const theme = controller.getSnapshot().theme!;
    expect(theme.token('control-radius')).toBe(baselineTheme.tokens.shape['control-radius']);
    expect(theme.stylesheet).toBe('/presentation/themes/synthetic.css');
    expect(theme.facility({ era: 'heritage', kind: 'stadium', stage: 0 }).src).toBe(
      '/presentation/themes/synthetic/heritage/stadium/0.webp',
    );
    expect(theme.icon('home')).toEqual({
      type: 'image',
      resource: '/presentation/themes/synthetic-home.svg',
    });
    expect(activations).toContain('/presentation/themes/synthetic.css');
    expect(activations).not.toContain('/presentation/themes/pixel.css');
    expect(
      activations
        .filter((value) => value.includes('.woff2'))
        .every((value) => value.includes('theme=synthetic-one')),
    ).toBe(true);
  });

  it('ignores stale load completion', async () => {
    const { controller, documents, activations } = setup();
    await controller.initialize();
    const pending = deferred<unknown>();
    documents.set('/presentation/themes/synthetic-one.json', pending.promise);
    const first = controller.select({ themeId: 'synthetic-one' });
    await controller.select({ themeId: 'synthetic-two' });
    pending.resolve(syntheticTheme('synthetic-one'));
    await first;
    expect(controller.getSnapshot().theme?.id).toBe('synthetic-two');
    expect(activations.some((value) => value.includes('theme=synthetic-one'))).toBe(false);
  });

  it('checks freshness immediately before installing staged theme resources', async () => {
    const pending = deferred<void>();
    const { controller, activations, releases } = setup(
      {},
      {
        stageFont: async (font) => {
          if (font.resource.includes('theme=synthetic-one')) await pending.promise;
          return {
            activate: () => {
              activations.push(font.resource);
            },
            dispose: () => {
              releases.push(font.resource);
            },
          };
        },
      },
    );
    await controller.initialize();
    const first = controller.select({ themeId: 'synthetic-one' });
    // Let pack validation finish and font staging begin before the later selection.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await controller.select({ localeId: 'en-US', themeId: 'synthetic-two' });
    pending.resolve();
    await first;
    expect(controller.getSnapshot().theme?.id).toBe('synthetic-two');
    expect(controller.getSnapshot().locale?.id).toBe('en-US');
    expect(activations.some((value) => value.includes('theme=synthetic-one'))).toBe(false);
    expect(releases.some((value) => value.includes('theme=synthetic-one'))).toBe(true);
  });

  it('keeps the active pack on failure and retries the requested selection', async () => {
    const { controller, documents, releases } = setup();
    await controller.initialize();
    const active = controller.getSnapshot();
    documents.delete('/presentation/themes/synthetic-one.json');
    await controller.select({ localeId: 'en-US', themeId: 'synthetic-one' });
    expect(controller.getSnapshot().locale).toBe(active.locale);
    expect(controller.getSnapshot().theme).toBe(active.theme);
    expect(releases).toEqual([]);
    expect(controller.getSnapshot().error).toBeDefined();
    documents.set('/presentation/themes/synthetic-one.json', syntheticTheme('synthetic-one'));
    await controller.retry();
    expect(controller.getSnapshot().locale?.id).toBe('en-US');
    expect(controller.getSnapshot().theme?.id).toBe('synthetic-one');
    expect(controller.getSnapshot().error).toBeUndefined();
  });

  it('offers retry after an initial registry load fails', async () => {
    const { controller, documents } = setup();
    const registry = documents.get('/presentation/locales/index.json');
    documents.delete('/presentation/locales/index.json');
    await controller.initialize();
    expect(controller.getSnapshot().locale).toBeUndefined();
    expect(controller.getSnapshot().error).toBeDefined();
    documents.set('/presentation/locales/index.json', registry);
    await controller.retry();
    expect(controller.getSnapshot().locale?.id).toBe(localeRegistry.defaultId);
  });

  it('starts a new choice from the usable selection after another choice fails', async () => {
    const { controller, documents } = setup();
    await controller.initialize();
    documents.delete('/presentation/themes/synthetic-one.json');
    await controller.select({ themeId: 'synthetic-one' });
    await controller.select({ localeId: 'en-US' });
    expect(controller.getSnapshot().locale?.id).toBe('en-US');
    expect(controller.getSnapshot().theme?.id).toBe(themeRegistry.defaultId);
    expect(controller.getSnapshot().error).toBeUndefined();
  });

  it('never sends a game command for presentation changes', async () => {
    const { controller, storage, writes } = setup();
    const storedProse = '1950년, 한글로 저장된 원래 사건';
    storage.set('haeram-soccor:slot:a', storedProse);
    await controller.initialize();
    await controller.select({ localeId: 'en-US', themeId: 'synthetic-two' });
    expect(writes.mock.calls.every(([key]) => key === 'haeram-soccor:presentation')).toBe(true);
    expect(storage.get('haeram-soccor:manifest')).toBe('unchanged checkpoint manifest');
    expect(storage.get('haeram-soccor:slot:a')).toBe(storedProse);
    // No game client, ownership, world or progression port is needed to make a selection.
    expect(controller.getSnapshot().locale?.id).toBe('en-US');
  });
});
