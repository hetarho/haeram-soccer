import { describe, expect, it } from 'vitest';
import type { Club, FreeAgent, Player, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES, FREE_AGENT_CAP } from '../../contracts/src/player';
import { validateWorld } from '../../contracts/src/schema';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import {
  closeFreeAgents,
  FREE_AGENT_CONFIG,
  isFreeAgent,
  joinFreeAgents,
  lettingGo,
  nationalityOf,
  refreshFreeAgents,
  seedFreeAgents,
  takeFreeAgent,
} from './free-agents';
import { historyWorld } from './history';
import { careerWorld } from './career.testkit';
import { clubPlayers, makePlayer, npcSquad, refillPosition, squad } from './world';
import { foundSquads } from './persisted-squads';
import { activePlayers, overall } from './player-state';
import { compareIds, random } from './primitives';
import { suitorFor } from './transfers';
import { openEmployment, retainPerson } from './person-careers';
import { movePerson } from './npc-continuity';
import { expireContracts, marketWage } from './contracts';
import { divisionStrength, topUpAtClose } from './season';
import { lineOf } from './player';
import { SQUAD_TARGET } from './squad-size';
import { promotionAge } from './academy';

const club = (id: string, strength: number): Club => ({
  id,
  name: id,
  short: id.slice(-2),
  country: 'ENG',
  tier: Number(id.split(':')[1]),
  group: 0,
  strength,
  reputation: 50,
  fans: 1000,
  color: '#000000',
});
/** Three clubs nobody owns on a season's first day, nothing else: the pool's rules alone. */
function small(year = 1960): World {
  return {
    seed: 'free-agents',
    year,
    round: 0,
    calendar: { day: 0 },
    playerClub: '',
    clubs: [club('ENG:0:0:0', 80), club('ENG:1:0:0', 62), club('ENG:3:0:0', 40)],
    players: [],
    events: [],
    currency: 'GBP',
  } as unknown as World;
}
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
/** The let-go rule read from a squad itself. */
function leastAble(players: readonly Player[], year: number) {
  return players
    .filter((p) => year - p.born >= FREE_AGENT_CONFIG.letGoMinAge)
    .sort((a, b) => overall(a) - overall(b) || compareIds(a.id, b.id))
    .slice(0, FREE_AGENT_CONFIG.letGoPerClub)
    .map((p) => p.id);
}
const ids = (players: readonly { id: string }[]) => players.map((p) => p.id).sort(compareIds);

describe('free agents at a world start (→CLUB-49)', () => {
  it("holds each club's two least able aged 21 or older, kept off their old squads", () => {
    const w = small();
    seedFreeAgents(w);
    expect(ids(w.freeAgents!)).toEqual(
      w.clubs.flatMap((c) => leastAble(npcSquad(w.seed, w.year, c), w.year)).sort(compareIds),
    );
    for (const p of w.freeAgents!) {
      expect(p.freeSince).toBe(w.year);
      expect(p.season.every((v) => v === 0) && p.career.every((v) => v === 0)).toBe(true);
      expect(p).not.toHaveProperty('clauses');
      expect(p).not.toHaveProperty('loanUntil');
      expect(BigInt(p.wage)).toBeGreaterThan(0n);
      expect(nationalityOf(w, p.id)).toBe('ENG');
    }
    // Nobody is in two places: the old club's generated place is someone else's this season.
    for (const c of w.clubs) {
      const players = squad(w, c);
      expect(players).toHaveLength(18);
      expect(players.some((p) => isFreeAgent(w, p.id))).toBe(false);
    }
  });
  it('starts a persisted world without free agents and holds every founding player at his club', () => {
    const w = historyWorld('free-agents', undefined, 1950);
    expect(w.freeAgents ?? []).toEqual([]);
    expect(Object.keys(w.squads!)).toHaveLength(w.clubs.filter((c) => !c.representative).length);
  });
});

describe('free agents at the close (→CLUB-49)', () => {
  it('retires one unsigned through the season and admits the let-go, free from the next', () => {
    const w = small();
    seedFreeAgents(w);
    const seeded = ids(w.freeAgents!);
    // The closing season's squads, a free agent's place held by someone else.
    const expected = w.clubs.flatMap((c) => leastAble(squad(w, c), w.year));
    closeFreeAgents(w, w.year, lettingGo(w, w.year, w.year + 1));
    expect(ids(w.freeAgents!).some((id) => seeded.includes(id))).toBe(false);
    expect(w.freeAgents!.every((p) => p.freeSince === w.year + 1)).toBe(true);
    // The let-go of the closing season come from its squads, a retirement draw aside.
    expect(ids(w.freeAgents!).every((id) => expected.includes(id))).toBe(true);
  });
  it('lets the retirement chance decide and stops everyone at 41', () => {
    const w = small(),
      old = agent(w, 'old', 60, w.year + 1, 40),
      young = agent(w, 'young', 60, w.year + 1, 25);
    closeFreeAgents(w, w.year, [old, young]);
    expect(ids(w.freeAgents!)).toEqual(['young']);
  });
  it('ages a newcomer a season without growth', () => {
    const w = small(),
      p = agent(w, 'veteran', 60, w.year + 1, 29),
      before = { ...p.attrs };
    closeFreeAgents(w, w.year, [p]);
    const after = w.freeAgents![0]!.attrs;
    // At 30 next season only pace and stamina are past their decline age (→PLAYER-17).
    for (const a of ATTRIBUTES)
      if (a === 'pace' || a === 'stamina') {
        expect(after[a]).toBeLessThanOrEqual(before[a] - 1.5);
        expect(after[a]).toBeGreaterThanOrEqual(before[a] - 2.5);
      } else expect(after[a]).toBe(before[a]);
  });
  it('keeps the ablest up to the cap; a registered newcomer left out stays at his club', () => {
    const w = small(),
      since = w.year + 1,
      strong = Array.from({ length: FREE_AGENT_CAP }, (_, i) =>
        agent(w, `cap:${String(i).padStart(3, '0')}`, 60, since),
      ),
      weak = [agent(w, 'weak:0', 30, since), agent(w, 'weak:1', 30, since)];
    const register = (p: Player) => {
      retainPerson(w, p, 'ENG:1:0:0');
      openEmployment(w, p.id, 'player', 'ENG:1:0:0');
    };
    for (const p of [weak[0]!, strong[0]!, strong.at(-1)!]) register(p);
    closeFreeAgents(w, w.year, [...weak, ...strong]);
    expect(ids(w.freeAgents!)).toEqual(ids(strong));
    expect(w.people!['weak:0']).toMatchObject({ playing: 'active', club: 'ENG:1:0:0' });
    expect(w.people!['cap:000']!.playing).toBe('released');
    // Over the cap the least able held free agent retires, the last by ID among equals.
    expect(joinFreeAgents(w, agent(w, 'newcomer', 70, since), since)).toBe(true);
    expect(w.freeAgents).toHaveLength(FREE_AGENT_CAP);
    expect(w.freeAgents!.some((p) => p.id === 'cap:199')).toBe(false);
    expect(w.people!['cap:199']!.playing).toBe('retired');
    // A newcomer less able than everyone held is left out.
    expect(joinFreeAgents(w, agent(w, 'late', 30, since), since)).toBe(false);
  });
});

describe('free agents at each refresh (→CLUB-49)', () => {
  const world = () => {
    const w = small(1950);
    foundSquads(w);
    for (const c of w.clubs)
      for (const p of [...w.squads![c.id]!].slice(0, 2)) joinFreeAgents(w, p, w.year);
    w.round = 4;
    return w;
  };
  it('lets each join a club nobody owns with the configured chance from his own stream', () => {
    const w = world(),
      before = w.freeAgents!;
    const leaving = before.filter((p) => {
      const r = random(`${w.seed}:free-agent:${p.id}:${w.year}:${w.round}`);
      return r() < FREE_AGENT_CONFIG.joinChance && suitorFor(w, p, r);
    });
    expect(leaving.length).toBeGreaterThan(0);
    const { freeAgents: _pool, people: _people, squads: _squads, ...rest } = w;
    const others = JSON.stringify(rest);
    refreshFreeAgents(w);
    expect(ids(w.freeAgents!)).toEqual(ids(before.filter((p) => !leaving.includes(p))));
    // Only the pool, actual squads and career affiliations move, from each player's own stream.
    const { freeAgents: _after, people: _peopleAfter, squads: _squadsAfter, ...restAfter } = w;
    expect(JSON.stringify(restAfter)).toBe(others);
    void [_pool, _people, _squads, _after, _peopleAfter, _squadsAfter];
    // A registered one's move is recorded and he plays for his new club.
    for (const p of leaving.filter((p) => w.people?.[p.id])) {
      const person = w.people![p.id]!;
      expect(person.playing).toBe('active');
      const club = w.clubs.find((c) => c.id === person.club)!;
      expect(clubPlayers(w, club).some((q) => q.id === p.id)).toBe(true);
    }
    for (const p of leaving) {
      const r = random(`${w.seed}:free-agent:${p.id}:${w.year}:${w.round}`);
      r();
      const destination = suitorFor(w, p, r)!;
      expect(w.squads![destination.id]!.find((q) => q.id === p.id)).toMatchObject({
        attrs: p.attrs,
        potential: p.potential,
        personality: p.personality,
      });
      expect(Object.values(w.squads!).flat().filter((q) => q.id === p.id)).toHaveLength(1);
    }
  });
  it('is the same for the same world', () => {
    const a = world(),
      b = world();
    refreshFreeAgents(a);
    refreshFreeAgents(b);
    expect(a.freeAgents).toEqual(b.freeAgents);
  });
});

describe('taking a free agent', () => {
  it('removes him from the pool without his free season and frees his old place', () => {
    const w = small();
    seedFreeAgents(w);
    const p = w.freeAgents![0]!,
      old = w.clubs.find((c) => p.id.startsWith(`${c.id}:`))!;
    expect(squad(w, old).some((q) => q.id === p.id)).toBe(false);
    const taken = takeFreeAgent(w, p.id)!;
    expect(taken).not.toHaveProperty('freeSince');
    expect(taken.id).toBe(p.id);
    expect(w.freeAgents!.some((q) => q.id === p.id)).toBe(false);
    expect(squad(w, old).some((q) => q.id === p.id)).toBe(true);
    expect(takeFreeAgent(w, p.id)).toBeUndefined();
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
