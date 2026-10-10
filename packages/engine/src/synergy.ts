import type { Player, World } from '../../contracts/src/types';
import { activePlayers, selectedLineup } from './world';
import { policyOf } from './policy';
import { staffMember } from './staff';
import { buildOf } from './build';

/**
 * Build synergies (→CLUB-21): when the manager, the staff, the club's choices and the squad point
 * the same way, the build gets a bonus on top of each card. Every condition is visible, so the owner
 * can see what is missing.
 */
export interface SynergyEffects {
  pass: number;
  possession: number;
  defense: number;
  lineHigh: number;
  /** Fatigue taken off each match for the players who played. */
  fatigueRelief: number;
  academyGrowth: number;
  academyPotential: number;
  marketPotential: number;
  feeMultiplier: number;
  sponsor: number;
  moraleBaseline: number;
}

export const NEUTRAL_SYNERGY: Readonly<SynergyEffects> = Object.freeze({
  pass: 0,
  possession: 0,
  defense: 0,
  lineHigh: 0,
  fatigueRelief: 0,
  academyGrowth: 1,
  academyPotential: 0,
  marketPotential: 0,
  feeMultiplier: 1,
  sponsor: 1,
  moraleBaseline: 0,
});

export interface SynergyState {
  id: string;
  label: string;
  /** What the build is, in football terms. */
  idea: string;
  conditions: { label: string; met: boolean }[];
  active: boolean;
  bonus: string;
}

interface SynergyRule {
  id: string;
  label: string;
  idea: string;
  bonus: string;
  effects: Partial<SynergyEffects>;
  conditions: (w: World, starters: Player[]) => { label: string; met: boolean }[];
}

const average = (players: Player[], value: (p: Player) => number) =>
  players.length ? players.reduce((sum, p) => sum + value(p), 0) / players.length : 0;
const coach = (w: World, role: Parameters<typeof staffMember>[1]) => staffMember(w, role);

const RULES: readonly SynergyRule[] = [
  {
    id: 'gegenpress',
    label: '게겐프레스 엔진',
    idea: '압박 감독 · 회복을 맡은 피지컬 코치 · 체력 좋은 주전이 맞물린 고강도 압박',
    bonus: '경기당 피로 −2 · 상대 빌드업 패스 성공 −1%p 추가',
    effects: { fatigueRelief: 2, lineHigh: 0.01 },
    conditions: (w, starters) => [
      {
        label: '게겐프레싱 감독 또는 전방 압박 전술',
        met: w.manager.style === 'gegenpress' || w.tactic === 'press',
      },
      {
        label: '피지컬 코치 능력 65+ 또는 회복 전문',
        met: (coach(w, 'fitness')?.ability ?? 0) >= 65 || coach(w, 'fitness')?.trait === 'recovery',
      },
      { label: '주전 평균 체력 60+', met: average(starters, (p) => p.stamina) >= 60 },
    ],
  },
  {
    id: 'positional',
    label: '점유의 미학',
    idea: '포지셔널 플레이 감독 · 패스를 키우는 수석코치 · 패스 좋은 미드필드',
    bonus: '패스 성공률 +1%p · 점유율 +1%p',
    effects: { pass: 1, possession: 1 },
    conditions: (w, starters) => [
      {
        label: '포지셔널 플레이 감독 또는 점유 전술',
        met: w.manager.style === 'positional' || w.tactic === 'possession',
      },
      {
        label: '수석코치 능력 65+ 또는 전문가',
        met:
          (coach(w, 'assistant')?.ability ?? 0) >= 65 ||
          coach(w, 'assistant')?.trait === 'specialist',
      },
      {
        label: '주전 미드필더 평균 패스 62+',
        met:
          average(
            starters.filter((p) => p.role === 'MID'),
            (p) => p.passing,
          ) >= 62,
      },
    ],
  },
  {
    id: 'wall',
    label: '철의 장막',
    idea: '수비형 감독 · 수비 코치 · 단단한 수비진이 만드는 두 줄 수비',
    bonus: '상대 슈팅 기회 −1%p 추가',
    effects: { defense: 1 },
    conditions: (w, starters) => [
      {
        label: '수비 조직가·실리 역습 감독',
        met: w.manager.style === 'organizer' || w.manager.style === 'counter',
      },
      {
        label: '수비 코치 능력 65+ 또는 전문가',
        met:
          (coach(w, 'defense')?.ability ?? 0) >= 65 || coach(w, 'defense')?.trait === 'specialist',
      },
      {
        label: '주전 수비수 평균 수비 62+',
        met:
          average(
            starters.filter((p) => p.role === 'DEF'),
            (p) => p.defense,
          ) >= 62,
      },
    ],
  },
  {
    id: 'pipeline',
    label: '유스 파이프라인',
    idea: '유소년 투자 · 육성형 유스 디렉터 · 유망주를 쓰는 감독이 이어진 육성 사다리',
    bonus: '아카데미 성장 ×1.15 · 유스 입단 잠재력 +3',
    effects: { academyGrowth: 1.15, academyPotential: 3 },
    conditions: (w) => [
      { label: '유소년 투자 3단계 이상', met: (policyOf(w).academy ?? 1) >= 3 },
      {
        label: '유스 디렉터 육성형 또는 능력 70+',
        met: coach(w, 'youth')?.trait === 'developer' || (coach(w, 'youth')?.ability ?? 0) >= 70,
      },
      {
        label: '육성형 감독 또는 유망주 중용 감독',
        met: w.manager.style === 'developer' || w.manager.trait === 'youth',
      },
    ],
  },
  {
    id: 'moneyball',
    label: '머니볼',
    idea: '데이터 스카우팅 · 발굴·협상에 강한 수석 스카우트 · 젊은 선수 위주 영입',
    bonus: '영입 후보 잠재력 +3 · 이적료 ×0.92',
    effects: { marketPotential: 3, feeMultiplier: 0.92 },
    conditions: (w) => [
      { label: '스카우팅 · 데이터 스카우팅', met: buildOf(w).scouting === 'data' },
      {
        label: '수석 스카우트 발굴가·협상가',
        met: coach(w, 'scout')?.trait === 'spotter' || coach(w, 'scout')?.trait === 'negotiator',
      },
      { label: '영입 기조 유망주·젊은 선수 위주', met: policyOf(w).recruitment <= 2 },
    ],
  },
  {
    id: 'commercial',
    label: '상업 제국',
    idea: '상업 확장 수익 모델 · 적극적인 마케팅 · 큰 경기장이 만드는 수익 구조',
    bonus: '새 후원 계약 금액 ×1.1 추가',
    effects: { sponsor: 1.1 },
    conditions: (w) => [
      { label: '수익 모델 · 상업 확장', met: buildOf(w).revenue === 'commercial' },
      { label: '마케팅 4단계 이상', met: policyOf(w).marketing >= 4 },
      { label: '시설 6단계 이상', met: w.facilities >= 6 },
    ],
  },
  {
    id: 'one-team',
    label: '원 팀',
    idea: '동기부여형 감독 · 넉넉한 선수단 투자 · 좋은 분위기가 이어지는 라커룸',
    bonus: '분위기 기준점 +3',
    effects: { moraleBaseline: 3 },
    conditions: (w) => [
      { label: '동기부여형 감독', met: w.manager.style === 'motivator' },
      { label: '선수단 투자 4단계 이상', met: policyOf(w).support >= 4 },
      { label: '분위기 65 이상', met: (w.morale ?? 60) >= 65 },
    ],
  },
  {
    id: 'local-heroes',
    label: '우리 동네 아이들',
    idea: '아카데미에서 키운 동네 아이들 · 지역이 채우는 경기장 · 서로 챙기는 라커룸',
    bonus: '분위기 기준점 +2 · 유스 입단 잠재력 +2',
    effects: { moraleBaseline: 2, academyPotential: 2 },
    conditions: (w) => {
      const build = buildOf(w);
      return [
        {
          label: '유스 정책 · 성골 유스 또는 유소년 클럽 제휴',
          met: build.youth === 'homegrown' || build.youth === 'partnership',
        },
        { label: '홈·팬 · 지역 밀착', met: build.fans === 'community' },
        { label: '라커룸 문화 · 가족 같은 클럽', met: build.culture === 'family' },
      ];
    },
  },
  {
    id: 'trading-machine',
    label: '트레이딩 머신',
    idea: '지표로 찾고 · 1군에서 뛰게 해 키우고 · 비싸게 파는 순환',
    bonus: '영입 후보 잠재력 +2 · 아카데미 성장 ×1.1',
    effects: { marketPotential: 2, academyGrowth: 1.1 },
    conditions: (w) => {
      const build = buildOf(w);
      return [
        { label: '스카우팅 · 데이터 스카우팅', met: build.scouting === 'data' },
        { label: '유스 정책 · 1군 직행 경로', met: build.youth === 'pathway' },
        {
          label: '이적 기조 · 셀링 클럽 또는 쇼케이스',
          met: build.market === 'selling' || build.market === 'showcase',
        },
      ];
    },
  },
];

export function synergyStates(w: World): SynergyState[] {
  const starters = selectedLineup(activePlayers(w), w.lineup, w.manager, w.year);
  return RULES.map((rule) => {
    const conditions = rule.conditions(w, starters);
    return {
      id: rule.id,
      label: rule.label,
      idea: rule.idea,
      conditions,
      active: conditions.every((condition) => condition.met),
      bonus: rule.bonus,
    };
  });
}

/** The combined bonus of every active synergy; neutral when none is active. */
export function synergyEffects(w: World): SynergyEffects {
  const effects: SynergyEffects = { ...NEUTRAL_SYNERGY };
  const states = synergyStates(w);
  for (const rule of RULES) {
    if (!states.find((state) => state.id === rule.id)!.active) continue;
    for (const [key, value] of Object.entries(rule.effects) as [keyof SynergyEffects, number][])
      effects[key] =
        key === 'academyGrowth' || key === 'feeMultiplier' || key === 'sponsor'
          ? effects[key] * value
          : effects[key] + value;
  }
  return effects;
}
