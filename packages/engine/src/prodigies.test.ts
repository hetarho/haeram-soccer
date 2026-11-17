import { describe, expect, it } from 'vitest';
import type { Player, World } from '../../contracts/src/types';
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { drawProdigies, PRODIGY, prodigyGrowth, prodigyWeight } from './prodigies';
import { developAnnually, settlePlayerGrowth } from './training';
import { ACADEMY_LIMIT, ageGroupOf, seasonAcademy } from './academy';
import { lineOf, mainOvr } from './player';
import { overall } from './player-state';
import { closeNpcSummer, intakeNpcYouth, NPC_YOUTH } from './npc-careers';
import { crossWar } from './wartime';
import { divisionLevel, LINE_MINIMUM, NPC_SQUAD } from './world';
import { TRAINING_GROUND, trainingGroundTerms } from './facility-model';
import { random } from './primitives';

/** Two playable clubs (ours and one nobody owns) and a representative one; no world generation. */
function fixture() {
  const w = worldMarketFixture();
  w.clubs[2]!.representative = true;
  foundSquads(w);
  return w;
}

/** The same clubs before anyone owns one: ours too is a squad nobody owns. */
function ownerless() {
  const w = worldMarketFixture();
  w.clubs[2]!.representative = true;
  w.playerClub = '';
  w.players = [];
  foundSquads(w);
  return w;
}

/** How many prodigies `year`'s draw asks for (its stream's first number, →WORLD-18). */
function drawnCount(w: World, year: number) {
  return random(`${w.seed}:prodigy:${year}`)() < PRODIGY.twoChance ? 2 : 1;
}

/** A prodigy drawn into our academy, aged 14 in `year`: the other club stands at its 40-player
 * ceiling (→CLUB-44) for the draw, then back at its size. */
function academyProdigy(w: World, year: number) {
  const players = w.squads!.foreign!,
    size = players.length;
  while (players.length < 40) players.push({ ...players[0]!, id: `filler-${players.length}` });
  const [p] = drawProdigies(w, year);
  players.length = size;
  expect(p!.id.startsWith('own:academy:')).toBe(true);
  return p!;
}

/** Each summer's prodigies over `summers` seasons, taken out again so every summer has room. */
function summers(w: World, from: number, count: number) {
  const out: { year: number; drawn: Player[] }[] = [];
  for (let year = from; year < from + count; year++) {
    w.year = year - 1;
    const drawn = drawProdigies(w, year);
    out.push({ year, drawn: drawn.map((p) => structuredClone(p)) });
    for (const id of Object.keys(w.squads ?? {}))
      w.squads![id] = w.squads![id]!.filter((p) => !p.prodigy);
    w.academy = { players: [] };
  }
  return out;
}

describe('prodigies (→WORLD-18)', () => {
  it('draws one or two a summer, about 1.5, aged 14 at OVR 57–63 and potential 88–96', () => {
    const drawn = summers(fixture(), 1931, 400);
    const counts = drawn.map((s) => s.drawn.length);
    expect(counts.every((n) => n === 1 || n === 2)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeCloseTo(1.5, 1);
    for (const { year, drawn: players } of drawn)
      for (const p of players) {
        expect(year - p.born).toBe(PRODIGY.age);
        expect(overall(p)).toBeGreaterThanOrEqual(PRODIGY.ovr[0]);
        expect(overall(p)).toBeLessThanOrEqual(PRODIGY.ovr[1]);
        expect(p.potential).toBeGreaterThanOrEqual(PRODIGY.potential[0]);
        expect(p.potential).toBeLessThanOrEqual(PRODIGY.potential[1]);
        expect(p.prodigy).toBe(true);
        // Never for a representative club (→WORLD-1).
        expect(p.id.startsWith('representative:')).toBe(false);
      }
  });

  it('places by academy level and stature, higher-level clubs more often', () => {
    expect(prodigyWeight(0, 0)).toBe(1);
    expect(prodigyWeight(5, 0)).toBe(6);
    expect(prodigyWeight(2, 13)).toBeCloseTo(3 * 2.3);
    expect(prodigyWeight(2, -5)).toBe(3);
    const w = fixture();
    w.academyFacility = 0;
    w.clubs.find((c) => c.id === 'foreign')!.levels!.academy = 5;
    const placed = summers(w, 1931, 300).flatMap((s) => s.drawn);
    const share = placed.filter((p) => p.id.startsWith('foreign:')).length / placed.length;
    // Weights 6 (foreign, academy 5) against 1 (ours, academy 0): about 6/7.
    expect(share).toBeGreaterThan(0.78);
    expect(share).toBeLessThan(0.93);
  });

  it("joins the owner's academy in its youngest group, a club nobody owns as a squad player", () => {
    const w = fixture();
    w.clubs.find((c) => c.id === 'foreign')!.levels!.academy = 0;
    let own: Player | undefined, npc: Player | undefined;
    for (let year = 1931; year < 1990 && !(own && npc); year++) {
      w.year = year - 1;
      for (const p of drawProdigies(w, year)) {
        if (p.id.startsWith('own:')) own ??= p;
        else npc ??= p;
      }
    }
    expect(own && w.academy!.players.includes(own)).toBe(true);
    expect(own!.wage).toBe('0');
    expect(ageGroupOf({ year: own!.born + PRODIGY.age }, own!)).toBe('u17');
    expect(w.players.some((p) => p.id === own!.id)).toBe(false);
    expect(npc && w.squads!.foreign!.includes(npc)).toBe(true);
    expect(npc!.graduate).toBe(true);
  });
  it("never takes a club past its league's counted-player limit (→CLUB-44)", () => {
    // Italy's third tier from 2020 counts every player up to 24, with no youth exemption.
    const w = fixture();
    const c = w.clubs.find((club) => club.id === 'foreign')!;
    c.country = 'ITA';
    c.tier = 2;
    c.levels!.academy = 5;
    w.academyFacility = 0;
    const players = w.squads![c.id]!;
    while (players.length < 24) players.push({ ...players[0]!, id: `filler-${players.length}` });
    for (let year = 2021; year < 2061; year++) {
      w.year = year - 1;
      for (const p of drawProdigies(w, year)) expect(p.id.startsWith('own:')).toBe(true);
      w.academy = { players: [] };
    }
    expect(players).toHaveLength(24);
    // One place left takes at most one of a summer's two, the other going elsewhere.
    players.pop();
    for (let year = 2021; year < 2061; year++) {
      w.year = year - 1;
      drawProdigies(w, year);
      expect(players.length).toBeLessThanOrEqual(24);
      for (let k = players.length - 1; k >= 0; k--) if (players[k]!.prodigy) players.splice(k, 1);
      w.academy = { players: [] };
    }
  });
});

describe("a prodigy's growth (→PLAYER-15)", () => {
  const context = {
    youth: 50,
    ground: TRAINING_GROUND[2]!.growth,
    focus: 'balanced' as const,
    adaptation: 0.8,
  };
  const twins = () => {
    const [p] = summers(fixture(), 1931, 1)[0]!.drawn;
    const plain = structuredClone(p!);
    delete plain.prodigy;
    return [p!, plain] as const;
  };

  it('is three times the rate and the season limit until 18, and normal after', () => {
    expect(prodigyGrowth({ prodigy: true }, 17)).toBe(PRODIGY.growth);
    expect(prodigyGrowth({ prodigy: true }, 18)).toBe(1);
    expect(prodigyGrowth({}, 15)).toBe(1);
    const [p, plain] = twins();
    const before = mainOvr(p);
    settlePlayerGrowth(p, { ...context, age: 15 }, 1);
    settlePlayerGrowth(plain, { ...context, age: 15 }, 1);
    expect(mainOvr(p) - before).toBeCloseTo(3 * (mainOvr(plain) - before), 1);
    const [q, plainQ] = twins();
    settlePlayerGrowth(q, { ...context, age: 18 }, 4);
    settlePlayerGrowth(plainQ, { ...context, age: 18 }, 4);
    expect(q.attrs).toEqual(plainQ.attrs);
  });

  it('takes three times the season limit at the close', () => {
    const [p, plain] = twins();
    const w = fixture();
    const before = mainOvr(p),
      at = p.born + 15;
    const close = {
      year: at,
      youth: 50,
      ground: TRAINING_GROUND[2]!.growth,
      adaptation: 0.8,
      report: false,
    };
    developAnnually(w, p, close);
    developAnnually(w, plain, close);
    // The gap of about 30 asks for more than the limit of 3, so the prodigy takes up to 9.
    expect(mainOvr(p) - before).toBeGreaterThan(6);
    expect(mainOvr(plain) - before).toBeLessThan(3.6);
  });

  it('passes 80 by 16 in a clear share of cases (a 3-season run of the growth rule)', () => {
    const w = fixture();
    const players = summers(fixture(), 1931, 60).flatMap((s) => s.drawn);
    expect(players.length).toBeGreaterThanOrEqual(50);
    let reached = 0;
    for (const p of players) {
      let best = 0;
      for (let age = PRODIGY.age; age < PRODIGY.age + 3; age++) {
        settlePlayerGrowth(p, { ...context, age }, 38);
        if (age <= 16) best = Math.max(best, mainOvr(p));
        developAnnually(w, p, { ...context, year: p.born + age + 1, report: false });
        if (age + 1 <= 16) best = Math.max(best, mainOvr(p));
      }
      if (best >= 80) reached++;
    }
    // Measured 55 of 88 (62.5%) when written.
    expect(reached / players.length).toBeGreaterThan(0.4);
  });
});

describe('a war-gap summer (→WORLD-14/16)', () => {
  it('takes youth only to the standing size, its lines and a goalkeeper', () => {
    const w = fixture();
    const c = w.clubs.find((club) => club.id === 'foreign')!;
    const players = w.squads![c.id]!;
    expect(players.length).toBe(NPC_SQUAD.size);
    intakeNpcYouth(w, c, w.year + 1, undefined, true);
    expect(players.length).toBe(NPC_SQUAD.size);
    players.splice(0, 3);
    intakeNpcYouth(w, c, w.year + 1, undefined, true);
    expect(players.length).toBe(NPC_SQUAD.size);
    for (const line of Object.keys(LINE_MINIMUM) as (keyof typeof LINE_MINIMUM)[])
      expect(players.filter((p) => lineOf(p.position) === line).length).toBeGreaterThanOrEqual(
        LINE_MINIMUM[line],
      );
    // War refills come ready to play, just under the division's level (→WORLD-16).
    const refills = players.filter((p) => p.id.includes(`:y:${w.year + 1}:`));
    expect(refills).toHaveLength(3);
    for (const p of refills)
      expect(mainOvr(p)).toBeCloseTo(divisionLevel(c.tier) - NPC_YOUTH.warRefill.below, 1);
    // A played summer still takes the academy's count on top.
    intakeNpcYouth(w, c, w.year + 2);
    expect(players.length).toBe(NPC_SQUAD.size + NPC_YOUTH.byAcademy[c.levels!.academy]!.count);
  });
});

describe("a war-gap summer's prodigies (→WORLD-14/16/18)", () => {
  it('join a squad at or above its standing size too; only a full registration or academy excludes', () => {
    const w = fixture();
    // A placement reorders the squad into a new list (→CLUB-6), so it is read again each time.
    const squad = () => w.squads!.foreign!;
    expect(squad()).toHaveLength(NPC_SQUAD.size);
    // Our academy is full, so every war summer's prodigies join the other club's full squad.
    w.academy = {
      players: Array.from({ length: ACADEMY_LIMIT }, (_, i) => ({
        ...structuredClone(squad()[0]!),
        id: `own:academy:filler:${i}`,
      })),
    };
    for (let year = 1940; year < 1946; year++) {
      w.year = year - 1;
      const drawn = drawProdigies(w, year);
      expect(drawn).toHaveLength(drawnCount(w, year));
      for (const p of drawn) expect(squad()).toContain(p);
    }
    expect(squad().length).toBeGreaterThan(NPC_SQUAD.size);
    // At the 40-player ceiling (→CLUB-44) the other club is left out too, and nobody takes one.
    const players = squad();
    while (players.length < 40) players.push({ ...players[0]!, id: `filler-${players.length}` });
    w.year = 1945;
    expect(drawProdigies(w, 1946)).toEqual([]);
    expect(squad()).toHaveLength(40);
  });

  it('are placed every summer in a world nobody owns whose squads stand at their size', () => {
    const w = ownerless();
    for (const players of Object.values(w.squads!)) expect(players).toHaveLength(NPC_SQUAD.size);
    const summer = (year: number, matches: boolean) => {
      const before = Object.fromEntries(
        Object.entries(w.squads!).map(([id, players]) => [id, players.length]),
      );
      w.year = year;
      closeNpcSummer(w, undefined, matches);
      let placed = 0;
      for (const [id, players] of Object.entries(w.squads!)) {
        const drawn = players.filter((p) => p.prodigy && p.born === year + 1 - PRODIGY.age).length;
        placed += drawn;
        expect(players.length).toBeGreaterThanOrEqual(NPC_SQUAD.size);
        // A skipped summer's youth only refill the standing size; its prodigies come on top.
        if (!matches)
          expect(players.length - drawn).toBeLessThanOrEqual(Math.max(NPC_SQUAD.size, before[id]!));
      }
      expect(placed).toBe(drawnCount(w, year + 1));
    };
    for (let year = 1939; year < 1946; year++) summer(year, false);
    summer(1946, true);
  });

  it("never take a club at its league's counted limit in a world nobody owns (→CLUB-44)", () => {
    // Italy's third tier from 2020 counts every player up to 24, with no youth exemption.
    const w = ownerless();
    const c = w.clubs.find((club) => club.id === 'foreign')!;
    c.country = 'ITA';
    c.tier = 2;
    c.levels!.academy = 5;
    const players = w.squads![c.id]!;
    while (players.length < 24) players.push({ ...players[0]!, id: `filler-${players.length}` });
    for (let year = 2021; year < 2061; year++) {
      w.year = year - 1;
      const drawn = drawProdigies(w, year);
      expect(drawn).toHaveLength(drawnCount(w, year));
      for (const p of drawn) expect(w.squads!.own).toContain(p);
      // Taken out again, so the other club always has room.
      w.squads!.own = w.squads!.own!.filter((p) => !p.prodigy);
    }
    expect(w.squads!.foreign).toHaveLength(24);
  });
});

describe("a skipped season's development (→WORLD-14, PLAYER-15)", () => {
  /** His OVR after one skipped summer at `age` in it, and his plain twin's under the same draws. */
  function squadSummer(age: number) {
    const w = ownerless();
    w.year = 1939;
    const [p] = drawProdigies(w, 1939);
    p!.born = 1939 - age;
    const twin = structuredClone(w);
    const plain = Object.values(twin.squads!)
      .flat()
      .find((q) => q.id === p!.id)!;
    delete plain.prodigy;
    closeNpcSummer(w, undefined, false);
    closeNpcSummer(twin, undefined, false);
    return [p!, plain] as const;
  }

  it('grows a squad prodigy ×3 in a season he is 17 in, normally in one he is 18 in', () => {
    const [young, youngPlain] = squadSummer(17);
    expect(mainOvr(young) - mainOvr(youngPlain)).toBeGreaterThan(1);
    const [grown, grownPlain] = squadSummer(18);
    expect(grown.attrs).toEqual(grownPlain.attrs);
  });

  it("grows a prodigy in the owner's academy ×3 in a season he is 17 in, normally at 18", () => {
    for (const age of [17, 18]) {
      const w = fixture();
      w.year = 1938;
      const p = academyProdigy(w, 1939);
      p.born = 1939 - age;
      // The development he would take without the rule: the same draws, read as anyone's.
      const plain = structuredClone(p);
      delete plain.prodigy;
      developAnnually(structuredClone(w), plain, {
        year: 1940,
        youth: w.manager.youth,
        ground: trainingGroundTerms(w).growth,
        adaptation: p.adaptation,
        report: false,
      });
      // One skipped season, 1939/40.
      w.year = 1940;
      crossWar(w, 1938);
      expect(w.academy!.players).toContain(p);
      if (age === 17) expect(mainOvr(p) - mainOvr(plain)).toBeGreaterThan(1);
      else expect(p.attrs).toEqual(plain.attrs);
    }
  });
});

describe("the owner's academy across the war gap (→WORLD-14)", () => {
  it('develops a prodigy each skipped summer and keeps him through the restart season', () => {
    const w = fixture();
    // Aged 14 in 1938/39, the last season played before the war.
    w.year = 1937;
    const p = academyProdigy(w, 1938);
    expect(w.academy!.players).toEqual([p]);
    const before = mainOvr(p);
    w.year = 1946;
    crossWar(w, 1938);
    expect(w.academy!.players).toContain(p);
    expect(mainOvr(p) - before).toBeGreaterThan(15);
    // Aged 22 at the restart, he stays its season for the club to promote (→CLUB-16).
    seasonAcademy(w);
    expect(w.academy!.players).toContain(p);
    w.year = 1947;
    seasonAcademy(w);
    expect(w.academy!.players).not.toContain(p);
  });
});
