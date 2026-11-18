import { describe, expect, it } from 'vitest';
import type { Club, SeasonArchive, World } from '../../contracts/src/types';
import { takeoverFanDisposition } from './fan-disposition';
import { fanMoodAfter } from './fan-mood-read';
import { stature } from './world';

const club = (id: string) => ({ id }) as Club;
const world = (seed: string, history: SeasonArchive[] = []) =>
  ({ seed, year: 1950, history }) as World;
const season = (year: number, id = 'other') =>
  ({ year, champions: [{ club: id }] }) as SeasonArchive;

describe('the takeover fan mix (→OWNER-19)', () => {
  it('keeps whole shares bounded, summing to 100, and leans with stature on average', () => {
    let giants = 0,
      small = 0,
      giantCount = 0,
      smallCount = 0;
    for (let seed = 0; seed < 20; seed++) {
      const w = world(`fan-mix:${seed}`);
      for (let n = 0; n < 20; n++) {
        const c = club(`ENG:0:0:${n}`),
          mix = takeoverFanDisposition(w, c);
        expect(Object.values(mix).reduce((sum, share) => sum + share, 0)).toBe(100);
        for (const share of Object.values(mix)) {
          expect(Number.isInteger(share)).toBe(true);
          expect(share).toBeGreaterThanOrEqual(10);
          expect(share).toBeLessThanOrEqual(45);
        }
        if (stature(w.seed, c.id) >= 9) {
          giants += mix.results + mix.stars;
          giantCount++;
        }
        if (stature(w.seed, c.id) < 0) {
          small += mix.identity + mix.finance;
          smallCount++;
        }
        expect(takeoverFanDisposition(w, c)).toEqual(mix);
      }
    }
    expect(giantCount).toBeGreaterThan(0);
    expect(smallCount).toBeGreaterThan(0);
    expect(giants / giantCount).toBeGreaterThan(60);
    expect(small / smallCount).toBeGreaterThan(60);
  });

  it('uses the five most recent available closes across wartime, excluding the open season', () => {
    const c = club('small'),
      baseline = [1948, 1947, 1946, 1938, 1937, 1936].map((year) => season(year)),
      w = world('wartime', baseline),
      plain = takeoverFanDisposition(w, c);
    const recent = world(
      w.seed,
      baseline.map((s) => (s.year === 1937 ? season(s.year, c.id) : s)),
    );
    const before = structuredClone(recent);
    expect(takeoverFanDisposition(recent, c)).not.toEqual(plain);
    expect(recent).toEqual(before);
    expect(takeoverFanDisposition(world(w.seed, [...baseline, season(1950, c.id)]), c)).toEqual(
      plain,
    );
    expect(
      takeoverFanDisposition(
        world(
          w.seed,
          baseline.map((s) => (s.year === 1936 ? season(s.year, c.id) : s)),
        ),
        c,
      ),
    ).toEqual(plain);
    expect(takeoverFanDisposition(world(w.seed, [...baseline].reverse()), c)).toEqual(plain);
  });

  it('keeps missing saved mixes neutral regardless of advancing history and never records a new fact on reads', () => {
    const w = world('legacy');
    w.owner = { fanMood: 60, traits: [] } as unknown as World['owner'];
    expect(fanMoodAfter(w, 1, 'results')).toBe(61);
    w.year = 1970;
    w.history.push(season(1969, 'small'));
    expect(fanMoodAfter(w, 1, 'results')).toBe(61);
    expect(w.owner).not.toHaveProperty('fanDisposition');
  });
});
