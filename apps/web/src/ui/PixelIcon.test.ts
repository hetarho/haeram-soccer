import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import standardData from '../../public/presentation/themes/standard.json';
import pixelData from '../../public/presentation/themes/pixel.json';
import { validateThemePack, type IconResource } from '../presentation/contracts';
import { SemanticIcon } from './PixelIcon';

const render = (resource: IconResource) =>
  renderToStaticMarkup(
    createElement(SemanticIcon, { resource, semanticRole: 'chevronDown', size: 16 }),
  );

describe('semantic SVG resources', () => {
  it('preserves the connected Lucide chevron and its round stroke through validation and rendering', () => {
    const { icons } = validateThemePack(standardData);
    const chevron = icons.chevronDown.default;
    expect(chevron.type).toBe('svg');
    if (chevron.type !== 'svg') throw new Error('Expected a vector chevron');
    expect(chevron.layers).toHaveLength(1);
    const markup = render(chevron);
    expect(markup).toContain(`d="${chevron.layers[0].d}"`);
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toContain('stroke-linejoin="round"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('keeps filled pixel resources independent of the standard stroke style', () => {
    const { icons } = validateThemePack(pixelData);
    const markup = render(icons.chevronDown.default);
    expect(markup).toContain('shape-rendering="crispEdges"');
    expect(markup).toContain('fill="currentColor"');
    expect(markup).not.toContain('stroke-width=');
    expect(markup).not.toContain('stroke-linecap=');
  });

  it('rejects invalid SVG stroke attributes instead of passing them to the renderer', () => {
    for (const stroke of [
      { strokeWidth: -1 },
      { strokeLinecap: 'triangle' },
      { strokeLinejoin: 'triangle' },
    ]) {
      const candidate = structuredClone(standardData);
      Object.assign(candidate.icons.chevronDown.default.layers[0], stroke);
      expect(() => validateThemePack(candidate)).toThrow();
    }
  });
});
