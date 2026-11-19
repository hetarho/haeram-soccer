import { describe, expect, it } from 'vitest';
import { message } from '../../contracts/src/messages';
import type { EuropeTournament, FreeAgent, World } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';
import {
  ambitionWeight,
  TERMS_FACTORS,
  termsAnswer,
  termsChance,
  termsContext,
  WAGE_STEPS,
  type TermsContext,
} from './personal-terms';
import { clubOf, overall } from './player-state';
import type { AnswerFactor } from './sale-answer';
import { startingSquad } from './world';

/** A neutral player: same division and reputation, no Europe, no change of playing time. */
function ctx(over: Partial<TermsContext> = {}): TermsContext {
  return {
    demand: '100000',
    offer: '100000',
    divisionsBelow: 0,
    ourReputation: 50,
    hisReputation: 50,
    ambition: 3,
    age: 26,
    hisEurope: false,
    wouldStart: false,
    startsNow: false,
    freeAgent: false,
    loyalty: 0,
    ...over,
  };
}
const chance = (over: Partial<TermsContext>) => termsChance(ctx(over)).chance;
const offered = (ratio: number) => ({ offer: String(Math.round(100000 * ratio)) });

describe('personal terms (→CLUB-53)', () => {
  it('starts at σ(1.5) and rises with each wage step, saturating beyond 2.5×', () => {
    expect(chance({})).toBeCloseTo(1 / (1 + Math.exp(-1.5)), 10);
    const steps = WAGE_STEPS.map((step) => chance(offered(step)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    expect(chance(offered(2.5))).toBeGreaterThan(chance(offered(2)));
    expect(chance(offered(3))).toBe(chance(offered(2.5)));
    expect(chance(offered(0.8))).toBeLessThan(chance({}));
    expect(termsChance(ctx(offered(0.8))).logOdds).toBeCloseTo(1.5 + 3 * Math.log(0.8), 2);
  });

  it('falls with each division below and a lower reputation, scaled by his ambition', () => {
    const base = chance({});
    const one = chance({ divisionsBelow: 1 }),
      two = chance({ divisionsBelow: 2 });
    expect(one).toBeLessThan(base);
    expect(two).toBeLessThan(one);
    expect(chance({ divisionsBelow: 1, ambition: 5 })).toBeLessThan(
      chance({ divisionsBelow: 1, ambition: 1 }),
    );
    expect(chance({ hisReputation: 70 })).toBeLessThan(base);
    expect(chance({ hisReputation: 30 })).toBeGreaterThan(base);
    expect(chance({ hisReputation: 70, ambition: 5 })).toBeLessThan(
      chance({ hisReputation: 70, ambition: 1 }),
    );
    expect(ambitionWeight(5, 31)).toBe(0.75);
    expect(ambitionWeight(1, 30)).toBe(0.6);
    expect(termsChance(ctx({ divisionsBelow: 1, ambition: 5, age: 31 })).logOdds).toBeCloseTo(
      1.5 - 1.2 * 0.75,
      2,
    );
  });

  it('weighs this season’s European entries and leaving Europe', () => {
    const europe = (level: 'ucl' | 'cwc' | 'uel' | 'uecl') => ({
      ourEurope: { level, name: level },
    });
    const none = chance({});
    expect(chance(europe('ucl'))).toBeGreaterThan(chance(europe('uel')));
    expect(chance(europe('uel'))).toBe(chance(europe('cwc')));
    expect(chance(europe('uel'))).toBeGreaterThan(chance(europe('uecl')));
    expect(chance(europe('uecl'))).toBeGreaterThan(none);
    expect(chance({ hisEurope: true })).toBeLessThan(none);
    expect(chance({ hisEurope: true, ...europe('uecl') })).toBe(chance(europe('uecl')));
  });

  it('weighs playing time and a free agent', () => {
    const none = chance({});
    expect(chance({ wouldStart: true })).toBeGreaterThan(none);
    expect(chance({ wouldStart: true, startsNow: true })).toBe(chance({ wouldStart: true }));
    expect(chance({ startsNow: true })).toBeLessThan(none);
    expect(termsChance(ctx({ startsNow: true })).logOdds).toBeCloseTo(0.6, 2);
    expect(chance({ freeAgent: true, hisReputation: undefined })).toBeGreaterThan(none);
  });

  it('gives the same answer for the same draw, agreeing below his chance', () => {
    const c = ctx({ divisionsBelow: 1 }),
      { chance: p } = termsChance(c);
    for (const u of [0, 0.1, p - 1e-9, p, p + 1e-9, 0.99]) {
      expect(termsAnswer(c, u)).toEqual(termsAnswer(c, u));
      expect(termsAnswer(c, u).accept).toBe(u < p);
    }
  });

  it('plugs in a test-only factor without caller changes', () => {
    const prestige: AnswerFactor<TermsContext> = {
      id: 'prestige',
      read: () => ({
        factor: 'prestige',
        delta: 0.5,
        message: 'market.terms.freeAgent',
        params: {},
      }),
    };
    const c = ctx({ divisionsBelow: 2 });
    const before = termsChance(c),
      after = termsChance(c, [...TERMS_FACTORS, prestige]);
    expect(after.logOdds).toBeCloseTo(before.logOdds + 0.5, 2);
    expect(after.lines.at(-1)!.factor).toBe('prestige');
    expect(termsAnswer(c, 0.5, [...TERMS_FACTORS, prestige]).chance).toBe(after.chance);
  });

  it('names every factor with a message whose parameters it supplies', () => {
    const lines = [
      ctx({
        ...offered(0.8),
        divisionsBelow: 1,
        loyalty: 2,
        hisReputation: 70,
        hisEurope: true,
        startsNow: true,
      }),
      ctx({ ...offered(2), ourEurope: { level: 'ucl', name: 'European Cup' }, wouldStart: true }),
      ctx({ freeAgent: true, hisReputation: undefined, divisionsBelow: 1 }),
    ].flatMap((c) => termsChance(c).lines);
    expect(new Set(lines.map((l) => l.factor))).toEqual(new Set(TERMS_FACTORS.map((f) => f.id)));
    for (const l of lines) expect(message(l.message, l.params)).not.toMatch(/\{/);
  });
});

describe('termsContext reads our terms from a world', () => {
  const base = careerWorld({ seed: 'answer-models' });
  const seller = base.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
  const xi = startingSquad(base, seller),
    star = xi[0]!,
    bench = base.squads![seller.id]!.find((p) => !xi.includes(p))!;
  const tournament = (key: string, name: string, clubs: string[]): EuropeTournament => ({
    key,
    name,
    field: clubs.length,
    format: 'knockout',
    games: 2,
    stage: 'r1',
    clubs,
    fixtures: [],
    standings: {},
  });
  const withEurope = (w: World, europe: EuropeTournament[]): World => ({ ...w, europe });

  it('reads the demand, our step and the division and reputation gaps', () => {
    const c = termsContext(base, { playerId: star.id, clubId: seller.id, step: 1.5 })!;
    expect(BigInt(c.demand)).toBeGreaterThan(0n);
    expect(BigInt(c.offer)).toBe((BigInt(c.demand) * 3n) / 2n);
    expect(c.divisionsBelow).toBe(clubOf(base).tier - seller.tier);
    expect(c.hisReputation).toBe(seller.reputation);
    expect(c.ambition).toBe(star.personality.ambition);
    expect(c.freeAgent).toBe(false);
  });

  it('reads this season’s European entries of both clubs', () => {
    const plain = termsContext(base, { playerId: star.id, clubId: seller.id, step: 1 })!;
    expect(plain.ourEurope).toBeUndefined();
    expect(plain.hisEurope).toBe(false);
    const leaving = termsContext(
      withEurope(base, [tournament('ucl', 'European Cup', [seller.id])]),
      { playerId: star.id, clubId: seller.id, step: 1 },
    )!;
    expect(leaving.hisEurope).toBe(true);
    expect(termsChance(leaving).lines.some((l) => l.factor === 'leavingEurope')).toBe(true);
    const ours = termsContext(
      withEurope(base, [
        tournament('uecl', 'Conference League', [base.playerClub]),
        tournament('uel', 'UEFA Cup', [base.playerClub, seller.id]),
      ]),
      { playerId: star.id, clubId: seller.id, step: 1 },
    )!;
    expect(ours.ourEurope).toEqual({ level: 'uel', name: 'UEFA Cup' });
    expect(termsChance(ours).lines.some((l) => l.factor === 'leavingEurope')).toBe(false);
  });

  it('reads whether he would start for us and starts now', () => {
    const starter = termsContext(base, { playerId: star.id, clubId: seller.id, step: 1 })!;
    expect(starter.startsNow).toBe(true);
    expect(starter.wouldStart).toBe(true);
    const reserve = termsContext(base, { playerId: bench.id, clubId: seller.id, step: 1 })!;
    expect(reserve.startsNow).toBe(false);
    const weak = structuredClone(bench);
    for (const key of Object.keys(weak.attrs) as (keyof typeof weak.attrs)[]) weak.attrs[key] = 5;
    const w = {
      ...base,
      squads: {
        ...base.squads,
        [seller.id]: [...base.squads![seller.id]!.filter((p) => p !== bench), weak],
      },
    };
    expect(overall(weak)).toBeLessThan(20);
    expect(termsContext(w, { playerId: weak.id, clubId: seller.id, step: 1 })!.wouldStart).toBe(
      false,
    );
  });

  it('reads a free agent against the division his ability suits', () => {
    const agent: FreeAgent = {
      ...structuredClone(star),
      id: 'free:answer-models',
      freeSince: base.year,
    };
    const w = { ...base, freeAgents: [agent] };
    const c = termsContext(w, { playerId: agent.id, step: 1 })!;
    expect(c.freeAgent).toBe(true);
    expect(c.hisReputation).toBeUndefined();
    expect(c.startsNow).toBe(false);
    expect(c.divisionsBelow).toBeGreaterThan(0);
    expect(termsChance(c).lines.map((l) => l.message)).toContain('market.terms.division.suited');
  });

  it('is undefined for a player the club does not hold', () => {
    expect(termsContext(base, { playerId: 'nobody', clubId: seller.id, step: 1 })).toBeUndefined();
  });
});
