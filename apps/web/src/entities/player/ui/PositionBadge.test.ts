import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import registryData from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import { LINES, POSITIONS, type Line } from '../../../../../../packages/contracts/src/player';
import { lineOf } from '../../../../../../packages/engine/src/player';
import type { PresentationController } from '../../../presentation/controller';
import { validateLocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { PresentationProvider } from '../../../presentation/react';
import { validateRegistry } from '../../../presentation/registry';
import { PositionBadge } from './PositionBadge';

const registry = validateRegistry(registryData, 'locale');
const baseline = validateLocalePack(korean);

function render(pack: unknown, position: (typeof POSITIONS)[number]) {
  const locale = createLoadedLocale(registry, validateLocalePack(pack, baseline), baseline);
  const snapshot = { locale };
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  } as unknown as PresentationController;
  return renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(PositionBadge, { position }),
    }),
  );
}

const families: Record<Line, [string, string]> = {
  GK: ['골키퍼', 'Goalkeeper'],
  DF: ['수비', 'Defence'],
  MF: ['미드필드', 'Midfield'],
  FW: ['공격', 'Attack'],
};

describe('shared position badge', () => {
  it.each(POSITIONS.map((position) => [position]))(
    'shows %s with the engine family read before the code',
    (position) => {
      const line = lineOf(position);
      for (const [pack, label] of [
        [korean, families[line][0]],
        [english, families[line][1]],
      ] as const) {
        const markup = render(pack, position);
        expect(markup).toMatch(
          new RegExp(
            `^<span class="[^"]+" data-ui="position-badge" data-line="${line}" title="${label}">` +
              `<span class="[^"]+">${label} </span>${position}</span>$`,
          ),
        );
        // Informational only: the surrounding row's link stays the one target.
        expect(markup).not.toMatch(/<button|<a |tabindex|role=|aria-hidden/);
      }
    },
  );

  it('covers every engine family with the specified goalkeeper, defence, midfield and attack groups', () => {
    const grouped = Object.fromEntries(
      LINES.map((line) => [line, POSITIONS.filter((position) => lineOf(position) === line)]),
    );
    expect(grouped).toEqual({
      GK: ['GK'],
      DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
      MF: ['DM', 'CM', 'LM', 'RM', 'AM'],
      FW: ['LW', 'RW', 'ST'],
    });
  });

  it('keeps four distinct family fills with readable ink and no theme material over them', () => {
    const css = readFileSync(new URL('./PositionBadge.module.css', import.meta.url), 'utf8');
    const declared = (block: string, name: string) =>
      block.match(new RegExp(`--position-${name}: (#[0-9a-f]{6});`))![1];
    const block = (line: Line) =>
      line === 'DF'
        ? css.slice(css.indexOf('.badge {'), css.indexOf('}', css.indexOf('.badge {')))
        : css.slice(
            css.indexOf(`.badge[data-line='${line}']`),
            css.indexOf('}', css.indexOf(`.badge[data-line='${line}']`)),
          );
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((index) => {
        const value = parseInt(hex.slice(index, index + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    const palette = LINES.map((line) => ({
      line,
      fill: declared(block(line), 'fill'),
      ink: declared(block(line), 'ink'),
    }));
    expect(new Set(palette.map(({ fill }) => fill)).size).toBe(4);
    for (const { line, fill, ink } of palette)
      expect(contrast(fill, ink), line).toBeGreaterThanOrEqual(4.5);
    // A theme's dark material must never cover the family fill (→WEB-113).
    expect(css).not.toMatch(/image-[a-z-]*-material|image-dark-fill|background-image/);
  });
});
