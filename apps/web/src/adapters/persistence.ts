import { CATALOG_HASH, currency } from '../../../../packages/catalogs/src/index';
import { canonical, validateWorld, type World } from '../../../../packages/contracts/src/index';
import { unbase64, pack, unpack } from './packing';
import { denseBytes, denseText } from './dense';
import {
  SUPPORTED_ENGINE_VERSIONS,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import {
  SAVE_CODECS,
  SaveRepository,
  type Envelope,
  type StoragePort,
  type SaveInspector,
} from './repository';
export { CHECKPOINT_LIMIT, TOTAL_LIMIT } from './repository';
export type { Envelope, StoragePort, SaveInspector } from './repository';
async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function transform(bytes: Uint8Array, compress: boolean) {
  const stream = new Blob([new Uint8Array(bytes).buffer])
    .stream()
    .pipeThrough(compress ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('저장 파일의 압축 해제 한도를 초과했습니다.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function encode(w: World, generation = 1, parentGeneration = 0): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(pack(w)));
  const e: Envelope = {
    schema: 1,
    engine: w.engine,
    catalog: w.catalog,
    catalogHash: w.catalogHash,
    worldId: w.id,
    generation,
    parentGeneration,
    codec: 'gzip-cjk14',
    checksum: await digest(bytes),
    payload: denseText(await transform(bytes, true)),
  };
  return JSON.stringify(e);
}
export async function decode(raw: string): Promise<{ world: World; envelope: Envelope }> {
  if (raw.length > 4 * 1024 * 1024) throw new Error('저장 파일이 너무 큽니다.');
  const e = JSON.parse(raw) as Envelope;
  if (!e || typeof e !== 'object' || typeof e.schema !== 'number')
    throw new Error('저장 헤더가 올바르지 않습니다.');
  if (e.schema !== 1)
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 스키마 버전입니다. 원본 파일을 보관하세요.',
    );
  if (typeof e.engine !== 'string') throw new Error('저장 엔진 헤더가 올바르지 않습니다.');
  if (!SUPPORTED_ENGINE_VERSIONS.includes(e.engine))
    throw new SaveCompatibilityError('지원하지 않는 저장 엔진 버전입니다. 원본 파일을 보관하세요.');
  if (typeof e.catalog !== 'string') throw new Error('저장 카탈로그 헤더가 올바르지 않습니다.');
  if (e.catalog !== '2026-demo-1')
    throw new SaveCompatibilityError(
      '지원하지 않는 저장 카탈로그 버전입니다. 원본 파일을 보관하세요.',
    );
  if (typeof e.codec !== 'string') throw new Error('저장 코덱 헤더가 올바르지 않습니다.');
  if (!SAVE_CODECS.includes(e.codec))
    throw new SaveCompatibilityError('지원하지 않는 저장 코덱 버전입니다. 원본 파일을 보관하세요.');
  if (typeof e.catalogHash !== 'string') throw new Error('저장 카탈로그 해시가 올바르지 않습니다.');
  if (e.catalogHash !== CATALOG_HASH)
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
  const bytes = await transform(
    e.codec === 'gzip-base64' ? unbase64(e.payload) : denseBytes(e.payload),
    false,
  );
  if ((await digest(bytes)) !== e.checksum) throw new Error('체크섬이 일치하지 않습니다.');
  const world = validateWorld(
    unpack(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))),
  );
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
/** Public codec API retained; browser clients inject their worker into lean SaveRepository. */
export class Saves extends SaveRepository {
  constructor(storage: StoragePort, inspect: SaveInspector = decode) {
    super(storage, inspect);
  }
  async save(w: World) {
    const info = this.generationInfo;
    const raw = await encode(w, info.generation, info.parentGeneration);
    await this.commit(raw);
    return raw;
  }
}
