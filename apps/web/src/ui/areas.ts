import type { DirectionKey, PolicyKey, World } from '../../../../packages/contracts/src/types';
import type { BuildSlot } from '../../../../packages/contracts/src/build';
import { BUILD_SLOT_INFO, buildOf, cardOf } from '../../../../packages/engine/src/build';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { DIRECTION_INFO, directionOption } from '../../../../packages/engine/src/direction';
import { TICKET_LEVELS } from './ticketLevels';

/**
 * A row of the club's direction (→ECON-25): a card slot, a dial (→ECON-16), the ticket price
 * (→ECON-17) or a direction row the delegated staff follow.
 */
export type RowKey = BuildSlot | PolicyKey | 'ticket' | DirectionKey;
export type AreaKey =
  'squad' | 'scouting' | 'market' | 'youth' | 'staff' | 'finance' | 'local' | 'global';
export interface DirectionArea {
  key: AreaKey;
  label: string;
  /** The strategy card's slot; the staff and global areas have none. */
  card?: BuildSlot;
  /** Dials and direction rows after the card. */
  rows: readonly Exclude<RowKey, BuildSlot>[];
  /** The base the area's rows build (→ECON-34). */
  base?: 'local' | 'global';
}

/**
 * The club's direction by the decisions it steers (→ECON-25): each area's card says how the club
 * goes about it, its dials how much it puts in and its direction rows how the delegated staff
 * choose. Every row is set at founding and changed by nobody in a career. The training focus is
 * no row: the coaches set it (→CLUB-13).
 */
export const DIRECTION_AREAS: readonly DirectionArea[] = [
  { key: 'squad', label: '선수단', card: 'culture', rows: [] },
  { key: 'scouting', label: '영입', card: 'scouting', rows: ['recruitment', 'recruitmentSupport'] },
  { key: 'market', label: '매각', card: 'market', rows: [] },
  { key: 'youth', label: '유소년', card: 'youth', rows: ['youthGoal', 'debut', 'academy'] },
  { key: 'staff', label: '스태프', rows: ['school', 'manager', 'coaches'] },
  { key: 'finance', label: '재정', card: 'revenue', rows: ['finance', 'support', 'renewal'] },
  {
    key: 'local',
    label: '지역',
    card: 'fans',
    rows: ['localInvest', 'grassroots', 'ticket'],
    base: 'local',
  },
  {
    key: 'global',
    label: '글로벌',
    rows: ['globalMarketing', 'globalScouting', 'tour'],
    base: 'global',
  },
];

const isSlot = (key: RowKey): key is BuildSlot => Object.hasOwn(BUILD_SLOT_INFO, key);
const isDial = (key: RowKey): key is PolicyKey => Object.hasOwn(POLICY_INFO, key);

/**
 * A row's name and the option the club holds: its card, its dial's step, the ticket preset or the
 * direction row's option. A ticket price off the presets, kept from an older save, reads 사용자
 * 지정 (→ECON-17).
 */
export function rowInForce(w: World, key: RowKey): { label: string; value: string } {
  if (isSlot(key))
    return { label: BUILD_SLOT_INFO[key].label, value: cardOf(buildOf(w), key).label };
  if (key === 'ticket')
    return {
      label: '티켓 가격',
      value: TICKET_LEVELS.find((level) => level.price === w.ticket)?.name ?? '사용자 지정',
    };
  if (isDial(key))
    return {
      label: POLICY_INFO[key].label,
      value: POLICY_INFO[key].levels[policyOf(w)[key] - 1].name,
    };
  return { label: DIRECTION_INFO[key].label, value: directionOption(w, key).name };
}

/** The base an area's rows build, as it reads beside the area (→ECON-34): 지역 기반 12. */
export function areaBase(w: World, area: DirectionArea) {
  if (area.base === 'local') return `지역 기반 ${Math.round(w.localBase ?? 0)}`;
  if (area.base === 'global') return `글로벌 인지도 ${Math.round(w.globalReach ?? 0)}`;
  return undefined;
}
