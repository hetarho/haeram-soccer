import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, TD } from '../../../../packages/contracts/src/detail';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
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
      level: 'easy' as const,
    });
    for (let round = 0; round < 6; round++) advanceRound(w, undefined, false);
    const league = w.ownMatches.filter((m) => ['league', 'lower'].includes(m.kind));
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
    // Every grid match carries advanced counters, so the season reads MATCH-13's PPDA only.
    expect(stats.detailMatches).toBe(stats.played);
    expect(stats.pressPpda).toBeGreaterThan(0);
    expect(stats.ppda).toBeUndefined();
  });

  it('leaves xG out for matches recorded before it existed', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Old Rules',
      color: '#3a6b4f',
      seed: 'old-rules',
      level: 'easy' as const,
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

  const metrics = (passes = 0, tackles = 0) => {
    const row = Array<number>(12).fill(0);
    row[2] = passes;
    row[6] = tackles;
    row[10] = 90;
    row[11] = 45;
    return row;
  };
  const world = {
    playerClub: 'us',
    clubs: [
      { id: 'us', name: 'Us' },
      { id: 'them', name: 'Them' },
    ],
    // Opponents' players are in the world too, so only the split keeps them out.
    players: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  } as unknown as Parameters<typeof seasonStats>[0];
  const match = (
    round: number,
    side: 0 | 1,
    options: { detail?: [number, number]; passes?: number; tackles?: number } = {},
  ): MatchRecord => {
    const own = metrics(0, options.tackles ?? 0),
      opp = metrics(options.passes ?? 0);
    let detail: [number[], number[]] | undefined;
    if (options.detail) {
      const [buildUp, press] = options.detail;
      const ours = emptyTeamDetail(),
        theirs = emptyTeamDetail();
      ours[TD.pressActions] = press;
      theirs[TD.buildUpPasses] = buildUp;
      detail = side === 0 ? [ours, theirs] : [theirs, ours];
    }
    return {
      id: `m${round}`,
      year: 1950,
      round,
      kind: 'league',
      home: side === 0 ? 'us' : 'them',
      away: side === 0 ? 'them' : 'us',
      country: 'ENG',
      groupKey: 'g',
      score: { home: 0, away: 0 },
      metrics: side === 0 ? [own, opp] : [opp, own],
      players: [],
      highlights: [],
      tactics: ['balanced', 'balanced'],
      ...(detail ? { detail } : {}),
    };
  };

  it('splits player lines by line counts', () => {
    const line = (id: string, goals = 0) => {
      const row = metrics();
      row[0] = goals;
      return { id, metrics: row, detail: emptyPlayerDetail() };
    };
    // Away: 12 home lines (a substitute among them), then our 11 starters and 2 substitutes.
    const away = match(1, 1, { detail: [0, 0] });
    away.players = [
      ...Array.from({ length: 12 }, (_, i) => line(`p${i}`, i === 11 ? 5 : 0)),
      ...Array.from({ length: 13 }, (_, i) => line(`p${12 + i}`, i === 12 ? 2 : 0)),
    ];
    away.lineCounts = [12, 13];
    // Home: our 11 starters and a substitute who scores, then 11 away lines.
    const home = match(2, 0, { detail: [0, 0] });
    home.players = [
      ...Array.from({ length: 12 }, (_, i) => line(`p${12 + i}`, i === 11 ? 1 : 0)),
      ...Array.from({ length: 11 }, (_, i) => line(`p${i}`, 3)),
    ];
    home.lineCounts = [12, 11];
    const stats = seasonStats(world, [away, home]);
    expect(stats.leaders.goals.map((leader) => [leader.id, leader.value])).toEqual([
      ['p24', 2],
      ['p23', 1],
    ]);
    const ids = stats.leaders.minutes.map((leader) => leader.id);
    expect(ids.every((id) => Number(id.slice(1)) >= 12)).toBe(true);
    // Without `lineCounts` the duel chain's eleven per side split as before: the twelfth falls out.
    delete home.lineCounts;
    const old = seasonStats(world, [home]);
    expect(old.leaders.goals).toEqual([]);
    expect(old.leaders.minutes.every((leader) => Number(leader.id.slice(1)) < 23)).toBe(true);
  });

  it('uses MATCH-13 PPDA over the matches with advanced counters', () => {
    const stats = seasonStats(world, [
      match(1, 0, { detail: [100, 10], passes: 400, tackles: 20 }),
      match(2, 1, { detail: [60, 6], passes: 500, tackles: 10 }),
      match(3, 0, { passes: 900, tackles: 1 }),
    ]);
    expect(stats.played).toBe(3);
    expect(stats.detailMatches).toBe(2);
    expect(stats.pressPpda).toBe(160 / 16);
    // The whole-pitch approximation never fills in for the match without counters.
    expect(stats.ppda).toBeUndefined();
  });

  it('falls back to the marked approximation only without advanced counters', () => {
    const stats = seasonStats(world, [
      match(1, 0, { passes: 400, tackles: 20 }),
      match(2, 1, { passes: 500, tackles: 10 }),
    ]);
    expect(stats.detailMatches).toBe(0);
    expect(stats.pressPpda).toBeUndefined();
    expect(stats.ppda).toBe(900 / 30);
  });
});
