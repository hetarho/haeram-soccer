import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import {
  CATALOG_HASH,
  CATALOG_VERSION,
  LOAD_CATALOG,
  currency,
} from '../../../../packages/catalogs/src/index';
import {
  assertIdentityFormatVersions,
  validateWorld,
  type World,
} from '../../../../packages/contracts/src/index';
import { pack, unpack } from './packing';
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
  earlierRulesMessage,
  isEarlierEngine,
  NEWER_GAME_MESSAGE,
  PARITY_LEVEL_CATALOGS,
  PRIOR_CATALOG_HASHES,
  RELEVELLED_MONEY_MESSAGE,
  SUPPORTED_ENGINE_VERSIONS,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import { SAVE_CODECS, PORTABLE_FILE_LIMIT, type Envelope } from './repository';
export { PORTABLE_FILE_LIMIT, DECOMPRESSED_LIMIT } from './repository';
export type { Envelope, StoragePort, SaveInspector, PreviousStore } from './repository';
async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
/** Encodes once; the length is that of the exact uncompressed bytes the checksum covers. */
async function encodeChecked(w: World, generation: number, parentGeneration: number) {
  const bytes = new TextEncoder().encode(JSON.stringify(pack(w)));
  const checksum = await digest(bytes);
  const payload = await encodePayload(bytes);
  const envelope: Envelope = {
    schema: checkpointContainerFor(w),
    engine: w.engine,
    catalog: w.catalog,
    catalogHash: w.catalogHash,
    worldId: w.id,
    generation,
    parentGeneration,
    codec: payload.codec,
    checksum,
    payload: payload.payload,
  };
  return { raw: JSON.stringify(envelope), envelope, length: bytes.length };
}
export async function encode(w: World, generation = 1, parentGeneration = 0): Promise<string> {
  return (await encodeChecked(w, generation, parentGeneration)).raw;
}
/**
 * Everything a checkpoint is checked for before its payload means anything: header, versions,
 * catalog pin, codec, bounded decompression and checksum, then the JSON it carries.
 */
async function readEnvelope(raw: string, supported: readonly string[]) {
  if (
    raw.length > PORTABLE_FILE_LIMIT ||
    new TextEncoder().encode(raw).length > PORTABLE_FILE_LIMIT
  )
    throw new Error(sourceMessage('copy.persistence.02b1e71246'));
  const e = JSON.parse(raw) as Envelope;
  if (!e || typeof e !== 'object' || typeof e.schema !== 'number')
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  if (!isCheckpointSchema(e.schema))
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.52d3e36f5e'));
  if (typeof e.engine !== 'string') throw new Error(sourceMessage('copy.persistence.6025cca94a'));
  if (!supported.includes(e.engine))
    throw new SaveCompatibilityError(
      isEarlierEngine(e.engine) ? earlierRulesMessage(e.engine) : NEWER_GAME_MESSAGE,
      e.engine,
    );
  if (typeof e.catalog !== 'string') throw new Error(sourceMessage('copy.persistence.0bcc75e929'));
  // An older catalog is accepted by the fingerprint recorded with it (→SAVE-10); the pin moves to
  // the current catalog on writer activation, never while reading.
  const latest = e.catalog === CATALOG_VERSION;
  const pinned = latest ? CATALOG_HASH : PRIOR_CATALOG_HASHES[e.catalog];
  if (!pinned) throw new SaveCompatibilityError(sourceMessage('copy.persistence.db51c3b436'));
  if (typeof e.codec !== 'string') throw new Error(sourceMessage('copy.persistence.0ebc0d3b64'));
  if (!SAVE_CODECS.includes(e.codec))
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.62a3396f6d'));
  if (typeof e.catalogHash !== 'string')
    throw new Error(sourceMessage('copy.persistence.0331a30190'));
  if (e.catalogHash !== pinned)
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.98b9bb6b66'));
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
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  const bytes = await decodePayload(e.codec, e.payload);
  if ((await digest(bytes)) !== e.checksum)
    throw new Error(sourceMessage('copy.persistence.0d2cd0c308'));
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
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.030fddf291'));
  if (!history && carriesMatchModel(value) !== (envelope.schema === FULL_MODEL_CHECKPOINT_SCHEMA))
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.bbef3363d2'));
  return { value, envelope };
}
export async function decode(raw: string): Promise<{ world: World; envelope: Envelope }> {
  const { value, envelope: e } = await readCheckpoint(raw, SUPPORTED_ENGINE_VERSIONS, true);
  const world = validateWorld(value, LOAD_CATALOG);
  const country = world.clubs.find((c) => c.id === world.playerClub)!.country;
  if (
    world.id !== e.worldId ||
    world.engine !== e.engine ||
    world.catalog !== e.catalog ||
    world.catalogHash !== e.catalogHash ||
    world.currency !== currency(country, world.year).code
  )
    throw new Error(sourceMessage('copy.persistence.450e2c9cf6'));
  // Only England's money kept its level when the catalog re-levelled the rest (→ECON-35): elsewhere
  // a career's records would mix two levels, so it is refused, never reinterpreted (→SAVE-10).
  if (country !== 'ENG' && PARITY_LEVEL_CATALOGS.includes(world.catalog))
    throw new SaveCompatibilityError(RELEVELLED_MONEY_MESSAGE);
  return { world, envelope: e };
}
/**
 * A save verifies its own bytes (→SAVE-3, →ARCH-13): the payload is gunzipped again and its SHA-256
 * and length compared with what was encoded. It never parses, unpacks or validates the world; that
 * happens when a game opens or is imported (→SAVE-5).
 */
export async function verifyPayload(envelope: Envelope, expectedLength: number) {
  const bytes = await decodePayload(envelope.codec, envelope.payload);
  if (bytes.length !== expectedLength || (await digest(bytes)) !== envelope.checksum)
    throw new Error(sourceMessage('copy.persistence.0d2cd0c308'));
}
export async function checkpoint(w: World, generation = 1, parentGeneration = 0) {
  const { raw, envelope, length } = await encodeChecked(w, generation, parentGeneration);
  await verifyPayload(envelope, length);
  return { raw, envelope };
}
