// Opaque, reversible BMP text. Exclude ASCII, surrogates and Unicode noncharacters.
const BASE = 63198n;
const BLOCK = 127;
const DIGITS = 64;
const MAX_BYTES = 16 * 1024 * 1024;
const failure = () => new Error('BMP 저장 데이터 손상');
function character(digit: number) {
  let code = digit + 0x100;
  if (code >= 0xd800) code += 0x800;
  if (code >= 0xfdd0) code += 0x20;
  return String.fromCharCode(code);
}
function digit(code: number) {
  if (
    code < 0x100 ||
    code >= 0xfffe ||
    (code >= 0xd800 && code < 0xe000) ||
    (code >= 0xfdd0 && code < 0xfdf0)
  )
    throw failure();
  return BigInt(code - 0x100 - (code >= 0xe000 ? 0x800 : 0) - (code >= 0xfdf0 ? 0x20 : 0));
}
export function bmpText(bytes: Uint8Array): string {
  if (bytes.length > MAX_BYTES) throw failure();
  const parts = [
    String.fromCharCode(0x4e00 + (bytes.length ? ((bytes.length - 1) % BLOCK) + 1 : 0)),
  ];
  for (let offset = 0; offset < bytes.length; offset += BLOCK) {
    let value = 0n;
    for (const byte of bytes.subarray(offset, offset + BLOCK)) value = (value << 8n) | BigInt(byte);
    const output = new Array<string>(DIGITS);
    for (let i = DIGITS - 1; i >= 0; i--) {
      output[i] = character(Number(value % BASE));
      value /= BASE;
    }
    parts.push(output.join(''));
  }
  return parts.join('');
}
export function bmpBytes(text: string): Uint8Array {
  if (!text.length || (text.length - 1) % DIGITS !== 0) throw failure();
  const last = text.charCodeAt(0) - 0x4e00;
  const blocks = (text.length - 1) / DIGITS;
  if (last < 0 || last > BLOCK || (blocks === 0 ? last !== 0 : last === 0)) throw failure();
  const size = blocks ? (blocks - 1) * BLOCK + last : 0;
  if (size > MAX_BYTES) throw failure();
  const bytes = new Uint8Array(size);
  for (let block = 0; block < blocks; block++) {
    let value = 0n;
    for (let d = 0; d < DIGITS; d++)
      value = value * BASE + digit(text.charCodeAt(1 + block * DIGITS + d));
    const count = block === blocks - 1 ? last : BLOCK;
    for (let i = count - 1; i >= 0; i--) {
      bytes[block * BLOCK + i] = Number(value & 255n);
      value >>= 8n;
    }
    if (value !== 0n) throw failure();
  }
  return bytes;
}
