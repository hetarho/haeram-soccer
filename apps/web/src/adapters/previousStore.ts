import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { idbRequest } from './games';
import type { PreviousStore } from './repository';

const MISMATCH = {
  active: sourceMessage('copy.previousStore.df2f55e833'),
  previous: sourceMessage('copy.previousStore.d0b4dc5430'),
};

/** One checkpoint of the game in play, the active copy or its previous one, in IndexedDB (→SAVE-3). */
export class IndexedDbCheckpointKey implements PreviousStore {
  static available() {
    return typeof indexedDB !== 'undefined';
  }
  constructor(private key: 'active' | 'previous') {}
  async read() {
    const value = await idbRequest<unknown>(
      'checkpoints',
      (store) => store.get(this.key),
      'readonly',
    );
    return typeof value === 'string' ? value : null;
  }
  /** Writes and reads back, so a commit never relies on a copy it has not seen. */
  async write(raw: string) {
    await idbRequest('checkpoints', (store) => store.put(raw, this.key), 'readwrite');
    if ((await this.read()) !== raw) throw new Error(MISMATCH[this.key]);
  }
  async clear() {
    await idbRequest('checkpoints', (store) => store.delete(this.key), 'readwrite');
  }
}
