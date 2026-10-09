import type { ManagerStyle, Tactic, World } from '../../contracts/src/types';
import { integer, random } from './primitives';

/** Everything a manager's school changes, as additions or multipliers (→STAFF-14). */
export interface StyleEffects {
  /** Percentage-point modifiers of our tactical profile. */
  pass: number;
  possession: number;
  shot: number;
  defense: number;
  /** Added to the tactic's defensive line (pass success taken off the opponent). */
  lineHigh: number;
  lineLow: number;
  /** In-match fatigue drain multiplier and fatigue added per match. */
  drain: number;
  fatigueCost: number;
  /** Squad strength points in every match. */
  strength: number;
  /** Morale baseline points; morale points a defeat costs less. */
  moraleBaseline: number;
  defeatCushion: number;
  /** Round growth multipliers: everyone, and players aged 21 or younger. */
  growth: number;
  youthGrowth: number;
  /** Request acceptance score; chance a selling club accepts our bid (0–1). */
  requestBonus: number;
  bidAcceptance: number;
  /** Chance that a squad meeting the owner asks for works (0–1). */
  meeting: number;
  /** Automatic selection favours players aged 21 or younger. */
  youthSelection: boolean;
}

export const NEUTRAL_STYLE: Readonly<StyleEffects> = Object.freeze({
  pass: 0,
  possession: 0,
  shot: 0,
  defense: 0,
  lineHigh: 0,
  lineLow: 0,
  drain: 1,
  fatigueCost: 0,
  strength: 0,
  moraleBaseline: 0,
  defeatCushion: 0,
  growth: 1,
  youthGrowth: 1,
  requestBonus: 0,
  bidAcceptance: 0,
  meeting: 0,
  youthSelection: false,
});

export const MANAGER_STYLES: readonly ManagerStyle[] = [
  'positional',
  'gegenpress',
  'counter',
  'organizer',
  'motivator',
  'developer',
  'firefighter',
  'headcoach',
];

export const STYLE_INFO: Record<
  ManagerStyle,
  {
    label: string;
    /** The school in one line, as football writers describe it. */
    school: string;
    /** Styles that only play one way set the manager's tactic. */
    tactic?: Tactic;
    effects: Partial<StyleEffects>;
    pros: string[];
    cons: string[];
    /** Contract length in seasons. */
    term: number;
  }
> = {
  positional: {
    label: '포지셔널 플레이',
    school: '짧은 패스로 점유를 쥐고 하프스페이스를 공략하는 빌드업 축구',
    tactic: 'possession',
    effects: { pass: 2, possession: 2, shot: -0.5, lineHigh: 0.01, requestBonus: -6 },
    pros: ['패스 성공률 +2%p', '점유율 +2%p', '볼을 잃자마자 되찾는 압박 +1%p'],
    cons: ['슈팅 기회 −0.5%p', '철학이 확고해 전술 요청 수락 −6'],
    term: 3,
  },
  gegenpress: {
    label: '게겐프레싱',
    school: '볼을 잃은 직후 전방에서 압박해 높은 곳에서 탈환하는 고강도 축구',
    tactic: 'press',
    effects: { shot: 0.8, lineHigh: 0.03, drain: 1.1, fatigueCost: 1 },
    pros: ['상대 빌드업 패스 성공 −3%p (PPDA↓·하이 턴오버↑)', '슈팅 기회 +0.8%p'],
    cons: ['경기 중 체력 소모 ×1.1', '경기당 피로 +1'],
    term: 3,
  },
  counter: {
    label: '실리 역습',
    school: '내려앉아 공간을 지우고 빠른 전환으로 뒷공간을 노리는 실리 축구',
    tactic: 'counter',
    effects: { defense: 1.2, possession: -2, shot: 0.3, lineLow: 0.015 },
    pros: ['상대 슈팅 기회 −1.2%p', '우리 진영 상대 패스 성공 −1.5%p', '슈팅 기회 +0.3%p'],
    cons: ['점유율 −2%p'],
    term: 3,
  },
  organizer: {
    label: '수비 조직가',
    school: '두 줄 수비와 간격 유지로 실점을 줄이는 조직력 중심 축구',
    tactic: 'balanced',
    effects: { defense: 1.8, shot: -0.8, lineLow: 0.01 },
    pros: ['상대 슈팅 기회 −1.8%p', '우리 진영 상대 패스 성공 −1%p'],
    cons: ['슈팅 기회 −0.8%p'],
    term: 3,
  },
  motivator: {
    label: '동기부여형',
    school: '라커룸을 장악하고 선수들의 마음을 움직이는 관리형 지도자',
    effects: { moraleBaseline: 6, defeatCushion: 2, meeting: 0.2 },
    pros: ['분위기 기준점 +6', '패배 후 분위기 하락 −2', '선수단 미팅 성공 확률 +20%p'],
    cons: ['전술적 보정 없음'],
    term: 3,
  },
  developer: {
    label: '육성형',
    school: '유망주에게 출전 시간을 주며 키워 쓰는 아카데미 출신 지도자',
    effects: { youthGrowth: 1.3, youthSelection: true },
    pros: ['21세 이하 라운드 성장 ×1.3', '자동 선발에서 유망주 우대'],
    cons: ['경험 많은 선수 출전이 줄어 즉시 전력이 흔들릴 수 있어요'],
    term: 3,
  },
  firefighter: {
    label: '소방수',
    school: '위기의 팀을 맡아 단기간에 반등시키는 강등권 탈출 전문가',
    effects: { strength: 1.5, moraleBaseline: 3, growth: 0.85 },
    pros: ['경기 전력 +1.5', '분위기 기준점 +3', '부임 즉시 분위기 +10'],
    cons: ['라운드 성장 ×0.85', '1시즌 단기 계약'],
    term: 1,
  },
  headcoach: {
    label: '데이터 헤드코치',
    school: '스포츠 디렉터 체계 안에서 데이터로 일하는 실무형 헤드코치',
    effects: { requestBonus: 15, bidAcceptance: 0.05, moraleBaseline: -2 },
    pros: ['전술 요청 수락 +15', '영입 협상 수락 확률 +5%p'],
    cons: ['카리스마 부족: 분위기 기준점 −2'],
    term: 3,
  },
};

/** Morale added the day a firefighter takes over. */
export const FIREFIGHTER_ARRIVAL_MORALE = 10;

export function styleEffects(style: ManagerStyle | undefined): StyleEffects {
  return style ? { ...NEUTRAL_STYLE, ...STYLE_INFO[style].effects } : { ...NEUTRAL_STYLE };
}

export function managerStyleEffects(w: Pick<World, 'manager'>): StyleEffects {
  return styleEffects(w.manager.interim ? undefined : w.manager.style);
}

/**
 * This season's four candidates show four different schools: a seeded order of all eight,
 * drawn from its own stream so the other candidate attributes stay put.
 */
export function candidateStyles(seed: string, year: number): ManagerStyle[] {
  const r = random(`${seed}:manager-style:${year}`);
  const order = [...MANAGER_STYLES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = integer(r, 0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
