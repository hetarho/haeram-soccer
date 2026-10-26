import {
  ACTIVE,
  CHECKPOINT_LIMIT,
  MANIFEST,
  PREVIOUS,
  SLOT,
  TOTAL_LIMIT,
  type IndexedCheckpoints,
  type Lineage,
  type Source,
  type StoragePort,
} from './repository';

/** A commit that would leave no verified previous copy beside the committed one (→SAVE-3). */
export class PreviousUnavailableError extends Error {
  readonly code = 'previous-unavailable';
  constructor() {
    super('이 브라우저에서는 이전 저장본을 함께 둘 공간이 없어 저장하지 않았어요');
  }
}
/** Namespaced localStorage use (→SAVE-4); IndexedDB is not part of it. */
const budget = (...values: string[]) =>
  2 * (values.join('').length + SLOT.join('').length + MANIFEST.length);
function writeVerified(storage: StoragePort, key: string, value: string, failure: string) {
  storage.setItem(key, value);
  if (storage.getItem(key) !== value) throw new Error(failure);
}

/**
 * Writes a validated candidate after the committed checkpoint `committed` read from `source`
 * (→SAVE-3) and returns the source now committed. With IndexedDB: copy the committed checkpoint
 * to previous and verify it, write and read back active, then switch the manifest; a game still in
 * slot:a/b leaves localStorage only after that. Without it: write the inactive slot while both
 * fit the budget.
 */
export async function writeCheckpoint(
  storage: StoragePort,
  indexed: IndexedCheckpoints | undefined,
  source: Source | undefined,
  committed: string | null,
  raw: string,
  lineage: Lineage,
): Promise<Source> {
  if (2 * (raw.length + SLOT[0].length) > CHECKPOINT_LIMIT)
    throw new Error('저장 용량 한도에 도달했습니다. 현재 진행을 파일로 내보내세요.');
  if (indexed) {
    const manifest = JSON.stringify({ slot: ACTIVE, ...lineage });
    if (budget(manifest) > TOTAL_LIMIT) throw new Error('브라우저 저장 예산을 초과했습니다.');
    if (committed !== null && source !== PREVIOUS) await indexed.previous.write(committed);
    await indexed.active.write(raw);
    writeVerified(storage, MANIFEST, manifest, '매니페스트 읽기 검증 실패');
    for (const key of SLOT) if (storage.getItem(key) !== null) storage.removeItem(key);
    // A first checkpoint has no predecessor; a copy left by another career must not recover into it.
    if (committed === null) await indexed.previous.clear().catch(() => {});
    return ACTIVE;
  }
  const next = source !== 0 ? 0 : 1;
  const manifest = JSON.stringify({ slot: next, ...lineage });
  const other = storage.getItem(SLOT[1 - next]) || '';
  if (budget(raw, other, manifest) > TOTAL_LIMIT) {
    // Overwriting would leave the committed checkpoint without a verified previous copy.
    if (committed !== null) throw new PreviousUnavailableError();
    throw new Error('브라우저 저장 예산을 초과했습니다.');
  }
  writeVerified(storage, SLOT[next], raw, '저장 읽기 검증에 실패했습니다.');
  writeVerified(storage, MANIFEST, manifest, '매니페스트 읽기 검증 실패');
  return next;
}
