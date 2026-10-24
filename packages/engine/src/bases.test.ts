import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { ClubPolicy } from '../../contracts/src/types';
import {
  academyIntakeSize,
  academyPotentialBonus,
  activePlayers,
  advanceRound,
  BASE_CONFIG,
  baseEffects,
  gateProjection,
  POLICY_DEFAULTS,
  policyEffects,
  seasonTour,
  settleBases,
  simulateSeason,
  sponsorOffers,
  stepBase,
  transferOffers,
} from './index';
import { cachedWorld, DISABLED_RELEASE, simulatedWorld } from '../../../tests/fixtures/worlds';

/** The club on the pre-feature path: its bases, not the match model, are the subject. */
function world(policy?: Partial<ClubPolicy>) {
  const w = simulatedWorld(
    {
      country: 'ENG',
      name: 'Bases Albion',
      color: '#2a4d3c',
      seed: 'club-bases',
      level: 'easy' as const,
    },
    {},
    DISABLED_RELEASE,
  );
  w.cash = '999999999';
  if (policy) w.policy = { ...POLICY_DEFAULTS, ...policy };
  return w;
}

/** The club that never invests, four rounds in. */
const fourRounds = () =>
  cachedWorld('four-rounds', () => {
    const w = world();
    for (let round = 0; round < 4; round++) advanceRound(w, undefined, false);
    return w;
  });

/** The same club at the end of its first season, before the close starts the next. */
const seasonPlayed = () =>
  cachedWorld('season-played', () => {
    const w = fourRounds();
    while (w.round < 46) advanceRound(w, undefined, false);
    return w;
  });

describe('지역 기반 and 글로벌 인지도 (→ECON-34)', () => {
  it('stays absent and neutral for a club that never invests', () => {
    const w = fourRounds();
    expect('localBase' in w).toBe(false);
    expect('globalReach' in w).toBe(false);
    expect(baseEffects(w)).toEqual({
      gate: 0,
      localSponsor: 1,
      globalSponsor: 1,
      following: 1,
      intakePotential: 0,
      intake: 0,
    });
    expect(policyEffects(POLICY_DEFAULTS).baseTargets).toEqual({ local: 0, global: 0 });
  });

  it('rises toward the targets the rows set, faster up than down, and fades without investment', () => {
    // A main row and its second row add up, never past 100.
    expect(
      policyEffects({ ...POLICY_DEFAULTS, localInvest: 3, grassroots: 2 }).baseTargets,
    ).toEqual({ local: 50, global: 0 });
    expect(
      policyEffects({ ...POLICY_DEFAULTS, globalMarketing: 5, globalScouting: 5 }).baseTargets,
    ).toEqual({ local: 0, global: 100 });
    expect(stepBase(0, 100)).toBe(100 * BASE_CONFIG.rise);
    expect(stepBase(50, 0)).toBe(50 - 50 * BASE_CONFIG.fall);
    // 지역 상생 makes the town's base grow half again as fast.
    expect(stepBase(0, 100, 1.5)).toBe(100 * BASE_CONFIG.rise * 1.5);

    const w = world({ localInvest: 5, globalMarketing: 3 });
    settleBases(w);
    expect(w.localBase).toBe(2);
    expect(w.globalReach).toBe(0.8);
    const mutual = world({ localInvest: 5 });
    mutual.build = { fans: 'mutual' };
    settleBases(mutual);
    expect(mutual.localBase).toBe(3);

    // Years of investment build the base; stopping lets it fade slowly, never below 0.
    const built = world({ localInvest: 5 });
    for (let round = 0; round < 46; round++) settleBases(built);
    expect(built.localBase).toBeGreaterThan(55);
    const peak = built.localBase!;
    built.policy = { ...POLICY_DEFAULTS };
    settleBases(built);
    expect(built.localBase).toBeLessThan(peak);
    expect(peak - built.localBase!).toBeLessThan(peak * BASE_CONFIG.rise);
    validateWorld(built);
  });

  it('lifts the gate, the sponsor offers, the following and the academy intake', () => {
    const plain = world(),
      local = world(),
      global = world();
    local.localBase = 100;
    global.globalReach = 100;
    expect(baseEffects(local)).toMatchObject({ gate: 0.1, localSponsor: 1.5 });
    expect(baseEffects(global)).toMatchObject({ globalSponsor: 1.4, following: 2 });
    expect(gateProjection(local).attendanceHigh).toBeGreaterThan(
      gateProjection(plain).attendanceHigh,
    );
    // The 지역 후원 slot follows the town; every other slot the name abroad.
    expect(BigInt(sponsorOffers(local, 'local')[0].annual)).toBeGreaterThan(
      BigInt(sponsorOffers(plain, 'local')[0].annual),
    );
    expect(sponsorOffers(local, 'kit')[0].annual).toBe(sponsorOffers(plain, 'kit')[0].annual);
    expect(BigInt(sponsorOffers(global, 'kit')[0].annual)).toBeGreaterThan(
      BigInt(sponsorOffers(plain, 'kit')[0].annual),
    );
    expect(sponsorOffers(global, 'local')[0].annual).toBe(sponsorOffers(plain, 'local')[0].annual);
    // The academy draws on a base only through the youth card that looks to it.
    expect(academyPotentialBonus(local)).toBe(academyPotentialBonus(plain));
    local.build = { youth: 'homegrown' };
    plain.build = { youth: 'homegrown' };
    expect(baseEffects(local)).toMatchObject({ intakePotential: 4, intake: 1 });
    expect(academyIntakeSize(local)).toBe(academyIntakeSize(plain) + 1);
    expect(academyPotentialBonus(local)).toBe(academyPotentialBonus(plain) + 4);
    global.build = { youth: 'worldwide' };
    expect(baseEffects(global)).toMatchObject({ intakePotential: 3, intake: 0 });
    // 풀뿌리 유망주 투자 adds its own potential while paid.
    const grass = world({ grassroots: 5 });
    expect(academyPotentialBonus(grass)).toBe(academyPotentialBonus(world()) + 4);
  });

  it('widens and lifts the transfer list through 해외 스카우트망', () => {
    const plain = transferOffers(world()),
      scouted = transferOffers(world({ globalScouting: 5 }));
    expect(scouted).toHaveLength(plain.length + 4);
    expect(canonical(transferOffers(world({ globalScouting: 1 })))).toBe(canonical(plain));
  });

  it('pays a summer tour as the season starts, spreads the name and tires the rested squad', () => {
    // The tour is the policy's as the close starts the next season: set for the close here.
    const w = seasonPlayed();
    w.policy = { ...POLICY_DEFAULTS, tour: 3 };
    expect(() => seasonTour(world())).not.toThrow();
    simulateSeason(w);
    const tour = w.events.find((event) => event.kind === 'tour')!;
    expect(tour.title).toBe('긴 해외 투어');
    expect(BigInt(tour.amount!)).toBeGreaterThan(0n);
    expect(w.globalReach).toBeGreaterThanOrEqual(BASE_CONFIG.tourReach[2]);
    for (const player of activePlayers(w)) expect(player.fatigue).toBe(BASE_CONFIG.tourFatigue[2]);
    // No tour, no event, no fatigue.
    const home = seasonPlayed();
    simulateSeason(home);
    expect(home.events.some((event) => event.kind === 'tour')).toBe(false);
    expect(activePlayers(home).every((player) => player.fatigue === 0)).toBe(true);
    validateWorld(w);
  });
});
