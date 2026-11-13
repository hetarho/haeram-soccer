import { describe, expect, it } from 'vitest';
import type { FreeAgent, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES, FREE_AGENT_CAP } from '../../contracts/src/player';
import { validateWorld } from '../../contracts/src/schema';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import { joinFreeAgents } from './free-agents';
import { careerWorld } from './career.testkit';
import { historyWorld } from './history';
import { makePlayer, refillPosition } from './world';
import { activePlayers } from './player-state';
import { compareIds } from './primitives';
import { movePerson } from './npc-continuity';
import { expireContracts, marketWage } from './contracts';
import { divisionStrength, topUpAtClose } from './season';
import { lineOf } from './player';
import { SQUAD_TARGET } from './squad-size';
import { promotionAge } from './academy';

/** A free agent of `age` rated `ability` at every attribute, free from `since`. */
function agent(
  w: World,
  id: string,
  ability: number,
  since: number,
  age = 25,
  position: Position = 'CB',
) {
  const p = makePlayer('ENG', w.seed, id, w.year, ability, position, age);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  return { ...p, freeSince: since } satisfies FreeAgent;
}
const ids = (players: readonly { id: string }[]) => players.map((p) => p.id).sort(compareIds);

describe('the founding free-agent pool', () => {
  it('holds every founding player at his club and fabricates no free agents', () => {
    const w = historyWorld('free-agents', undefined, 1950);
    expect(w.freeAgents ?? []).toEqual([]);
    expect(Object.keys(w.squads!)).toHaveLength(w.clubs.filter((c) => !c.representative).length);
  });
});

describe('our expiring player no club signs (→CLUB-28, CLUB-49)', () => {
  it('joins the pool instead of vanishing, with the same event', () => {
    const w = careerWorld({ seed: 'free-agent-expiry' }),
      [star, plain] = activePlayers(w);
    // Better than any club's strength, so no club is a suitor; the other has one.
    for (const a of ATTRIBUTES) star!.attrs[a] = 99;
    star!.until = plain!.until = w.year;
    const before = { ...star!.attrs };
    w.year++;
    expireContracts(w);
    const held = w.freeAgents!.find((p) => p.id === star!.id)!;
    expect(held.freeSince).toBe(w.year);
    for (const a of ATTRIBUTES) expect(held.attrs[a]).toBeLessThanOrEqual(before[a]);
    expect(w.freeAgents!.some((p) => p.id === plain!.id)).toBe(false);
    expect(w.people![star!.id]!.playing).toBe('released');
    expect(w.events.find((e) => e.title === `${star!.name} 계약 만료`)?.detail).toContain(
      '새 팀을 찾아 떠남',
    );
  });
});

describe("the close's top-up (→CLUB-3, CLUB-40)", () => {
  /** A career one player short of the target in the line it lacks most, the pool `pool`. */
  function short(pool: (w: World, position: Position, level: number) => FreeAgent[]) {
    const w = careerWorld({ seed: 'free-agent-top-up' });
    w.academy = { players: [] };
    const line = lineOf(refillPosition(w));
    const gone = activePlayers(w)
      .filter((p) => lineOf(p.position) === line)
      .at(-1)!;
    gone.status = 'sold';
    movePerson(w, gone, undefined, true);
    const position = refillPosition(w),
      level = Math.round(divisionStrength(w));
    expect(lineOf(position)).toBe(line);
    w.freeAgents = pool(w, position, level);
    return { w, level, gone };
  }
  const other = (position: Position): Position => (lineOf(position) === 'FW' ? 'CM' : 'ST');
  it('signs the ablest free agent of the line at most the division average, before a youngster', () => {
    const { w, level } = short((w, position, level) => [
      agent(w, 'ENG:0:0:0:p:1:900', level + 5, w.year, 25, position),
      agent(w, 'ENG:0:0:0:p:2:900', level - 2, w.year, 25, position),
      agent(w, 'ENG:0:0:0:p:3:900', level - 8, w.year, 25, position),
      agent(w, 'ENG:0:0:0:p:4:900', level, w.year, 25, other(position)),
    ]);
    topUpAtClose(w, level);
    expect(activePlayers(w)).toHaveLength(SQUAD_TARGET);
    const signed = w.players.find((p) => p.id === 'ENG:0:0:0:p:2:900')!;
    expect(signed.status).toBe('active');
    expect(signed.joined).toBe(w.year);
    expect(signed.wage).toBe(marketWage(w, signed));
    expect(signed.clauses).toBeDefined();
    expect(signed).not.toHaveProperty('freeSince');
    expect(w.people![signed.id]).toMatchObject({ playing: 'active', club: w.playerClub });
    expect(ids(w.freeAgents!)).toEqual([
      'ENG:0:0:0:p:1:900',
      'ENG:0:0:0:p:3:900',
      'ENG:0:0:0:p:4:900',
    ]);
    expect(w.events.at(-1)).toMatchObject({ kind: 'free-agent-signing' });
    expect(w.players.some((p) => p.id.includes(':youth:'))).toBe(false);
  });
  it('generates an 18-year-old only when no free agent of the line fits', () => {
    const { w, level } = short((w, position, level) => [
      agent(w, 'ENG:0:0:0:p:1:900', level + 1, w.year, 25, position),
      agent(w, 'ENG:0:0:0:p:4:900', level - 5, w.year, 25, other(position)),
    ]);
    topUpAtClose(w, level);
    expect(activePlayers(w)).toHaveLength(SQUAD_TARGET);
    expect(w.freeAgents).toHaveLength(2);
    expect(activePlayers(w).filter((p) => p.id.includes(':youth:'))).toHaveLength(1);
  });
  it("calls up a delegated youth director's prospect before any free agent", () => {
    const { w, level } = short((w, position, level) => [
      agent(w, 'ENG:0:0:0:p:2:900', level - 2, w.year, 25, position),
    ]);
    w.settings!.responsibilities.academy = 'delegated';
    const prospect = makePlayer(
      'ENG',
      w.seed,
      `${w.playerClub}:academy:df`,
      w.year,
      30,
      refillPosition(w),
      promotionAge(w),
    );
    w.academy!.players.push(prospect);
    movePerson(w, prospect, w.playerClub, true);
    topUpAtClose(w, level);
    expect(activePlayers(w).some((p) => p.id === prospect.id)).toBe(true);
    expect(w.freeAgents).toHaveLength(1);
  });
  it('keeps a former player of ours on his one row with his career', () => {
    const { w, level, gone } = short((w, position, level) => {
      const former = w.players.find((p) => p.status === 'sold')!;
      return [
        {
          ...agent(w, former.id, level - 1, w.year, 25, position),
          name: former.name,
          born: former.born,
          personality: { ...former.personality },
          qualities: former.qualities,
        },
      ];
    });
    gone.career[0] = 7;
    topUpAtClose(w, level);
    const rows = w.players.filter((p) => p.id === gone.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'active' });
    expect(rows[0]!.career[0]).toBe(7);
  });
});

describe('the saved pool', () => {
  it('validates and round-trips, bounded by the cap and without duplicates', () => {
    const w = careerWorld({ seed: 'free-agent-save' });
    const c = w.clubs.find((c) => c.id !== w.playerClub && !c.representative)!;
    joinFreeAgents(w, w.squads![c.id]![0]!, w.year);
    expect(w.freeAgents!.length).toBeGreaterThan(0);
    const loaded = validateWorld(JSON.parse(JSON.stringify(w)), LOAD_CATALOG);
    expect(loaded.freeAgents).toEqual(w.freeAgents);
    const pool = w.freeAgents!;
    expect(() =>
      validateWorld({ ...structuredClone(w), freeAgents: [pool[0], pool[0]] }, LOAD_CATALOG),
    ).toThrow();
    const over = Array.from({ length: FREE_AGENT_CAP + 1 }, (_, i) => ({
      ...pool[0]!,
      id: `over:${i}`,
    }));
    expect(() =>
      validateWorld({ ...structuredClone(w), freeAgents: over }, LOAD_CATALOG),
    ).toThrow();
    const without = structuredClone(w);
    delete without.freeAgents;
    expect(validateWorld(without, LOAD_CATALOG).freeAgents).toBeUndefined();
  });
});
