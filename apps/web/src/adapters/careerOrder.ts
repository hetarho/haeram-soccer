const MAX_ROWS = 1_000_000;
const failure = () => new Error('인물 이력 순서 스트림 손상');
function base64(bytes: Uint8Array) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
/** Zigzag LEB128 deltas of a complete permutation, never a simulation-derived order. */
export function packCareerOrder(order: number[]) {
  if (order.length > MAX_ROWS) throw failure();
  const seen = new Uint8Array(order.length),
    bytes: number[] = [];
  let previous = 0;
  for (const original of order) {
    if (
      !Number.isSafeInteger(original) ||
      original < 0 ||
      original >= order.length ||
      seen[original]
    )
      throw failure();
    seen[original] = 1;
    const delta = original - previous;
    previous = original;
    let value = delta < 0 ? -2 * delta - 1 : 2 * delta;
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      bytes.push(byte + (value ? 128 : 0));
    } while (value);
  }
  return base64(Uint8Array.from(bytes));
}
export function readCareerOrder(text: string, count: number) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_ROWS ||
    typeof text !== 'string' ||
    text.length > count * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
  )
    throw failure();
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  if (bytes.length < count || bytes.length > count * 3 || base64(bytes) !== text) throw failure();
  const seen = new Uint8Array(count),
    order: number[] = [];
  let offset = 0,
    previous = 0;
  for (let row = 0; row < count; row++) {
    let value = 0,
      scale = 1,
      byte: number;
    do {
      if (offset >= bytes.length || scale > 128 ** 2) throw failure();
      byte = bytes[offset++];
      value += (byte % 128) * scale;
      if (scale > 1 && byte === 0) throw failure();
      scale *= 128;
    } while (byte >= 128);
    const original = previous + (value % 2 ? -(value + 1) / 2 : value / 2);
    if (original < 0 || original >= count || seen[original]) throw failure();
    seen[original] = 1;
    order.push(original);
    previous = original;
  }
  if (offset !== bytes.length) throw failure();
  return order;
}
