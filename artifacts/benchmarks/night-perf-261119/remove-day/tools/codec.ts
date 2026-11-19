// D6b (copied into the base tree as scripts/perf/codec.ts): the codec worker's checkpoint work on a
// world: pack + canonical + UTF-8, gzip (node zlib, CompressionStream's default level), and the
// product's encodePayload decision (gzip-cjk14 accepted, or the Brotli q11 fallback), without Brotli.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pack } from '../../apps/web/src/adapters/packing';
import { canonical } from '../../packages/contracts/src/index';
import { INDEXED_CHECKPOINT_LIMIT, PORTABLE_FILE_LIMIT } from '../../apps/web/src/adapters/repository';
import { cpu } from './side';
for (const f of process.argv.slice(2)) {
  const w: any = v8.deserialize(readFileSync(f));
  let a = cpu();
  const bytes = new TextEncoder().encode(canonical(pack(w)));
  const packMs = cpu() - a;
  a = cpu();
  const gz = gzipSync(bytes);
  const gzipMs = cpu() - a;
  const chars = Math.ceil((gz.length * 8) / 14);
  // The envelope check: 2 × UTF-16 length within the indexed limit and UTF-8 bytes (3 per CJK char) within the portable one.
  const fitsIndexed = 2 * (chars + 400) <= INDEXED_CHECKPOINT_LIMIT;
  const fitsPortable = 3 * chars + 400 <= PORTABLE_FILE_LIMIT;
  console.log(JSON.stringify({ file: f.split('/').pop(), year: w.year, packedMB: +(bytes.length / 1e6).toFixed(2), packMs: +packMs.toFixed(0), gzipMB: +(gz.length / 1e6).toFixed(2), gzipMs: +gzipMs.toFixed(0), fast: gz.length <= 1_200_000 || (fitsIndexed && fitsPortable), fitsIndexed, fitsPortable, gzipCliffMB: +((Math.min(INDEXED_CHECKPOINT_LIMIT / 2, PORTABLE_FILE_LIMIT / 3) * 14) / 8 / 1e6).toFixed(2) }));
}
