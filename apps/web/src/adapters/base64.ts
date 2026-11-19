import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
// Padded standard base64 as ASCII codes (same text `btoa` gives); shared by the checkpoint codec.
const BASE64_CODES = Uint8Array.from(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  (char) => char.charCodeAt(0),
);
const BASE64_PAD = '='.charCodeAt(0);
const ascii = new TextDecoder();

/** Padded standard base64, the same text `btoa` gives, written as ASCII codes (as bitpacking.ts). */
export function base64(bytes: Uint8Array) {
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
export function unbase64(s: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error(sourceMessage('copy.packing.0e84000039'));
  const binary = atob(s),
    bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
