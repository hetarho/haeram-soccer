import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { ClubPolicy, PolicyKey, PolicyLevel, World } from '../../contracts/src/types';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import { requestSchema } from '../../../apps/web/src/runtime/protocol';
import {
  advanceRound,
  clubOf,
  createWorld,
  gateProjection,
  marketingFanGain,
  operate,
  operatingCosts,
  overall,
  POLICY_DEFAULTS,
  POLICY_INFO,
  POLICY_KEYS,
  policyEffects,
  policyOf,
  policyPreview,
  ratio,
  settleRound,
  settleTraining,
  setPolicy,
  trainingSummary,
  transferOffers,
} from './index';

function world(policy?: Partial<ClubPolicy>) {
  const w = createWorld({
    country: 'ENG',
    name: 'Policy Athletic',
    color: '#2a4d3c',
    seed: 'club-policy',
    difficulty: 2,
  });
  w.cash = '999999999';
  if (policy) w.policy = { ...POLICY_DEFAULTS, ...policy };
  return w;
}

/** Young, equal players so round development and recovery are directly comparable. */
function academy(policy?: Partial<ClubPolicy>) {
  const w = world(policy);
  w.manager.youth = 60;
  // The owner sets training here; delegated staff would rest this fatigue-50 squad instead.
  w.delegation = { ...w.delegation, training: false };
  for (const player of w.players) {
    player.born = w.year - 20;
    player.potential = 85;
    player.attack = player.passing = player.defense = player.keeper = player.stamina = 40;
    player.fatigue = 50;
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

describe('club operating policy', () => {
  it('reproduces the pre-policy club exactly when absent or at the defaults', () => {
    const absent = world(),
      explicit = world({});
    expect(absent.policy).toBeUndefined();
    expect(explicit.policy).toEqual({ support: 3, recruitment: 3, marketing: 1 });
    expect(policyOf(absent)).toEqual(POLICY_DEFAULTS);
    expect(canonical(operatingCosts(explicit))).toBe(canonical(operatingCosts(absent)));
    expect(operatingCosts(absent).marketing).toBe('0');
    expect(Object.keys(operatingCosts(absent).payments)).toEqual([
      'playerWages',
      'managerWage',
      'maintenance',
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
    for (let round = 0; round < 4; round++) {
      advanceRound(absent, undefined, false);
      advanceRound(explicit, undefined, false);
    }
    expect(withoutPolicy(explicit)).toBe(withoutPolicy(absent));
    expect(absent.events.some((event) => event.detail.includes('마케팅'))).toBe(false);
  });

  it('describes three ordered decisions with five levels each and their real effects', () => {
    expect(POLICY_KEYS).toEqual(['support', 'recruitment', 'marketing']);
    for (const key of POLICY_KEYS) {
      expect(POLICY_INFO[key].label).toBeTruthy();
      expect(POLICY_INFO[key].question).toBeTruthy();
      expect(POLICY_INFO[key].levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
      for (const level of POLICY_INFO[key].levels) expect(level.summary).toBeTruthy();
    }
    const effects = policyEffects(POLICY_DEFAULTS);
    expect(effects).toMatchObject({
      wageMultiplier: 1,
      developmentMultiplier: 1,
      recoveryBonus: 0,
      marketingUnits: 0,
      fanGrowth: 0,
      gateBoost: 0,
      offer: { ability: [40, 85], age: [18, 30], potentialBonus: 0, feeMultiplier: 1 },
    });
  });

  it('pays more wages for faster development and recovery under stronger squad support', () => {
    const base = operatingCosts(world()).playerWages;
    const generous = world({ support: 5 }),
      frugal = world({ support: 1 });
    expect(operatingCosts(generous).playerWages).toBe(ratio(base, 1200n, 1000n));
    expect(operatingCosts(frugal).playerWages).toBe(ratio(base, 850n, 1000n));
    expect(BigInt(operatingCosts(generous).annual)).toBeGreaterThan(
      BigInt(operatingCosts(world()).annual),
    );
    expect(BigInt(operatingCosts(frugal).annual)).toBeLessThan(
      BigInt(operatingCosts(world()).annual),
    );

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
    expect(high.players.every((player) => player.fatigue === 40)).toBe(true);
    expect(standard.players.every((player) => player.fatigue === 42)).toBe(true);
    expect(low.players.every((player) => player.fatigue === 44)).toBe(true);
    expect(developed(high)).toBeGreaterThan(developed(standard));
    expect(developed(standard)).toBeGreaterThan(developed(low));

    const generousSeason = academy({ support: 5 }),
      frugalSeason = academy({ support: 1 });
    for (let round = 0; round < 6; round++) {
      advanceRound(generousSeason, undefined, false);
      advanceRound(frugalSeason, undefined, false);
    }
    expect(developed(generousSeason)).toBeGreaterThan(developed(frugalSeason));
    expect(fatigue(generousSeason)).toBeLessThan(fatigue(frugalSeason));
    expect(BigInt(generousSeason.expense)).toBeGreaterThan(BigInt(frugalSeason.expense));
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
    expect(canonical(signed)).toBe(canonical(offer.player));
    expect(prospects.year - signed.born).toBeLessThanOrEqual(21);
    validateWorld(prospects);
  });

  it('spends on marketing every round to grow fans and gate demand without randomness', () => {
    const loud = world({ marketing: 5 }),
      quiet = world();
    expect(operatingCosts(quiet).marketing).toBe('0');
    expect(BigInt(operatingCosts(loud).marketing)).toBeGreaterThan(0n);
    expect(BigInt(operatingCosts(loud).payments.marketing!)).toBeGreaterThan(0n);
    expect(BigInt(operatingCosts(loud).annual)).toBe(
      BigInt(operatingCosts(quiet).annual) + BigInt(operatingCosts(loud).marketing),
    );
    expect(gateProjection(loud).attendanceHigh).toBeGreaterThan(
      gateProjection(quiet).attendanceHigh,
    );

    const direct = world({ marketing: 5 });
    direct.round = 1;
    const fans = clubOf(direct).fans,
      bill = operatingCosts(direct, 1),
      cash = BigInt(direct.cash);
    settleRound(direct);
    expect(clubOf(direct).fans).toBe(fans + marketingFanGain(fans, 0.02));
    expect(marketingFanGain(fans, 0.02)).toBeGreaterThan(0);
    expect(BigInt(direct.cash)).toBe(cash - BigInt(bill.nextRound));
    expect(direct.events.at(-1)!.detail).toContain(`마케팅 ${bill.payments.marketing}`);

    for (let round = 0; round < 6; round++) {
      advanceRound(loud, undefined, false);
      advanceRound(quiet, undefined, false);
    }
    expect(clubOf(loud).fans).toBeGreaterThan(clubOf(quiet).fans);
    expect(BigInt(loud.expense)).toBeGreaterThan(BigInt(quiet.expense));
    expect(BigInt(loud.cash)).toBeLessThan(BigInt(quiet.cash));
    validateWorld(loud);
  });

  it('records a validated choice once and refuses unknown policies', () => {
    const w = world(),
      events = w.events.length,
      revision = w.revision;
    expect(() => setPolicy(w, 'scouting' as PolicyKey, 3)).toThrow('운영 방침');
    for (const level of [0, 6, 2.5, Number.NaN])
      expect(() => setPolicy(w, 'support', level as PolicyLevel)).toThrow('1–5');
    setPolicy(w, 'support', 3);
    expect(w.policy).toBeUndefined();
    expect(w.events).toHaveLength(events);

    operate(w, { type: 'policy', key: 'support', level: 5 });
    expect(w.policy).toEqual({ support: 5, recruitment: 3, marketing: 1 });
    expect(w.revision).toBe(revision + 1);
    expect(w.events.at(-1)).toMatchObject({
      kind: 'policy',
      title: `${POLICY_INFO.support.label} · ${POLICY_INFO.support.levels[4].name}`,
      detail: POLICY_INFO.support.levels[4].summary,
    });
    expect(w.events.at(-1)!.amount).toBeUndefined();
    setPolicy(w, 'support', 5);
    expect(w.events).toHaveLength(events + 1);
    setPolicy(w, 'marketing', 4);
    expect(w.policy).toEqual({ support: 5, recruitment: 3, marketing: 4 });
    expect(w.events).toHaveLength(events + 2);
  });

  it('previews the annual cost change and effects without changing the club', () => {
    const w = world(),
      before = canonical(w);
    expect(policyPreview(w, 'support', 3).annualCostChange).toBe('0');
    expect(BigInt(policyPreview(w, 'support', 5).annualCostChange)).toBeGreaterThan(0n);
    expect(BigInt(policyPreview(w, 'support', 1).annualCostChange)).toBeLessThan(0n);
    expect(policyPreview(w, 'recruitment', 5).annualCostChange).toBe('0');
    expect(policyPreview(w, 'recruitment', 1)).toMatchObject({
      offerAge: [17, 21],
      offerAbility: [35, 65],
      fansPerRound: 0,
    });
    expect(policyPreview(w, 'support', 5)).toMatchObject({
      developmentMultiplier: 1.25,
      recoveryBonus: 2,
      fansPerRound: 0,
    });
    const loud = policyPreview(w, 'marketing', 5);
    expect(loud.fansPerRound).toBe(marketingFanGain(clubOf(w).fans, 0.02));
    expect(canonical(w)).toBe(before);

    const annual = BigInt(operatingCosts(w).annual);
    operate(w, { type: 'policy', key: 'marketing', level: 5 });
    expect(BigInt(operatingCosts(w).annual) - annual).toBe(BigInt(loud.annualCostChange));
    expect(BigInt(policyPreview(w, 'marketing', 1).annualCostChange)).toBe(
      -BigInt(loud.annualCostChange),
    );
    expect(() => policyPreview(w, 'marketing', 9 as PolicyLevel)).toThrow('1–5');
  });

  it('validates, saves and transports the policy while older saves still load', async () => {
    const w = world({ support: 4, recruitment: 2, marketing: 3 });
    validateWorld(w);
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(restored.policy).toEqual({ support: 4, recruitment: 2, marketing: 3 });
    expect(canonical(restored)).toBe(canonical(w));
    const legacy = world();
    expect(Object.hasOwn((await decode(await encode(legacy, 1, 0))).world, 'policy')).toBe(false);
    for (const policy of [
      { support: 6, recruitment: 3, marketing: 1 },
      { support: 3, recruitment: 3 },
      { support: 3, recruitment: 3, marketing: 1, scouting: 2 },
      { support: 2.5, recruitment: 3, marketing: 1 },
    ])
      expect(() => validateWorld({ ...w, policy })).toThrow();
    const request = (command: unknown) =>
      requestSchema.safeParse({
        protocol: 1,
        session: 's',
        requestId: 'r',
        expectedRevision: 0,
        generation: 1,
        parentGeneration: 0,
        body: { type: 'command', command },
      }).success;
    expect(request({ type: 'policy', key: 'marketing', level: 5 })).toBe(true);
    expect(request({ type: 'policy', key: 'marketing', level: 6 })).toBe(false);
    expect(request({ type: 'policy', key: 'scouting', level: 2 })).toBe(false);
  });
});
