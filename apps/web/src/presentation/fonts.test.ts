import { describe, expect, it } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import { validateThemePack, type FontResource } from './contracts';
import { fontSourceCss, getFontSources, resolveFontResource } from './fonts';
import { createThemeResolver, THEME_FONT_ALIASES } from './theme';

const font: FontResource = {
  family: 'Example',
  weight: '600 900',
  resource: '../fonts/body.woff2',
  format: 'woff2',
};

describe('ordered font representations', () => {
  it('keeps single-resource packs compatible and preserves source order', () => {
    expect(getFontSources(font)).toEqual([{ resource: '../fonts/body.woff2', format: 'woff2' }]);
    const alternatives = {
      ...font,
      fallbacks: [
        { resource: '../fonts/body.woff', format: 'woff' as const },
        { resource: '../fonts/body.ttf' },
      ],
    };
    expect(getFontSources(alternatives).map(fontSourceCss)).toEqual([
      'url("../fonts/body.woff2") format("woff2")',
      'url("../fonts/body.woff") format("woff")',
      'url("../fonts/body.ttf")',
    ]);
    const legacy = structuredClone(pixelData);
    for (const face of legacy.fonts) delete (face as FontResource).fallbacks;
    expect(validateThemePack(legacy).fonts.every((face) => !face.fallbacks)).toBe(true);
  });

  it('resolves every representation from the declaring pack without changing input', () => {
    const candidate: FontResource = {
      ...font,
      fallbacks: [{ resource: './compat/body.woff', format: 'woff' }],
    };
    const original = structuredClone(candidate);
    const resolved = resolveFontResource(candidate, 'https://club.example/packs/night/pack.json');
    expect(getFontSources(resolved).map((source) => source.resource)).toEqual([
      'https://club.example/packs/fonts/body.woff2',
      'https://club.example/packs/night/compat/body.woff',
    ]);
    expect(candidate).toEqual(original);
  });

  it('carries resolved alternatives into every stable semantic alias', () => {
    const pack = validateThemePack(pixelData);
    for (const face of pack.fonts) {
      face.resource = 'body.woff2';
      face.fallbacks = [{ resource: 'compat/body.woff', format: 'woff' }];
    }
    const resolver = createThemeResolver(pack, { url: '/nested/theme.json' });
    expect(new Set(resolver.fonts.map((face) => face.family))).toEqual(
      new Set(Object.values(THEME_FONT_ALIASES)),
    );
    for (const face of resolver.fonts)
      expect(getFontSources(face).map((source) => source.resource)).toEqual([
        '/nested/body.woff2',
        '/nested/compat/body.woff',
      ]);
  });

  it.each([
    [{ resource: 'https://elsewhere.example/body.woff' }],
    [{ resource: '//elsewhere.example/body.woff' }],
    [{ resource: 'data:font/woff;base64,AA' }],
    [{ resource: 'fonts\\body.woff' }],
    [{ resource: 'body.woff', format: 'unsupported' }],
    [{ resource: 'body.woff', family: 'Other face' }],
    [{}],
  ])('applies primary URL/format constraints to alternatives %#', (fallback) => {
    const candidate = structuredClone(pixelData);
    Object.assign(candidate.fonts[0], { fallbacks: [fallback] });
    expect(() => validateThemePack(candidate)).toThrow('fonts.0.fallbacks.0');
  });

  it('also rejects unsafe alternative references at the shared resolution boundary', () => {
    expect(() =>
      resolveFontResource(
        { ...font, fallbacks: [{ resource: 'https://elsewhere.example/body.woff' }] },
        '/packs/theme.json',
      ),
    ).toThrow('Expected a local resource URL');
  });
});
