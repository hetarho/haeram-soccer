import type { World } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  SaveCompatibilityError,
  type CheckpointSchema,
} from '../../../../packages/contracts/src/versions';
export const CHECKPOINT_LIMIT = 3 * 1024 * 1024;
export const TOTAL_LIMIT = 3.5 * 1024 * 1024;
export const MANIFEST = 'haeram-soccor:manifest';
export const SLOT = ['haeram-soccor:slot:a', 'haeram-soccor:slot:b'];
function checkpointGeneration(raw: string | null) {
  try {
    const value = JSON.parse(raw || 'null')?.generation;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
/** Codec vocabulary is shared by recovery ownership and the validating worker. */
export const SAVE_CODECS: readonly string[] = ['gzip-cjk14', 'gzip-base64', 'brotli-bmp127'];
export type SaveCodec = 'gzip-cjk14' | 'gzip-base64' | 'brotli-bmp127';
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Envelope {
  /** Container 1 or 2 (identity-bearing); `World.schema` stays 1 either way. */
  schema: CheckpointSchema;
  engine: string;
  catalog: string;
  catalogHash: string;
  worldId: string;
  generation: number;
  parentGeneration: number;
  codec: SaveCodec;
  checksum: string;
  payload: string;
}
export type SaveWorldMetadata = Pick<World, 'id' | 'revision'>;
export type SaveInspector<W extends SaveWorldMetadata = World> = (
  raw: string,
) => Promise<{ world: W; envelope: Envelope }>;

/** The recovery predecessor of the game in play (→SAVE-3); `write` reads back what it stored. */
export interface PreviousStore {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
  clear(): Promise<void>;
}
/** Checkpoint sources: the two localStorage slots, then the previous store. */
export const PREVIOUS = 2;
export type Source = 0 | 1 | typeof PREVIOUS;
/** Writes a validated candidate (checkpointWriter.ts), injected so browsers load it lazily. */
export type CheckpointWrite = typeof import('./checkpointWriter').writeCheckpoint;
export interface Lineage {
  worldId: string;
  generation: number;
  parentGeneration: number;
}

/**
 * Browser storage only. Every checkpoint is validated by the injected worker codec. With a previous
 * store the game in play keeps one active copy in slot:a and its predecessor there; without one it
 * alternates slot:a and slot:b while both fit the budget.
 */
export class SaveRepository<W extends SaveWorldMetadata = World> {
  private source: Source | undefined;
  /** The committed checkpoint when it was recovered from the previous store. */
  private recoveredRaw?: string;
  private generation = 0;
  private incompatible?: SaveCompatibilityError;
  private protectedRaw?: string;
  constructor(
    private storage: StoragePort,
    private inspect: SaveInspector<W>,
    private write: CheckpointWrite,
    private previous?: PreviousStore,
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
  /** The committed checkpoint of the game in play, exactly as stored (→SAVE-14 parking). */
  committedRaw() {
    if (this.source === undefined) return null;
    if (this.source === PREVIOUS) return this.recoveredRaw ?? null;
    return this.storage.getItem(SLOT[this.source]);
  }
  /** Drops the predecessor of a game removed from play. */
  async clearPrevious() {
    await this.previous?.clear();
  }
  async load() {
    const manifest = this.storage.getItem(MANIFEST);
    // A removed game leaves no manifest or slot; its predecessor is never brought back alone.
    const sources: Source[] =
      this.previous && (manifest !== null || SLOT.some((key) => this.storage.getItem(key) !== null))
        ? [0, 1, PREVIOUS]
        : [0, 1];
    const raws = new Map<Source, string | null>();
    const read = async (source: Source) => {
      if (!raws.has(source))
        raws.set(
          source,
          source === PREVIOUS
            ? await this.previous!.read().catch(() => null)
            : this.storage.getItem(SLOT[source]),
        );
      return raws.get(source)!;
    };
    let order = sources;
    let declared: Source | undefined;
    let header: Lineage | undefined;
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
        declared = m.slot as Source;
        header = m;
        order = [declared, ...sources.filter((source) => source !== declared)];
      }
    } catch {
      /* Validate bounded checkpoints without altering any source. */
    }
    const recoverOrder = async () => {
      const generations = new Map<Source, number>();
      for (const source of sources)
        generations.set(source, checkpointGeneration(await read(source)));
      return [...sources].sort((a, b) => generations.get(b)! - generations.get(a)! || a - b);
    };
    if (declared === undefined) order = await recoverOrder();
    const errors: string[] = [];
    for (let index = 0; index < order.length; index++) {
      const source = order[index];
      const raw = await read(source);
      if (!raw) continue;
      try {
        const result = await this.inspect(raw);
        if (
          header &&
          ((source === declared &&
            (result.envelope.worldId !== header.worldId ||
              result.envelope.parentGeneration !== header.parentGeneration)) ||
            result.envelope.generation !==
              (source === declared ? header.generation : header.parentGeneration))
        ) {
          errors.push('체크포인트와 매니페스트 계보가 일치하지 않습니다.');
          header = undefined;
          declared = undefined;
          order = await recoverOrder();
          index = -1;
          continue;
        }
        this.adopt(source, raw);
        this.generation = result.envelope.generation;
        this.incompatible = undefined;
        this.protectedRaw = undefined;
        return { ...result, raw, recovered: source !== declared, errors };
      } catch (error) {
        if (isSaveCompatibilityError(error)) {
          this.incompatible = error;
          this.protectedRaw = raw;
          // Explicit recovery still writes elsewhere first, preserving this career until commit.
          this.adopt(source, raw);
          this.generation =
            checkpointGeneration(raw) || (source === declared ? header!.generation : 0);
          throw error;
        }
        errors.push(String(error));
      }
    }
    if (manifest || errors.length)
      throw new Error(
        '유효한 저장을 찾지 못했습니다. 파일 가져오기로 복구하세요. ' + errors.join(' '),
      );
    // A writer reset or confirmed deletion may have removed the previously protected career.
    this.incompatible = undefined;
    this.protectedRaw = undefined;
    this.source = undefined;
    this.recoveredRaw = undefined;
    this.generation = 0;
    return null;
  }
  private adopt(source: Source, raw: string) {
    this.source = source;
    this.recoveredRaw = source === PREVIOUS ? raw : undefined;
  }
  /**
   * Keeps the committed checkpoint as the verified previous copy, writes the candidate and reads it
   * back, then switches the manifest (→SAVE-3). A codec checkpoint comes with the envelope its
   * worker validated; any other candidate is inspected first.
   */
  async commit(raw: string, options: { replaceIncompatible?: boolean; envelope?: Envelope } = {}) {
    if (this.incompatible && !options.replaceIncompatible) throw this.incompatible;
    const envelope = options.envelope ?? (await this.inspect(raw)).envelope;
    if (envelope.generation <= this.generation)
      throw new Error('더 새로운 저장이 이미 있어 오래된 체크포인트를 쓰지 않았습니다.');
    const lineage: Lineage = {
      worldId: envelope.worldId,
      generation: envelope.generation,
      parentGeneration: envelope.parentGeneration,
    };
    const source = await this.write(
      this.storage,
      this.previous,
      this.source,
      this.committedRaw(),
      raw,
      lineage,
    );
    this.adopt(source, raw);
    this.generation = envelope.generation;
    this.incompatible = undefined;
    this.protectedRaw = undefined;
  }
}
