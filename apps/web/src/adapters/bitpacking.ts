import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
export interface BitColumns {
  count: number;
  headers: [number, number][];
  data: string;
  layout?: 'planes';
}

const MAX_COUNT = 1_000_000;
const MAX_CELLS = 16 * 1024 * 1024;
/**
 * Widest column range coded with 32-bit shifts and masks. Wider ranges (money, ids up to 53 bits)
 * stay on exact floating-point arithmetic, which `<<`/`>>>` would truncate. Bit offsets stay below
 * 2^31 because MAX_CELLS × 53 bits does.
 */
const INTEGER_BITS = 31;
const BASE64_CODES = Uint8Array.from(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  (char) => char.charCodeAt(0),
);
const BASE64_PAD = '='.charCodeAt(0);
const ascii = new TextDecoder();

function validateWidth(width: number) {
  if (!Number.isInteger(width) || width < 1 || width > 156)
    throw new Error(sourceMessage('copy.bitpacking.c852cf9f8f'));
}

/** Padded standard base64, the same text `btoa` gives, written as ASCII codes. */
function base64(bytes: Uint8Array) {
  const length = bytes.length,
    text = new Uint8Array(Math.ceil(length / 3) * 4);
  let at = 0,
    i = 0;
  for (; i + 2 < length; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    text[at++] = BASE64_CODES[triple >>> 18];
    text[at++] = BASE64_CODES[(triple >>> 12) & 63];
    text[at++] = BASE64_CODES[(triple >>> 6) & 63];
    text[at++] = BASE64_CODES[triple & 63];
  }
  if (i < length) {
    const pair = i + 1 < length;
    const triple = (bytes[i] << 16) | (pair ? bytes[i + 1] << 8 : 0);
    text[at++] = BASE64_CODES[triple >>> 18];
    text[at++] = BASE64_CODES[(triple >>> 12) & 63];
    text[at++] = pair ? BASE64_CODES[(triple >>> 6) & 63] : BASE64_PAD;
    text[at] = BASE64_PAD;
  }
  return ascii.decode(text);
}

function unbase64(encoded: string) {
  if (
    typeof encoded !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw new Error(sourceMessage('copy.bitpacking.35fae48603'));
  const binary = atob(encoded),
    bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Bits a column stores per row for the range `max - min` of its values. */
export function rangeBits(range: number) {
  let bits = 0;
  for (; range > 0; range = Math.floor(range / 2)) bits++;
  return bits;
}

/**
 * Write one column wider than INTEGER_BITS from `offset`, exactly as the format defines it;
 * returns the next offset. Each bit is added to a still-zero position of `bytes`.
 */
function writeWideColumn(
  bytes: Uint8Array,
  offset: number,
  values: number[],
  column: number,
  width: number,
  count: number,
  [min, widthBits]: [number, number],
  planes: boolean,
) {
  if (planes) {
    for (let bit = 0; bit < widthBits; bit++) {
      const weight = 2 ** bit;
      for (let row = 0; row < count; row++) {
        const value = values[row * width + column] - min;
        bytes[Math.floor(offset / 8)] += (Math.floor(value / weight) % 2) * 2 ** (offset % 8);
        offset++;
      }
    }
    return offset;
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
  return offset;
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
    for (let index = column; index < values.length; index += width) {
      const value = values[index];
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
  const planes = layout === 'planes';
  // The stream is written strictly forward: bytes past the one holding `offset` are still zero.
  let offset = 0;
  for (let column = 0; column < width; column++) {
    const [min, bits] = headers[column];
    if (!bits) continue;
    if (bits > INTEGER_BITS) {
      offset = writeWideColumn(
        bytes,
        offset,
        values,
        column,
        width,
        count,
        headers[column],
        planes,
      );
    } else if (planes) {
      for (let bit = 0; bit < bits; bit++)
        for (let index = column; index < values.length; index += width, offset++)
          bytes[offset >>> 3] |= (((values[index] - min) >>> bit) & 1) << (offset & 7);
    } else {
      for (let index = column; index < values.length; index += width) {
        const end = offset + bits;
        let value = values[index] - min;
        bytes[offset >>> 3] |= value << (offset & 7);
        value >>>= 8 - (offset & 7);
        for (let at = (offset | 7) + 1; at < end; at += 8, value >>>= 8) bytes[at >>> 3] = value;
        offset = end;
      }
    }
  }
  return { count, headers, data: base64(bytes), ...(layout ? { layout } : {}) };
}

/** Read one value of a column wider than INTEGER_BITS, exactly as the format defines it. */
function readWideValue(
  bytes: Uint8Array,
  start: number,
  row: number,
  count: number,
  widthBits: number,
  planes: boolean,
) {
  let value = 0;
  if (planes) {
    for (let bit = 0; bit < widthBits; bit++) {
      const position = start + bit * count + row;
      value += (Math.floor(bytes[Math.floor(position / 8)] / 2 ** (position % 8)) % 2) * 2 ** bit;
    }
    return value;
  }
  let offset = start + row * widthBits,
    remaining = widthBits,
    written = 0;
  while (remaining) {
    const withinByte = offset % 8;
    const chunk = Math.min(8 - withinByte, remaining);
    const part = Math.floor(bytes[Math.floor(offset / 8)] / 2 ** withinByte) % 2 ** chunk;
    value += part * 2 ** written;
    offset += chunk;
    written += chunk;
    remaining -= chunk;
  }
  return value;
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
  const offsets: number[] = [],
    mins: number[] = [],
    widths: number[] = [];
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
    mins.push(header[0]);
    widths.push(header[1]);
    totalBits += packed.count * header[1];
  }
  const bytes = unbase64(packed.data);
  if (
    bytes.length !== Math.ceil(totalBits / 8) ||
    (totalBits % 8 && bytes.at(-1)! >= 2 ** (totalBits % 8))
  )
    throw new Error(sourceMessage('copy.bitpacking.665c029da5'));
  const count = packed.count,
    cells = count * width,
    planes = packed.layout === 'planes';
  let cursor = 0,
    nextColumn = 0,
    nextRow = 0;
  return {
    take(n: number): number[] {
      if (!Number.isInteger(n) || n < 0 || cursor + n > cells)
        throw new Error(sourceMessage('copy.bitpacking.698d8a75fe'));
      const result = new Array<number>(n);
      let column = nextColumn,
        row = nextRow;
      for (let i = 0; i < n; i++) {
        const bits = widths[column];
        let value: number;
        if (bits > INTEGER_BITS) {
          value = readWideValue(bytes, offsets[column], row, count, bits, planes);
        } else if (!bits) {
          value = 0;
        } else if (planes) {
          value = 0;
          for (let bit = 0, at = offsets[column] + row; bit < bits; bit++, at += count)
            value |= ((bytes[at >>> 3] >>> (at & 7)) & 1) << bit;
        } else {
          const start = offsets[column] + row * bits;
          let at = start >>> 3;
          value = bytes[at] >>> (start & 7);
          for (let read = 8 - (start & 7); read < bits; read += 8) value |= bytes[++at] << read;
          value &= -1 >>> (32 - bits);
        }
        value += mins[column];
        if (!Number.isSafeInteger(value) || value < 0)
          throw new Error(sourceMessage('copy.bitpacking.c74e47069c'));
        result[i] = value;
        if (++column === width) {
          column = 0;
          row++;
        }
      }
      cursor += n;
      nextColumn = column;
      nextRow = row;
      return result;
    },
    done() {
      if (cursor !== cells) throw new Error(sourceMessage('copy.bitpacking.39c0a255cf'));
    },
  };
}
