import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { World } from '../../contracts/src/types';
import { clubRegistration } from './registration';
import { historyWorld } from './history';
import { LINE_MINIMUM, NPC_SQUAD, rating } from './world';
import { lineOf } from './player';
import { advanceDays, advanceRound } from './season';
import { NPC_WAGE_DECISIONS, npcWageBill, npcWageLimit } from './books';
import { FREE_AGENT_CONFIG } from './free-agents';
import { npcMarketDays, PLAYER_MOVE_FLOW } from './npc-market';
import { transferWindowDays } from './transfer-window';
import { SEASON_END_DAY } from './calendar';
import { SQUAD_MINIMUM } from './squad-size';

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

describe('the persisted world from 1930 to 1970', () => {
  it('keeps full legal squads, unique identities and ordered division means across the war', () => {
    const w = historyWorld('persisted-world-invariants');
    const years = [w.year];
    firstDay(w);
    advanceRound(w, undefined, false);
    expect(w.npcSeason!.year).toBe(1930);
    expect(w.npcSeason!.competitions.some((c) => c.players.length > 0)).toBe(true);
    let decisions = 0;
    const previous = NPC_WAGE_DECISIONS.observe;
    const previousMove = PLAYER_MOVE_FLOW.observe;
    let moves = 0;
    PLAYER_MOVE_FLOW.observe = (world, id, move) => {
      moves++;
      expect(world.clubs.some((c) => c.id === move.from)).toBe(true);
      expect(world.clubs.some((c) => c.id === move.to)).toBe(true);
      const last = world.playerRecords?.[id]?.moves.at(-1);
      if (last) expect(last.to, `${id}:${move.year}:${move.day}`).toBe(move.from);
      const held = world.squads?.[move.from]?.some((p) => p.id === id);
      const released = world.people?.[id]?.employment.some(
        (job) => job.role === 'player' && job.club === move.from,
      );
      expect(held || released, `${id}:${move.from}`).toBe(true);
      expect(world.squads?.[move.to]?.some((p) => p.id === id)).not.toBe(true);
    };
    const overAtClose = new Set<string>();
    NPC_WAGE_DECISIONS.observe = (club, bill, limit, allowed) => {
      decisions++;
      expect(allowed, `${w.year}:${club.id}:${bill}:${limit}`).toBe(
        limit === undefined || bill <= limit,
      );
    };
    try {
      while (w.year < 1970) {
        const before = new Map(
          w.clubs
            .filter((c) => !c.representative)
            .map((c) => [
              c.id,
              {
                strength: c.strength,
                players: JSON.stringify(w.squads![c.id]!.map((p) => [p.id, p.attrs, p.positions])),
              },
            ]),
        );
        const year = w.year;
        if (w.calendar!.day === SEASON_END_DAY)
          for (const c of w.clubs.filter((c) => !c.representative)) {
            const limit = npcWageLimit(w, c);
            if (limit !== undefined && npcWageBill(w, c) > limit) overAtClose.add(c.id);
          }
        advanceDays(w, 1, undefined, false);
        const day = w.calendar!.day,
          dates = transferWindowDays(w.year);
        if (day === dates.summerClose || day === dates.winterClose) {
          const live = Object.values(w.squads!).flatMap((ps) => ps.map((p) => p.id));
          live.push(...(w.freeAgents ?? []).map((p) => p.id));
          expect(new Set(live).size).toBe(live.length);
          for (const c of w.clubs.filter((c) => !c.representative)) {
            const players = w.squads![c.id]!,
              state = clubRegistration(c, w.year, players);
            expect(state.total).toBeLessThanOrEqual(state.ceiling);
            expect(state.counted).toBeLessThanOrEqual(state.allowed);
            expect(players.length).toBeGreaterThanOrEqual(SQUAD_MINIMUM);
            expect(players.some((p) => p.position === 'GK')).toBe(true);
            if (day === dates.summerClose && overAtClose.has(c.id)) {
              const limit = npcWageLimit(w, c);
              expect(
                limit === undefined ||
                  npcWageBill(w, c) <= limit ||
                  players.length <= SQUAD_MINIMUM,
                `${w.year}:${c.id}:sell-down`,
              ).toBe(true);
            }
          }
          if (day === dates.summerClose) overAtClose.clear();
          const marketDays = npcMarketDays(w.year).flat();
          for (const record of Object.values(w.playerRecords ?? {}))
            for (const move of record.moves.filter((m) => m.year === w.year && BigInt(m.fee) > 0n))
              expect(marketDays).toContain(move.day);
        }
        for (const c of w.clubs.filter((c) => !c.representative)) {
          const last = before.get(c.id)!;
          if (last.strength !== c.strength)
            expect(
              JSON.stringify(w.squads![c.id]!.map((p) => [p.id, p.attrs, p.positions])),
              `${w.year}:${w.calendar?.day}:${c.id}`,
            ).not.toBe(last.players);
        }
        if (w.year !== year) {
          years.push(w.year);
          for (const place of w.history.at(-1)!.ballonDor ?? [])
            expect(w.playerRecords![place.id]!.linked).toBe(true);
          for (const [id, record] of Object.entries(w.playerRecords ?? {})) {
            const lines = record.lines ?? [];
            expect(new Set(lines.map((line) => `${line.year}:${line.club}`)).size).toBe(
              lines.length,
            );
            expect(lines.every((line) => line.appearances > 0)).toBe(true);
            if (record.retired) {
              expect(record.linked).toBe(true);
              expect(record.retired.profile.id).toBe(id);
              expect(
                Object.values(w.squads!).some((players) => players.some((p) => p.id === id)),
              ).toBe(false);
            }
          }
          firstDay(w);
          expect((w.freeAgents ?? []).length).toBeLessThanOrEqual(FREE_AGENT_CONFIG.cap);
          for (const c of w.clubs.filter((c) => !c.representative)) {
            const limit = npcWageLimit(w, c);
            if (limit !== undefined && npcWageBill(w, c) > limit) overAtClose.add(c.id);
          }
        }
      }
    } finally {
      NPC_WAGE_DECISIONS.observe = previous;
      PLAYER_MOVE_FLOW.observe = previousMove;
    }
    expect(decisions).toBeGreaterThan(0);
    expect(moves).toBeGreaterThan(0);
    expect(w.history.filter((h) => h.year < 1955).every((h) => h.ballonDor === undefined)).toBe(
      true,
    );
    expect(years).toEqual([
      1930, 1931, 1932, 1933, 1934, 1935, 1936, 1937, 1938, 1946, 1947, 1948, 1949, 1950, 1951,
      1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1966,
      1967, 1968, 1969, 1970,
    ]);
  });
});
