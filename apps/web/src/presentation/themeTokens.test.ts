import { describe, expect, it } from 'vitest';
import pixel from '../../public/presentation/themes/pixel.json';
import standard from '../../public/presentation/themes/standard.json';
import print from '../../public/presentation/themes/matchday-print.json';
import sticker from '../../public/presentation/themes/sticker-club.json';
import { resolveThemeTokens } from './themeTokens';
import { contrast } from '../../../../packages/engine/src/identity-legacy';

describe('shared semantic theme tokens', () => {
  it.each(['iron', 'bronze', 'silver', 'gold', 'elite'])(
    'keeps matchday-print %s rating numbers readable against their surface',
    (tier) => {
      const tokens = resolveThemeTokens(print.tokens);
      expect(
        contrast(tokens[`rating-${tier}-text`], tokens[`rating-${tier}-fill`]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('preserves legacy optional roles for registered-default fallback', () => {
    const tokens = structuredClone(pixel.tokens);
    delete (tokens.shape as Record<string, string>)['control-radius'];
    delete (tokens.shape as Record<string, string>)['card-radius'];
    const resolved = resolveThemeTokens(tokens);
    expect(resolved).not.toHaveProperty('control-radius');
    expect(resolved).not.toHaveProperty('card-radius');
    expect(resolved.radius).toBe(tokens.shape.radius);
  });

  it('honours declared semantic variants and arbitrary extension roles', () => {
    const tokens = structuredClone(pixel.tokens);
    Object.assign(tokens.shape, { 'badge-radius': '7px', 'scene-radius': '13px' });
    Object.assign(tokens.surfaces, { 'custom-chart-fill': 'var(--surface)' });
    const resolved = resolveThemeTokens(tokens);
    expect(resolved['badge-radius']).toBe('7px');
    expect(resolved['scene-radius']).toBe('13px');
    expect(resolved['custom-chart-fill']).toBe('var(--surface)');
  });

  it.each(['image-canvas', 'image-quiet', 'image-detail'] as const)(
    'keeps text readable on the print %s material fallback',
    (role) => {
      const fill = print.tokens.ui[role];
      for (const color of [
        print.tokens.palette.text,
        print.tokens.palette['text-muted'],
        print.tokens.palette['text-faint'],
        print.tokens.palette['accent-text'],
        print.tokens.palette.positive,
        print.tokens.palette.warm,
        print.tokens.palette.cool,
        print.tokens.palette.danger,
      ]) {
        expect(contrast(color, fill), `${color} on ${role}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('gives imported older packs neutral secondary roles without another theme leaking in', () => {
    const tokens = structuredClone(pixel.tokens);
    for (const key of Object.keys(tokens.ui)) {
      if (key.startsWith('secondary-')) delete (tokens.ui as Record<string, string>)[key];
    }
    const resolved = resolveThemeTokens(tokens);
    expect(resolved['secondary-fill']).toBe('var(--surface-2)');
    expect(resolved['secondary-text']).toBe(tokens.palette.text);
    expect(resolved['secondary-muted']).toBe(tokens.palette['text-muted']);
  });

  it('keeps an older imported pack on its own material without applying the new weave blend', () => {
    const tokens = structuredClone(pixel.tokens);
    for (const key of [
      'image-transport-material',
      'transport-material-size',
      'transport-material-blend',
    ]) {
      delete (tokens.ui as Record<string, string>)[key];
    }
    const resolved = resolveThemeTokens(tokens);
    expect(resolved['image-transport-material']).toBe('var(--image-dark-material)');
    expect(resolved['transport-material-blend']).toBe('normal');
  });

  it.each([standard, pixel, print, sticker])(
    '$id supplies secondary surfaces distinct from the emphasized controller',
    (pack) => {
      const resolved = resolveThemeTokens(pack.tokens);
      expect(resolved['secondary-fill']).not.toBe(
        pack.tokens.ui['image-dark-fill' as keyof typeof pack.tokens.ui] ??
          pack.tokens.ui['image-ink-color'],
      );
      expect(
        contrast(pack.tokens.ui['image-ink-color'], resolved['secondary-fill']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(pack.tokens.ui['image-muted'], resolved['secondary-fill']),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([standard, pixel, print, sticker])(
    '$id distinguishes the light controller from dark navigation with readable local text',
    (pack) => {
      const tokens = resolveThemeTokens(pack.tokens);
      const navigation =
        (pack.tokens.ui as Record<string, string>)['image-dark-fill'] ??
        pack.tokens.ui['image-ink-color'];
      expect(contrast(tokens['transport-fill'], navigation)).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens['transport-text'], tokens['transport-fill'])).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(tokens['transport-muted'], tokens['transport-fill'])).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it('keeps font alias resolution and immutable per-pack results independent', () => {
    const tokens = structuredClone(pixel.tokens);
    const original = structuredClone(tokens);
    const first = resolveThemeTokens(tokens, { ...tokens.typography, body: 'Resolved face' });
    tokens.shape.radius = '31px';
    const second = resolveThemeTokens(tokens);
    expect(first.body).toBe('Resolved face');
    expect(first.radius).toBe(original.shape.radius);
    expect(second.radius).toBe('31px');
    expect(tokens.typography).toEqual(original.typography);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
