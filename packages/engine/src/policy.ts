import type { ClubPolicy, PolicyKey, PolicyLevel, World } from '../../contracts/src/types';
import { operatingCosts } from './finance';
import { addEvent, clubOf } from './world';

/** Display and decision order. */
export const POLICY_KEYS: readonly PolicyKey[] = ['support', 'recruitment', 'marketing', 'academy'];

/** Absent or partial policies resolve to these values, which reproduce the pre-policy club. */
export const POLICY_DEFAULTS: ClubPolicy = Object.freeze({
  support: 3,
  recruitment: 3,
  marketing: 1,
  academy: 1,
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
    question: '급여 수준과 훈련·의료 환경에 얼마나 쓸까요?',
    levels: [
      { level: 1, name: '긴축', summary: '급여 지출 −15% · 라운드 성장 ×0.8 · 피로 회복 −2' },
      { level: 2, name: '절약', summary: '급여 지출 −8% · 라운드 성장 ×0.9 · 피로 회복 −1' },
      { level: 3, name: '표준', summary: '급여 지출·라운드 성장·피로 회복 모두 기본' },
      { level: 4, name: '후한 지원', summary: '급여 지출 +10% · 라운드 성장 ×1.12 · 피로 회복 +1' },
      { level: 5, name: '최고 대우', summary: '급여 지출 +20% · 라운드 성장 ×1.25 · 피로 회복 +2' },
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
  marketing: {
    label: '마케팅',
    question: '구단을 얼마나 알릴까요?',
    levels: [
      { level: 1, name: '입소문', summary: '추가 비용 없음 · 팬과 관중 변화 없음' },
      {
        level: 2,
        name: '지역 홍보',
        summary: '라운드마다 소액 지출 · 팬 +0.4%/라운드 · 관중 수요 +2%',
      },
      {
        level: 3,
        name: '꾸준한 광고',
        summary: '라운드마다 지출 · 팬 +0.8%/라운드 · 관중 수요 +4%',
      },
      {
        level: 4,
        name: '적극 홍보',
        summary: '라운드마다 큰 지출 · 팬 +1.3%/라운드 · 관중 수요 +6%',
      },
      {
        level: 5,
        name: '대대적 캠페인',
        summary: '라운드마다 최대 지출 · 팬 +2%/라운드 · 관중 수요 +8%',
      },
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
};

export interface PolicyEffects {
  wageMultiplier: number;
  developmentMultiplier: number;
  /** Fatigue recovered per settled round, added to the training focus recovery. */
  recoveryBonus: number;
  /** Per-round marketing spend in 1901 price units. */
  marketingUnits: number;
  fanGrowth: number;
  gateBoost: number;
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

const SUPPORT_WAGES = [0.85, 0.92, 1, 1.1, 1.2];
const SUPPORT_DEVELOPMENT = [0.8, 0.9, 1, 1.12, 1.25];
const SUPPORT_RECOVERY = [-2, -1, 0, 1, 2];
/** Spend per fan rises with each level, so loud campaigns trade efficiency for reach. */
const MARKETING_UNITS = [0, 1, 2.5, 4.5, 7];
const MARKETING_FANS = [0, 0.004, 0.008, 0.013, 0.02];
const MARKETING_GATE = [0, 0.02, 0.04, 0.06, 0.08];
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
  if (!Number.isInteger(level) || level < 1 || level > 5)
    throw new Error('운영 방침 단계는 1–5 사이여야 합니다.');
}

export function policyOf(w: World): ClubPolicy {
  return { ...POLICY_DEFAULTS, ...w.policy };
}

export function policyEffects(policy: ClubPolicy): PolicyEffects {
  const support = policy.support - 1,
    marketing = policy.marketing - 1,
    academy = (policy.academy ?? POLICY_DEFAULTS.academy) - 1,
    offer = OFFERS[policy.recruitment - 1];
  return {
    wageMultiplier: SUPPORT_WAGES[support],
    developmentMultiplier: SUPPORT_DEVELOPMENT[support],
    recoveryBonus: SUPPORT_RECOVERY[support],
    marketingUnits: MARKETING_UNITS[marketing],
    fanGrowth: MARKETING_FANS[marketing],
    gateBoost: MARKETING_GATE[marketing],
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

/** Deterministic fans gained in one settled round from the marketing policy alone. */
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

/** Pure read model of choosing `level` for `key`; nothing is spent or changed. */
export function policyPreview(w: World, key: PolicyKey, level: PolicyLevel) {
  validate(key, level);
  const next: ClubPolicy = { ...policyOf(w), [key]: level },
    effects = policyEffects(next),
    before = operatingCosts(w),
    after = operatingCosts({ ...w, policy: next });
  return {
    annualCostChange: (BigInt(after.annual) - BigInt(before.annual)).toString(),
    fansPerRound: key === 'marketing' ? marketingFanGain(clubOf(w).fans, effects.fanGrowth) : 0,
    developmentMultiplier: effects.developmentMultiplier,
    recoveryBonus: effects.recoveryBonus,
    offerAge: effects.offer.age,
    offerAbility: effects.offer.ability,
  };
}
