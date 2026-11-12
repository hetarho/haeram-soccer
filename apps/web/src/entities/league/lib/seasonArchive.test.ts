import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../../../../tests/fixtures/worlds';
import { finalZones } from './league';
import { finalRows, seasonRecords, seasonSnapshots } from './seasonArchive';

// Every season here is played on the pre-feature path: the archived tables, not the match model,
// are the subject.
const input = { country: 'ENG' as const, seed: 'season-archive' };

describe('closed season tables', () => {
  it('rebuilds a professional table from the archived standings in the engine order', () => {
    const w = simulatedWorld(input, { seasons: 1 }),
      season = w.history[0];
    expect(seasonSnapshots(w, season).map((s) => s.round)).toEqual(
      Array.from({ length: 46 }, (_, i) => i + 1),
    );
    const kept = finalRows(w, season, season.standings)!;
    expect(kept).toHaveLength(24);
    expect(seasonRecords(w, season)?.size).toBe(24);
    delete w.rankHistory;
    expect(finalRows(w, season, season.standings)).toEqual(kept);
    expect(finalRows(w, season)).toBeUndefined();
  });

  // By the rules of the season's own division.
  it('finalZones marks automatic, playoff and relegation places', () => {
    const second = finalZones('ENG', 1, 24);
    expect(second.zones.slice(0, 7)).toEqual([
      'automatic',
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      'playoff',
      undefined,
    ]);
    expect(second.zones.slice(-4)).toEqual([undefined, 'relegation', 'relegation', 'relegation']);
    const top = finalZones('ENG', 0, 20);
    expect(top.zones.filter(Boolean)).toEqual(['relegation', 'relegation', 'relegation']);
    expect(top.zones.slice(-3)).toEqual(['relegation', 'relegation', 'relegation']);
    // Regional groups send their winner up and three more to the play-off.
    expect(finalZones('ITA', 2, 20).zones.slice(0, 5)).toEqual([
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      undefined,
    ]);
    // The last division relegates nobody (→LEAGUE-16): England's fourth tier only goes up.
    expect(finalZones('ENG', 3, 24).zones.filter(Boolean)).toEqual([
      'automatic',
      'automatic',
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      'playoff',
    ]);
  });

  it('marks a closed Italian third-division group: its winner up, three to the play-off, none down', () => {
    const w = simulatedWorld({ ...input, country: 'ITA' }, { seasons: 1 }),
      season = w.history[0];
    expect(season.tier).toBe(2);
    const rows = finalRows(w, season, season.standings)!;
    expect(rows).toHaveLength(20);
    const { zones } = finalZones('ITA', season.tier, rows.length);
    expect(zones.slice(0, 5)).toEqual(['automatic', 'playoff', 'playoff', 'playoff', undefined]);
    expect(zones.filter(Boolean)).toHaveLength(4);
  });
});
