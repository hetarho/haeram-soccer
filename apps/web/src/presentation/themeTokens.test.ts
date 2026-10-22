import { describe, expect, it } from 'vitest';
import pixel from '../../public/presentation/themes/pixel.json';
import { resolveThemeTokens } from './themeTokens';

describe('shared semantic theme tokens', () => {
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
