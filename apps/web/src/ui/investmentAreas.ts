import type { FacilityScene } from './facilityScene';

export const INVESTMENT_AREAS = [
  {
    id: 'firstTeam',
    title: '1군',
    art: 'training',
    description: '선수 지원 · 라커룸 문화 · 훈련장',
  },
  { id: 'youth', title: '유소년', art: 'academy', description: '육성 투자 · 유입 방식 · 아카데미' },
  {
    id: 'coaches',
    title: '코치진',
    art: 'staff',
    description: '재직 스태프의 상시 효과 · 급여 현황',
  },
  {
    id: 'stadium',
    title: '경기장',
    art: 'stadium',
    description: '티켓 가격 · 관중석 증축 · 재건축',
  },
  {
    id: 'scouting',
    title: '스카우팅',
    art: 'manager',
    description: '스카우팅 방식 · 해외 스카우트망',
  },
  {
    id: 'community',
    title: '팬 · 마케팅',
    art: 'stadium',
    description: '지역 관계 · 지역 투자 · 해외 마케팅 · 투어',
  },
  {
    id: 'finance',
    title: '재정 · 사업',
    art: 'manager',
    description: '수익 모델 · 사업 투자 · 자금 투입 · 배당',
  },
  {
    id: 'identity',
    title: '구단 디자인',
    art: 'locker',
    description: '디자인 의뢰 · 색상 · 문장 · 유니폼',
  },
] as const satisfies readonly {
  id: string;
  title: string;
  art: FacilityScene;
  description: string;
}[];
export type InvestmentArea = (typeof INVESTMENT_AREAS)[number]['id'];
export const INVESTMENT_PAGES = [
  ['overview', '투자'],
  ...INVESTMENT_AREAS.map((area) => [area.id, area.title] as const),
] as const;
