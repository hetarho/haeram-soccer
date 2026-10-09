/**
 * Dense text for compressed checkpoint bytes, 14 bits per character.
 *
 * Browser storage is budgeted in UTF-16 code units (→SAVE-4), where Base64 spends one code unit
 * on 6 bits. These characters are CJK Unified Ideographs U+4E00–U+8DFF: all assigned, never
 * surrogates, unchanged by every Unicode normalization form and stored by JSON verbatim.
 *
 * The first character carries the zero padding (0–13 bits) that completes the last group, so the
 * byte length is exact without a separate length field.
 */
const BASE = 0x4e00;
const BITS = 14;
const MASK = (1 << BITS) - 1;
const CHUNK = 8192;

export function denseText(bytes: Uint8Array): string {
  const bits = bytes.length * 8;
  const count = Math.ceil(bits / BITS);
  const codes = new Array<number>(count + 1);
  codes[0] = BASE + (count * BITS - bits);
  let held = 0,
    value = 0,
    out = 1;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    held += 8;
    if (held >= BITS) {
      held -= BITS;
      codes[out++] = BASE + ((value >>> held) & MASK);
      value &= (1 << held) - 1;
    }
  }
  if (held) codes[out++] = BASE + ((value << (BITS - held)) & MASK);
  let text = '';
  for (let i = 0; i < codes.length; i += CHUNK)
    text += String.fromCharCode(...codes.slice(i, i + CHUNK));
  return text;
}

export function denseBytes(text: string): Uint8Array {
  const padding = text.charCodeAt(0) - BASE;
  if (!(padding >= 0 && padding < BITS)) throw new Error('저장 인코딩 헤더 손상');
  const bits = (text.length - 1) * BITS - padding;
  if (bits < 0 || bits % 8) throw new Error('저장 인코딩 길이 손상');
  const bytes = new Uint8Array(bits / 8);
  let held = 0,
    value = 0,
    out = 0;
  for (let i = 1; i < text.length; i++) {
    const code = text.charCodeAt(i) - BASE;
    if (!(code >= 0 && code <= MASK)) throw new Error('저장 인코딩 문자 손상');
    value = (value << BITS) | code;
    held += BITS;
    while (held >= 8 && out < bytes.length) {
      held -= 8;
      bytes[out++] = (value >>> held) & 0xff;
      value &= (1 << held) - 1;
    }
  }
  // Whatever is left over must be exactly the declared zero padding.
  if (out !== bytes.length || held !== padding || value !== 0)
    throw new Error('저장 인코딩 패딩 손상');
  return bytes;
}
