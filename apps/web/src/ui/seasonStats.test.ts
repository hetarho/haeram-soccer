import { describe, expect, it } from 'vitest';
import { advanceRound, createWorld } from '../../../../packages/engine/src/index';
import { expectedPoints, seasonStats, share } from './seasonStats';

describe('season analytics', () => {
  it('turns two xG totals into Poisson expected points', () => {
    expect(expectedPoints(1.34, 0.87)).toBeCloseTo(1.7, 1);
    expect(expectedPoints(0, 0)).toBeCloseTo(1, 5);
    const sum = expectedPoints(1.5, 1.1) + expectedPoints(1.1, 1.5);
    // Points shared out: three for a decisive match, two for a draw.
    expect(sum).toBeGreaterThan(2);
    expect(sum).toBeLessThan(3);
  });

  it('measures the league season from recorded matches only', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Review Club',
      color: '#3a6b4f',
      seed: 'season-review',
      difficulty: 2,
    });
    for (let round = 0; round < 6; round++) advanceRound(w, undefined, false);
    const league = w.ownMatches.filter((m) => m.kind === 'league');
    const stats = seasonStats(w, w.ownMatches);
    const table = w.tables[w.playerClub];
    expect(stats.played).toBe(league.length);
    expect(stats.points).toBe(table.points);
    expect(stats.gf).toBe(table.gf);
    expect(stats.ga).toBe(table.ga);
    expect(stats.home.played + stats.away.played).toBe(stats.played);
    expect(stats.xgMatches).toBe(stats.played);
    expect(stats.xpts).toBeGreaterThan(0);
    expect(stats.xpts).toBeLessThan(3 * stats.played);
    expect(stats.progression).toHaveLength(stats.played);
    expect(stats.progression.at(-1)!.points).toBe(stats.points);
    expect(stats.leaders.goals.reduce((sum, l) => sum + l.value, 0)).toBeLessThanOrEqual(stats.gf);
    expect(stats.possession).toBeGreaterThan(0);
    expect(stats.possession).toBeLessThan(100);
    expect(stats.ppda).toBeGreaterThan(0);
  });

  it('leaves xG out for matches recorded before it existed', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Old Rules',
      color: '#3a6b4f',
      seed: 'old-rules',
      difficulty: 2,
    });
    for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
    for (const match of w.ownMatches) delete match.xg;
    const stats = seasonStats(w, w.ownMatches);
    expect(stats.xgMatches).toBe(0);
    expect(stats.xg).toBeUndefined();
    expect(stats.progression.every((row) => row.xpts === undefined)).toBe(true);
    expect(share(1, 0)).toBe('—');
    expect(share(1, 3)).toBe('33.3%');
  });
});
