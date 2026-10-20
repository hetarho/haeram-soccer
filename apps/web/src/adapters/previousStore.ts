import { idbRequest } from './games';
import type { PreviousStore } from './repository';

const KEY = 'previous';

/** The previous committed checkpoint of the game in play, in IndexedDB (→SAVE-3). */
export class IndexedDbPreviousStore implements PreviousStore {
  static available() {
    return typeof indexedDB !== 'undefined';
  }
  async read() {
    const value = await idbRequest<unknown>('checkpoints', (store) => store.get(KEY), 'readonly');
    return typeof value === 'string' ? value : null;
  }
  /** Writes and reads back, so a commit never relies on a copy it has not seen. */
  async write(raw: string) {
    await idbRequest('checkpoints', (store) => store.put(raw, KEY), 'readwrite');
    if ((await this.read()) !== raw) throw new Error('이전 저장본을 다시 읽어 확인하지 못했어요.');
  }
  async clear() {
    await idbRequest('checkpoints', (store) => store.delete(KEY), 'readwrite');
  }
}
