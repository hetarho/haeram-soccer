import type { ClubPolicy, PolicyKey, PolicyLevel, World } from '../../contracts/src/types';
import { operatingCosts } from './finance';
import { addEvent, clubOf } from './world';

/** Display and decision order. */
export const POLICY_KEYS: readonly PolicyKey[] = [
  'support',
  'recruitment',
  'academy',
  'localInvest',
  'grassroots',
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
  grassroots: 1,
  globalMarketing: 1,
  globalScouting: 1,
  tour: 1,
});

export const POLICY_INFO: Record<
  PolicyKey,
  {
    label: string;
    question: string;
    levels: { level: PolicyLevel; name: string; summary: string }[];
  }
> = {
  support: {
    label: '선수단 투자',
    question: '훈련·의료 환경과 협상에서의 선수 대우에 얼마나 쓸까요?',
    levels: [
      {
        level: 1,
        name: '긴축',
        summary: '협상 호감 −5% · 라운드 성장 ×0.8 · 피로 회복 −2 · 운영 경비 ×0.9',
      },
      {
        level: 2,
        name: '절약',
        summary: '협상 호감 0% · 라운드 성장 ×0.9 · 피로 회복 −1 · 운영 경비 ×0.95',
      },
      {
        level: 3,
        name: '표준',
        summary: '협상 호감 +5% · 라운드 성장·피로 회복·운영 경비 기본',
      },
      {
        level: 4,
        name: '후한 지원',
        summary: '협상 호감 +10% · 라운드 성장 ×1.12 · 피로 회복 +1 · 운영 경비 ×1.1',
      },
      {
        level: 5,
        name: '최고 대우',
        summary: '협상 호감 +15% · 라운드 성장 ×1.25 · 피로 회복 +2 · 운영 경비 ×1.2',
      },
    ],
  },
  recruitment: {
    label: '영입 기조',
    question: '어떤 선수를 데려올까요?',
    levels: [
      {
        level: 1,
        name: '유망주 발굴',
        summary: '17–21세 · 능력 35–65 · 잠재력 +12 · 이적료 −15%',
      },
      {
        level: 2,
        name: '젊은 선수 위주',
        summary: '18–25세 · 능력 38–75 · 잠재력 +6 · 이적료 −5%',
      },
      { level: 3, name: '균형', summary: '18–30세 · 능력 40–85 · 기본 이적료' },
      { level: 4, name: '경험 위주', summary: '23–31세 · 능력 50–88 · 이적료 +15%' },
      { level: 5, name: '즉시 전력', summary: '26–33세 · 능력 60–92 · 이적료 +30%' },
    ],
  },
  academy: {
    label: '유소년 투자',
    question: '아카데미 코치·스카우트·시설에 얼마나 쓸까요?',
    levels: [
      { level: 1, name: '기본 운영', summary: '추가 비용 없음 · 입단 인원과 잠재력 기본' },
      {
        level: 2,
        name: '육성 강화',
        summary: '라운드마다 소액 지출 · 입단 잠재력 +3 · 유스 성장 ×1.1',
      },
      {
        level: 3,
        name: '집중 투자',
        summary: '라운드마다 지출 · 입단 +1명 · 잠재력 +5 · 유스 성장 ×1.2',
      },
      {
        level: 4,
        name: '엘리트 아카데미',
        summary: '라운드마다 큰 지출 · 입단 +1명 · 잠재력 +8 · 유스 성장 ×1.3',
      },
      {
        level: 5,
        name: '최고 수준 아카데미',
        summary: '라운드마다 최대 지출 · 입단 +2명 · 잠재력 +11 · 유스 성장 ×1.45',
      },
    ],
  },
  localInvest: {
    label: '주변 투자',
    question: '연고지 경제와 동네에 얼마나 투자할까요?',
    levels: [
      { level: 1, name: '없음', summary: '추가 비용 없음 · 지역 기반 그대로' },
      {
        level: 2,
        name: '지역 행사 후원',
        summary: '라운드마다 소액 지출 · 관중 수요 +2% · 지역 기반 목표 20',
      },
      {
        level: 3,
        name: '지역 상권 투자',
        summary: '라운드마다 지출 · 관중 수요 +4% · 지역 기반 목표 40',
      },
      {
        level: 4,
        name: '지역 인프라 투자',
        summary: '라운드마다 큰 지출 · 관중 수요 +6% · 지역 기반 목표 65',
      },
      {
        level: 5,
        name: '도시 재생 사업',
        summary: '라운드마다 최대 지출 · 관중 수요 +8% · 지역 기반 목표 100',
      },
    ],
  },
  grassroots: {
    label: '풀뿌리 유망주 투자',
    question: '동네 유소년 축구를 얼마나 키울까요?',
    levels: [
      { level: 1, name: '없음', summary: '추가 비용 없음' },
      {
        level: 2,
        name: '동네 축구교실',
        summary: '라운드마다 소액 지출 · 입단 잠재력 +1 · 지역 기반 목표 +10',
      },
      {
        level: 3,
        name: '지역 리그 후원',
        summary: '라운드마다 지출 · 입단 잠재력 +2 · 지역 기반 목표 +20',
      },
      {
        level: 4,
        name: '학교 축구 지원',
        summary: '라운드마다 큰 지출 · 입단 잠재력 +3 · 지역 기반 목표 +30',
      },
      {
        level: 5,
        name: '지역 유소년 네트워크',
        summary: '라운드마다 최대 지출 · 입단 잠재력 +4 · 지역 기반 목표 +45',
      },
    ],
  },
  globalMarketing: {
    label: '해외 마케팅',
    question: '구단 이름을 해외에 얼마나 알릴까요?',
    levels: [
      { level: 1, name: '입소문', summary: '추가 비용 없음 · 팬 변화 없음' },
      {
        level: 2,
        name: '해외 홍보',
        summary: '라운드마다 소액 지출 · 팬 +0.4%/라운드 · 글로벌 인지도 목표 20',
      },
      {
        level: 3,
        name: '해외 광고',
        summary: '라운드마다 지출 · 팬 +0.8%/라운드 · 글로벌 인지도 목표 40',
      },
      {
        level: 4,
        name: '글로벌 캠페인',
        summary: '라운드마다 큰 지출 · 팬 +1.3%/라운드 · 글로벌 인지도 목표 65',
      },
      {
        level: 5,
        name: '세계적 브랜딩',
        summary: '라운드마다 최대 지출 · 팬 +2%/라운드 · 글로벌 인지도 목표 100',
      },
    ],
  },
  globalScouting: {
    label: '해외 스카우트망',
    question: '해외 선수와 유망주를 얼마나 넓게 찾을까요?',
    levels: [
      { level: 1, name: '없음', summary: '추가 비용 없음' },
      {
        level: 2,
        name: '해외 정보원',
        summary: '라운드마다 소액 지출 · 영입 후보 +1명 · 글로벌 인지도 목표 +10',
      },
      {
        level: 3,
        name: '지역 스카우트',
        summary: '라운드마다 지출 · 영입 후보 +2명 · 잠재력 +1 · 글로벌 인지도 목표 +20',
      },
      {
        level: 4,
        name: '대륙 스카우트망',
        summary: '라운드마다 큰 지출 · 영입 후보 +3명 · 잠재력 +1 · 글로벌 인지도 목표 +30',
      },
      {
        level: 5,
        name: '세계 스카우트망',
        summary: '라운드마다 최대 지출 · 영입 후보 +4명 · 잠재력 +2 · 글로벌 인지도 목표 +45',
      },
    ],
  },
  tour: {
    label: '해외 투어',
    question: '여름마다 해외 투어를 갈까요?',
    levels: [
      { level: 1, name: '안 함', summary: '투어 없음' },
      {
        level: 2,
        name: '짧은 투어',
        summary: '시즌 시작에 투어 수입 · 글로벌 인지도 +5 · 모든 선수 피로 +10',
      },
      {
        level: 3,
        name: '긴 투어',
        summary: '시즌 시작에 큰 투어 수입 · 글로벌 인지도 +10 · 모든 선수 피로 +20',
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
  /** 풀뿌리 유망주 투자's intake potential; 해외 스카우트망's extra candidates and potential. */
  grassrootsPotential: number;
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
    feeMultiplier: number;
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
const GRASSROOTS_POTENTIAL = [0, 1, 2, 3, 4];
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
  { ability: [35, 65], age: [17, 21], potentialBonus: 12, feeMultiplier: 0.85 },
  { ability: [38, 75], age: [18, 25], potentialBonus: 6, feeMultiplier: 0.95 },
  { ability: [40, 85], age: [18, 30], potentialBonus: 0, feeMultiplier: 1 },
  { ability: [50, 88], age: [23, 31], potentialBonus: 0, feeMultiplier: 1.15 },
  { ability: [60, 92], age: [26, 33], potentialBonus: 0, feeMultiplier: 1.3 },
];

function validate(key: PolicyKey, level: PolicyLevel) {
  if (typeof key !== 'string' || !Object.hasOwn(POLICY_INFO, key))
    throw new Error('운영 방침 항목을 확인하세요.');
  if (!Number.isInteger(level) || level < 1 || level > (key === 'tour' ? 3 : 5))
    throw new Error(`${POLICY_INFO[key].label} 단계를 확인하세요.`);
}

export function policyOf(w: World): ClubPolicy {
  return { ...POLICY_DEFAULTS, ...w.policy };
}

export function policyEffects(policy: ClubPolicy): PolicyEffects {
  const level = (key: PolicyKey) => (policy[key] ?? POLICY_DEFAULTS[key]) - 1;
  const support = policy.support - 1,
    academy = level('academy'),
    local = level('localInvest'),
    grass = level('grassroots'),
    global = level('globalMarketing'),
    scout = level('globalScouting'),
    offer = OFFERS[policy.recruitment - 1];
  return {
    goodwill: SUPPORT_GOODWILL[support],
    developmentMultiplier: SUPPORT_DEVELOPMENT[support],
    recoveryBonus: SUPPORT_RECOVERY[support],
    operatingFactor: SUPPORT_EXPENSES[support],
    investUnits:
      INVEST_UNITS[local] + INVEST_UNITS[grass] + INVEST_UNITS[global] + INVEST_UNITS[scout],
    fanGrowth: GLOBAL_FANS[global],
    gateBoost: LOCAL_GATE[local],
    grassrootsPotential: GRASSROOTS_POTENTIAL[grass],
    scoutCandidates: SCOUT_CANDIDATES[scout],
    scoutPotential: SCOUT_POTENTIAL[scout],
    baseTargets: {
      local: Math.min(100, MAIN_TARGET[local] + SIDE_TARGET[grass]),
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
      feeMultiplier: offer.feeMultiplier,
    },
  };
}

/** Deterministic fans gained in one settled round from 해외 마케팅 alone. */
export function marketingFanGain(fans: number, fanGrowth: number) {
  if (fanGrowth <= 0) return 0;
  return Math.round(fans * fanGrowth * Math.max(0.2, 1 - fans / 1000000));
}

export function setPolicy(w: World, key: PolicyKey, level: PolicyLevel) {
  validate(key, level);
  const current = policyOf(w);
  if (current[key] === level) return;
  w.policy = { ...current, [key]: level };
  const info = POLICY_INFO[key],
    chosen = info.levels[level - 1];
  addEvent(w, 'policy', `${info.label} · ${chosen.name}`, chosen.summary);
}

/**
 * Pure read model of choosing `level` for `key`; nothing is spent or changed. Cost changes are the
 * fixed costs at that level against today's (→ECON-12): squad investment's through the operating
 * expenses it scales, the academy's and the investment rows' through their spend.
 */
export function policyPreview(w: World, key: PolicyKey, level: PolicyLevel) {
  validate(key, level);
  const next: ClubPolicy = { ...policyOf(w), [key]: level },
    effects = policyEffects(next),
    before = operatingCosts(w),
    after = operatingCosts({ ...w, policy: next });
  return {
    /** Yearly fixed costs at this level minus today's. */
    annualCostChange: (BigInt(after.annual) - BigInt(before.annual)).toString(),
    /** The next round's bill at this level minus today's (zero once the season's rounds are paid). */
    nextRoundChange: (BigInt(after.nextRound) - BigInt(before.nextRound)).toString(),
    fansPerRound:
      key === 'globalMarketing' ? marketingFanGain(clubOf(w).fans, effects.fanGrowth) : 0,
    goodwill: effects.goodwill,
    developmentMultiplier: effects.developmentMultiplier,
    recoveryBonus: effects.recoveryBonus,
    operatingFactor: effects.operatingFactor,
    offerAge: effects.offer.age,
    offerAbility: effects.offer.ability,
  };
}
