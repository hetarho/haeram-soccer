// Read-only: the autosave hand-off and the codec worker's checkpoint on a world .bin.
// mode 'fast'  : brotli stubbed (reports which codec the product picks, gzip path timed in full)
// mode 'full'  : product checkpoint() (encode + decode-validate) run to completion, whatever codec
// mode 'loop'  : product checkpoint() forever (codec worker kept busy, for contention runs)
import { registerHooks } from 'node:module';
const [bin, mode = 'fast'] = process.argv.slice(2);
if (mode === 'fast')
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec === 'brotli/compress')
        return { url: 'data:text/javascript,export async function compress(){throw new Error("BROTLI_CHOSEN")}', shortCircuit: true };
      return next(spec, ctx);
    },
  });
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
const R = '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/';
const { checkpoint } = await import(R + 'apps/web/src/adapters/persistence');
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const pcpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const wall = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const w: any = v8.deserialize(readFileSync(bin!));
const out: any = { bin: bin!.split('/').pop(), year: w.year, mode };
if (mode !== 'loop' && mode !== 'once') {
  const clones: number[] = [], cloneWall: number[] = [], sers: number[] = [];
  for (let i = 0; i < 3; i++) {
    let a = cpu(), t = wall();
    structuredClone(w);
    clones.push(+(cpu() - a).toFixed(0)); cloneWall.push(+(wall() - t).toFixed(0));
    a = cpu();
    const s = v8.serialize(w);
    sers.push(+(cpu() - a).toFixed(0)); out.serBytes = s.length;
  }
  out.handoffCloneMs = clones; out.handoffCloneWallMs = cloneWall; out.serializeMs = sers;
}
let n = 0;
do {
  const a = cpu(), p = pcpu(), t = wall();
  try {
    const { raw, envelope } = await checkpoint(w, 2, 1);
    Object.assign(out, { codec: envelope.codec, rawChars: raw.length, rawUtf8: Buffer.byteLength(raw) });
  } catch (e) {
    out.codec = String(e).includes('BROTLI_CHOSEN') ? 'brotli-bmp127 (chosen, not run)' : 'error ' + String(e).slice(0, 300);
  }
  Object.assign(out, { checkpointThreadMs: +(cpu() - a).toFixed(0), checkpointProcMs: +(pcpu() - p).toFixed(0), checkpointWallMs: +(wall() - t).toFixed(0), maxRssMB: +(process.resourceUsage().maxRSS / 1024).toFixed(0), n: ++n, at: new Date().toISOString() });
  console.log(JSON.stringify(out));
} while (mode === 'loop');
