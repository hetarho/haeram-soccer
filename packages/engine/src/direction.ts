import type { Direction, DirectionKey, ManagerStyle, World } from '../../contracts/src/types';
import { MANAGER_STYLES, STYLE_INFO } from './styles';
import { addEvent } from './world';

/**
 * The direction rows the delegated staff follow (→ECON-25): 재계약 기조 (→CLUB-26), 선호 학파 and
 * 감독 기조 (→STAFF-18), 코치 기조 (→STAFF-15) and 재정 기조 (→ECON-33). Each option is a named
 * choice like a dial step; the first-listed default keeps the club as it was before the rows
 * existed, and is never stored.
 */
export interface DirectionOption {
  id: string;
  name: string;
  /** What the option makes the staff do, in the owner's words. */
  summary: string;
}
export const DIRECTION_KEYS: readonly DirectionKey[] = [
  'renewal',
  'school',
  'manager',
  'coaches',
  'finance',
];
/** Each row's default option: 표준, or any school. */
export const DIRECTION_DEFAULT: Readonly<Record<DirectionKey, string>> = {
  renewal: 'standard',
  school: 'any',
  manager: 'standard',
  coaches: 'standard',
  finance: 'standard',
};

/**
 * 재정 기조 (→ECON-33): the runway the staff keep after a delegated spend (rounds of fixed costs),
 * the wage bill's ceiling against 12 months' revenue, the operating costs (in years) below which
 * academy promotions wait, and the two runways below which the staff sell harder.
 */
export interface FinanceStance {
  runway: number;
  wageShare: number;
  promotionYears: number;
  sellSteps: readonly [number, number];
}
export const FINANCE_STANCES: Readonly<Record<string, FinanceStance>> = {
  aggressive: { runway: 6, wageShare: 0.75, promotionYears: 0.25, sellSteps: [6, 14] },
  bold: { runway: 9, wageShare: 0.7, promotionYears: 0.5, sellSteps: [9, 20] },
  standard: { runway: 13, wageShare: 0.65, promotionYears: 1, sellSteps: [13, 30] },
  careful: { runway: 20, wageShare: 0.6, promotionYears: 1.5, sellSteps: [20, 45] },
  stable: { runway: 30, wageShare: 0.55, promotionYears: 2, sellSteps: [30, 65] },
};
const years = (value: number) =>
  value < 1 ? `${Math.round(value * 12)}개월분` : value === 1 ? '1년분' : `${value}년분`;
const financeSummary = (id: string) => {
  const stance = FINANCE_STANCES[id];
  return `지출 뒤 고정비 ${stance.runway}라운드분을 남기고, 임금 총액은 수입의 ${Math.round(stance.wageShare * 100)}%까지, 현금이 운영비 ${years(stance.promotionYears)}보다 적으면 승격을 미뤄요`;
};

export const DIRECTION_INFO: Readonly<
  Record<DirectionKey, { label: string; question: string; options: readonly DirectionOption[] }>
> = {
  renewal: {
    label: '재계약 기조',
    question: '계약이 끝나 가는 선수를 누구까지, 얼마까지 붙잡을까요?',
    options: [
      { id: 'standard', name: '표준', summary: '모두 붙잡되 시장가의 110%까지 줘요' },
      { id: 'keepAll', name: '모두 붙잡기', summary: '모두 붙잡고 시장가의 140%까지 줘요' },
      {
        id: 'coreOnly',
        name: '핵심만 붙잡기',
        summary: '주전 11명만 시장가의 140%까지 주고 붙잡아요. 나머지는 보내요',
      },
      { id: 'frugal', name: '짠물', summary: '누구든 시장가까지만 줘요' },
      {
        id: 'youngFirst',
        name: '젊은 선수 우선',
        summary: '30세 이상은 보내고, 나머지는 시장가의 110%까지 줘요',
      },
    ],
  },
  school: {
    label: '선호 학파',
    question: '감독은 어떤 축구를 하는 사람이어야 할까요?',
    options: [
      { id: 'any', name: '상관없음', summary: '학파를 가리지 않아요' },
      ...MANAGER_STYLES.map((style) => ({
        id: style,
        name: STYLE_INFO[style].label,
        summary: `${STYLE_INFO[style].label} 학파 감독만 데려오고 재계약해요`,
      })),
    ],
  },
  manager: {
    label: '감독 기조',
    question: '감독 자리가 비면 어떤 사람을 앉힐까요?',
    options: [
      {
        id: 'standard',
        name: '표준',
        summary: 'OVR 높은 순으로 2시즌 계약해요. 맞는 후보가 없으면 대행 체제로 기다려요',
      },
      {
        id: 'developer',
        name: '육성가',
        summary: '육성 60 이상 중 육성 높은 순으로 3시즌 계약해요',
      },
      {
        id: 'proven',
        name: '검증된 승부사',
        summary: '다른 구단 감독까지 웃돈을 주고 OVR 높은 순으로 3시즌 계약해요',
      },
      { id: 'young', name: '젊은 감독', summary: '잠재력 높은 순으로 3시즌 계약해요' },
      { id: 'cheap', name: '저비용', summary: '연봉 낮은 순으로 2시즌 계약해요' },
    ],
  },
  coaches: {
    label: '코치 기조',
    question: '코치진 자리는 어떤 코치로 채울까요?',
    options: [
      {
        id: 'volunteer',
        name: '자원봉사',
        summary: '모든 자리를 무급 자원봉사자(능력 50)로 채워요',
      },
      { id: 'cheap', name: '저비용', summary: '능력 45 이상 중 연봉 낮은 순으로 2시즌 계약해요' },
      { id: 'standard', name: '표준', summary: '능력 55 이상 중 연봉 낮은 순으로 2시즌 계약해요' },
      {
        id: 'elite',
        name: '최고 수준',
        summary: '능력 65 이상 중 능력 높은 순으로 3시즌 계약해요',
      },
    ],
  },
  finance: {
    label: '재정 기조',
    question: '맡긴 지출을 얼마나 과감하게 할까요?',
    options: [
      { id: 'aggressive', name: '공격적', summary: financeSummary('aggressive') },
      { id: 'bold', name: '적극', summary: financeSummary('bold') },
      { id: 'standard', name: '표준', summary: financeSummary('standard') },
      { id: 'careful', name: '신중', summary: financeSummary('careful') },
      { id: 'stable', name: '안정적', summary: financeSummary('stable') },
    ],
  },
};

/** The option in force for a row, its default when absent. */
export function directionOf(w: Pick<World, 'direction'>, key: DirectionKey): string {
  return w.direction?.[key] ?? DIRECTION_DEFAULT[key];
}
/** The option record in force for a row. */
export function directionOption(w: Pick<World, 'direction'>, key: DirectionKey) {
  const id = directionOf(w, key);
  return DIRECTION_INFO[key].options.find((option) => option.id === id)!;
}
/** The 선호 학파 in force, or undefined for any school. */
export function preferredSchool(w: Pick<World, 'direction'>): ManagerStyle | undefined {
  return w.direction?.school;
}
/** "감독 기조 육성가": a row and its option in force, for the staff's reports. */
export function directionLine(w: Pick<World, 'direction'>, key: DirectionKey) {
  return `${DIRECTION_INFO[key].label} ${directionOption(w, key).name}`;
}
/** 재정 기조 in force (→ECON-33). */
export function financeStance(w: Pick<World, 'direction'>): FinanceStance {
  return FINANCE_STANCES[directionOf(w, 'finance')];
}

/**
 * Sets one direction row (→ECON-25) like a dial: an unknown row or option is refused, an
 * unchanged one records nothing, the default is not stored, and the change is recorded as a
 * policy event naming the option.
 */
export function setDirection(w: World, key: DirectionKey, option: string) {
  const info = DIRECTION_INFO[key as DirectionKey];
  if (!info || !DIRECTION_KEYS.includes(key)) throw new Error('방향 줄을 확인하세요.');
  const chosen = info.options.find((item) => item.id === option);
  if (!chosen) throw new Error(`${info.label}의 선택지를 확인하세요.`);
  if (directionOf(w, key) === option) return;
  const next: Direction = { ...w.direction };
  if (option === DIRECTION_DEFAULT[key]) delete next[key];
  else (next as Record<string, string>)[key] = option;
  if (Object.keys(next).length) w.direction = next;
  else delete w.direction;
  addEvent(w, 'policy', `${info.label} · ${chosen.name}`, chosen.summary);
}
