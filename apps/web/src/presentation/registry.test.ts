import { describe, expect, it } from 'vitest';
import {
  getMessageParameters,
  PresentationValidationError,
  selectPluralTemplate,
  THEME_ICON_ROLES,
  THEME_TOKEN_KEYS,
  validateLocalePack,
  validateMessage,
  validateThemePack,
  type ThemePack,
} from './contracts';
import { resolvePackEntry, resolvePackUrl, resolveResourceUrl, validateRegistry } from './registry';

const localeRegistry = {
  schemaVersion: 1,
  defaultId: 'ko-KR',
  entries: [
    { id: 'ko-KR', label: '한국어', direction: 'ltr', resource: 'ko-KR.json' },
    { id: 'ar', label: 'العربية', direction: 'rtl', resource: 'nested/ar.json' },
  ],
};

function themeFixture(): ThemePack {
  const group = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 'value']));
  const icon = {
    type: 'svg' as const,
    viewBox: '0 0 16 16',
    shapeRendering: 'crispEdges' as const,
    layers: [{ d: 'M1 1h14v14H1Z', fill: 'currentColor', fillRule: 'evenodd' as const }],
  };
  return {
    schemaVersion: 1,
    id: 'synthetic-night',
    tokens: {
      palette: group(THEME_TOKEN_KEYS.palette),
      surfaces: group(THEME_TOKEN_KEYS.surfaces),
      typography: group(THEME_TOKEN_KEYS.typography),
      shape: group(THEME_TOKEN_KEYS.shape),
      imageTreatment: {
        objectFit: 'cover',
        objectPosition: 'center',
        imageRendering: 'pixelated',
        filter: 'saturate(0.7) contrast(0.92)',
        overlay: 'rgb(9 15 12 / 24%)',
      },
    },
    fonts: [
      { family: 'display', resource: '../fonts/bold.woff2', weight: '600 900', format: 'woff2' },
    ],
    images: {
      facility: {
        pattern: '../../art/{era}/{kind}-{stage}.webp',
        overrides: { 'heritage.stadium.0': '../../art/small-ground.webp' },
      },
    },
    icons: Object.fromEntries(THEME_ICON_ROLES.map((role) => [role, { default: icon }])),
    stylesheet: './theme.css',
  };
}

describe('presentation registries and resource contracts', () => {
  it('discovers choices from registry data', () => {
    const registry = validateRegistry(localeRegistry, 'locale');
    expect(registry.entries.map(({ id, label, direction }) => ({ id, label, direction }))).toEqual([
      { id: 'ko-KR', label: '한국어', direction: 'ltr' },
      { id: 'ar', label: 'العربية', direction: 'rtl' },
    ]);
    const unseen = validateRegistry(
      {
        schemaVersion: 1,
        defaultId: 'new-concept',
        entries: [{ id: 'new-concept', label: 'New concept', resource: 'new/pack.json' }],
      },
      'theme',
    );
    expect(unseen.defaultId).toBe('new-concept');
  });

  it('rejects duplicate entries and missing defaults', () => {
    expect(() =>
      validateRegistry(
        { ...localeRegistry, entries: [localeRegistry.entries[0], localeRegistry.entries[0]] },
        'locale',
      ),
    ).toThrow('Duplicate registry ID');
    expect(() => validateRegistry({ ...localeRegistry, defaultId: 'fr' }, 'locale')).toThrow(
      'default is absent',
    );
  });

  it('uses the registered default for an unknown preference', () => {
    const registry = validateRegistry(localeRegistry, 'locale');
    expect(resolvePackEntry(registry, 'removed-locale')).toBe(registry.entries[0]);
    expect(resolvePackEntry(registry)).toBe(registry.entries[0]);
    expect(resolvePackEntry(registry, 'ar')).toBe(registry.entries[1]);
  });

  it.each([
    { ...localeRegistry, schemaVersion: 2 },
    { ...localeRegistry, entries: [] },
    { ...localeRegistry, entries: [{ ...localeRegistry.entries[0], id: '../bad' }] },
    { ...localeRegistry, entries: [{ ...localeRegistry.entries[0], resource: '/absolute.json' }] },
    {
      ...localeRegistry,
      entries: [{ ...localeRegistry.entries[0], resource: 'https://elsewhere.example/pack.json' }],
    },
    { ...localeRegistry, entries: [{ ...localeRegistry.entries[0], direction: undefined }] },
  ])('rejects malformed registry structures %#', (value) => {
    expect(() => validateRegistry(value, 'locale')).toThrow(PresentationValidationError);
  });

  it('resolves resources relative to their declaring JSON', () => {
    const entry = validateRegistry(localeRegistry, 'locale').entries[1];
    expect(resolvePackUrl(entry, '/presentation/locales/index.json')).toBe(
      '/presentation/locales/nested/ar.json',
    );
    expect(resolveResourceUrl('../fonts/body.woff2', '/presentation/themes/night/pack.json')).toBe(
      '/presentation/themes/fonts/body.woff2',
    );
    expect(
      resolveResourceUrl('/art/ground.webp', 'https://club.example/presentation/themes/night.json'),
    ).toBe('https://club.example/art/ground.webp');
    for (const resource of [
      '//elsewhere.example/a',
      'https://elsewhere.example/a',
      'data:image/svg+xml,x',
      '\\evil/a',
      'a\n.css',
    ])
      expect(() => resolveResourceUrl(resource, '/presentation/theme.json')).toThrow(
        PresentationValidationError,
      );
  });

  it('shares placeholder and plural checks between locale consumers', () => {
    const message = validateMessage({
      plural: 'count',
      forms: {
        one: '{club} won one cup',
        other: '{club} won {count} cups',
      },
    });
    expect(getMessageParameters(message)).toEqual(['club', 'count']);
    if (typeof message === 'string') throw new Error('Expected plural fixture');
    expect(selectPluralTemplate(message, 'en', 1)).toBe('{club} won one cup');
    expect(selectPluralTemplate(message, 'en', 2)).toBe('{club} won {count} cups');
    expect(selectPluralTemplate(message, 'ar', 2)).toBe('{club} won {count} cups');
    expect(() => selectPluralTemplate(message, 'en', NaN)).toThrow('finite number');
    for (const invalid of [
      '{club',
      '{club.name}',
      'club}',
      { plural: 'n', forms: { one: 'one' } },
      { plural: 'n', forms: { one: '{club}', other: '{team}' } },
    ])
      expect(() => validateMessage(invalid)).toThrow(PresentationValidationError);
  });

  it('checks translated keys and parameters against the registered baseline', () => {
    const baseline = validateLocalePack({
      schemaVersion: 1,
      id: 'ko-KR',
      messages: {
        'shell.title': '해람',
        'club.name': '{club}',
      },
    });
    expect(
      validateLocalePack(
        { schemaVersion: 1, id: 'fr', messages: { 'club.name': '{club}' } },
        baseline,
      ).messages,
    ).toEqual({ 'club.name': '{club}' });
    expect(() =>
      validateLocalePack(
        { schemaVersion: 1, id: 'fr', messages: { 'club.name': '{team}' } },
        baseline,
      ),
    ).toThrow('parameters differ');
    expect(() =>
      validateLocalePack({ schemaVersion: 1, id: 'fr', messages: { invented: 'x' } }, baseline),
    ).toThrow('Unknown message key');
    expect(() =>
      validateLocalePack({ schemaVersion: 2, id: 'ko-KR', messages: baseline.messages }),
    ).toThrow(PresentationValidationError);
  });

  it('accepts semantic tokens, font ranges, layered variants and image icons', () => {
    const pack = themeFixture();
    pack.icons['trophy.league'] = {
      default: {
        type: 'svg',
        viewBox: '0 0 24 24',
        layers: [
          { d: 'M1 1h22v22H1Z', fill: '#805529', fillRule: 'evenodd' },
          { d: 'M2 2h20v20H2Z', fill: '#ffe3a0', opacity: 0.5 },
        ],
      },
      variants: {
        unearned: { type: 'image', resource: '../icons/unearned.webp', width: 24, height: 24 },
      },
    };
    expect(validateThemePack(pack)).toEqual(pack);
    expect(validateThemePack(pack).fonts[0].weight).toBe('600 900');
    expect(pack.images.facility.overrides?.['heritage.stadium.0']).toBe(
      '../../art/small-ground.webp',
    );
  });

  it('rejects missing semantic slots and malformed theme resources', () => {
    const pack = themeFixture();
    delete pack.tokens.palette.focus;
    expect(() => validateThemePack(pack)).toThrow('Missing required semantic token');
    const icons = themeFixture();
    delete icons.icons['trophy.league'];
    expect(() => validateThemePack(icons)).toThrow('Missing required semantic icon');
    for (const pattern of [
      'art/{era}/{stage}.webp',
      'https://other.example/{era}/{kind}/{stage}.png',
    ])
      expect(() =>
        validateThemePack({ ...themeFixture(), images: { facility: { pattern } } }),
      ).toThrow(PresentationValidationError);
    expect(() =>
      validateThemePack({
        ...themeFixture(),
        fonts: [{ family: 'body', resource: '//other/font.woff2', weight: '400' }],
      }),
    ).toThrow(PresentationValidationError);
    expect(() => validateThemePack({ ...themeFixture(), stylesheet: 'javascript:run()' })).toThrow(
      PresentationValidationError,
    );
  });
});
