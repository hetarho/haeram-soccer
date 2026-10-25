// Maps columns of tsx's one-line output of a source file back to source lines, through the newest
// source map in tsx's transform cache that names the file.
// usage: node docs/benchmarks/t450/col2line.cjs <absolute source path> <column> [<column>…]
const fs = require('fs');
const os = require('os');
const path = require('path');
const [source, ...cols] = process.argv.slice(2);
const cacheDir = path.join(os.tmpdir(), `tsx-${os.userInfo().uid}`);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const entries = fs
  .readdirSync(cacheDir)
  .map((name) => ({ name, at: fs.statSync(path.join(cacheDir, name)).mtimeMs }))
  .sort((a, b) => b.at - a.at)
  .slice(0, 2000);
let segs;
for (const e of entries) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(path.join(cacheDir, e.name), 'utf8'));
  } catch {
    continue;
  }
  if (j.map?.sources?.[0] !== source) continue;
  segs = [];
  let genCol = 0,
    srcLine = 0;
  for (const seg of j.map.mappings.split(';')[0].split(',')) {
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
      srcLine += vals[2];
      segs.push([genCol, srcLine]);
    }
  }
  break;
}
if (!segs) throw new Error(`no cached map for ${source}`);
for (const col of cols.map(Number)) {
  let best = segs[0];
  for (const s of segs) if (s[0] <= col) best = s;
  console.log(`${col} → line ${best[1] + 1}`);
}
