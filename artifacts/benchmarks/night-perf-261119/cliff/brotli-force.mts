// Read-only: the product brotli path (compression.encodePayload with the fast candidate refused, as
// persistence.encode refuses it past the portable limit) on a world .bin, then the product decode
// of that payload. Reports thread/process CPU, wall and peak RSS.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
const R = '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/';
const { encodePayload, decodePayload } = await import(R + 'apps/web/src/adapters/compression');
const { pack } = await import(R + 'apps/web/src/adapters/packing');
const { canonical } = await import(R + 'packages/contracts/src/index');
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const pcpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const wall = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const w: any = v8.deserialize(readFileSync(process.argv[2]!));
const bytes = new TextEncoder().encode(canonical(pack(w)));
const out: any = { bin: process.argv[2]!.split('/').pop(), year: w.year, packed: bytes.length, rssBeforeMB: +(process.memoryUsage().rss / 1e6).toFixed(0) };
let a = cpu(), p = pcpu(), t = wall();
const enc = await encodePayload(bytes, () => false);
Object.assign(out, { codec: enc.codec, payloadChars: enc.payload.length, encThreadMs: +(cpu() - a).toFixed(0), encProcMs: +(pcpu() - p).toFixed(0), encWallMs: +(wall() - t).toFixed(0), maxRssAfterEncMB: +(process.resourceUsage().maxRSS / 1024).toFixed(0) });
a = cpu(); p = pcpu(); t = wall();
const back = await decodePayload(enc.codec, enc.payload);
Object.assign(out, { decOk: back.length === bytes.length, decThreadMs: +(cpu() - a).toFixed(0), decWallMs: +(wall() - t).toFixed(0), maxRssMB: +(process.resourceUsage().maxRSS / 1024).toFixed(0) });
console.log(JSON.stringify(out));
