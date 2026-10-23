import {
  CATALOG_HASH,
  CATALOG_VERSION,
  LOAD_CATALOG,
  currency,
} from '../../../../packages/catalogs/src/index';
import {
  assertIdentityFormatVersions,
  canonical,
  validateWorld,
  type World,
} from '../../../../packages/contracts/src/index';
import { pack, unpack } from './packing';
import { writeCheckpoint } from './checkpointWriter';
import { encodePayload, decodePayload } from './compression';
import {
  assertMatchModelFormat,
  carriesMatchModel,
} from '../../../../packages/contracts/src/match-model';
import { readMatchModelFormat } from './matchModelPacking';
import { checkpointContainerFor, readManagerHistoryFormat } from './managerHistoryPacking';
import {
  carriesManagerHistory,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
  isCheckpointSchema,
  LEGACY_ENGINE_VERSIONS,
  earlierRulesMessage,
  isEarlierEngine,
  PRIOR_CATALOG_HASHES,
  SUPPORTED_ENGINE_VERSIONS,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import {
  SAVE_CODECS,
  SaveRepository,
  type Envelope,
  type StoragePort,
  type SaveInspector,
  type PreviousStore,
} from './repository';
export { CHECKPOINT_LIMIT, TOTAL_LIMIT } from './repository';
export type { Envelope, StoragePort, SaveInspector, PreviousStore } from './repository';
async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function encode(w: World, generation = 1, parentGeneration = 0): Promise<string> {
  const schema = checkpointContainerFor(w);
  const bytes = new TextEncoder().encode(canonical(pack(w)));
  const payload = await encodePayload(bytes);
  const e: Envelope = {
    schema,
    engine: w.engine,
    catalog: w.catalog,
    catalogHash: w.catalogHash,
    worldId: w.id,
    generation,
    parentGeneration,
    codec: payload.codec,
    checksum: await digest(bytes),
    payload: payload.payload,
  };
  return JSON.stringify(e);
}
/**
 * Everything a checkpoint is checked for before its payload means anything: header, versions,
 * catalog pin, codec, bounded decompression and checksum, then the JSON it carries.
 */
async function readEnvelope(raw: string, supported: readonly string[]) {
  if (raw.length > 8 * 1024 * 1024) throw new Error('저장 파일이 너무 큽니다.');
  const e = JSON.parse(raw) as Envelope;
  if (!e || typeof e !== 'object' || typeof e.schema !== 'number')
    throw new Error('저장 헤더가 올바르지 않습니다.');
  if (!isCheckpointSchema(e.schema))
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 스키마 버전입니다. 원본 파일을 보관하세요.',
    );
  if (typeof e.engine !== 'string') throw new Error('저장 엔진 헤더가 올바르지 않습니다.');
  if (!supported.includes(e.engine))
    throw new SaveCompatibilityError(
      isEarlierEngine(e.engine)
        ? earlierRulesMessage(e.engine)
        : '지원하지 않는 저장 엔진 버전입니다. 원본 파일을 보관하세요.',
      e.engine,
    );
  if (typeof e.catalog !== 'string') throw new Error('저장 카탈로그 헤더가 올바르지 않습니다.');
  // An older catalog is accepted by the fingerprint recorded with it (→SAVE-10); the pin moves to
  // the current catalog on writer activation, never while reading.
  const latest = e.catalog === CATALOG_VERSION;
  const pinned = latest ? CATALOG_HASH : PRIOR_CATALOG_HASHES[e.catalog];
  if (!pinned)
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 카탈로그 버전입니다. 원본 파일을 보관하세요.',
    );
  if (typeof e.codec !== 'string') throw new Error('저장 코덱 헤더가 올바르지 않습니다.');
  if (!SAVE_CODECS.includes(e.codec))
    throw new SaveCompatibilityError('지원하지 않는 저장 코덱 버전입니다. 원본 파일을 보관하세요.');
  if (typeof e.catalogHash !== 'string') throw new Error('저장 카탈로그 해시가 올바르지 않습니다.');
  if (e.catalogHash !== pinned)
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 카탈로그 해시입니다. 원본 파일을 보관하세요.',
    );
  if (
    !Number.isSafeInteger(e.generation) ||
    e.generation < 1 ||
    !Number.isSafeInteger(e.parentGeneration) ||
    e.parentGeneration < 0 ||
    e.parentGeneration >= e.generation ||
    typeof e.payload !== 'string' ||
    typeof e.worldId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(e.checksum)
  )
    throw new Error('저장 헤더가 올바르지 않습니다.');
  const bytes = await decodePayload(e.codec, e.payload);
  if ((await digest(bytes)) !== e.checksum) throw new Error('체크섬이 일치하지 않습니다.');
  return {
    json: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
    envelope: e,
  };
}
async function readCheckpoint(
  raw: string,
  supported: readonly string[],
  validateExpandedWorld = false,
) {
  const { json, envelope } = await readEnvelope(raw, supported);
  // A newer game's identity or match-model data is a compatibility failure before unpacking can
  // call it corrupt.
  const packed = json as {
    format?: unknown;
    world?: unknown;
    model?: unknown;
    managerHistory?: unknown;
  } | null;
  const compact = packed?.format === 'compact1';
  const world = compact ? packed.world : json;
  assertIdentityFormatVersions(world);
  assertMatchModelFormat(world);
  if (compact && packed.model !== undefined) readMatchModelFormat(packed.model);
  if (compact && packed.managerHistory !== undefined)
    readManagerHistoryFormat(packed.managerHistory);
  const value = unpack(json as Parameters<typeof unpack>[0], validateExpandedWorld);
  // Manager history travels only in its own container, with or without model data, and model
  // data otherwise only in the full-model container, each refused by an older reader (→SAVE-23/24).
  // A checksum-valid payload in another container is no writer this version knows, so it is kept
  // as incompatible rather than recovered over (→SAVE-11).
  const history = carriesManagerHistory(value);
  if (history !== (envelope.schema === MANAGER_HISTORY_CHECKPOINT_SCHEMA))
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 컨테이너와 감독 이력 데이터 조합입니다. 원본 파일을 보관하세요.',
    );
  if (!history && carriesMatchModel(value) !== (envelope.schema === FULL_MODEL_CHECKPOINT_SCHEMA))
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 컨테이너와 경기 모델 데이터 조합입니다. 원본 파일을 보관하세요.',
    );
  return { value, envelope };
}
/**
 * Integrity and known historical metadata, independently of today's unpacking and world schema:
 * an earlier rules' career is recognized even though this version can no longer read it (→SAVE-18).
 */
export async function recognizedLegacy(raw: string): Promise<boolean> {
  try {
    const { json, envelope } = await readEnvelope(raw, LEGACY_ENGINE_VERSIONS);
    // Earlier rules were never written in the match-model or manager-history container.
    if (
      envelope.schema === FULL_MODEL_CHECKPOINT_SCHEMA ||
      envelope.schema === MANAGER_HISTORY_CHECKPOINT_SCHEMA
    )
      return false;
    const packed = json as { format?: unknown; world?: Partial<World> } | null;
    const world = packed?.world;
    return (
      packed?.format === 'compact1' &&
      !!world &&
      typeof world === 'object' &&
      world.id === envelope.worldId &&
      world.engine === envelope.engine &&
      world.catalog === envelope.catalog &&
      world.catalogHash === envelope.catalogHash
    );
  } catch {
    return false;
  }
}
export async function decode(raw: string): Promise<{ world: World; envelope: Envelope }> {
  const { value, envelope: e } = await readCheckpoint(raw, SUPPORTED_ENGINE_VERSIONS, true);
  const world = validateWorld(value, LOAD_CATALOG);
  if (
    world.id !== e.worldId ||
    world.engine !== e.engine ||
    world.catalog !== e.catalog ||
    world.catalogHash !== e.catalogHash ||
    world.currency !==
      currency(world.clubs.find((c) => c.id === world.playerClub)!.country, world.year).code
  )
    throw new Error('저장 헤더와 세계가 일치하지 않습니다.');
  return { world, envelope: e };
}
/**
 * The codec worker's checkpoint (→ARCH-13): encoded, then decoded and validated as a load would, so
 * only a candidate that loads is ever handed to the slot writer.
 */
export async function checkpoint(w: World, generation = 1, parentGeneration = 0) {
  const raw = await encode(w, generation, parentGeneration);
  return { raw, envelope: (await decode(raw)).envelope };
}
/** Public codec API retained; browser clients inject their worker into lean SaveRepository. */
export class Saves extends SaveRepository {
  constructor(storage: StoragePort, inspect: SaveInspector = decode, previous?: PreviousStore) {
    super(storage, inspect, writeCheckpoint, previous);
  }
  async save(w: World) {
    const info = this.generationInfo;
    const raw = await encode(w, info.generation, info.parentGeneration);
    await this.commit(raw);
    return raw;
  }
}
