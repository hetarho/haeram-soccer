import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
export interface BitColumns {
  count: number;
  headers: [number, number][];
  data: string;
  layout?: 'planes';
}

const MAX_COUNT = 1_000_000;
const MAX_CELLS = 16 * 1024 * 1024;

function validateWidth(width: number) {
  if (!Number.isInteger(width) || width < 1 || width > 156)
    throw new Error(sourceMessage('copy.bitpacking.c852cf9f8f'));
}

function base64(bytes: Uint8Array) {
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 32768)
    encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(encoded);
}

function unbase64(encoded: string) {
  if (
    typeof encoded !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw new Error(sourceMessage('copy.bitpacking.35fae48603'));
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

/** Bits a column stores per row for the range `max - min` of its values. */
export function rangeBits(range: number) {
  let bits = 0;
  for (; range > 0; range = Math.floor(range / 2)) bits++;
  return bits;
}

/** Store each column using its exact minimum and the bits needed for its remaining range. */
export function packBitColumns(values: number[], width: number, layout?: 'planes'): BitColumns {
  validateWidth(width);
  if (layout !== undefined && layout !== 'planes')
    throw new Error(sourceMessage('copy.bitpacking.01dcc08ad1'));
  const count = values.length / width;
  if (!Number.isInteger(count) || count > MAX_COUNT || values.length > MAX_CELLS)
    throw new Error(sourceMessage('copy.bitpacking.41ba32cdfb'));
  const headers: [number, number][] = [];
  let totalBits = 0;
  for (let column = 0; column < width; column++) {
    let min = Number.MAX_SAFE_INTEGER,
      max = 0;
    for (let row = 0; row < count; row++) {
      const value = values[row * width + column];
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(sourceMessage('copy.bitpacking.936448c6ca'));
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (!count) min = 0;
    const bits = rangeBits(max - min);
    headers.push([min, bits]);
    totalBits += count * bits;
  }
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  let offset = 0;
  for (let column = 0; column < width; column++) {
    const [min, widthBits] = headers[column];
    if (layout === 'planes') {
      for (let bit = 0; bit < widthBits; bit++) {
        const weight = 2 ** bit;
        for (let row = 0; row < count; row++) {
          const value = values[row * width + column] - min;
          bytes[Math.floor(offset / 8)] += (Math.floor(value / weight) % 2) * 2 ** (offset % 8);
          offset++;
        }
      }
      continue;
    }
    for (let row = 0; row < count; row++) {
      let value = values[row * width + column] - min;
      let remaining = widthBits;
      while (remaining) {
        const withinByte = offset % 8;
        const chunk = Math.min(8 - withinByte, remaining);
        bytes[Math.floor(offset / 8)] += (value % 2 ** chunk) * 2 ** withinByte;
        value = Math.floor(value / 2 ** chunk);
        remaining -= chunk;
        offset += chunk;
      }
    }
  }
  return { count, headers, data: base64(bytes), ...(layout ? { layout } : {}) };
}

/** Decode by column offsets as rows are requested; opening a stream allocates no cell array. */
export function readBitColumns(packed: BitColumns, width: number) {
  validateWidth(width);
  if (
    !packed ||
    !Number.isInteger(packed.count) ||
    packed.count < 0 ||
    packed.count > MAX_COUNT ||
    packed.count * width > MAX_CELLS ||
    !Array.isArray(packed.headers) ||
    packed.headers.length !== width ||
    (packed.layout !== undefined && packed.layout !== 'planes')
  )
    throw new Error(sourceMessage('copy.bitpacking.d845f1a234'));
  const offsets: number[] = [];
  let totalBits = 0;
  for (const header of packed.headers) {
    if (
      !Array.isArray(header) ||
      header.length !== 2 ||
      !Number.isSafeInteger(header[0]) ||
      header[0] < 0 ||
      !Number.isInteger(header[1]) ||
      header[1] < 0 ||
      header[1] > 53
    )
      throw new Error(sourceMessage('copy.bitpacking.7898b86990'));
    offsets.push(totalBits);
    totalBits += packed.count * header[1];
  }
  const bytes = unbase64(packed.data);
  if (
    bytes.length !== Math.ceil(totalBits / 8) ||
    (totalBits % 8 && bytes.at(-1)! >= 2 ** (totalBits % 8))
  )
    throw new Error(sourceMessage('copy.bitpacking.665c029da5'));
  const cells = packed.count * width;
  let cursor = 0;
  return {
    take(n: number): number[] {
      if (!Number.isInteger(n) || n < 0 || cursor + n > cells)
        throw new Error(sourceMessage('copy.bitpacking.698d8a75fe'));
      const result = Array.from({ length: n }, (_, i) => {
        const index = cursor + i,
          column = index % width,
          row = Math.floor(index / width);
        const [min, widthBits] = packed.headers[column];
        let offset = offsets[column] + row * widthBits;
        let remaining = widthBits,
          written = 0,
          value = 0;
        if (packed.layout === 'planes') {
          for (let bit = 0; bit < widthBits; bit++) {
            const position = offsets[column] + bit * packed.count + row;
            value +=
              (Math.floor(bytes[Math.floor(position / 8)] / 2 ** (position % 8)) % 2) * 2 ** bit;
          }
          remaining = 0;
        }
        while (remaining) {
          const withinByte = offset % 8;
          const chunk = Math.min(8 - withinByte, remaining);
          const part = Math.floor(bytes[Math.floor(offset / 8)] / 2 ** withinByte) % 2 ** chunk;
          value += part * 2 ** written;
          offset += chunk;
          written += chunk;
          remaining -= chunk;
        }
        value += min;
        if (!Number.isSafeInteger(value) || value < 0)
          throw new Error(sourceMessage('copy.bitpacking.c74e47069c'));
        return value;
      });
      cursor += n;
      return result;
    },
    done() {
      if (cursor !== cells) throw new Error(sourceMessage('copy.bitpacking.39c0a255cf'));
    },
  };
}
