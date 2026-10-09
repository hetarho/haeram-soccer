import type { ClubVision, World } from '../../contracts/src/types';
import { addEvent } from './world';

/** Everything a club vision changes, as additions or multipliers (→ECON-22). */
export interface VisionEffects {
  /** Academy intake prospects and their potential. */
  academyIntake: number;
  academyPotential: number;
  /** Round growth of first-team players aged 21 or younger. */
  youthGrowth: number;
  /** Transfer market candidates, potential and ability. */
  marketCandidates: number;
  marketPotential: number;
  marketAbility: number;
  /** Daily chance multiplier of another club's offer, and the fee every sale earns. */
  incomingBids: number;
  saleFee: number;
  /** Sponsor offer amounts, campaign income and marketing fan growth. */
  sponsor: number;
  campaignIncome: number;
  marketingFans: number;
  /** Added to home gate demand (0.08 = +8%). */
  gateDemand: number;
  /** Multiplier on the supporters a win brings. */
  winFans: number;
  /** Strength points at home. */
  homeStrength: number;
  /** Owner capital injections allowed per season. */
  ownerCapital: number;
  /** Player wage multiplier. */
  wage: number;
  moraleBaseline: number;
}

export const NEUTRAL_VISION: Readonly<VisionEffects> = Object.freeze({
  academyIntake: 0,
  academyPotential: 0,
  youthGrowth: 1,
  marketCandidates: 0,
  marketPotential: 0,
  marketAbility: 0,
  incomingBids: 1,
  saleFee: 1,
  sponsor: 1,
  campaignIncome: 1,
  marketingFans: 1,
  gateDemand: 0,
  winFans: 1,
  homeStrength: 0,
  ownerCapital: 3,
  wage: 1,
  moraleBaseline: 0,
});

export const CLUB_VISIONS: readonly ClubVision[] = [
  'balanced',
  'academy',
  'trading',
  'commercial',
  'community',
  'ambition',
];

export const VISION_INFO: Record<
  ClubVision,
  { label: string; model: string; effects: Partial<VisionEffects>; pros: string[]; cons: string[] }
> = {
  balanced: {
    label: '균형 운영',
    model: '특정 방향에 치우치지 않는 기본 운영',
    effects: {},
    pros: ['모든 선택지의 효과가 기본값'],
    cons: ['특화 보너스 없음'],
  },
  academy: {
    label: '유스 명가',
    model: '아카데미에서 키운 선수로 1군을 채우는 유스 명가 모델',
    effects: { academyIntake: 1, academyPotential: 4, youthGrowth: 1.15, marketCandidates: -2 },
    pros: ['유스 입단 +1명', '입단 잠재력 +4', '21세 이하 성장 ×1.15'],
    cons: ['이적시장 후보 −2명'],
  },
  trading: {
    label: '셀링 클럽',
    model: '싸게 사서 키운 뒤 비싸게 파는 트레이딩 모델',
    effects: { incomingBids: 1.6, saleFee: 1.25, marketPotential: 4, moraleBaseline: -2 },
    pros: ['다른 구단 제안 ×1.6', '매각 이적료 ×1.25', '영입 후보 잠재력 +4'],
    cons: ['주축이 떠날 수 있다는 불안: 분위기 기준점 −2'],
  },
  commercial: {
    label: '상업 확장',
    model: '스폰서와 마케팅으로 수익을 키우는 상업 중심 구단',
    effects: { sponsor: 1.2, campaignIncome: 1.25, marketingFans: 1.2, gateDemand: -0.03 },
    pros: ['새 후원 계약 금액 ×1.2', '캠페인 수입 ×1.25', '마케팅 팬 증가 ×1.2'],
    cons: ['상업화 반감: 홈 관중 수요 −3%'],
  },
  community: {
    label: '지역 밀착',
    model: '지역 공동체와 함께 홈 경기장을 채우는 서포터 중심 구단',
    effects: { gateDemand: 0.08, winFans: 1.5, homeStrength: 1, sponsor: 0.9 },
    pros: ['홈 관중 수요 +8%', '승리 시 팬 증가 ×1.5', '홈 경기 전력 +1'],
    cons: ['새 후원 계약 금액 ×0.9'],
  },
  ambition: {
    label: '승격 올인',
    model: '구단주의 자금으로 즉시 전력을 사 모으는 야망형 구단',
    effects: { ownerCapital: 5, marketAbility: 5, wage: 1.08, moraleBaseline: 2 },
    pros: ['구단주 추가 출자 시즌 5회', '영입 후보 능력 +5', '분위기 기준점 +2'],
    cons: ['선수 급여 ×1.08'],
  },
};

export function visionOf(w: Pick<World, 'vision'>): ClubVision {
  return w.vision ?? 'balanced';
}

export function visionEffects(w: Pick<World, 'vision'>): VisionEffects {
  return { ...NEUTRAL_VISION, ...VISION_INFO[visionOf(w)].effects };
}

/** Why the vision cannot change now, if it cannot. */
export function visionLock(w: World): string | undefined {
  return w.visionYear === w.year ? '비전은 시즌마다 한 번만 바꿀 수 있어요' : undefined;
}

/** One change per season: a direction is a commitment, not a weekly dial. */
export function setVision(w: World, vision: ClubVision) {
  if (!Object.hasOwn(VISION_INFO, vision)) throw new Error('구단 비전을 확인하세요.');
  if (visionOf(w) === vision) return;
  const lock = visionLock(w);
  if (lock) throw new Error(lock);
  w.vision = vision;
  w.visionYear = w.year;
  const info = VISION_INFO[vision];
  addEvent(w, 'vision', `구단 비전 · ${info.label}`, [...info.pros, ...info.cons].join(' · '));
}
