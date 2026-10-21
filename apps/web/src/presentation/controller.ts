import type { createPresentationResources } from '../adapters/presentationResources';
import type {
  PresentationPreferencesStore,
  PresentationPreferences,
} from '../adapters/presentationPreferences';
import type { InstalledTheme, prepareThemeResources } from '../adapters/themeResources';
import type { PackRegistry, ThemeRegistryEntry } from './contracts';
import { createLoadedLocale, type LoadedLocale } from './locale';
import { resolvePackEntry } from './registry';
import {
  collectThemeImageResources,
  createThemeResolver,
  type ThemeImageNeed,
  type ThemeResolver,
} from './theme';

export interface PresentationSnapshot {
  readonly locale?: LoadedLocale;
  readonly theme?: ThemeResolver;
  readonly themeEntry?: Readonly<ThemeRegistryEntry>;
  readonly localeRegistry?: PackRegistry<'locale'>;
  readonly themeRegistry?: PackRegistry<'theme'>;
  readonly pending: boolean;
  readonly error?: unknown;
  readonly sessionOnly: boolean;
}
export interface PresentationControllerOptions {
  resources: ReturnType<typeof createPresentationResources>;
  preferences: PresentationPreferencesStore;
  prepareTheme: typeof prepareThemeResources;
  applyLocale?: (locale: LoadedLocale) => void;
}

/** T299 has checked the origin; retain deployment-root asset references in HTML. */
function themeResourceBase(url: string): string {
  if (url.startsWith('/')) return url;
  const declaring = new URL(url);
  return `${declaring.pathname}${declaring.search}`;
}

/** Only presentation ports enter this controller: it cannot send game or save commands. */
export function createPresentationController(options: PresentationControllerOptions) {
  let snapshot: PresentationSnapshot = Object.freeze({ pending: true, sessionOnly: false });
  let requested: PresentationPreferences = {};
  let generation = 0;
  let disposed = false;
  let installed: InstalledTheme | undefined;
  let registries: { locale: PackRegistry<'locale'>; theme: PackRegistry<'theme'> } | undefined;
  const needs = new Map<symbol, ThemeImageNeed>();
  let needsRevision = 0;
  let needsRefreshQueued = false;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<PresentationSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...change });
    for (const listener of listeners) listener();
  };

  async function apply(token: number): Promise<void> {
    if (!registries || disposed) return;
    const revision = needsRevision;
    const current = () => !disposed && token === generation && revision === needsRevision;
    const localeRegistry = registries.locale;
    const themeRegistry = registries.theme;
    // Retain the entries returned by T299: each carries its declaring registry provenance.
    const localeEntry = resolvePackEntry(localeRegistry, requested.localeId);
    const defaultEntry = resolvePackEntry(localeRegistry);
    const themeEntry = resolvePackEntry(themeRegistry, requested.themeId);
    requested = { localeId: localeEntry.id, themeId: themeEntry.id };
    try {
      const [selected, baseline, themePack, themeBaseline] = await Promise.all([
        options.resources.loadPack('locale', localeEntry),
        options.resources.loadPack('locale', defaultEntry),
        options.resources.loadPack('theme', themeEntry),
        options.resources.loadPack('theme', resolvePackEntry(themeRegistry)),
      ]);
      if (!current()) return;
      const locale = createLoadedLocale(localeRegistry, selected.pack, baseline.pack);
      let theme = snapshot.theme?.id === themeEntry.id ? snapshot.theme : undefined;
      if (!theme) {
        const selectedTheme = createThemeResolver(themePack.pack, {
          url: themeResourceBase(themePack.url),
        });
        const defaultTheme = createThemeResolver(themeBaseline.pack, {
          url: themeResourceBase(themeBaseline.url),
        });
        theme = {
          ...selectedTheme,
          tokens: Object.freeze({ ...defaultTheme.tokens, ...selectedTheme.tokens }),
          token: (key: string) =>
            Object.hasOwn(selectedTheme.tokens, key)
              ? selectedTheme.token(key)
              : defaultTheme.token(key),
        };
      }
      if (theme !== snapshot.theme) {
        const prepared = await options.prepareTheme(theme, {
          requiredImages: collectThemeImageResources(theme, [...needs.values()]),
        });
        if (!current()) {
          prepared.dispose();
          return;
        }
        // Commit ownership and publish the corresponding services in one synchronous stack.
        const next = prepared.commit({ previous: installed, isCurrent: current });
        if (!next) return;
        installed = next;
      }
      options.applyLocale?.(locale);
      options.preferences.write({ localeId: locale.id, themeId: theme.id });
      publish({
        locale,
        theme,
        themeEntry,
        localeRegistry,
        themeRegistry,
        pending: false,
        error: undefined,
        sessionOnly: options.preferences.sessionOnly,
      });
    } catch (error) {
      if (current()) publish({ pending: false, error });
    }
  }

  async function initialize(): Promise<void> {
    const token = ++generation;
    publish({ pending: true, error: undefined });
    try {
      const [locale, theme] = await Promise.all([
        options.resources.loadRegistry('locale'),
        options.resources.loadRegistry('theme'),
      ]);
      if (disposed || token !== generation) return;
      registries = { locale, theme };
      requested = options.preferences.read();
      await apply(token);
    } catch (error) {
      if (!disposed && token === generation) publish({ pending: false, error });
    }
  }

  const request = (selection: PresentationPreferences, retry = false) => {
    const base =
      !snapshot.pending && !retry && snapshot.locale && snapshot.theme
        ? { localeId: snapshot.locale.id, themeId: snapshot.theme.id }
        : requested;
    requested = { ...base, ...selection };
    const token = ++generation;
    publish({ pending: true, error: undefined });
    return registries ? apply(token) : initialize();
  };

  function refreshNeeds() {
    needsRevision++;
    if (disposed || !snapshot.pending || !registries || !snapshot.locale || needsRefreshQueued)
      return;
    needsRefreshQueued = true;
    queueMicrotask(() => {
      needsRefreshQueued = false;
      if (!disposed && snapshot.pending && snapshot.locale) void request({}, true);
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize,
    select: (selection: PresentationPreferences) => request(selection),
    retry: () => (registries ? request({}, true) : initialize()),
    registerNeed(need: ThemeImageNeed) {
      if (disposed) return () => {};
      const key = Symbol();
      needs.set(key, Object.freeze({ ...need }));
      refreshNeeds();
      return () => {
        if (needs.delete(key)) refreshNeeds();
      };
    },
    dispose() {
      disposed = true;
      generation++;
      installed?.dispose();
      needs.clear();
      listeners.clear();
    },
  };
}
export type PresentationController = ReturnType<typeof createPresentationController>;
