import { describe, expect, it } from 'vitest';
import { createWorld, simulateSeason } from '../../../../packages/engine/src/index';
import { professionalStart } from '../../../../packages/engine/src/testing';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { finalZones } from './league';
import { finalRows, seasonSnapshots } from './seasonArchive';

// Every season here is played on the pre-feature path: the archived tables, not the match model,
// are the subject.
const input = {
  country: 'ENG' as const,
  name: 'Haeram Archive',
  color: '#24664f',
  seed: 'season-archive',
  level: 'normal' as const,
};

describe('closed season tables', () => {
  it('reads an amateur season from its last snapshot only', () => {
    const w = simulatedWorld(input, { seasons: 1 }, DISABLED_RELEASE),
      season = w.history[0];
    expect(seasonSnapshots(w, season).map((s) => s.round)).toEqual(
      Array.from({ length: 46 }, (_, i) => i + 1),
    );
    const rows = finalRows(w, season, season.standings)!;
    expect(rows).toHaveLength(16);
    const ours = rows.findIndex(([club]) => w.clubs[club].id === w.playerClub);
    expect(ours + 1).toBe(season.rank);
    expect(rows[ours][1]).toBe(season.points);
    // The archived standings leave the amateur clubs out, so they are no table on their own.
    delete w.rankHistory;
    expect(finalRows(w, season, season.standings)).toBeUndefined();
  });

  it('rebuilds a professional table from the archived standings in the engine order', () => {
    const w = cachedWorld('professional-season', () =>
        simulateSeason(professionalStart(createWorld(input, DISABLED_RELEASE))),
      ),
      season = w.history[0];
    const kept = finalRows(w, season, season.standings)!;
    expect(kept).toHaveLength(24);
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
    // Regional groups send their winner up and three more to the play-off; amateurs never drop.
    expect(finalZones('ITA', 2, 20).zones.slice(0, 5)).toEqual([
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      undefined,
    ]);
    // The amateur league sends up as many clubs as the last division drops, the last by play-off.
    const amateur = finalZones('ENG', 4, 16);
    expect(amateur.lower).toBe(true);
    expect(amateur.zones.filter(Boolean)).toEqual([
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      'playoff',
    ]);
  });

  it('marks a closed Italian amateur season for the six places three Serie C groups open', () => {
    const w = simulatedWorld({ ...input, country: 'ITA' }, { seasons: 1 }, DISABLED_RELEASE),
      season = w.history[0];
    const rows = finalRows(w, season, season.standings)!;
    expect(rows).toHaveLength(16);
    const { zones, lower } = finalZones('ITA', season.tier, rows.length);
    expect(lower).toBe(true);
    expect(zones.slice(0, 10)).toEqual([
      'automatic',
      'automatic',
      'automatic',
      'automatic',
      'automatic',
      'playoff',
      'playoff',
      'playoff',
      'playoff',
      undefined,
    ]);
    expect(zones.filter(Boolean)).toHaveLength(9);
  });
});
