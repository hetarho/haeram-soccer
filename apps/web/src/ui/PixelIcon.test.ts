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
const vector = {
  type: 'svg',
  viewBox: '0 0 24 24',
  shapeRendering: 'geometricPrecision',
  layers: [
    {
      d: 'm6 9 6 6 6-6',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
} satisfies IconResource;

describe('semantic SVG resources', () => {
  it('preserves the connected Lucide chevron and its round stroke through validation and rendering', () => {
    const candidate = validateThemePack(standardData);
    candidate.icons.chevronDown.default = vector;
    const { icons } = validateThemePack(candidate);
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

  it('renders the painted Stadium Green icon as a decorative full-colour image', () => {
    const { icons } = validateThemePack(standardData);
    expect(icons.chevronDown.default.type).toBe('image');
    const html = render(icons.chevronDown.default);
    expect(html).toContain('<img');
    expect(html).toContain('page-refresh-v1/icon-chevronDown.webp');
    expect(html).toContain('width="16" height="16"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
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
      const candidate = validateThemePack(standardData);
      const invalid = structuredClone(vector);
      Object.assign(invalid.layers[0], stroke);
      candidate.icons.chevronDown.default = invalid;
      expect(() => validateThemePack(candidate)).toThrow();
    }
  });
});
