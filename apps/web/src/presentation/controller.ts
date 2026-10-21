import type { createPresentationResources } from '../adapters/presentationResources';
import type {
  PresentationPreferencesStore,
  PresentationPreferences,
} from '../adapters/presentationPreferences';
import type { InstalledTheme, installThemeResources } from '../adapters/themeResources';
import type { PackRegistry, ThemeRegistryEntry } from './contracts';
import { createLoadedLocale, type LoadedLocale } from './locale';
import { resolvePackEntry } from './registry';
import { createThemeResolver, type ThemeResolver } from './theme';

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
  installTheme: typeof installThemeResources;
  applyLocale?: (locale: LoadedLocale) => void;
}

/** Only presentation ports enter this controller: it cannot send game or save commands. */
export function createPresentationController(options: PresentationControllerOptions) {
  let snapshot: PresentationSnapshot = Object.freeze({ pending: true, sessionOnly: false });
  let requested: PresentationPreferences = {};
  let generation = 0;
  let disposed = false;
  let installed: InstalledTheme | undefined;
  let registries: { locale: PackRegistry<'locale'>; theme: PackRegistry<'theme'> } | undefined;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<PresentationSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...change });
    for (const listener of listeners) listener();
  };

  async function apply(token: number): Promise<void> {
    if (!registries || disposed) return;
    const current = () => !disposed && token === generation;
    const localeRegistry = registries.locale;
    const themeRegistry = registries.theme;
    // Retain the entries returned by T299: each carries its declaring registry provenance.
    const localeEntry = resolvePackEntry(localeRegistry, requested.localeId);
    const defaultEntry = resolvePackEntry(localeRegistry);
    const themeEntry = resolvePackEntry(themeRegistry, requested.themeId);
    requested = { localeId: localeEntry.id, themeId: themeEntry.id };
    try {
      const [selected, baseline, themePack] = await Promise.all([
        options.resources.loadPack('locale', localeEntry),
        options.resources.loadPack('locale', defaultEntry),
        options.resources.loadPack('theme', themeEntry),
      ]);
      if (!current()) return;
      const locale = createLoadedLocale(localeRegistry, selected.pack, baseline.pack);
      const theme =
        snapshot.theme?.id === themeEntry.id
          ? snapshot.theme
          : createThemeResolver(themePack.pack, { url: themePack.url });
      if (theme !== snapshot.theme) {
        const next = await options.installTheme(theme, { previous: installed, isCurrent: current });
        if (!next) return;
        installed = next;
      }
      if (!current()) return;
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

  const select = (selection: PresentationPreferences) => {
    requested = { ...requested, ...selection };
    const token = ++generation;
    publish({ pending: true, error: undefined });
    return registries ? apply(token) : initialize();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize,
    select,
    retry: () => (registries ? select({}) : initialize()),
    dispose() {
      disposed = true;
      generation++;
      installed?.dispose();
      listeners.clear();
    },
  };
}
export type PresentationController = ReturnType<typeof createPresentationController>;
