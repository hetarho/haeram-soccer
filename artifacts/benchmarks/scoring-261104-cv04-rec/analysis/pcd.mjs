// T689 cv04-rec: node pcd.mjs NAME:FILE[,FILE…] … — markdown rows of `scripts/scoring-press-counter.ts`
// reports, pooled over the files given for each name (per match: shots, goals, conversion, xG a shot).
// Keys missing from a file (the through-ball keys arrived with the second run) count over the files
// that hold them.
import { readFileSync } from 'node:fs';

const KEYS = [
  ['open play', 'shot|S|open'],
  ['set pieces', 'shot|S|setPiece'],
  ['within 8 s of the possession', 'shot|S|dt|<8'],
  ['25 s or more into it', 'shot|S|dt|>=25'],
  ['no defender goal-side', 'shot|S|gs|0'],
  ['one goal-side', 'shot|S|gs|1'],
  ['three or more goal-side', 'shot|S|gs|3'],
  ['in a possession with a received through ball', 'shot|S|possThrough|true'],
  ['in a possession without', 'shot|S|possThrough|false'],
];
const fmt = (a, m) =>
  a ? `${(a.n / m).toFixed(2)} / ${(a.goals / m).toFixed(3)} / ${((100 * a.goals) / a.n).toFixed(1)}% / ${(a.xg / a.n).toFixed(3)}` : '-';
const reads = process.argv.slice(2).map((spec) => {
  const [name, list] = spec.split(':');
  const files = list.split(',').map((f) => JSON.parse(readFileSync(f, 'utf8')));
  return { name, files };
});
console.log(`| side, shots | ${reads.map((r) => r.name).join(' | ')} |`);
console.log(`|---|${reads.map(() => '---').join('|')}|`);
for (const S of ['press', 'counter'])
  for (const [label, key0] of KEYS) {
    const key = key0.replace('S', S);
    const cells = reads.map(({ files }) => {
      let m = 0;
      const a = { n: 0, goals: 0, xg: 0 };
      let found = false;
      for (const d of files) {
        const r = d.rows.find((x) => x.key === key);
        if (!r && key.includes('possThrough')) continue;
        m += d.matches;
        if (r) {
          found = true;
          a.n += r.n;
          a.goals += r.goals;
          a.xg += r.xg;
        }
      }
      return found ? fmt(a, m) : '-';
    });
    console.log(`| ${S}: ${label} | ${cells.join(' | ')} |`);
  }
// Through balls (the trace's `through` kind, wider than MATCH-13's counter) and their receptions.
for (const S of ['press', 'counter']) {
  const cells = reads.map(({ files }) => {
    const with_ = files.filter((d) => d.rows.some((r) => r.key.startsWith('through|')));
    if (!with_.length) return '-';
    const m = with_.reduce((a, d) => a + d.matches, 0);
    const sum = (re) =>
      with_.reduce((a, d) => a + d.rows.filter((r) => re.test(r.key)).reduce((b, r) => b + r.n, 0), 0);
    const all = sum(new RegExp(`^through\\|${S}\\|`));
    const done = sum(new RegExp(`^through\\|${S}\\|complete$`));
    const off = sum(new RegExp(`^throughRecv\\|${S}\\|complete\\|offsidePos$`));
    const called = sum(new RegExp(`^through\\|${S}\\|offside$`));
    return `${(all / m).toFixed(1)} / ${(done / m).toFixed(1)} / ${(off / m).toFixed(1)} / ${(called / m).toFixed(2)}`;
  });
  console.log(`| ${S}: through passes (trace kind) attempted / completed / completed from an offside position / called offside, a match | ${cells.join(' | ')} |`);
}
