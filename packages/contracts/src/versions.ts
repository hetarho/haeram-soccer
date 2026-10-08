import type { World } from './types';

export const CURRENT_ENGINE_VERSION = '1.2.0';
/** 1.1.0 added club policy; 1.2.0 adds staff, academy, transfer windows and the inbox. */
export const SUPPORTED_ENGINE_VERSIONS: readonly string[] = [
  '1.0.0',
  '1.1.0',
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
  if (w.engine !== '1.0.0' && w.engine !== '1.1.0') throw new SaveCompatibilityError();
  if (!Number.isSafeInteger(w.revision + 1)) throw new Error('저장 revision 범위를 초과했습니다.');
  return { ...w, engine: CURRENT_ENGINE_VERSION, revision: w.revision + 1 };
}
