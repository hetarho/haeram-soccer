import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { ClubPolicy, World } from '../../contracts/src/types';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  advanceRound,
  clubOf,
  gateProjection,
  marketingFanGain,
  marketWage,
  moneyLabel,
  operate,
  operatingCosts,
  overall,
  POLICY_DEFAULTS,
  POLICY_INFO,
  POLICY_KEYS,
  policyEffects,
  policyOf,
  settleRound,
  settleTraining,
  SUPPORT_EXPENSES,
  trainingSummary,
  transferOffers,
  driftFans,
  baseEffects,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/** The club on the pre-feature path: club policy, not the match model, is the subject. */
function world(policy?: Partial<ClubPolicy>) {
  const w = simulatedWorld({ country: 'ENG', seed: 'club-policy' }, {}, DISABLED_RELEASE);
  w.cash = '999999999';
  if (policy) w.policy = { ...POLICY_DEFAULTS, ...policy };
  return w;
}

/** Young, equal players so round development and recovery are directly comparable. */
function academy(policy?: Partial<ClubPolicy>) {
  const w = world(policy);
  w.manager.youth = 60;
  for (const player of w.players) {
    player.born = w.year - 20;
    w.people![player.id].born = player.born;
    player.potential = 85;
    for (const a of ATTRIBUTES) player.attrs[a] = 40;
    // Tired past the assistant's 하드 line, short of his 회복 one: he trains them 균형.
    player.fatigue = 20;
    player.personality = { ...player.personality, professionalism: 3 };
    w.people![player.id].professionalism = 3;
    // Paid as the market rates them now, so nobody asks for a raise (→CLUB-26).
    player.wage = marketWage(w, player);
  }
  return w;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const developed = (w: World) => sum(w.players.map((player) => player.developed || 0));
const fatigue = (w: World) => sum(w.players.map((player) => player.fatigue));
const offerFees = (w: World) =>
  transferOffers(w)
    .slice(1)
    .reduce((total, offer) => total + BigInt(offer.fee), 0n);
const withoutPolicy = (w: World) => canonical({ ...w, policy: undefined });
/** `w` after `rounds` unobserved rounds. */
function played(w: World, rounds: number) {
  for (let round = 0; round < rounds; round++) advanceRound(w, undefined, false);
  return w;
}
/** The club without a policy, three rounds in: built once. */
const plainThree = () => cachedWorld('plain-3', () => played(world(), 3));

describe('club operating policy', () => {
  it('reproduces the pre-policy club exactly when absent or at the defaults', () => {
    const absent = world(),
      explicit = world({});
    expect(absent.policy).toBeUndefined();
    expect(explicit.policy).toEqual({
      support: 3,
      recruitment: 3,
      academy: 1,
      localInvest: 1,
      grassroots: 1,
      globalMarketing: 1,
      globalScouting: 1,
      tour: 1,
    });
    expect(policyOf(absent)).toEqual(POLICY_DEFAULTS);
    expect(canonical(operatingCosts(explicit))).toBe(canonical(operatingCosts(absent)));
    expect(operatingCosts(absent).investment).toBe('0');
    // Operating expenses are paid at every level (→ECON-30); policy spending appears only when set.
    expect(Object.keys(operatingCosts(absent).payments)).toEqual([
      'playerWages',
      'managerWage',
      'maintenance',
      'expenses',
    ]);
    expect(operatingCosts(absent).playerWages).toBe(
      sum(absent.players.map((player) => Number(player.wage))).toString(),
    );
    expect(canonical(transferOffers(explicit))).toBe(canonical(transferOffers(absent)));
    expect(canonical(gateProjection(explicit))).toBe(canonical(gateProjection(absent)));
    expect(gateProjection(absent).marketing).toBe(1);
    expect(canonical(trainingSummary(explicit))).toBe(canonical(trainingSummary(absent)));
    for (const offer of transferOffers(absent)) {
      expect(absent.year - offer.player.born).toBeGreaterThanOrEqual(18);
      expect(absent.year - offer.player.born).toBeLessThanOrEqual(30);
    }
    // Three rounds of each are built once; the fourth is played here.
    const absentPlayed = plainThree(),
      explicitPlayed = cachedWorld('defaults-3', () => played(world({}), 3));
    advanceRound(absentPlayed, undefined, false);
    advanceRound(explicitPlayed, undefined, false);
    expect(withoutPolicy(explicitPlayed)).toBe(withoutPolicy(absentPlayed));
    expect(absentPlayed.events.some((event) => event.detail.includes('마케팅'))).toBe(false);
  });

  it('describes eight ordered decisions with five levels each (the tour three) and their real effects', () => {
    expect(POLICY_KEYS).toEqual([
      'support',
      'recruitment',
      'academy',
      'localInvest',
      'grassroots',
      'globalMarketing',
      'globalScouting',
      'tour',
    ]);
    for (const key of POLICY_KEYS) {
      expect(POLICY_INFO[key].label).toBeTruthy();
      expect(POLICY_INFO[key].levels.map((level) => level.level)).toEqual(
        key === 'tour' ? [1, 2, 3] : [1, 2, 3, 4, 5],
      );
      for (const level of POLICY_INFO[key].levels) expect(level.summary).toBeTruthy();
    }
    const effects = policyEffects(POLICY_DEFAULTS);
    expect(effects).toMatchObject({
      goodwill: 5,
      developmentMultiplier: 1,
      recoveryBonus: 0,
      operatingFactor: 1,
      investUnits: 0,
      fanGrowth: 0,
      gateBoost: 0,
      grassrootsPotential: 0,
      scoutCandidates: 0,
      scoutPotential: 0,
      baseTargets: { local: 0, global: 0 },
      tour: 0,
      academyUnits: 0,
      academyIntake: 0,
      academyPotential: 0,
      academyGrowth: 1,
      offer: { ability: [40, 85], age: [18, 30], potentialBonus: 0, feeMultiplier: 1 },
    });
  });

  it('support effects carry no pay ceiling', () => {
    // The owner's talk rule caps what the staff agree in contract talks (→CLUB-26).
    for (const support of [1, 2, 3, 4, 5] as const) {
      expect(policyEffects({ ...POLICY_DEFAULTS, support })).not.toHaveProperty('payCeiling');
      expect(POLICY_INFO.support.levels[support - 1].summary).not.toContain('연봉 상한');
    }
  });

  it('the support effects table includes the operating-expense factor', () => {
    // Squad investment is paid through the operating expenses it scales (→ECON-16, ECON-30).
    expect(SUPPORT_EXPENSES).toEqual([0.9, 0.95, 1, 1.1, 1.2]);
    for (const support of [1, 2, 3, 4, 5] as const) {
      const factor = SUPPORT_EXPENSES[support - 1],
        { summary } = POLICY_INFO.support.levels[support - 1];
      expect(policyEffects({ ...POLICY_DEFAULTS, support }).operatingFactor).toBe(factor);
      expect(summary).toContain(factor === 1 ? '운영 경비 기본' : `운영 경비 ×${factor}`);
    }
    // Only squad investment moves the factor.
    for (const key of POLICY_KEYS.filter((key) => key !== 'support'))
      for (const level of [1, key === 'tour' ? 3 : 5] as const)
        expect(policyEffects({ ...POLICY_DEFAULTS, [key]: level }).operatingFactor).toBe(1);
  });

  it('raises goodwill, development and recovery under stronger squad support, never the wage bill', () => {
    expect(
      ([1, 2, 3, 4, 5] as const).map(
        (support) => policyEffects({ ...POLICY_DEFAULTS, support }).goodwill,
      ),
    ).toEqual([-5, 0, 5, 10, 15]);
    // Agreed wages are paid as signed at every level; squad investment costs operating expenses.
    const base = operatingCosts(world());
    for (const support of [1, 5] as const) {
      const costs = operatingCosts(world({ support }));
      expect(costs.playerWages).toBe(base.playerWages);
      expect(costs.payments.playerWages).toBe(base.payments.playerWages);
      expect(costs.managerWage).toBe(base.managerWage);
      expect(BigInt(costs.annual) - BigInt(costs.expenses)).toBe(
        BigInt(base.annual) - BigInt(base.expenses),
      );
    }

    const high = academy({ support: 5 }),
      standard = academy(),
      low = academy({ support: 1 });
    expect(trainingSummary(high).players[0].nextGain).toBeGreaterThan(
      trainingSummary(standard).players[0].nextGain,
    );
    expect(trainingSummary(low).players[0].nextGain).toBeLessThan(
      trainingSummary(standard).players[0].nextGain,
    );
    for (const w of [high, standard, low]) {
      w.round = 1;
      settleTraining(w);
    }
    expect(high.players.every((player) => player.fatigue === 7)).toBe(true);
    expect(standard.players.every((player) => player.fatigue === 9)).toBe(true);
    expect(low.players.every((player) => player.fatigue === 11)).toBe(true);
    expect(developed(high)).toBeGreaterThan(developed(standard));
    expect(developed(standard)).toBeGreaterThan(developed(low));

    // Five rounds of each are built once; the sixth is played here.
    const generousSeason = cachedWorld('generous-5', () => played(academy({ support: 5 }), 5)),
      frugalSeason = cachedWorld('frugal-5', () => played(academy({ support: 1 }), 5));
    advanceRound(generousSeason, undefined, false);
    advanceRound(frugalSeason, undefined, false);
    expect(developed(generousSeason)).toBeGreaterThan(developed(frugalSeason));
    expect(fatigue(generousSeason)).toBeLessThan(fatigue(frugalSeason));
    const bills = (w: World) =>
      w.events.filter((event) => event.kind === 'operating-cost').map((event) => event.amount);
    expect(bills(generousSeason)).toHaveLength(6);
    expect(bills(generousSeason)).toEqual(bills(frugalSeason));
    validateWorld(generousSeason);
  });

  it('shapes the transfer market from young prospects to ready-made veterans', () => {
    const prospects = world({ recruitment: 1 }),
      balanced = world(),
      veterans = world({ recruitment: 5 });
    const ages = (w: World) => transferOffers(w).map((offer) => w.year - offer.player.born);
    const ability = (w: World) => sum(transferOffers(w).map((offer) => overall(offer.player)));
    const headroom = (w: World) =>
      sum(transferOffers(w).map((offer) => offer.player.potential - overall(offer.player)));
    expect(Math.max(...ages(prospects))).toBeLessThanOrEqual(21);
    expect(Math.min(...ages(prospects))).toBeGreaterThanOrEqual(17);
    expect(Math.min(...ages(veterans))).toBeGreaterThanOrEqual(26);
    expect(Math.max(...ages(veterans))).toBeLessThanOrEqual(33);
    expect(sum(ages(prospects))).toBeLessThan(sum(ages(balanced)));
    expect(sum(ages(veterans))).toBeGreaterThan(sum(ages(balanced)));
    expect(ability(prospects)).toBeLessThan(ability(balanced));
    expect(ability(veterans)).toBeGreaterThan(ability(balanced));
    expect(headroom(prospects)).toBeGreaterThan(headroom(balanced));
    expect(offerFees(prospects)).toBeLessThan(offerFees(balanced));
    expect(offerFees(veterans)).toBeGreaterThan(offerFees(balanced));
    for (const w of [prospects, balanced, veterans])
      for (const offer of transferOffers(w)) {
        expect(offer.player.potential).toBeLessThanOrEqual(99);
        expect(offer.player.potential).toBeGreaterThanOrEqual(overall(offer.player));
      }

    const offer = transferOffers(prospects)[2];
    operate(prospects, { type: 'recruit', candidate: 2 });
    const signed = prospects.players.find((player) => player.id === offer.player.id)!;
    // He signs as offered, with the clauses his signing settles (→CLUB-29), starting to settle
    // at his 적응력's start (→PLAYER-11).
    expect(signed.clauses).toBeDefined();
    expect(canonical(signed)).toBe(
      canonical({
        ...offer.player,
        joined: prospects.year,
        clauses: signed.clauses,
        adaptation: signed.adaptation,
        clubRounds: 0,
      }),
    );
    expect(signed.adaptation).toBeLessThan(0.8);
    expect(prospects.year - signed.born).toBeLessThanOrEqual(21);
    validateWorld(prospects);
  });

  it('spends on 해외 마케팅 every round to grow fans without randomness', () => {
    const loud = world({ globalMarketing: 5 }),
      quiet = world();
    expect(operatingCosts(quiet).investment).toBe('0');
    expect(BigInt(operatingCosts(loud).investment)).toBeGreaterThan(0n);
    expect(BigInt(operatingCosts(loud).payments.investment!)).toBeGreaterThan(0n);
    expect(BigInt(operatingCosts(loud).annual)).toBe(
      BigInt(operatingCosts(quiet).annual) + BigInt(operatingCosts(loud).investment),
    );
    // 주변 투자 is the row that lifts home demand (→ECON-34); 해외 마케팅 does not.
    expect(gateProjection(world({ localInvest: 5 })).attendanceHigh).toBeGreaterThan(
      gateProjection(quiet).attendanceHigh,
    );

    const direct = world({ globalMarketing: 5 });
    direct.round = 1;
    const fans = clubOf(direct).fans,
      bill = operatingCosts(direct, 1),
      cash = BigInt(direct.cash);
    const income = BigInt(direct.income);
    settleRound(direct);
    const online = BigInt(direct.income) - income;
    expect(online).toBeGreaterThan(0n);
    // Marketing adds supporters before they drift toward the club's following (→ECON-23),
    // scaled by the 글로벌 인지도 the round has just built (→ECON-34).
    expect(direct.globalReach).toBeGreaterThan(0);
    expect(clubOf(direct).fans).toBe(
      driftFans(
        fans + marketingFanGain(fans, 0.02),
        clubOf(direct).reputation,
        baseEffects(direct).following,
      ),
    );
    expect(marketingFanGain(fans, 0.02)).toBeGreaterThan(0);
    expect(BigInt(direct.cash)).toBe(cash - BigInt(bill.nextRound) + online);
    expect(direct.events.findLast((event) => event.kind === 'operating-cost')!.detail).toContain(
      `지역·글로벌 투자 ${moneyLabel(direct, bill.payments.investment!)}`,
    );

    // Five rounds of each are built once; the sixth is played here.
    const loudSeason = cachedWorld('loud-5', () => played(world({ globalMarketing: 5 }), 5)),
      quietSeason = cachedWorld('quiet-5', () => played(plainThree(), 2));
    advanceRound(loudSeason, undefined, false);
    advanceRound(quietSeason, undefined, false);
    expect(clubOf(loudSeason).fans).toBeGreaterThan(clubOf(quietSeason).fans);
    expect(BigInt(loudSeason.expense)).toBeGreaterThan(BigInt(quietSeason.expense));
    expect(BigInt(loudSeason.cash)).toBeLessThan(BigInt(quietSeason.cash));
    validateWorld(loudSeason);
  });

  it('validates and saves the policy while older saves still load', async () => {
    const w = world({ support: 4, recruitment: 2, globalMarketing: 3, tour: 2 });
    validateWorld(w);
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(restored.policy).toEqual({
      ...POLICY_DEFAULTS,
      support: 4,
      recruitment: 2,
      globalMarketing: 3,
      tour: 2,
    });
    expect(canonical(restored)).toBe(canonical(w));
    const legacy = world();
    expect(Object.hasOwn((await decode(await encode(legacy, 1, 0))).world, 'policy')).toBe(false);
    for (const policy of [
      { support: 6, recruitment: 3 },
      { support: 3 },
      { support: 3, recruitment: 3, scouting: 2 },
      { support: 2.5, recruitment: 3 },
      { support: 3, recruitment: 3, academy: 6 },
      { support: 3, recruitment: 3, tour: 4 },
      { support: 3, recruitment: 3, globalScouting: 0 },
    ])
      expect(() => validateWorld({ ...w, policy })).toThrow();
  });

  it('buys bigger, better academy intakes and growth with academy investment', () => {
    const base = world(),
      elite = world({ academy: 5 });
    expect(BigInt(operatingCosts(elite).academy)).toBeGreaterThan(0n);
    expect(BigInt(operatingCosts(elite).annual)).toBe(
      BigInt(operatingCosts(base).annual) + BigInt(operatingCosts(elite).academy),
    );
    expect(policyEffects(policyOf(elite))).toMatchObject({
      academyIntake: 2,
      academyPotential: 11,
      academyGrowth: 1.45,
    });
  });
});
