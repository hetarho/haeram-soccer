// Self time of a V8 .cpuprofile taken under tsx by source line: tsx runs each file as one
// whitespace-minified line, so the profile's columns are mapped back through the source maps in
// tsx's transform cache (the newest entry whose map names the file and whose code holds the
// function). usage: node docs/benchmarks/t450/lines.cjs <file.cpuprofile> [N] [filter]
const fs = require('fs');
const os = require('os');
const path = require('path');
const [file, n = 40, filter = ''] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const dt = new Map();
p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const cacheDir = path.join(os.tmpdir(), `tsx-${os.userInfo().uid}`);
const entries = fs
  .readdirSync(cacheDir)
  .map((name) => ({ name, at: fs.statSync(path.join(cacheDir, name)).mtimeMs }))
  .sort((a, b) => b.at - a.at)
  .slice(0, 1500);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decode(mappings) {
  // Generated line 0 only (tsx emits one line): [genCol, srcLine] pairs.
  const out = [];
  let genCol = 0,
    src = 0,
    srcLine = 0,
    srcCol = 0;
  const line = mappings.split(';')[0];
  for (const seg of line.split(',')) {
    if (!seg) continue;
    const vals = [];
    let v = 0,
      shift = 0;
    for (const ch of seg) {
      const d = B64.indexOf(ch);
      v += (d & 31) << shift;
      if (d & 32) shift += 5;
      else {
        vals.push(v & 1 ? -(v >>> 1) : v >>> 1);
        v = 0;
        shift = 0;
      }
    }
    genCol += vals[0];
    if (vals.length > 1) {
      src += vals[1];
      srcLine += vals[2];
      srcCol += vals[3];
      out.push([genCol, srcLine]);
    }
  }
  return out;
}
const maps = new Map();
function mapFor(url) {
  if (maps.has(url)) return maps.get(url);
  const source = url.replace(/^file:\/\//, '');
  let found;
  for (const e of entries) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(cacheDir, e.name), 'utf8'));
    } catch {
      continue;
    }
    if (j.map?.sources?.[0] !== source) continue;
    found = decode(j.map.mappings);
    break;
  }
  maps.set(url, found);
  return found;
}
function lineOf(segs, col) {
  let lo = 0,
    hi = segs.length - 1,
    best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid][0] <= col) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return segs[best]?.[1];
}
const lines = new Map();
let total = 0;
for (const node of p.nodes) {
  const us = dt.get(node.id) ?? 0;
  total += us;
  const cf = node.callFrame;
  if (!cf.url.includes(filter) || !cf.url.startsWith('file://')) continue;
  if (!/packages\//.test(cf.url)) continue;
  const segs = mapFor(cf.url);
  // positionTicks give the sampled lines within the function; fall back to its start.
  const short = cf.url.replace(/^.*\/packages\//, '');
  if (node.positionTicks && segs) {
    const ticks = node.positionTicks.reduce((a, t) => a + t.ticks, 0) || 1;
    for (const t of node.positionTicks) {
      // positionTicks lines are 1-based generated lines; tsx has one line, so read the column-less start.
      const key = `${cf.functionName || '(anon)'} ${short}:${(lineOf(segs, cf.columnNumber) ?? -1) + 1}`;
      lines.set(key, (lines.get(key) ?? 0) + (us * t.ticks) / ticks);
    }
  } else {
    const key = `${cf.functionName || '(anon)'} ${short}:${segs ? (lineOf(segs, cf.columnNumber) ?? -1) + 1 : '?'}`;
    lines.set(key, (lines.get(key) ?? 0) + us);
  }
}
console.log(`total ${(total / 1000).toFixed(0)} ms`);
for (const [k, us] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, +n))
  console.log(`${(us / 1000).toFixed(0).padStart(7)} ms ${((100 * us) / total).toFixed(1).padStart(5)}%  ${k}`);
