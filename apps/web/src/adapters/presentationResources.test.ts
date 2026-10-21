import { describe, expect, it, vi } from 'vitest';
import { resolvePackEntry } from '../presentation/registry';
import {
  createPresentationResources,
  PresentationResourceError,
  type PresentationResponse,
} from './presentationResources';

const registry = {
  schemaVersion: 1,
  defaultId: 'fr-CA',
  entries: [
    { id: 'fr-CA', label: 'Français canadien', direction: 'ltr', resource: 'new/fr-CA.json' },
  ],
};
const pack = { schemaVersion: 1, id: 'fr-CA', messages: { 'shell.title': 'Synthetic club' } };
const response = (value: unknown, url?: string): PresentationResponse => ({
  ok: true,
  status: 200,
  url,
  json: async () => structuredClone(value),
});
function fixtures() {
  const documents = new Map<string, unknown>([
    ['/presentation/locales/index.json', registry],
    ['/presentation/locales/new/fr-CA.json', pack],
  ]);
  const fetch = vi.fn(async (url: string) => {
    if (!documents.has(url)) return { ...response(null), ok: false, status: 404 };
    return response(documents.get(url));
  });
  return { documents, fetch, resources: createPresentationResources({ fetch }) };
}

describe('injected presentation resources', () => {
  it('loads an unseen pack ID without a code branch', async () => {
    const { fetch, resources } = fixtures();
    const loadedRegistry = await resources.loadRegistry('locale');
    const selected = resolvePackEntry(loadedRegistry, 'not-installed');
    const loaded = await resources.loadPack('locale', selected);
    expect(loaded).toEqual({
      kind: 'locale',
      entry: registry.entries[0],
      url: '/presentation/locales/new/fr-CA.json',
      pack,
    });
    expect(loaded.pack.id).toBe('fr-CA');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/presentation/locales/index.json',
      '/presentation/locales/new/fr-CA.json',
    ]);
  });

  it('caches validated successes and shares concurrent fetches', async () => {
    const { fetch, resources } = fixtures();
    const [first, second] = await Promise.all([
      resources.loadRegistry('locale'),
      resources.loadRegistry('locale'),
    ]);
    expect(second).toBe(first);
    await Promise.all([
      resources.loadPack('locale', first.entries[0]),
      resources.loadPack('locale', first.entries[0]),
    ]);
    await resources.loadPack('locale', first.entries[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('/presentation/locales/index.json', {
      cache: 'no-cache',
      credentials: 'same-origin',
    });
  });

  it('discovers resource-only additions on a fresh registry load', async () => {
    const { documents, resources } = fixtures();
    await resources.loadRegistry('locale');
    documents.set('/presentation/locales/index.json', {
      ...registry,
      entries: [
        ...registry.entries,
        { id: 'de', label: 'Deutsch', direction: 'ltr', resource: 'de.json' },
      ],
    });
    expect((await resources.loadRegistry('locale')).entries).toHaveLength(1);
    expect(
      (await resources.loadRegistry('locale', { reload: true })).entries.map(({ id }) => id),
    ).toEqual(['fr-CA', 'de']);
  });

  it('can retry after a failed fetch', async () => {
    const { documents, fetch, resources } = fixtures();
    documents.delete('/presentation/locales/new/fr-CA.json');
    const entry = (await resources.loadRegistry('locale')).entries[0];
    await expect(resources.loadPack('locale', entry)).rejects.toMatchObject({
      name: 'PresentationResourceError',
      kind: 'locale',
      retryable: true,
      url: '/presentation/locales/new/fr-CA.json',
    });
    documents.set('/presentation/locales/new/fr-CA.json', pack);
    expect((await resources.loadPack('locale', entry)).pack).toEqual(pack);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('can retry a failed registry and malformed pack without poisoned caches', async () => {
    const { documents, resources } = fixtures();
    documents.set('/presentation/locales/index.json', { ...registry, defaultId: 'absent' });
    await expect(resources.loadRegistry('locale')).rejects.toBeInstanceOf(
      PresentationResourceError,
    );
    documents.set('/presentation/locales/index.json', registry);
    const entry = (await resources.loadRegistry('locale')).entries[0];
    documents.set('/presentation/locales/new/fr-CA.json', {
      ...pack,
      messages: { bad: '{unfinished' },
    });
    await expect(resources.loadPack('locale', entry)).rejects.toBeInstanceOf(
      PresentationResourceError,
    );
    documents.set('/presentation/locales/new/fr-CA.json', pack);
    expect((await resources.loadPack('locale', entry)).pack).toEqual(pack);
  });

  it('resolves resources relative to their declaring JSON after same-origin redirects', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('index.json')
        ? response(registry, 'https://club.example/published/locales/index.json')
        : response(pack, 'https://club.example/published/locales/new/fr-CA.json'),
    );
    const resources = createPresentationResources({ fetch, baseUrl: 'https://club.example/game/' });
    const entry = (await resources.loadRegistry('locale')).entries[0];
    const loaded = await resources.loadPack('locale', entry);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://club.example/presentation/locales/index.json',
      'https://club.example/published/locales/new/fr-CA.json',
    ]);
    expect(resources.resolveResourceUrl('../fonts/body.woff2', loaded.url)).toBe(
      'https://club.example/published/locales/fonts/body.woff2',
    );
  });

  it('rejects cross-origin redirects and mismatched cached pack identities', async () => {
    const resources = createPresentationResources({
      fetch: async () => response(registry, 'https://other.example/index.json'),
      baseUrl: 'https://club.example/',
    });
    await expect(resources.loadRegistry('locale')).rejects.toMatchObject({ retryable: true });
    const local = fixtures();
    const entry = (await local.resources.loadRegistry('locale')).entries[0];
    await local.resources.loadPack('locale', entry);
    await expect(local.resources.loadPack('locale', { ...entry, id: 'de' })).rejects.toBeInstanceOf(
      PresentationResourceError,
    );
  });

  it.each([false, true])(
    'keeps an older entry relative to its declaring registry after refresh (cached: %s)',
    async (preloadOldPack) => {
      let revision = 'v1';
      const oldPackUrl = 'https://club.example/v1/locales/fr-CA.json';
      const newPackUrl = 'https://club.example/v2/locales/new/fr-CA.json';
      const fetch = vi.fn(async (url: string) => {
        if (url.endsWith('/index.json')) {
          const resource = revision === 'v1' ? 'fr-CA.json' : 'new/fr-CA.json';
          return response(
            { ...registry, entries: [{ ...registry.entries[0], resource }] },
            `https://club.example/${revision}/locales/index.json`,
          );
        }
        if (url === oldPackUrl || url === newPackUrl) return response(pack, url);
        return { ...response(null, url), ok: false, status: 404 };
      });
      const resources = createPresentationResources({ fetch, baseUrl: 'https://club.example/' });
      const first = await resources.loadRegistry('locale');
      if (preloadOldPack)
        expect((await resources.loadPack('locale', first.entries[0])).url).toBe(oldPackUrl);

      revision = 'v2';
      const second = await resources.loadRegistry('locale', { reload: true });
      expect((await resources.loadPack('locale', second.entries[0])).url).toBe(newPackUrl);
      expect((await resources.loadPack('locale', first.entries[0])).url).toBe(oldPackUrl);
      expect(fetch.mock.calls.filter(([url]) => url === oldPackUrl)).toHaveLength(1);
      expect(fetch.mock.calls.filter(([url]) => url === newPackUrl)).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(4);
    },
  );

  it('does not confuse a registry URL with a pack cache entry', async () => {
    const { documents, resources } = fixtures();
    documents.set('/presentation/locales/index.json', {
      ...registry,
      entries: [{ ...registry.entries[0], resource: 'index.json' }],
    });
    const entry = (await resources.loadRegistry('locale')).entries[0];
    await expect(resources.loadPack('locale', entry)).rejects.toBeInstanceOf(
      PresentationResourceError,
    );
  });
});
