import {
  PresentationValidationError,
  validateLocalePack,
  validateThemePack,
  type PackFor,
  type PackKind,
  type PackRegistry,
  type RegistryEntry,
} from '../presentation/contracts';
import {
  resolvePackUrl,
  resolveRegistryUrl,
  resolveResourceUrl,
  validateRegistry,
} from '../presentation/registry';

export interface PresentationResponse {
  ok: boolean;
  status: number;
  url?: string;
  json(): Promise<unknown>;
}
export type PresentationFetch = (
  url: string,
  options?: { cache: 'no-cache'; credentials: 'same-origin' },
) => Promise<PresentationResponse>;
export interface LoadedPack<K extends PackKind = PackKind> {
  kind: K;
  entry: RegistryEntry<K>;
  url: string;
  pack: PackFor<K>;
}
export class PresentationResourceError extends Error {
  readonly retryable = true;
  constructor(
    readonly kind: PackKind,
    readonly url: string,
    readonly cause: unknown,
  ) {
    super(`Unable to load ${kind} presentation resource: ${url}`);
    this.name = 'PresentationResourceError';
  }
}

/** Fetch is the only I/O port. No game, save, storage, or worker API enters this boundary. */
export function createPresentationResources(options: {
  fetch: PresentationFetch;
  baseUrl?: string;
}) {
  const baseUrl = options.baseUrl ?? globalThis.location?.href;
  const cache = new Map<string, unknown>();
  const pending = new Map<string, Promise<unknown>>();
  const registryUrls = new Map<PackKind, string>();

  async function load<T>(
    scope: 'registry' | 'pack',
    kind: PackKind,
    url: string,
    parse: (value: unknown, url: string) => T,
    reload = false,
  ): Promise<T> {
    const key = `${scope}:${kind}:${url}`;
    if (!reload && cache.has(key)) return cache.get(key) as T;
    if (pending.has(key)) return pending.get(key) as Promise<T>;
    const request = (async () => {
      try {
        const response = await options.fetch(url, {
          cache: 'no-cache',
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let declaringUrl = url;
        if (response.url) {
          const requested = new URL(url, new URL(baseUrl ?? '/', 'https://presentation.invalid'));
          const actual = new URL(response.url, requested);
          if (requested.origin !== actual.origin)
            throw new PresentationValidationError(
              'Presentation redirects must have the same origin',
            );
          // Preserve root-relative results for root-relative injected requests.
          declaringUrl = url.startsWith('/') ? `${actual.pathname}${actual.search}` : actual.href;
        }
        const result = parse(await response.json(), declaringUrl);
        cache.set(key, result);
        return result;
      } catch (cause) {
        throw new PresentationResourceError(kind, url, cause);
      }
    })();
    pending.set(key, request);
    try {
      return await request;
    } finally {
      pending.delete(key);
    }
  }

  async function loadRegistry<K extends PackKind>(
    kind: K,
    settings?: { reload?: boolean },
  ): Promise<PackRegistry<K>> {
    const url = resolveRegistryUrl(kind, baseUrl);
    return load(
      'registry',
      kind,
      url,
      (value, declaringUrl) => {
        const registry = validateRegistry(value, kind);
        registryUrls.set(kind, declaringUrl);
        return registry;
      },
      settings?.reload,
    );
  }

  async function loadPack<K extends PackKind>(
    kind: K,
    entry: RegistryEntry<K>,
  ): Promise<LoadedPack<K>> {
    try {
      await loadRegistry(kind);
      const url = resolvePackUrl(entry, registryUrls.get(kind)!);
      const loaded = await load('pack', kind, url, (value, declaringUrl) => {
        const pack = kind === 'locale' ? validateLocalePack(value) : validateThemePack(value);
        if (pack.id !== entry.id)
          throw new PresentationValidationError('Pack ID differs from its registry entry');
        return { url: declaringUrl, pack: pack as PackFor<K> };
      });
      if (loaded.pack.id !== entry.id)
        throw new PresentationValidationError('Pack ID differs from its registry entry');
      return { kind, entry, ...loaded };
    } catch (cause) {
      if (cause instanceof PresentationResourceError) throw cause;
      throw new PresentationResourceError(kind, resolveRegistryUrl(kind, baseUrl), cause);
    }
  }

  return { loadRegistry, loadPack, resolveResourceUrl };
}
