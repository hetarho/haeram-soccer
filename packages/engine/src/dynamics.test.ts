import { afterEach, describe, expect, it } from 'vitest';
import type { Club, World } from '../../contracts/src/types';
import { EVOLUTION, evolveClubs, levelOf } from './index';
import { careerWorld } from './career.testkit';
import { MEANS_LEVEL, meansLevel, squadCostAt } from './dynamics';
import { historyWorld } from './history';
import { keepsBooks } from './books';
import { random } from './primitives';
import { npcSquad } from './world';
import { ABILITY_FIT, marketWageAt } from './market-prices';

/** A 1930 world nobody owns (→WORLD-13) whose clubs have not yet closed a season. */
const fresh = () => historyWorld('means-level-probe');
const tiersOf = (w: World) => new Map(w.clubs.map((c) => [c.id, c.tier]));
/** A closed book of `w.year` leaving `budget` for wages: income `budget + costs`, costs 1,000. */
function withBook(c: Club, year: number, budget: bigint) {
  c.books = {
    seasons: [
      {
        year,
        income: (budget + 1000n).toString(),
        wages: '0',
        costs: '1000',
        result: budget.toString(),
      },
    ],
    cash: '0',
    debt: '0',
  };
}
/** The summer's would-be strengths with the means level out of force. */
function releasedPath(w: World) {
  const copy = structuredClone(w);
  MEANS_LEVEL.inForce = false;
  evolveClubs(copy, tiersOf(copy));
  return new Map(copy.clubs.map((c) => [c.id, c.strength]));
}
/** Whether a club's summer draws a takeover (LEAGUE-10's 1.5%), read from its own stream. */
function takeoverSummer(w: World, c: Club) {
  const r = random(`${w.seed}:evolve:${w.year}:${c.id}`);
  r();
  r();
  r();
  return r() < EVOLUTION.takeover.chance;
}

describe("a club nobody owns keeps only the stars its book pays (LEAGUE-10's means level)", () => {
  // Production's value, restored after every case that switches it.
  const inForce = MEANS_LEVEL.inForce;
  afterEach(() => {
    MEANS_LEVEL.inForce = inForce;
  });
  const bookClubs = (w: World) =>
    w.clubs.filter((c) => keepsBooks(w, c) && c.project === undefined && !takeoverSummer(w, c));

  it('a club whose book pays its squad follows the released path', () => {
    const w = fresh();
    const released = releasedPath(w);
    for (const c of bookClubs(w)) withBook(c, w.year, 10n ** 15n);
    MEANS_LEVEL.inForce = true;
    evolveClubs(w, tiersOf(w));
    for (const c of w.clubs) expect(c.strength).toBe(released.get(c.id));
  });

  it('a club whose book cannot pay ends at exactly its means level', () => {
    const w = fresh();
    const released = releasedPath(w);
    const [club] = bookClubs(w)
      .filter((c) => c.tier === 0)
      .sort((a, b) => b.strength - a.strength);
    const would = released.get(club!.id)!;
    // A book paying the squad 10 points below its would-be strength, a little more than that.
    const budget = squadCostAt(w, club!, would - 10, club!.tier, w.year) + 1n;
    withBook(club!, w.year, budget);
    MEANS_LEVEL.inForce = true;
    evolveClubs(w, tiersOf(w));
    const held = club!.strength;
    expect(held).toBeLessThan(would);
    expect(held).toBeGreaterThanOrEqual(would - 10);
    expect(squadCostAt(w, club!, held, club!.tier, w.year)).toBeLessThanOrEqual(budget);
    expect(squadCostAt(w, club!, held + 1, club!.tier, w.year)).toBeGreaterThan(budget);
  });

  it('holds no club with a project, in its takeover summer or without books', () => {
    const w = fresh();
    const keeping = w.clubs.filter((c) => keepsBooks(w, c));
    const project = keeping.find((c) => !takeoverSummer(w, c))!;
    project.project = 10;
    const takeover = keeping.find((c) => c !== project && takeoverSummer(w, c))!;
    const bookless = keeping.find((c) => c !== project && c !== takeover)!;
    const released = releasedPath(w);
    for (const c of [project, takeover]) withBook(c, w.year, 0n);
    delete bookless.books;
    MEANS_LEVEL.inForce = true;
    evolveClubs(w, tiersOf(w));
    for (const c of [project, takeover, bookless]) expect(c.strength).toBe(released.get(c.id));
  });

  it('never falls as income rises nor rises as costs rise', () => {
    const w = fresh();
    const [club] = bookClubs(w).sort((a, b) => b.strength - a.strength);
    const top = squadCostAt(w, club!, 99, club!.tier, w.year);
    let last = 0;
    for (let k = 0; k <= 20; k++) {
      // Rising income at fixed costs, then the same budgets read as falling costs.
      withBook(club!, w.year, (top * BigInt(k)) / 20n);
      const level = meansLevel(w, club!, club!.tier)!;
      expect(level).toBeGreaterThanOrEqual(last);
      club!.books!.seasons[0] = {
        ...club!.books!.seasons[0]!,
        income: top.toString(),
        costs: (top - (top * BigInt(k)) / 20n).toString(),
      };
      expect(meansLevel(w, club!, club!.tier)).toBe(level);
      last = level;
    }
    expect(last).toBe(EVOLUTION.ceiling);
    delete club!.books;
    expect(meansLevel(w, club!, club!.tier)).toBeUndefined();
  });

  it('reads money added to the means as the same income in the book (T697)', () => {
    const w = fresh();
    const [club] = bookClubs(w).sort((a, b) => b.strength - a.strength);
    const top = squadCostAt(w, club!, 99, club!.tier, w.year);
    for (const k of [2, 7, 13]) {
      const budget = (top * BigInt(k)) / 20n,
        extra = top / 10n;
      withBook(club!, w.year, budget + extra);
      const counted = meansLevel(w, club!, club!.tier, 90)!;
      withBook(club!, w.year, budget);
      expect(meansLevel(w, club!, club!.tier, 90, undefined, extra)).toBe(counted);
      expect(counted).toBeGreaterThanOrEqual(meansLevel(w, club!, club!.tier, 90)!);
    }
  });

  it('with the switch off every strength equals the released path', () => {
    const w = fresh();
    const released = releasedPath(w);
    for (const c of w.clubs.filter((c) => keepsBooks(w, c))) withBook(c, w.year, 0n);
    MEANS_LEVEL.inForce = false;
    evolveClubs(w, tiersOf(w));
    for (const c of w.clubs) expect(c.strength).toBe(released.get(c.id));
  });

  it("prices a squad at its players' market wages in the tier and season asked", () => {
    const w = fresh();
    const c = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    // Another tier and season than the club's own; a strong squad low down, where ability fit
    // changes the division its players are paid on.
    const [strength, tier, year] = [84, 2, w.year + 5];
    const kept = ABILITY_FIT.inForce;
    try {
      for (const inForce of [false, true]) {
        ABILITY_FIT.inForce = inForce;
        const squad = npcSquad(w.seed, year, { ...c, strength, tier });
        expect(squadCostAt(w, c, strength, tier, year)).toBe(
          squad.reduce((sum, p) => sum + BigInt(marketWageAt(c.country, year, tier, p)), 0n),
        );
      }
    } finally {
      ABILITY_FIT.inForce = kept;
    }
  });
});

describe('clubs nobody owns', () => {
  it('can grow past any old cap through rare projects, as strong as an owner can build', () => {
    const w = careerWorld({ seed: 'superclub-probe' });
    let highest = 0,
      projects = 0;
    for (let season = 0; season < 40; season++) {
      const tiers = new Map(w.clubs.map((club) => [club.id, club.tier]));
      evolveClubs(w, tiers);
      w.year++;
      for (const club of w.clubs) {
        if (club.id === w.playerClub) continue;
        expect(club.strength).toBeLessThanOrEqual(EVOLUTION.ceiling);
        highest = Math.max(highest, club.strength);
        if (club.project) {
          projects++;
          // A project lifts the level the club drifts toward.
          expect(levelOf(w, club)).toBeGreaterThan(levelOf(w, { ...club, project: undefined }));
        }
      }
    }
    expect(highest).toBeGreaterThan(92);
    expect(projects).toBeGreaterThan(0);
  });
});
