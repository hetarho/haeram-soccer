/** Staff roles, traits, contract terms and member reads: a leaf the UI may read (→ARCH-4). */
import type {
  ContractTerm,
  ManagerTrait,
  Staff,
  StaffRole,
  StaffTrait,
  World,
} from '../../contracts/src/types';
import { ratio } from './primitives';

/** The 단장 beside the manager, then the coaching departments below him, in display order. */
export const STAFF_ROLES: readonly StaffRole[] = [
  'director',
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
];
export const STAFF_INFO: Record<StaffRole, { label: string; duty: string; traits: StaffTrait[] }> =
  {
    director: {
      label: '단장',
      duty: '이적·계약 협상과 감독 선임',
      traits: ['negotiator', 'closer'],
    },
    assistant: {
      label: '수석코치',
      duty: '훈련 방향과 미드필더 패스 성장',
      traits: ['developer', 'specialist'],
    },
    attack: { label: '공격 코치', duty: '공격 능력 성장', traits: ['specialist', 'developer'] },
    defense: { label: '수비 코치', duty: '수비 능력 성장', traits: ['specialist', 'developer'] },
    goalkeeping: { label: '골키퍼 코치', duty: '골키퍼 능력 성장', traits: ['specialist'] },
    fitness: {
      label: '피지컬 코치',
      duty: '체력 성장과 피로 회복',
      traits: ['recovery', 'specialist'],
    },
    youth: {
      label: '유스 디렉터',
      duty: '아카데미 입단 수준과 유소년 성장',
      traits: ['developer', 'spotter'],
    },
    scout: {
      label: '수석 스카우트',
      duty: '이적 시장 후보 수와 잠재력',
      traits: ['spotter'],
    },
  };
export const STAFF_TRAIT_INFO: Record<StaffTrait, { label: string; effect: string }> = {
  developer: { label: '육성형', effect: '21세 이하 선수 성장이 빨라져요' },
  specialist: { label: '전문가', effect: '담당 능력 성장이 더 빨라져요' },
  recovery: { label: '회복 전문', effect: '라운드마다 피로를 더 많이 풀어요' },
  spotter: { label: '발굴가', effect: '잠재력 높은 선수를 찾아와요' },
  closer: { label: '속전속결', effect: '요구액보다 더 주고 빨리 끝내요' },
  negotiator: { label: '협상가', effect: '이적료를 낮추고 낮은 제안부터 흥정해요' },
};
export const MANAGER_TRAIT_INFO: Record<ManagerTrait, { label: string; effect: string }> = {
  youth: { label: '유망주 중용', effect: '자동 선발에서 21세 이하 선수를 더 자주 기용해요' },
  rotation: { label: '로테이션', effect: '지친 선수를 적극적으로 쉬게 해요' },
  stable: { label: '베스트 일레븐', effect: '피로가 있어도 주전을 꾸준히 기용해요' },
};

export function staffMember(w: World, role: StaffRole): Staff | undefined {
  return w.staff?.find((member) => member.role === role);
}

/** Seasons a manager or coach may sign for when the owner chooses (→STAFF-11, →STAFF-14). */
export const CONTRACT_TERMS: readonly ContractTerm[] = [1, 2, 3, 4, 5];
/** The seasons a renewal signs for when nobody chose a term, and where the owner's choice starts. */
export const DELEGATED_TERM: ContractTerm = 2;

/** Seasons left on a contract, this one included: a deal ending at this season's close has one. */
export function seasonsLeft(w: World, until: number) {
  return Math.max(0, until - w.year);
}

/**
 * Releasing or replacing a paid coach or manager pays 25% of his annual wage for each season left
 * on his contract (→STAFF-11); volunteers leave freely.
 */
export function releaseCost(w: World, person: Pick<Staff, 'wage' | 'until'> | undefined) {
  if (!person || BigInt(person.wage) <= 0n) return '0';
  return ratio(person.wage, BigInt(seasonsLeft(w, person.until)), 4n);
}

/** Starting XI average fatigue that makes the assistant call a recovery week. */
export const AUTO_RECOVERY_FATIGUE = 30;
/** Below this starters' fatigue, with morale at least AUTO_HARD_MORALE, he may call 하드 (→CLUB-13). */
export const AUTO_HARD_FATIGUE = 15;
export const AUTO_HARD_MORALE = 50;

/** A player's fatigue at which the assistant rests him whatever the squad does (→CLUB-13). */
export const AUTO_PLAYER_RECOVERY = 40;

/** A paid coach whose contract ends at this season's close. */
export function isExpiring(w: World, member: Staff) {
  return BigInt(member.wage) > 0n && member.until <= w.year + 1;
}
export const MANAGER_GONE = '감독이 떠났습니다. 새 감독을 선임하세요.';
