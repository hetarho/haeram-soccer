import type { FacilityScene } from './facilityScene';

export const INVESTMENT_AREAS = [
  { id: 'firstTeam', title: '1군', art: 'training', description: '선수 지원 · 훈련장 업그레이드' },
  { id: 'youth', title: '유소년', art: 'academy', description: '육성 투자 · 아카데미 시설' },
  { id: 'coaches', title: '코치진', art: 'staff', description: '채용 투자 수준 · 스태프 현황' },
  { id: 'stadium', title: '경기장', art: 'stadium', description: '관중석 증축 · 경기장 재건축' },
  { id: 'scouting', title: '스카우팅 · 영입', art: 'manager', description: '영입 기조 · 해외 스카우트망' },
  { id: 'community', title: '팬 · 마케팅', art: 'stadium', description: '지역 투자 · 해외 마케팅' },
] as const satisfies readonly { id: string; title: string; art: FacilityScene; description: string }[];
export type InvestmentArea = (typeof INVESTMENT_AREAS)[number]['id'];
export const INVESTMENT_PAGES = [
  ['overview', '투자'],
  ...INVESTMENT_AREAS.map((area) => [area.id, area.title] as const),
] as const;
