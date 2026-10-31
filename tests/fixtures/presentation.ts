import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';
import {
  validateLocalePack,
  validateThemePack,
  type LocalePack,
  type PackRegistry,
  type ThemePack,
} from '../../apps/web/src/presentation/contracts';
import {
  resolvePackUrl,
  resolveRegistryUrl,
  resolveResourceUrl,
  validateRegistry,
} from '../../apps/web/src/presentation/registry';
import { THEME_FONT_ALIASES } from '../../apps/web/src/presentation/theme';

/** Private-use IDs exist in these Node fixtures and routed responses only, never in app builds. */
export const FIXTURE_LOCALE = 'fr-FR-x-fixture';
export const FIXTURE_THEME = 'fixture-signal';
export const FIXTURE_BACKGROUND = '#102030';
export const STORED_KOREAN_TITLE = '우리 구단의 오래된 약속';
export const STORED_KOREAN_DETAIL = '이 한국어 기록은 화면 언어를 바꿔도 그대로 남아요.';
const FIXTURE_PREFIX = '/__presentation-fixtures/';

export function readPresentationBaselines() {
  const root = new URL('../../apps/web/public/', import.meta.url);
  const read = (url: string): unknown => JSON.parse(readFileSync(new URL(`.${url}`, root), 'utf8'));
  const localeRegistry = validateRegistry(read(resolveRegistryUrl('locale')), 'locale');
  const themeRegistry = validateRegistry(read(resolveRegistryUrl('theme')), 'theme');
  const localeEntry = localeRegistry.entries.find(
    (entry) => entry.id === localeRegistry.defaultId,
  )!;
  const themeEntry = themeRegistry.entries.find((entry) => entry.id === themeRegistry.defaultId)!;
  const localeUrl = resolvePackUrl(localeEntry, resolveRegistryUrl('locale'));
  const themeUrl = resolvePackUrl(themeEntry, resolveRegistryUrl('theme'));
  return {
    root: fileURLToPath(root),
    localeRegistry,
    themeRegistry,
    localeEntry,
    themeEntry,
    localeUrl,
    themeUrl,
    locale: validateLocalePack(read(localeUrl)),
    theme: validateThemePack(read(themeUrl)),
  };
}

/** A conforming concept can rename font families and replace resources without new consumers. */
export function createSyntheticPresentation(baseline: {
  locale: LocalePack;
  theme: ThemePack;
  themeUrl: string;
}) {
  const locale: LocalePack = {
    ...structuredClone(baseline.locale),
    id: FIXTURE_LOCALE,
    messages: {
      ...structuredClone(baseline.locale.messages),
      'navigation.dashboard': 'Resource-only club home',
      'navigation.short.dashboard': 'Test home',
      'shell.cash': 'Budget de test',
      'shell.cashDetails': 'Budget {amount} · {status} · Details',
      'facility.era.heritage': 'Ère de test',
      'facility.stadium': 'Tribune {stage}',
      'facility.manager': 'Bureau de test',
    },
  };
  const theme = structuredClone(baseline.theme);
  theme.id = FIXTURE_THEME;
  for (const image of Object.values(theme.images.ui ?? {}))
    image.resource = resolveResourceUrl(image.resource, baseline.themeUrl);
  theme.tokens.palette.bg = FIXTURE_BACKGROUND;
  theme.tokens.imageTreatment = {
    objectFit: 'cover',
    objectPosition: 'center',
    imageRendering: 'auto',
    filter: 'none',
    overlay: 'transparent',
  };
  const font = baseline.theme.fonts[0];
  theme.fonts = [
    {
      ...font,
      family: 'Fixture Display',
      resource: resolveResourceUrl(font.resource, baseline.themeUrl),
    },
  ];
  for (const role of Object.keys(THEME_FONT_ALIASES))
    theme.tokens.typography[role] = "'Fixture Display', sans-serif";
  theme.images.facility = { pattern: `${FIXTURE_PREFIX}scenes/{era}/{kind}-{stage}.svg` };
  theme.stylesheet = `${FIXTURE_PREFIX}concept.css`;
  theme.icons.home = {
    default: { type: 'image', resource: `${FIXTURE_PREFIX}home.svg`, width: 16, height: 16 },
  };
  const localeEntry = {
    id: locale.id,
    label: 'Langue de test',
    direction: 'ltr' as const,
    resource: 'fixtures/resource-locale.json',
  };
  const themeEntry = {
    id: theme.id,
    label: 'Signal de test',
    resource: 'fixtures/resource-theme.json',
  };
  return {
    locale,
    theme,
    localeEntry,
    themeEntry,
    localeUrl: resolvePackUrl(localeEntry, resolveRegistryUrl('locale')),
    themeUrl: resolvePackUrl(themeEntry, resolveRegistryUrl('theme')),
  };
}

export const fixtureSvg = (width = 240, height = 80) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#123456"/><path d="M0 0L${width} ${height}" stroke="#fedcba"/></svg>`;

/** Models deploying new registry/JSON/assets after a fixed app build, with actual browser fetches. */
export async function routeSyntheticPresentation(
  page: Page,
  options: { failThemeOnce?: boolean } = {},
) {
  const baseline = readPresentationBaselines();
  const fixture = createSyntheticPresentation(baseline);
  const localeRegistry: PackRegistry<'locale'> = {
    ...baseline.localeRegistry,
    entries: [
      ...baseline.localeRegistry.entries.filter(({ id }) => id !== fixture.locale.id),
      fixture.localeEntry,
    ],
  };
  const themeRegistry: PackRegistry<'theme'> = {
    ...baseline.themeRegistry,
    entries: [
      ...baseline.themeRegistry.entries.filter(({ id }) => id !== fixture.theme.id),
      fixture.themeEntry,
    ],
  };
  const requests = new Map<string, number>();
  let failed = false;
  const route = async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    requests.set(path, (requests.get(path) ?? 0) + 1);
    const resources: Record<string, unknown> = {
      [resolveRegistryUrl('locale')]: localeRegistry,
      [resolveRegistryUrl('theme')]: themeRegistry,
      [fixture.localeUrl]: fixture.locale,
      [fixture.themeUrl]: fixture.theme,
    };
    if (path === fixture.themeUrl && options.failThemeOnce && !failed) {
      failed = true;
      return route.fulfill({ status: 503, body: 'Synthetic retryable resource failure' });
    }
    if (Object.hasOwn(resources, path)) return route.fulfill({ json: resources[path] });
    if (path === fixture.theme.stylesheet)
      return route.fulfill({
        contentType: 'text/css',
        body: ':root { --presentation-fixture-loaded: 1; }',
      });
    if (path.startsWith(`${FIXTURE_PREFIX}scenes/`))
      return route.fulfill({ contentType: 'image/svg+xml', body: fixtureSvg() });
    if (path === `${FIXTURE_PREFIX}home.svg`)
      return route.fulfill({ contentType: 'image/svg+xml', body: fixtureSvg(16, 16) });
    return route.continue();
  };
  await page.route('**/presentation/**', route);
  await page.route(`**${FIXTURE_PREFIX}**`, route);
  return { ...baseline, ...fixture, localeRegistry, themeRegistry, requests };
}
