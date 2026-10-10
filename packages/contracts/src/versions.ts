import type { World } from './types';

export const CURRENT_ENGINE_VERSION = '1.8.0';
/**
 * 1.1.0 added club policy; 1.2.0 staff, academy, transfer windows and the inbox; 1.3.0 closes
 * the season after its final round, opens the summer window there, normalizes league match
 * income to a 46-game season and adds business delegation and cash warnings; 1.4.0 plays own and
 * own-league matches as player duels and adds care actions; 1.5.0 starts clubs level with their
 * league, rates every club by its XI, charges only fatigue beyond match fitness, raises weekly
 * recovery and records match xG; 1.6.0 records advanced match counters, defends tactic lines,
 * adds manager styles, owner requests to the manager, club visions and academy investment; 1.7.0
 * lets delegated staff weigh age, contract, cash runway and prospects when selling; 1.8.0 replaces
 * the six club visions with a six-slot club build (a stored vision loads as its preset).
 */
export const SUPPORTED_ENGINE_VERSIONS: readonly string[] = [
  '1.0.0',
  '1.1.0',
  '1.2.0',
  '1.3.0',
  '1.4.0',
  '1.5.0',
  '1.6.0',
  '1.7.0',
  CURRENT_ENGINE_VERSION,
];
export const SAVE_COMPATIBILITY_CODE = 'save-compatibility' as const;

export class SaveCompatibilityError extends Error {
  readonly code = SAVE_COMPATIBILITY_CODE;
  constructor(
    message = '지원하지 않는 저장 버전 또는 카탈로그입니다. 원본 파일을 내보내 보관하세요.',
  ) {
    super(message);
    this.name = 'SaveCompatibilityError';
  }
}

export function isSaveCompatibilityError(error: unknown): error is SaveCompatibilityError {
  return (
    error instanceof SaveCompatibilityError ||
    (!!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === SAVE_COMPATIBILITY_CODE)
  );
}

/** Only rule metadata and revision change; absent optional fields and all prior facts survive. */
export function upgradeWorldRules(w: World): World {
  if (w.engine === CURRENT_ENGINE_VERSION) return w;
  if (!SUPPORTED_ENGINE_VERSIONS.includes(w.engine)) throw new SaveCompatibilityError();
  if (!Number.isSafeInteger(w.revision + 1)) throw new Error('저장 revision 범위를 초과했습니다.');
  return { ...w, engine: CURRENT_ENGINE_VERSION, revision: w.revision + 1 };
}
