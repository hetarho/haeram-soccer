import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { World } from '../../contracts/src/types';
import { clubRegistration } from './registration';
import { historyWorld } from './history';
import { LINE_MINIMUM, NPC_SQUAD, rating } from './world';
import { lineOf } from './player';
import { advanceDays, advanceRound } from './season';
import { NPC_WAGE_DECISIONS } from './books';
import { FREE_AGENT_CONFIG } from './free-agents';

/** Full lived-world regression: the coordinator runs this only at the integrated batch gate. */
function firstDay(w: World) {
  expect(w.round).toBe(0);
  const live = new Set<string>();
  for (const c of w.clubs.filter((c) => !c.representative)) {
    const players = w.squads![c.id]!;
    expect(players.length, `${w.year}:${c.id}`).toBeGreaterThanOrEqual(NPC_SQUAD.size);
    for (const line of Object.keys(LINE_MINIMUM) as (keyof typeof LINE_MINIMUM)[])
      expect(
        players.filter((p) => lineOf(p.position) === line).length,
        `${w.year}:${c.id}:${line}`,
      ).toBeGreaterThanOrEqual(LINE_MINIMUM[line]);
    const registered = clubRegistration(c, w.year, players);
    expect(registered.total).toBeLessThanOrEqual(registered.ceiling);
    expect(registered.counted).toBeLessThanOrEqual(registered.allowed);
    for (const p of players) {
      expect(w.year - p.born).toBeLessThan(42);
      expect(live.has(p.id)).toBe(false);
      live.add(p.id);
    }
  }
  for (const p of w.freeAgents ?? []) {
    expect(live.has(p.id)).toBe(false);
    live.add(p.id);
  }
  for (const cp of COUNTRIES) {
    const means = cp.groups.map((_, tier) => {
      const clubs = w.clubs.filter((c) => c.country === cp.code && c.tier === tier);
      return clubs.reduce((n, c) => n + rating(w, c), 0) / clubs.length;
    });
    for (let tier = 1; tier < means.length; tier++)
      expect(means[tier]!, `${w.year}:${cp.code}:${tier}`).toBeLessThan(means[tier - 1]!);
  }
}

describe('the persisted world from 1930 to 1960', () => {
  it('keeps full legal squads, unique identities and ordered division means across the war', () => {
    const w = historyWorld('persisted-world-invariants');
    const years = [w.year];
    firstDay(w);
    advanceRound(w, undefined, false);
    expect(w.npcSeason!.year).toBe(1930);
    expect(w.npcSeason!.competitions.some((c) => c.players.length > 0)).toBe(true);
    let decisions = 0;
    const previous = NPC_WAGE_DECISIONS.observe;
    NPC_WAGE_DECISIONS.observe = (club, bill, limit, allowed) => {
      decisions++;
      expect(allowed, `${w.year}:${club.id}:${bill}:${limit}`).toBe(limit === undefined || bill <= limit);
    };
    try {
      while (w.year < 1960) {
        const before = new Map(w.clubs.filter((c) => !c.representative).map((c) => [c.id, {
          strength: c.strength,
          players: JSON.stringify(w.squads![c.id]!.map((p) => [p.id, p.attrs, p.positions])),
        }]));
        const year = w.year;
        advanceDays(w, 1, undefined, false);
        for (const c of w.clubs.filter((c) => !c.representative)) {
          const last = before.get(c.id)!;
          if (last.strength !== c.strength)
            expect(JSON.stringify(w.squads![c.id]!.map((p) => [p.id, p.attrs, p.positions])),
              `${w.year}:${w.calendar?.day}:${c.id}`).not.toBe(last.players);
        }
        if (w.year !== year) {
          years.push(w.year);
          firstDay(w);
          expect((w.freeAgents ?? []).length).toBeLessThanOrEqual(FREE_AGENT_CONFIG.cap);
        }
      }
    } finally {
      NPC_WAGE_DECISIONS.observe = previous;
    }
    expect(decisions).toBeGreaterThan(0);
    expect(w.history.filter((h) => h.year < 1955).every((h) => h.ballonDor === undefined)).toBe(true);
    expect(years).toEqual([
      1930, 1931, 1932, 1933, 1934, 1935, 1936, 1937, 1938, 1946, 1947, 1948, 1949, 1950,
      1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1960,
    ]);
  });
});
