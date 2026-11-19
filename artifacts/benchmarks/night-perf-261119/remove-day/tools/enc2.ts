// D6b check (copied into the base tree as scripts/perf/enc2.ts): the product's checkpoint encode on a
// world, which codec it picks and its CPU; gives up after 90 s (that would be the Brotli fallback).
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { encode } from '../../apps/web/src/adapters/persistence';
import { cpu } from './side';
setTimeout(() => { console.log(JSON.stringify({ gaveUp: true, cpuMs: cpu() })); process.exit(0); }, 90000).unref?.();
const w: any = v8.deserialize(readFileSync(process.argv[2]!));
const a = cpu(), t = Date.now();
const raw = await encode(w, 2, 1);
const env = JSON.parse(raw);
console.log(JSON.stringify({ file: process.argv[2]!.split('/').pop(), codec: env.codec, chars: env.payload.length, utf8MB: +(new TextEncoder().encode(raw).length / 1e6).toFixed(2), cpuMs: +(cpu() - a).toFixed(0), wallMs: Date.now() - t }));
