import type { ClubBuild } from '../../contracts/src/build';
import type { ClubPolicy, Direction } from '../../contracts/src/types';

// Data only, with type imports: the founding screen reads the presets from here without loading
// the engine (→ARCH-28).
/**
 * The rows a preset sets beyond its cards (→ECON-22): policy levels, the ticket price and direction
 * rows; every row it does not name returns to its default when the preset is applied (→ECON-25).
 */
export interface PresetRows {
  policy?: Partial<ClubPolicy>;
  ticket?: number;
  direction?: Direction;
}
/**
 * Ready-made directions (→ECON-22), one tap to fill every row of the board. Each has one identity
 * and lights or aims at a synergy (→CLUB-21); the owner can still compose any other mix.
 */
export const BUILD_PRESETS: {
  id: string;
  label: string;
  model: string;
  /** The synergy the preset lights at once or points toward, in the owner's terms. */
  aim: string;
  /** The rows beyond the cards it fills, in one line for the founding screen (→WEB-15). */
  summary: string;
  build: ClubBuild;
  rows: PresetRows;
}[] = [
  {
    id: 'local-pride',
    label: '유스 순혈주의',
    model: '지역 출신 유스로 1군을 꾸리는 칸테라 정책',
    aim: '시너지 우리 동네 아이들 바로 발동',
    summary: '주변 투자·풀뿌리 유망주 투자 늘리기 · 티켓 저렴 · 모두 붙잡기 · 1군 공급 · 재정 신중',
    build: {
      youth: 'homegrown',
      scouting: 'local',
      market: 'hold',
      revenue: 'members',
      fans: 'community',
      culture: 'family',
    },
    rows: {
      policy: { localInvest: 3, grassroots: 3 },
      ticket: 0.035,
      direction: { renewal: 'keepAll', youthGoal: 'firstTeam', finance: 'careful' },
    },
  },
  {
    id: 'youth-academy',
    label: '유스 명가',
    model: '아카데미에 쏟아붓고 키운 아이들로 1군을 채워요',
    aim: '육성형 또는 능력 70+ 유스 디렉터가 있으면 시너지 유스 파이프라인',
    summary:
      '엘리트 아카데미 · 1군 공급 · 빠른 데뷔 · 유망주 발굴 · 육성형 육성가 감독 · 최고 수준 코치',
    build: { youth: 'elite', culture: 'meritocracy' },
    rows: {
      policy: { academy: 4, recruitment: 1 },
      direction: {
        youthGoal: 'firstTeam',
        debut: 'early',
        renewal: 'youngFirst',
        school: 'developer',
        manager: 'developer',
        coaches: 'elite',
      },
    },
  },
  {
    id: 'trading',
    label: '트레이딩 머신',
    model: '지표로 찾고 1군에서 키워 비싸게 팔아요',
    aim: '시너지 트레이딩 머신 바로 발동 · 발굴가 스카우트나 협상가 단장을 쓰면 머니볼까지',
    summary: '젊은 선수 위주 영입 · 판매용 육성 · 빠른 데뷔 · 젊은 선수 우선 재계약',
    build: { scouting: 'data', market: 'selling', culture: 'meritocracy' },
    rows: {
      policy: { recruitment: 2 },
      direction: { youthGoal: 'sell', debut: 'early', renewal: 'youngFirst' },
    },
  },
  {
    id: 'commercial',
    label: '상업 제국',
    model: '브랜드로 벌어 스타를 데려와요',
    aim: '해외 마케팅 4단계 · 3만 석 경기장을 채우면 시너지 상업 제국',
    summary: '해외 광고 · 짧은 해외 투어 · 티켓 비싸게 · 재정 적극',
    build: { scouting: 'network', revenue: 'commercial', culture: 'stars' },
    rows: {
      policy: { globalMarketing: 3, tour: 2 },
      ticket: 0.08,
      direction: { finance: 'bold' },
    },
  },
  {
    id: 'global',
    label: '세계로',
    model: '세계를 뒤져 숨은 재능을 찾고 보여 줘서 팔아요',
    aim: '발굴가 또는 능력 65+ 수석 스카우트가 있으면 시너지 글로벌 스카우팅',
    summary: '해외 스카우트망 · 해외 홍보 · 짧은 해외 투어 · 젊은 선수 위주 영입',
    build: { youth: 'worldwide', scouting: 'network', market: 'showcase' },
    rows: { policy: { globalScouting: 3, globalMarketing: 2, tour: 2, recruitment: 2 } },
  },
  {
    id: 'ambition',
    label: '승격 올인',
    model: '구단주 돈과 홈 요새로 지금 올라가요',
    aim: '유스 성장을 내주고 당장의 전력을 사요',
    summary:
      '후한 선수단 투자 · 즉시 전력 영입 · 핵심만 붙잡기 · 검증된 승부사 · 유소년 최소 · 재정 공격적',
    build: {
      scouting: 'proven',
      market: 'hold',
      revenue: 'owner',
      fans: 'fortress',
      culture: 'veterans',
    },
    rows: {
      policy: { support: 4, recruitment: 5 },
      direction: {
        renewal: 'coreOnly',
        manager: 'proven',
        youthGoal: 'minimal',
        finance: 'aggressive',
      },
    },
  },
  {
    id: 'shoestring',
    label: '알뜰 생존',
    model: '적은 돈으로 오래 버티는 작은 구단',
    aim: '분위기를 지키며 선수 급여 ×0.91 · 작은 출발에 맞춰요',
    summary: '절약 · 짠물 재계약 · 저비용 감독·코치 · 재정 안정적',
    build: {
      youth: 'partnership',
      scouting: 'local',
      market: 'hardball',
      revenue: 'frugal',
      fans: 'families',
      culture: 'veterans',
    },
    rows: {
      policy: { support: 2 },
      direction: { renewal: 'frugal', manager: 'cheap', coaches: 'cheap', finance: 'stable' },
    },
  },
];
