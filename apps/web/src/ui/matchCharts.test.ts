import { describe, expect, it } from 'vitest';
import { createWorld, simulateMatch } from '../../../../packages/engine/src/index';
import { chartSeries, seriesColour } from './MatchCharts';
import { contrast } from './crests';

const w = createWorld({
  country: 'ENG',
  name: 'Chart Club',
  color: '#0b1f44',
  seed: 'charts',
  difficulty: 1,
});
const playback = simulateMatch(
  w,
  w.fixtures.find((f) => f.home === w.playerClub)!,
  true,
  true,
);

describe('live match charts', () => {
  it('reveals data only up to the presented minute', () => {
    const [home, away] = chartSeries(playback, 30, 'xg');
    expect(home).toHaveLength(30);
    expect(away).toHaveLength(30);
    expect(home.at(-1)).toBe(playback.frames[29].xg![0]);
    expect(chartSeries(playback, 0, 'shots')[0]).toEqual([]);
  });

  it('splits rolling possession between the sides', () => {
    const [home, away] = chartSeries(playback, 90, 'possession');
    home.forEach((share, i) => expect(share + away[i]).toBeCloseTo(100));
    expect(home[0]).toBe(playback.frames[0].side === 0 ? 100 : 0);
  });

  it('counts recorded shots cumulatively', () => {
    const [home] = chartSeries(playback, 90, 'shots');
    expect(home.at(-1)).toBe(playback.record.metrics[0][4]);
    for (let i = 1; i < home.length; i++) expect(home[i]).toBeGreaterThanOrEqual(home[i - 1]);
  });

  it('lifts dark kit colours until the line reads on the chart surface', () => {
    expect(contrast(seriesColour('#0b1f44'), '#07110e')).toBeGreaterThanOrEqual(3);
    expect(seriesColour('#f5e663')).toBe('#f5e663');
  });
});
