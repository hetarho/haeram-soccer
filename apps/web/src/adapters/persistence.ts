import { canonical, validateWorld, type World } from '../../../../packages/contracts/src/index';
import { base64, unbase64, pack, unpack } from './packing';
export const CHECKPOINT_LIMIT = 1.5 * 1024 * 1024;
export const TOTAL_LIMIT = 3.5 * 1024 * 1024;
const MANIFEST = 'haeram-soccor:manifest';
const SLOT = ['haeram-soccor:slot:a', 'haeram-soccor:slot:b'];
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Envelope {
  schema: 1;
  engine: string;
  catalog: string;
  worldId: string;
  generation: number;
  parentGeneration: number;
  codec: 'gzip-base64';
  checksum: string;
  payload: string;
}
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
    worldId: w.id,
    generation,
    parentGeneration,
    codec: 'gzip-base64',
    checksum: await digest(bytes),
    payload: base64(await transform(bytes, true)),
  };
  return JSON.stringify(e);
}
export async function decode(raw: string): Promise<{ world: World; envelope: Envelope }> {
  if (raw.length > 4 * 1024 * 1024) throw new Error('저장 파일이 너무 큽니다.');
  const e = JSON.parse(raw) as Envelope;
  if (
    e.schema !== 1 ||
    e.engine !== '1.0.0' ||
    e.catalog !== '2026-demo-1' ||
    e.codec !== 'gzip-base64' ||
    !Number.isSafeInteger(e.generation) ||
    e.generation < 1 ||
    !Number.isSafeInteger(e.parentGeneration) ||
    e.parentGeneration < 0 ||
    e.parentGeneration >= e.generation ||
    !/^[a-f0-9]{64}$/.test(e.checksum)
  )
    throw new Error('지원하지 않는 저장 버전 또는 헤더입니다.');
  const bytes = await transform(unbase64(e.payload), false);
  if ((await digest(bytes)) !== e.checksum) throw new Error('체크섬이 일치하지 않습니다.');
  const world = validateWorld(
    unpack(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))),
  );
  if (world.id !== e.worldId || world.engine !== e.engine || world.catalog !== e.catalog)
    throw new Error('저장 헤더와 세계가 일치하지 않습니다.');
  return { world, envelope: e };
}
export class Saves {
  private active: number | undefined;
  private generation = 0;
  constructor(
    private storage: StoragePort,
    private inspect: typeof decode = decode,
  ) {}
  get generationInfo() {
    return { generation: this.generation + 1, parentGeneration: this.generation };
  }
  async load() {
    const manifest = this.storage.getItem(MANIFEST);
    let order = [0, 1];
    let declared: number | undefined;
    let header: { worldId: string; generation: number; parentGeneration: number } | undefined;
    try {
      const m = JSON.parse(manifest || 'null');
      if (m && (m.slot === 0 || m.slot === 1)) {
        declared = m.slot;
        header = m;
        order = [m.slot, 1 - m.slot];
      }
    } catch {
      /* inspect both bounded checkpoints */
    }
    const errors: string[] = [];
    for (const slot of order) {
      const raw = this.storage.getItem(SLOT[slot]);
      if (!raw) continue;
      try {
        const result = await this.inspect(raw);
        if (
          header &&
          ((slot === declared && result.envelope.worldId !== header.worldId) ||
            result.envelope.generation !==
              (slot === declared ? header.generation : header.parentGeneration))
        )
          throw new Error('체크포인트 계보가 일치하지 않습니다.');
        this.active = slot;
        this.generation = result.envelope.generation;
        return { ...result, raw, recovered: slot !== declared, errors };
      } catch (error) {
        errors.push(String(error));
      }
    }
    if (manifest || errors.length)
      throw new Error(
        '유효한 저장을 찾지 못했습니다. 파일 가져오기로 복구하세요. ' + errors.join(' '),
      );
    return null;
  }
  async save(w: World) {
    const raw = await encode(w, this.generation + 1, this.generation);
    await this.commit(raw);
    return raw;
  }
  async commit(raw: string) {
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
  }
}
