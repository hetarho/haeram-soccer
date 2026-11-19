import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { base64, unbase64 } from './base64';
import { DECOMPRESSED_LIMIT, type SaveCodec } from './repository';
async function gzip(bytes: Uint8Array, compress: boolean, limit: number) {
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
    if (size > limit) {
      await reader.cancel();
      throw new Error(sourceMessage('copy.compression.32374943f3'));
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
export interface EncodedPayload {
  codec: SaveCodec;
  payload: string;
}
/** Every checkpoint and export is gzip in base64 (→SAVE-2, →ARCH-12): no other codec exists. */
export async function encodePayload(
  bytes: Uint8Array,
  limit = DECOMPRESSED_LIMIT,
): Promise<EncodedPayload> {
  if (bytes.length > limit) throw new Error(sourceMessage('copy.compression.32374943f3'));
  return { codec: 'gzip-base64', payload: base64(await gzip(bytes, true, limit)) };
}
export function payloadBytes(codec: SaveCodec, payload: string): Uint8Array {
  if (codec !== 'gzip-base64') throw new Error(sourceMessage('copy.persistence.62a3396f6d'));
  return unbase64(payload);
}
export async function decodePayload(
  codec: SaveCodec,
  payload: string,
  limit = DECOMPRESSED_LIMIT,
): Promise<Uint8Array> {
  return gzip(payloadBytes(codec, payload), false, limit);
}
