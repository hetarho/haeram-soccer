import { denseBytes, denseText } from './dense';
import { bmpBytes, bmpText } from './bmp127';
import { unbase64 } from './packing';
import type { SaveCodec } from './repository';
const LIMIT = 16 * 1024 * 1024;
async function gzip(bytes: Uint8Array, compress: boolean) {
  const stream = new Blob([new Uint8Array(bytes).buffer])
    .stream()
    .pipeThrough(compress ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > LIMIT) {
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
export async function encodePayload(
  bytes: Uint8Array,
): Promise<{ codec: SaveCodec; payload: string }> {
  if (bytes.length > LIMIT) throw new Error('저장 파일의 압축 해제 한도를 초과했습니다.');
  const fast = await gzip(bytes, true);
  if (fast.length <= 1_200_000) return { codec: 'gzip-cjk14', payload: denseText(fast) };
  const { compress } = await import('brotli/compress');
  const packed = await compress(bytes, { quality: 11, lgwin: 24 });
  if (!packed) throw new Error('저장 압축에 실패했습니다.');
  return { codec: 'brotli-bmp127', payload: bmpText(packed) };
}
export function payloadBytes(codec: SaveCodec, payload: string): Uint8Array {
  return codec === 'brotli-bmp127'
    ? bmpBytes(payload)
    : codec === 'gzip-base64'
      ? unbase64(payload)
      : denseBytes(payload);
}
export async function decodePayload(codec: SaveCodec, payload: string): Promise<Uint8Array> {
  const bytes = payloadBytes(codec, payload);
  if (codec !== 'brotli-bmp127') return gzip(bytes, false);
  const { decompress } = await import('brotli/decompress');
  return decompress(bytes, undefined, LIMIT);
}
