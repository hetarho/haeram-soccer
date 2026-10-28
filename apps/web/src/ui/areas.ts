import type { DirectionKey, PolicyKey } from '../../../../packages/contracts/src/types';
import type { BuildSlot } from '../../../../packages/contracts/src/build';

/** A dial of the board (→ECON-16, →ECON-17). */
export type DialKey = PolicyKey | 'ticket';
/** Any row of the board that is not a card: a dial or a direction row (→ECON-25). */
export type RowKey = DialKey | DirectionKey;
export type AreaKey =
  'squad' | 'scouting' | 'market' | 'youth' | 'staff' | 'finance' | 'local' | 'global';
export interface DirectionArea {
  key: AreaKey;
  label: string;
  icon: string;
  question: string;
  /** The strategy card's slot; the staff area has none. */
  card?: BuildSlot;
  /** Dials and direction rows after the card, in their order on the board. */
  rows: readonly RowKey[];
  /** The base the area's rows build, named in its header (→ECON-34). */
  base?: 'local' | 'global';
}
/** Whether a row is a direction row rather than a dial. */
export const isDirectionRow = (key: RowKey): key is DirectionKey =>
  key === 'recruitmentSupport' ||
  key === 'renewal' ||
  key === 'school' ||
  key === 'manager' ||
  key === 'coaches' ||
  key === 'finance' ||
  key === 'youthGoal' ||
  key === 'debut';

/**
 * The club's direction by the decisions it steers (→ECON-25): each area's card says how the club
 * goes about it, its dials how much it puts in and its direction rows how the delegated staff
 * choose. The training focus is no row of the board: it belongs to 훈련 (→WEB-70).
 */
export const DIRECTION_AREAS: readonly DirectionArea[] = [
  {
    key: 'squad',
    label: '선수단',
    icon: '★',
    question: '선수단의 라커룸 문화를 어떻게 만들까',
    card: 'culture',
    rows: [],
  },
  {
    key: 'scouting',
    label: '영입',
    icon: '⇄',
    question: '어떤 선수를 어떻게 찾아 데려올까',
    card: 'scouting',
    rows: ['recruitment', 'recruitmentSupport'],
  },
  {
    key: 'market',
    label: '매각',
    icon: '↗',
    question: '우리 선수를 원하는 구단에 어떻게 응할까',
    card: 'market',
    rows: [],
  },
  {
    key: 'youth',
    label: '유소년',
    icon: '✿',
    question: '아카데미 아이들을 어디서 데려와 무엇을 위해, 언제 올릴까',
    card: 'youth',
    rows: ['youthGoal', 'debut', 'academy'],
  },
  {
    key: 'staff',
    label: '스태프',
    icon: '☰',
    question: '감독과 코치 자리는 어떤 사람으로 채울까',
    rows: ['school', 'manager', 'coaches'],
  },
  {
    key: 'finance',
    label: '재정',
    icon: '₤',
    question: '어디서 벌고, 맡긴 돈은 얼마나 과감하게 쓸까',
    card: 'revenue',
    rows: ['finance', 'support', 'renewal'],
  },
  {
    key: 'local',
    label: '지역',
    icon: '◎',
    question: '연고지와 어떻게 지내고, 동네에 얼마나 투자할까',
    card: 'fans',
    rows: ['localInvest', 'grassroots', 'ticket'],
    base: 'local',
  },
  {
    key: 'global',
    label: '글로벌',
    icon: '◍',
    question: '구단 이름을 해외에 얼마나 알리고 넓힐까',
    rows: ['globalMarketing', 'globalScouting', 'tour'],
    base: 'global',
  },
];
/** The area holding a row or a card slot. */
export const areaOf = (key: RowKey | BuildSlot) =>
  DIRECTION_AREAS.find((area) => area.card === key || area.rows.includes(key as RowKey))!;
