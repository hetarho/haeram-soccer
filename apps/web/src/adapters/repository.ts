import type { World } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  SaveCompatibilityError,
  type CheckpointSchema,
} from '../../../../packages/contracts/src/versions';
export const INDEXED_CHECKPOINT_LIMIT = 6 * 1024 * 1024;
export const PORTABLE_FILE_LIMIT = 8 * 1024 * 1024;
export const MANIFEST = 'haeram-soccor:manifest';
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
  /** Container 1, 2 (identity-bearing) or 3 (match model); `World.schema` stays 1 in each. */
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

/**
 * One IndexedDB checkpoint of the game in play, its active copy or recovery predecessor (→SAVE-3);
 * `write` reads back what it stored.
 */
export interface PreviousStore {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
  clear(): Promise<void>;
}
/** The game in play's IndexedDB keys; both or neither are available. */
export interface IndexedCheckpoints {
  active: PreviousStore;
  previous: PreviousStore;
}
export const PREVIOUS = 'previous';
export const ACTIVE = 'active';
export type Source = typeof PREVIOUS | typeof ACTIVE;
/** Writes a validated candidate (checkpointWriter.ts), injected so browsers load it lazily. */
export type CheckpointWrite = typeof import('./checkpointWriter').writeCheckpoint;
export interface Lineage {
  worldId: string;
  generation: number;
  parentGeneration: number;
}

/** IndexedDB checkpoints, validated by the injected worker codec before activation or commit. */
export class SaveRepository<W extends SaveWorldMetadata = World> {
  private source: Source | undefined;
  /** The committed checkpoint when it sits in IndexedDB, so parking reads it without waiting. */
  private indexedRaw?: string;
  /** The IndexedDB active copy as last read or written, for recovery exports. */
  private activeRaw?: string;
  private indexed?: IndexedCheckpoints;
  private generation = 0;
  private incompatible?: SaveCompatibilityError;
  private protectedRaw?: string;
  constructor(
    private storage: StoragePort,
    private inspect: SaveInspector<W>,
    private write: CheckpointWrite,
    previous?: PreviousStore,
    active?: PreviousStore,
  ) {
    if (previous && active) this.indexed = { previous, active };
  }
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
    return this.indexedRaw ?? null;
  }
  /**
   * The stored checkpoint a recovery export keeps: the protected incompatible one, else the
   * manifest's source, else any stored copy.
   */
  recoveryRaw() {
    if (this.protectedRaw) return this.protectedRaw;
    return this.activeRaw;
  }
  /** Whether the current IndexedDB game or its commit manifest exists. */
  hasStored() {
    return this.storage.getItem(MANIFEST) !== null || this.activeRaw !== undefined;
  }
  /** Drops the active copy of a game removed from play; on failure the game stays whole. */
  async clearActive() {
    await this.requireIndexed().active.clear();
    this.storage.removeItem(MANIFEST);
    this.source = undefined;
    this.indexedRaw = undefined;
    this.generation = 0;
    this.activeRaw = undefined;
  }
  /** Drops the predecessor of a game removed from play. */
  async clearPrevious() {
    await this.requireIndexed().previous.clear();
  }
  private requireIndexed() {
    if (!this.indexed)
      throw new Error('게임 저장에는 IndexedDB가 필요해요. 브라우저의 저장 권한을 확인하세요.');
    return this.indexed;
  }
  async load() {
    const indexed = this.requireIndexed();
    const manifest = this.storage.getItem(MANIFEST);
    const raws = new Map<Source, string | null>();
    const read = async (source: Source) => {
      if (!raws.has(source)) raws.set(source, await indexed[source].read());
      if (source === ACTIVE) this.activeRaw = raws.get(ACTIVE) ?? undefined;
      return raws.get(source)!;
    };
    this.activeRaw = undefined;
    const sources: Source[] = [ACTIVE];
    // A deleted game's lone predecessor is never restored as the game in play.
    if (manifest !== null || (await read(ACTIVE)) !== null) sources.push(PREVIOUS);
    let order = sources;
    let declared: Source | undefined;
    let header: Lineage | undefined;
    try {
      const m = JSON.parse(manifest || 'null');
      if (
        m &&
        typeof m.worldId === 'string' &&
        m.worldId.length > 0 &&
        m.worldId.length <= 100 &&
        Number.isSafeInteger(m.generation) &&
        m.generation > 0 &&
        Number.isSafeInteger(m.parentGeneration) &&
        m.parentGeneration >= 0 &&
        m.parentGeneration < m.generation
      ) {
        declared = ACTIVE;
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
      return [...sources].sort(
        (a, b) =>
          generations.get(b)! - generations.get(a)! || sources.indexOf(a) - sources.indexOf(b),
      );
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
          // An interrupted active/manifest write can leave the committed generation in previous.
          // Only take it after validating active, so incompatible newer data still stays protected.
          if (declared === ACTIVE) {
            try {
              const previous = JSON.parse((await read(PREVIOUS)) || 'null');
              if (
                previous?.worldId === header.worldId &&
                previous.generation === header.generation &&
                previous.parentGeneration === header.parentGeneration
              ) {
                declared = PREVIOUS;
                order = [PREVIOUS, ACTIVE];
                index = -1;
                continue;
              }
            } catch {
              /* Normal validated recovery below handles malformed headers. */
            }
          }
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
        return { ...result, raw, recovered: source !== ACTIVE || declared === undefined, errors };
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
    // Confirmed deletion may have removed the previously protected career.
    this.incompatible = undefined;
    this.protectedRaw = undefined;
    this.source = undefined;
    this.indexedRaw = undefined;
    this.generation = 0;
    return null;
  }
  private adopt(source: Source, raw: string) {
    this.source = source;
    this.indexedRaw = source === PREVIOUS || source === ACTIVE ? raw : undefined;
    if (source === ACTIVE) this.activeRaw = raw;
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
      this.requireIndexed(),
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
