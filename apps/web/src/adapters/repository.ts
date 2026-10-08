import type { World } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';

export const CHECKPOINT_LIMIT = 1.5 * 1024 * 1024;
export const TOTAL_LIMIT = 3.5 * 1024 * 1024;
const MANIFEST = 'haeram-soccor:manifest';
const SLOT = ['haeram-soccor:slot:a', 'haeram-soccor:slot:b'];
function checkpointGeneration(raw: string | null) {
  try {
    const value = JSON.parse(raw || 'null')?.generation;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Envelope {
  schema: 1;
  engine: string;
  catalog: string;
  catalogHash: string;
  worldId: string;
  generation: number;
  parentGeneration: number;
  codec: 'gzip-base64';
  checksum: string;
  payload: string;
}
export type SaveInspector = (raw: string) => Promise<{ world: World; envelope: Envelope }>;

/** Browser storage only. Every checkpoint is validated by the injected worker codec. */
export class SaveRepository {
  private active: number | undefined;
  private generation = 0;
  private incompatible?: SaveCompatibilityError;
  private protectedRaw?: string;
  constructor(
    private storage: StoragePort,
    private inspect: SaveInspector,
  ) {}
  get generationInfo() {
    return { generation: this.generation + 1, parentGeneration: this.generation };
  }
  get incompatibleCheckpoint() {
    return this.incompatible !== undefined;
  }
  get incompatibleBackup() {
    return this.protectedRaw;
  }
  async load() {
    const manifest = this.storage.getItem(MANIFEST);
    let order = [0, 1];
    let declared: number | undefined;
    let header: { worldId: string; generation: number; parentGeneration: number } | undefined;
    try {
      const m = JSON.parse(manifest || 'null');
      if (
        m &&
        (m.slot === 0 || m.slot === 1) &&
        typeof m.worldId === 'string' &&
        m.worldId.length > 0 &&
        m.worldId.length <= 100 &&
        Number.isSafeInteger(m.generation) &&
        m.generation > 0 &&
        Number.isSafeInteger(m.parentGeneration) &&
        m.parentGeneration >= 0 &&
        m.parentGeneration < m.generation
      ) {
        declared = m.slot;
        header = m;
        order = [m.slot, 1 - m.slot];
      }
    } catch {
      /* Validate bounded checkpoints without altering either source. */
    }
    const recoverOrder = () =>
      [0, 1].sort(
        (a, b) =>
          checkpointGeneration(this.storage.getItem(SLOT[b])) -
            checkpointGeneration(this.storage.getItem(SLOT[a])) || a - b,
      );
    if (declared === undefined) order = recoverOrder();
    const errors: string[] = [];
    for (let index = 0; index < order.length; index++) {
      const slot = order[index];
      const raw = this.storage.getItem(SLOT[slot]);
      if (!raw) continue;
      try {
        const result = await this.inspect(raw);
        if (
          header &&
          ((slot === declared &&
            (result.envelope.worldId !== header.worldId ||
              result.envelope.parentGeneration !== header.parentGeneration)) ||
            result.envelope.generation !==
              (slot === declared ? header.generation : header.parentGeneration))
        ) {
          errors.push('체크포인트와 매니페스트 계보가 일치하지 않습니다.');
          header = undefined;
          declared = undefined;
          order = recoverOrder();
          index = -1;
          continue;
        }
        this.active = slot;
        this.generation = result.envelope.generation;
        this.incompatible = undefined;
        this.protectedRaw = undefined;
        return { ...result, raw, recovered: slot !== declared, errors };
      } catch (error) {
        if (isSaveCompatibilityError(error)) {
          this.incompatible = error;
          this.protectedRaw = raw;
          // Explicit recovery still writes the other slot, preserving this career until commit.
          this.active = slot;
          this.generation =
            checkpointGeneration(raw) || (slot === declared ? header!.generation : 0);
          throw error;
        }
        errors.push(String(error));
      }
    }
    if (manifest || errors.length)
      throw new Error(
        '유효한 저장을 찾지 못했습니다. 파일 가져오기로 복구하세요. ' + errors.join(' '),
      );
    return null;
  }
  async commit(raw: string, options: { replaceIncompatible?: boolean } = {}) {
    if (this.incompatible && !options.replaceIncompatible) throw this.incompatible;
    const { envelope } = await this.inspect(raw);
    const next = this.active === undefined ? 0 : 1 - this.active;
    const manifest = JSON.stringify({
      slot: next,
      worldId: envelope.worldId,
      generation: envelope.generation,
      parentGeneration: envelope.parentGeneration,
    });
    if (2 * (raw.length + SLOT[next].length) > CHECKPOINT_LIMIT)
      throw new Error('저장 용량 한도에 도달했습니다. 현재 진행을 파일로 내보내세요.');
    const previous = this.storage.getItem(SLOT[1 - next]) || '';
    if (
      2 *
        (raw.length + previous.length + manifest.length + SLOT.join('').length + MANIFEST.length) >
      TOTAL_LIMIT
    )
      throw new Error('브라우저 저장 예산을 초과했습니다.');
    this.storage.setItem(SLOT[next], raw);
    if (this.storage.getItem(SLOT[next]) !== raw) throw new Error('저장 읽기 검증에 실패했습니다.');
    this.storage.setItem(MANIFEST, manifest);
    if (this.storage.getItem(MANIFEST) !== manifest) throw new Error('매니페스트 읽기 검증 실패');
    this.active = next;
    this.generation = envelope.generation;
    this.incompatible = undefined;
    this.protectedRaw = undefined;
  }
}
