import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { MatchAppearance } from '../../../../packages/contracts/src/identity';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { createWorld, simulateMatch } from '../../../../packages/engine/src/index';
import { chartLines, chartSeries, MatchCharts, seriesColour } from './MatchCharts';
import { colourDistance, contrast } from './crests';
import { describeShirt } from './kitPainting';
import { matchLook, UNRECORDED_LOOK, type MatchLook } from './matchAppearance';

const w = createWorld({
  country: 'ENG',
  name: 'Chart Club',
  color: '#0b1f44',
  seed: 'charts',
  level: 'normal' as const,
});
const playback = simulateMatch(
  w,
  w.fixtures.find((f) => f.home === w.playerClub)!,
  true,
  true,
);

describe('live match charts', () => {
  it('keeps chart lines above 3:1 contrast on each active theme ground', () => {
    const kit = '#0b1f44';
    for (const surface of ['#191b16', '#123b2e', '#10251b', '#0c0f10'])
      expect(contrast(seriesColour(kit, surface), surface)).toBeGreaterThanOrEqual(3);
  });
  it('reveals data only up to the presented frame', () => {
    const [home, away] = chartSeries(playback, 30, 'xg');
    expect(home).toHaveLength(30);
    expect(away).toHaveLength(30);
    expect(home.at(-1)).toBe(playback.frames[29].xg![0]);
    expect(chartSeries(playback, 0, 'shots')[0]).toEqual([]);
  });

  it('splits rolling possession between the sides', () => {
    const [home, away] = chartSeries(playback, playback.frames.length, 'possession');
    home.forEach((share, i) => expect(share + away[i]).toBeCloseTo(100));
    expect(home[0]).toBe(playback.frames[0].side === 0 ? 100 : 0);
  });

  it('counts recorded shots cumulatively', () => {
    const [home] = chartSeries(playback, playback.frames.length, 'shots');
    expect(home.at(-1)).toBe(playback.record.metrics[0][4]);
    for (let i = 1; i < home.length; i++) expect(home[i]).toBeGreaterThanOrEqual(home[i - 1]);
  });

  it('lifts dark kit colours until the line reads on the chart surface', () => {
    expect(contrast(seriesColour('#0b1f44'), '#07110e')).toBeGreaterThanOrEqual(3);
    expect(seriesColour('#f5e663')).toBe('#f5e663');
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Both sides in dark navy: the home stripes and a plain away shirt with no other colour. */
const NAVY: MatchAppearance = deepFreeze({
  version: 1,
  sides: [
    {
      club: playback.record.home,
      crest: { shape: 'shield', pattern: 'plain', emblem: 'star', primary: '#0b1f44' },
      role: 'home',
      shirt: { pattern: 'stripes', primary: '#0b1f44', secondary: '#d62828' },
      goalkeeper: '#ffd400',
    },
    {
      club: playback.record.away,
      crest: { shape: 'round', pattern: 'plain', emblem: 'ball', primary: '#0b1f44' },
      role: 'away',
      shirt: { pattern: 'plain', primary: '#0b1f44' },
      goalkeeper: '#00ff99',
    },
  ],
  warnings: ['teams'],
});
const recorded: MatchPlayback = {
  ...playback,
  record: { ...playback.record, appearance: NAVY },
};
const render = (look: MatchLook) =>
  renderToStaticMarkup(
    createElement(MatchCharts, {
      playback: recorded,
      shown: 30,
      look,
      names: ['CHA', 'OPP'],
      details: false,
      detailsId: 'details',
      onDetails: () => {
        throw new Error('rendering never toggles details');
      },
    }),
  );

describe('chart series against the worn shirts (→WEB-49, KIT-12)', () => {
  it('lifts a dark line for contrast without repainting the shirt or the snapshot', () => {
    const before = canonical(NAVY);
    const look = matchLook(recorded.record);
    const [home, away] = chartLines(look);
    expect(home.colour).not.toBe('#0b1f44');
    expect(contrast(home.colour, '#07110e')).toBeGreaterThanOrEqual(3);
    // The plain navy away shirt has no other colour, so its line falls back to a fixed one.
    expect(colourDistance(home.colour, away.colour)).toBeGreaterThanOrEqual(120);
    expect([home.dash, away.dash]).toEqual([undefined, '5 3']);
    // The frozen snapshot would throw on a write; it and the drawn shirts are unchanged.
    expect(canonical(NAVY)).toBe(before);
    expect(look.sides.map((side) => side.shirt.primary)).toEqual(['#0b1f44', '#0b1f44']);
  });

  it('draws the away series dashed and names each side by its worn shirt swatch', () => {
    const look = matchLook(recorded.record);
    const html = render(look);
    const lines = [...html.matchAll(/<polyline([^>]*)>/g)].map(([, tag]) => tag);
    // Away is drawn first, under home.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('stroke-dasharray="5 3"');
    expect(lines[1]).not.toContain('stroke-dasharray');
    const [home, away] = chartLines(look);
    expect(lines[1]).toContain(`stroke="${home.colour}"`);
    expect(lines[0]).toContain(`stroke="${away.colour}"`);
    // The swatch shows the actual shirt, not the lifted line colour.
    expect(html).toContain(`aria-label="CHA 홈 유니폼: ${describeShirt(NAVY.sides[0].shirt)}"`);
    expect(html).toContain(`aria-label="OPP 어웨이 유니폼: ${describeShirt(NAVY.sides[1].shirt)}"`);
    expect(html).toContain('(실선)');
    expect(html).toContain('(점선)');
  });

  it('labels the neutral swatches of an unrecorded match', () => {
    const html = render(UNRECORDED_LOOK);
    expect(html).toContain('aria-label="CHA 기본 표시 (유니폼 미기록):');
    expect(html).toContain('aria-label="OPP 기본 표시 (유니폼 미기록):');
  });
});
