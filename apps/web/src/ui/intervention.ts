import type { DelegationKey, InboxKind, World } from '../../../../packages/contracts/src/types';
import { COACH_KEYS, coachKey } from '../../../../packages/engine/src/hiring';
import { STAFF_INFO, STAFF_ROLES } from '../../../../packages/engine/src/staff';
import type { GameClient } from '../runtime/client';
import { STOP_LABELS, type ProgressionController, type StopOn } from '../runtime/progression';
import type { Home } from './state';

/** The switches the intervention level presets: every staff switch but the training focus. */
export type LevelKey = Exclude<DelegationKey, 'training'>;
/**
 * The training focus and the coach choosing it belong to 훈련 (→WEB-70), so no level sets or
 * reads that switch (→WEB-45).
 */
export const LEVEL_KEYS: readonly LevelKey[] = [
  'academy',
  'contracts',
  'transfers',
  'business',
  ...COACH_KEYS,
  'manager',
];
/** Every event kind that can stop the clock. */
export const ALL_KINDS = Object.keys(STOP_LABELS) as InboxKind[];
const stops = (on: InboxKind[]): StopOn =>
  Object.fromEntries(ALL_KINDS.map((kind) => [kind, on.includes(kind)])) as StopOn;
/** The level's switches: those it names on, every other level switch off. */
const switches = (on: LevelKey[]) =>
  Object.fromEntries(LEVEL_KEYS.map((key) => [key, on.includes(key)])) as Record<LevelKey, boolean>;

/**
 * Which decisions the owner looks at himself (→WEB-45): a preset over the clock stops and the
 * staff switches, never a choice of direction. Every criterion stays as set.
 */
export const INTERVENTION_LEVELS: {
  name: string;
  /** One line for the clock's quick picker. */
  short: string;
  summary: string;
  stopOn: StopOn;
  delegation: Record<LevelKey, boolean>;
}[] = [
  {
    name: '모든 결정 확인',
    short: '모든 이벤트에서 멈추고 직접 결정해요',
    summary:
      '경기 전날, 이적시장, 협상, 영입 제안, 유소년, 컵 대진, 스태프 보고, 감독·코치 재계약, 자금 경고까지 모두 멈춰서 직접 결정해요.',
    stopOn: stops(ALL_KINDS),
    delegation: switches([]),
  },
  {
    name: '중요한 결정만',
    short: '경기·이적·유소년·코치·자금에서 멈춰요',
    summary:
      '경기 전날과 이적 협상·제안, 유소년 입단, 감독·코치 재계약, 자금·후원 경고에서만 멈춰요. 유소년 승격과 선수 재계약·계약 개선 협상은 스태프가 맡아요.',
    stopOn: stops([
      'match',
      'window-open',
      'bid-response',
      'incoming-bid',
      'youth-intake',
      'staff-renewal',
      'finance',
      'sponsor-ending',
    ]),
    delegation: switches(['academy', 'contracts']),
  },
  {
    name: '이적만 직접',
    short: '이적·재계약·자금에서만 멈춰요',
    summary:
      '경기는 결과로 넘기고 이적시장 개장과 협상·제안, 감독·코치 재계약, 자금·후원 경고에서만 멈춰요. 유소년과 선수 재계약·계약 개선 협상은 스태프가 맡아요.',
    stopOn: stops([
      'window-open',
      'bid-response',
      'incoming-bid',
      'staff-renewal',
      'finance',
      'sponsor-ending',
    ]),
    delegation: switches(['academy', 'contracts']),
  },
  {
    name: '운영진에 모두 맡기기',
    short: '운영진이 처리하고 자금·후원 경고만 멈춰요',
    summary:
      '감독과 스태프가 경기·유소년·선수 재계약·계약 개선 협상·영입 제안·후원 계약·모든 코치진 부서의 고용·감독 선임까지 처리하고, 자금·후원 경고에서만 멈춰요. 결과는 소식함에 남아요.',
    stopOn: stops(['finance', 'sponsor-ending']),
    delegation: switches([
      'academy',
      'contracts',
      'transfers',
      'business',
      ...COACH_KEYS,
      'manager',
    ]),
  },
];
/**
 * The level whose stops and switches match, or -1 for a mix the owner changed in a home (맞춤).
 * The training switch is never compared.
 */
export function interventionLevel(stopOn: StopOn, w: Pick<World, 'delegation'>) {
  return INTERVENTION_LEVELS.findIndex(
    (level) =>
      ALL_KINDS.every((kind) => level.stopOn[kind] === stopOn[kind]) &&
      LEVEL_KEYS.every((key) => level.delegation[key] === !!w.delegation?.[key]),
  );
}
/** A level's name; a mix of no level reads 맞춤 (→WEB-45). */
export function levelName(level: number) {
  return level >= 0 ? INTERVENTION_LEVELS[level].name : '맞춤';
}
/** Applies a level: its clock stops at once, then every level switch that differs. */
export function applyInterventionLevel(
  client: GameClient,
  controller: ProgressionController,
  w: Pick<World, 'delegation'>,
  index: number,
) {
  const level = INTERVENTION_LEVELS[index];
  controller.setStopOnAll(level.stopOn);
  for (const key of LEVEL_KEYS)
    if (!!w.delegation?.[key] !== level.delegation[key])
      void client.command({ type: 'delegate', key, value: level.delegation[key] });
}

/** Each staff switch's decision in the owner's words and the home where it is set (→WEB-71). */
const DECISIONS: { key: DelegationKey; label: string; home: Home }[] = [
  { key: 'training', label: '훈련 방향', home: { page: 'training', view: 'training' } },
  { key: 'academy', label: '유소년 승격·방출', home: { page: 'training', view: 'academy' } },
  { key: 'contracts', label: '선수 계약 협상', home: { page: 'people', view: 'players' } },
  { key: 'transfers', label: '이적 제안 응답', home: { page: 'people', view: 'market' } },
  { key: 'business', label: '스폰서 계약', home: { page: 'business', view: 'sponsor' } },
  ...STAFF_ROLES.map((role) => ({
    key: coachKey(role),
    label: `${STAFF_INFO[role].label} 선임·재계약`,
    home: { page: 'people', view: 'coaches' } as const,
  })),
  { key: 'manager', label: '감독 선임', home: { page: 'people', view: 'manager' } },
];
/** The decisions the staff take now, the training focus included, each with its home. */
export function delegatedDecisions(w: Pick<World, 'delegation'>) {
  return DECISIONS.filter(({ key }) => !!w.delegation?.[key]);
}
