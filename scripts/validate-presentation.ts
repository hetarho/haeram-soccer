import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACILITY_ERAS,
  FACILITY_KINDS,
  validateLocalePack,
  validateThemePack,
} from '../apps/web/src/presentation/contracts';
import {
  resolvePackUrl,
  resolveRegistryUrl,
  resolveResourceUrl,
  validateRegistry,
} from '../apps/web/src/presentation/registry';
import { createThemeResolver, validateThemeTypography } from '../apps/web/src/presentation/theme';
import { installThemeResources } from '../apps/web/src/adapters/themeResources';
import { partTop } from '../packages/engine/src/facilities';

export interface PresentationInventory {
  locales: { id: string; label: string; url: string }[];
  themes: { id: string; label: string; url: string }[];
  assets: string[];
}

/** Validate the same runtime contracts against a deployment's static public tree. */
export async function validatePresentation(
  publicDirectory = fileURLToPath(new URL('../apps/web/public/', import.meta.url)),
): Promise<PresentationInventory> {
  const root = resolve(publicDirectory);
  const assets = new Set<string>();
  function localPath(url: string) {
    const pathname = decodeURIComponent(new URL(url, 'https://presentation.invalid').pathname);
    const path = resolve(root, `.${pathname}`);
    const inside = relative(root, path);
    if (inside === '..' || inside.startsWith('../') || inside.startsWith('..\\'))
      throw new Error(`Presentation resource escapes the public directory: ${url}`);
    return path;
  }
  async function requireFile(url: string, label: string) {
    try {
      if (!(await stat(localPath(url))).isFile()) throw new Error('Not a file');
    } catch (cause) {
      throw new Error(`Missing ${label}: ${url}`, { cause });
    }
  }
  async function json(url: string, label: string): Promise<unknown> {
    await requireFile(url, label);
    try {
      return JSON.parse(await readFile(localPath(url), 'utf8'));
    } catch (cause) {
      throw new Error(`Invalid JSON in ${label}: ${url}`, { cause });
    }
  }
  async function asset(url: string, label: string) {
    await requireFile(url, label);
    assets.add(url);
  }

  const localeRegistryUrl = resolveRegistryUrl('locale');
  const themeRegistryUrl = resolveRegistryUrl('theme');
  const localeRegistry = validateRegistry(
    await json(localeRegistryUrl, 'locale registry'),
    'locale',
  );
  const themeRegistry = validateRegistry(await json(themeRegistryUrl, 'theme registry'), 'theme');
  const defaultEntry = localeRegistry.entries.find(
    (entry) => entry.id === localeRegistry.defaultId,
  )!;
  const defaultUrl = resolvePackUrl(defaultEntry, localeRegistryUrl);
  const baseline = validateLocalePack(
    await json(defaultUrl, `default locale resource ${defaultEntry.id}`),
  );
  if (baseline.id !== defaultEntry.id)
    throw new Error(`Locale pack ID differs from its registry entry: ${defaultUrl}`);
  const locales: PresentationInventory['locales'] = [];
  for (const entry of localeRegistry.entries) {
    const url = resolvePackUrl(entry, localeRegistryUrl);
    const pack = validateLocalePack(await json(url, `locale resource ${entry.id}`), baseline);
    if (pack.id !== entry.id)
      throw new Error(`Locale pack ID differs from its registry entry: ${url}`);
    locales.push({ id: entry.id, label: entry.label, url });
  }

  const themes: PresentationInventory['themes'] = [];
  for (const entry of themeRegistry.entries) {
    const url = resolvePackUrl(entry, themeRegistryUrl);
    const pack = validateThemePack(await json(url, `theme resource ${entry.id}`));
    if (pack.id !== entry.id)
      throw new Error(`Theme pack ID differs from its registry entry: ${url}`);
    validateThemeTypography(pack, url);
    const theme = createThemeResolver(pack, { url });
    // The browser's installer uses these same resolved font/CSS resources. Static ports check
    // their files without starting a browser, installing fonts or changing global styles.
    const installed = await installThemeResources(theme, {
      ports: {
        async stageFont(font) {
          await asset(font.resource, `theme font ${entry.id}/${font.family}`);
          return { activate() {}, dispose() {} };
        },
        async stageStylesheet(stylesheet) {
          await asset(stylesheet, `theme stylesheet ${entry.id}`);
          return { activate() {}, dispose() {} };
        },
        installTokens: () => ({ dispose() {} }),
      },
    });
    installed?.dispose();
    for (const era of FACILITY_ERAS)
      for (const kind of FACILITY_KINDS)
        for (let stage = 0; stage <= partTop(kind === 'locker' ? 'stadium' : kind); stage++)
          await asset(
            theme.facility({ era, kind, stage }).src,
            `era stage asset ${entry.id}/${era}.${kind}.${stage}`,
          );
    for (const reference of Object.values(pack.images.facility.overrides ?? {}))
      await asset(resolveResourceUrl(reference, url), `theme image override ${entry.id}`);
    for (const [role, icon] of Object.entries(pack.icons))
      for (const variant of [undefined, ...Object.keys(icon.variants ?? {})]) {
        const resource = theme.icon(role, variant);
        if (resource.type === 'image')
          await asset(
            resource.resource,
            `theme icon ${entry.id}/${role}${variant ? `/${variant}` : ''}`,
          );
      }
    themes.push({ id: entry.id, label: entry.label, url });
  }
  return { locales, themes, assets: [...assets].sort() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const inventory = await validatePresentation();
    console.log(
      `Presentation resources valid: locales ${inventory.locales.map(({ id }) => id).join(', ')}; themes ${inventory.themes.map(({ id }) => id).join(', ')}; ${inventory.assets.length} local assets.`,
    );
  } catch (error) {
    const details: string[] = [];
    let cause: unknown = error;
    while (cause instanceof Error) {
      details.push(cause.message);
      cause = cause.cause;
    }
    console.error(details.join('\n'));
    process.exitCode = 1;
  }
}
