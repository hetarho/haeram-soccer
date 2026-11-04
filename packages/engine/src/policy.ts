import { message as sourceMessage } from '../../contracts/src/messages';
import type { ClubPolicy, PolicyKey, PolicyLevel, World } from '../../contracts/src/types';

/** Display and decision order. */
export const POLICY_KEYS: readonly PolicyKey[] = [
  'support',
  'recruitment',
  'academy',
  'localInvest',
  'globalMarketing',
  'globalScouting',
  'tour',
];

/** Absent or partial policies resolve to these values, which reproduce the pre-policy club. */
export const POLICY_DEFAULTS: ClubPolicy = Object.freeze({
  support: 3,
  recruitment: 3,
  academy: 1,
  localInvest: 1,
  globalMarketing: 1,
  globalScouting: 1,
  tour: 1,
});

export const POLICY_INFO: Record<
  PolicyKey,
  {
    label: string;
    levels: { level: PolicyLevel; name: string; summary: string }[];
  }
> = {
  support: {
    label: sourceMessage('copy.contracts.31d8ccedbf'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.policy.15540ae21f'),
        summary: sourceMessage('copy.policy.29b49c5f41'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.c2c05df7dc'),
        summary: sourceMessage('copy.policy.3d040f1fb6'),
      },
      {
        level: 3,
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.policy.b41007006a'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.dc3507d722'),
        summary: sourceMessage('copy.policy.fcd74b70d5'),
      },
      {
        level: 5,
        name: sourceMessage('copy.policy.691d996bf3'),
        summary: sourceMessage('copy.policy.135396d929'),
      },
    ],
  },
  recruitment: {
    label: sourceMessage('copy.policy.f0bb84ce59'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.policy.98593ea624'),
        summary: sourceMessage('copy.policy.4892c2a434'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.931bb98a41'),
        summary: sourceMessage('copy.policy.09ddc63a2f'),
      },
      {
        level: 3,
        name: sourceMessage('copy.stories.634269a095'),
        summary: sourceMessage('copy.policy.9927636c77'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.8d07b643d0'),
        summary: sourceMessage('copy.policy.2d821f1599'),
      },
      {
        level: 5,
        name: sourceMessage('copy.build.9fa10575b1'),
        summary: sourceMessage('copy.policy.b46e1a3d87'),
      },
    ],
  },
  academy: {
    label: sourceMessage('copy.FinancialBreakdown.d4527c802c'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.policy.a6dad7d287'),
        summary: sourceMessage('copy.policy.a6f7d65e9d'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.6790b9183c'),
        summary: sourceMessage('copy.policy.e12b579a32'),
      },
      {
        level: 3,
        name: sourceMessage('copy.policy.f287cb691a'),
        summary: sourceMessage('copy.policy.8528d27f4c'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.5065bab3b6'),
        summary: sourceMessage('copy.policy.d7722fdb57'),
      },
      {
        level: 5,
        name: sourceMessage('copy.policy.cdbcdf39fb'),
        summary: sourceMessage('copy.policy.e124210492'),
      },
    ],
  },
  localInvest: {
    label: sourceMessage('copy.policy.09f73facfb'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
        summary: sourceMessage('copy.policy.a73592d17a'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.40299543c2'),
        summary: sourceMessage('copy.policy.71d05c845c'),
      },
      {
        level: 3,
        name: sourceMessage('copy.policy.03d6f2091d'),
        summary: sourceMessage('copy.policy.89e8d38aa1'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.9bc2edc399'),
        summary: sourceMessage('copy.policy.f96393398a'),
      },
      {
        level: 5,
        name: sourceMessage('copy.policy.b2d9bc6743'),
        summary: sourceMessage('copy.policy.ca7a2f5110'),
      },
    ],
  },
  globalMarketing: {
    label: sourceMessage('copy.policy.00ca8c6d8c'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.policy.307c69c7ec'),
        summary: sourceMessage('copy.policy.dfc2657b24'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.fee992bdb8'),
        summary: sourceMessage('copy.policy.07a7a3eb10'),
      },
      {
        level: 3,
        name: sourceMessage('copy.policy.f5eaba9a1c'),
        summary: sourceMessage('copy.policy.91f27ef3a9'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.966ccd7c69'),
        summary: sourceMessage('copy.policy.8c236c9d09'),
      },
      {
        level: 5,
        name: sourceMessage('copy.policy.7fa4e41f9d'),
        summary: sourceMessage('copy.policy.3802145bfe'),
      },
    ],
  },
  globalScouting: {
    label: sourceMessage('copy.policy.652cb7e155'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
        summary: sourceMessage('copy.policy.db80c19eec'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.8c3b718161'),
        summary: sourceMessage('copy.policy.02d608340d'),
      },
      {
        level: 3,
        name: sourceMessage('copy.policy.8445ec445f'),
        summary: sourceMessage('copy.policy.76a3fc348d'),
      },
      {
        level: 4,
        name: sourceMessage('copy.policy.f153e0ac35'),
        summary: sourceMessage('copy.policy.d6703e8548'),
      },
      {
        level: 5,
        name: sourceMessage('copy.policy.da0ee66875'),
        summary: sourceMessage('copy.policy.697e18818d'),
      },
    ],
  },
  tour: {
    label: sourceMessage('copy.influences.f39e48758d'),
    levels: [
      {
        level: 1,
        name: sourceMessage('copy.policy.42fd2e05c9'),
        summary: sourceMessage('copy.policy.22b47aa075'),
      },
      {
        level: 2,
        name: sourceMessage('copy.policy.0d8cc2d53e'),
        summary: sourceMessage('copy.policy.3eb5dd5f40'),
      },
      {
        level: 3,
        name: sourceMessage('copy.policy.6c71b0d2d1'),
        summary: sourceMessage('copy.policy.4793942cdf'),
      },
    ],
  },
};

export interface PolicyEffects {
  /** Percent a player comes down from his demand in a contract talk (→CLUB-26). */
  goodwill: number;
  developmentMultiplier: number;
  /** Fatigue recovered per settled round, added to the training focus recovery. */
  recoveryBonus: number;
  /** Multiplies each round's operating expenses (운영 경비, →ECON-30); the default level's is 1. */
  operatingFactor: number;
  /** Per-round spend of the 지역 and 글로벌 investment rows in 1901 price units (→ECON-16). */
  investUnits: number;
  /** 해외 마케팅's fan growth per settled round and 주변 투자's gate demand. */
  fanGrowth: number;
  gateBoost: number;
  /** 해외 스카우트망's extra candidates and potential. */
  scoutCandidates: number;
  scoutPotential: number;
  /** The targets the rows set for 지역 기반 and 글로벌 인지도 (→ECON-34), each at most 100. */
  baseTargets: { local: number; global: number };
  /** 해외 투어: 0 none, 1 short, 2 long. */
  tour: number;
  /** Per-round academy spend in 1901 price units, and what it buys at the next intake. */
  academyUnits: number;
  academyIntake: number;
  academyPotential: number;
  academyGrowth: number;
  offer: {
    ability: [number, number];
    age: [number, number];
    potentialBonus: number;
  };
}

const SUPPORT_GOODWILL = [-5, 0, 5, 10, 15];
const SUPPORT_DEVELOPMENT = [0.8, 0.9, 1, 1.12, 1.25];
const SUPPORT_RECOVERY = [-2, -1, 0, 1, 2];
/** Squad investment is paid through the operating expenses it scales (→ECON-16). */
export const SUPPORT_EXPENSES = [0.9, 0.95, 1, 1.1, 1.2];
/** Each investment row's spend per round; spend per effect rises with each level. */
const INVEST_UNITS = [0, 1, 2.5, 4.5, 7];
const GLOBAL_FANS = [0, 0.004, 0.008, 0.013, 0.02];
const LOCAL_GATE = [0, 0.02, 0.04, 0.06, 0.08];
const SCOUT_CANDIDATES = [0, 1, 2, 3, 4];
const SCOUT_POTENTIAL = [0, 0, 1, 1, 2];
/** The base a main row aims at, and what its second row adds (→ECON-34). */
const MAIN_TARGET = [0, 20, 40, 65, 100];
const SIDE_TARGET = [0, 10, 20, 30, 45];
/** Level 1 is exactly the pre-policy academy, at no cost. */
const ACADEMY_UNITS = [0, 1, 2.5, 4.5, 7];
const ACADEMY_INTAKE = [0, 0, 1, 1, 2];
const ACADEMY_POTENTIAL = [0, 3, 5, 8, 11];
const ACADEMY_GROWTH = [1, 1.1, 1.2, 1.3, 1.45];
/** Level 3 is exactly the pre-policy transfer market. */
const OFFERS: PolicyEffects['offer'][] = [
  { ability: [35, 65], age: [17, 21], potentialBonus: 12 },
  { ability: [38, 75], age: [18, 25], potentialBonus: 6 },
  { ability: [40, 85], age: [18, 30], potentialBonus: 0 },
  { ability: [50, 88], age: [23, 31], potentialBonus: 0 },
  { ability: [60, 92], age: [26, 33], potentialBonus: 0 },
];

export function policyOf(w: World): ClubPolicy {
  const policy = { ...POLICY_DEFAULTS };
  // Only active keys enter the runtime policy; retired save fields have no effect.
  for (const key of POLICY_KEYS) {
    const saved = w.policy?.[key];
    if (saved !== undefined) policy[key] = saved;
  }
  return policy;
}

export function policyEffects(policy: ClubPolicy): PolicyEffects {
  const level = (key: PolicyKey) => (policy[key] ?? POLICY_DEFAULTS[key]) - 1;
  const support = policy.support - 1,
    academy = level('academy'),
    local = level('localInvest'),
    global = level('globalMarketing'),
    scout = level('globalScouting'),
    offer = OFFERS[policy.recruitment - 1];
  return {
    goodwill: SUPPORT_GOODWILL[support],
    developmentMultiplier: SUPPORT_DEVELOPMENT[support],
    recoveryBonus: SUPPORT_RECOVERY[support],
    operatingFactor: SUPPORT_EXPENSES[support],
    investUnits: INVEST_UNITS[local] + INVEST_UNITS[global] + INVEST_UNITS[scout],
    fanGrowth: GLOBAL_FANS[global],
    gateBoost: LOCAL_GATE[local],
    scoutCandidates: SCOUT_CANDIDATES[scout],
    scoutPotential: SCOUT_POTENTIAL[scout],
    baseTargets: {
      local: MAIN_TARGET[local],
      global: Math.min(100, MAIN_TARGET[global] + SIDE_TARGET[scout]),
    },
    tour: level('tour'),
    academyUnits: ACADEMY_UNITS[academy],
    academyIntake: ACADEMY_INTAKE[academy],
    academyPotential: ACADEMY_POTENTIAL[academy],
    academyGrowth: ACADEMY_GROWTH[academy],
    offer: {
      ability: [offer.ability[0], offer.ability[1]],
      age: [offer.age[0], offer.age[1]],
      potentialBonus: offer.potentialBonus,
    },
  };
}

/** Deterministic fans gained in one settled round from 해외 마케팅 alone. */
export function marketingFanGain(fans: number, fanGrowth: number) {
  if (fanGrowth <= 0) return 0;
  return Math.round(fans * fanGrowth * Math.max(0.2, 1 - fans / 1000000));
}
