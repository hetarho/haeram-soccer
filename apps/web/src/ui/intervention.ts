import type {
  DelegationKey,
  InterventionLevel,
  World,
} from '../../../../packages/contracts/src/types';
import { delegated, interventionOf } from '../../../../packages/engine/src/intervention';
import type { GameClient } from '../runtime/client';

/**
 * Which decisions the owner takes himself (→WEB-45), in his words: the level alone sets where the
 * clock stops (LEVEL_STOPS in runtime/progression) and what the staff decide
 * (INTERVENTION_DELEGATES in the engine). Every direction row stays as set.
 */
export const INTERVENTION_LEVELS: {
  level: InterventionLevel;
  name: string;
  /** One line for the clock's popover: where it stops and what the staff take. */
  short: string;
  summary: string;
}[] = [
  {
    level: 1,
    name: '모든 결정 확인',
    short: '모든 이벤트에서 멈추고 전부 직접 결정해요',
    summary:
      '경기 전날, 이적시장, 협상, 영입 제안, 유소년, 컵 대진, 스태프 보고, 감독·코치 재계약, 자금 경고까지 모두 멈추고, 유소년 승격부터 코치 선임까지 모든 결정을 직접 해요. 훈련 방향은 어느 단계에서나 코치들이 정해요.',
  },
  {
    level: 2,
    name: '중요한 결정만',
    short: '경기·이적·유소년·재계약·자금에서 멈춰요 · 유소년은 스태프, 선수 협상은 단장',
    summary:
      '경기 전날과 이적 협상·제안, 유소년 입단, 감독·코치 재계약, 자금·후원 경고에서만 멈춰요. 유소년 승격·방출은 유스 디렉터가, 선수 재계약·계약 개선 협상은 단장이 맡아요.',
  },
  {
    level: 3,
    name: '이적만 직접',
    short: '이적·자금에서만 멈춰요 · 선수 협상·감독 선임은 단장, 유소년·후원·코치진은 스태프',
    summary:
      '경기는 결과로 넘기고 이적시장 개장과 협상·제안, 자금 경고에서만 멈춰요. 선수 재계약·계약 개선 협상과 감독 선임은 단장이, 유소년, 후원 계약, 단장 자리를 포함한 모든 코치진 고용은 스태프가 방향에 따라 맡아요.',
  },
  {
    level: 4,
    name: '운영진에 모두 맡기기',
    short: '자금 경고에서만 멈춰요 · 이적 제안 응답과 영입까지 단장',
    summary:
      '3단계에 더해 다른 구단의 영입 제안 응답과 선수 영입까지 단장이 맡아요. 수석 스카우트의 명단과 감독의 요청을 보고 영입 줄과 재정 기조 안에서 빈 자리를 채우고 주전을 보강해요. 자금 경고에서만 멈추고, 결과는 소식함에 남아요.',
  },
];

/** The level's name, e.g. 중요한 결정만. */
export function levelName(level: InterventionLevel) {
  return INTERVENTION_LEVELS[level - 1].name;
}
/** Sends the owner's level; the stops and the staff's decisions follow it at once. */
export function applyInterventionLevel(client: GameClient, level: InterventionLevel) {
  return client.command({ type: 'intervention', level });
}
/** Who takes one decision now (→STAFF-13): the level in force and whether the staff decide. */
export function decisionOwner(w: Pick<World, 'intervention'>, key: DelegationKey) {
  const level = interventionOf(w);
  return { level, name: levelName(level), auto: delegated(w, key) };
}
