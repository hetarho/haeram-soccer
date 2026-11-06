// T689 cv04-sho: node chased.mjs FILE… — summarises scripts/scoring-chased-shots.ts outputs: the box beyond
// the goal area's open-play shots with nobody between (a carrier's own `shot` entries), by chased/free and
// keeper set/out; each recorded-xG factor's mean, SB16's goal per shot in their cells, block rates; the
// chaser's place along the shot's line; each closing blocker class's chance and blocks.
import { readFileSync } from 'node:fs';

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
const pc = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + '%' : '-');
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const teams = r.matches * 2;
  const row = (k) => r.rows.find((x) => x.key === k);
  console.log(`\n## ${file.split('/').pop()} — ${r.matches} matches, ${r.rebuilt} shots rebuilt, ${r.matched} within 1% of recorded xG`);
  console.log('| group | shots a team | conv. | xG a shot | place | pressure f. | narrowing | unblocked close | unblocked path | level | dist m | SB16 g/shot | blocked (close / path) | closers / path men a shot | keeper off m |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|');
  for (const g of ['chased|keeperSet', 'chased|keeperOut', 'free|keeperSet', 'free|keeperOut', 'any']) {
    const a = row(`all|${g}`);
    if (!a) continue;
    const m = (k) => a[k] / a.n;
    console.log(
      `| ${g} | ${f2(a.n / teams)} | ${pc(m('goals'))} | ${f3(m('xg'))} | ${f3(m('place'))} | ${f3(m('pressureFactor'))} | ${f3(m('narrow'))} | ${f3(m('unblockedClose'))} | ${f3(m('unblockedPath'))} | ${f3(m('level'))} | ${f2(m('dist'))} | ${f3(m('sb16'))} | ${pc(m('blocked'))} (${pc(m('blockedClose'))} / ${pc(m('blockedPath'))}) | ${f2(m('closers'))} / ${f2(m('pathMen'))} | ${f2(m('keeperOff'))} |`,
    );
  }
  console.log('\n| group | chaser stands | share of the group | chaser dist m | along m | xG a shot | unblocked close | blocked by a closer |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const g of ['chased|keeperSet', 'chased|keeperOut']) {
    const all = row(`all|${g}`);
    if (!all) continue;
    for (const c of ['behind', 'level', 'goalSide']) {
      const a = row(`chaser|${g}|${c}`);
      if (!a) continue;
      const m = (k) => a[k] / a.n;
      console.log(
        `| ${g} | ${c} | ${pc(a.n / all.n)} | ${f2(m('chaserDist'))} | ${f2(m('chaserAlong'))} | ${f3(m('xg'))} | ${f3(m('unblockedClose'))} | ${pc(m('blockedClose'))} |`,
      );
    }
  }
  console.log('\n| group | closer stands | closers a shot | mean chance | within 1.2 m | blocked (share of his chances) |');
  console.log('|---|---|---:|---:|---:|---:|');
  for (const g of ['chased|keeperSet', 'chased|keeperOut', 'free|keeperSet', 'free|keeperOut']) {
    const all = row(`all|${g}`);
    if (!all) continue;
    for (const c of ['behind', 'level', 'goalSide']) {
      const a = row(`closer|${g}|${c}`);
      if (!a) continue;
      console.log(
        `| ${g} | ${c} | ${f2(a.n / all.n)} | ${f3(a.chance / a.n)} | ${pc(a.touch / a.n)} | ${pc(a.blocked / a.n)} |`,
      );
    }
  }
  // The keeper at the kick against the keeper as the entry was traced (scoring-shot-origins.ts's reading).
  const entries = r.rows.filter((x) => x.key.startsWith('entry|'));
  if (entries.length) {
    console.log('\n| at the kick | keeper at the entry | shots a team | conv. | xG a shot |');
    console.log('|---|---|---:|---:|---:|');
    for (const a of entries.sort((x, y) => (x.key < y.key ? -1 : 1)))
      console.log(
        `| ${a.key.split('|').slice(1, 3).join('|')} | ${a.key.split('|')[3]} | ${f2(a.n / teams)} | ${pc(a.goals / a.n)} | ${f3(a.xg / a.n)} |`,
      );
  }
  // Cells of the chased shots against a set keeper.
  const cells = r.rows.filter((x) => x.key.startsWith('cell|chased|keeperSet|')).sort((a, b) => b.n - a.n);
  if (cells.length) {
    console.log('\n| chased, keeper set: cell | shots a team | conv. | xG a shot | SB16 g/shot | dist m |');
    console.log('|---|---:|---:|---:|---:|---:|');
    for (const a of cells)
      console.log(
        `| ${a.key.split('|')[3]} | ${f2(a.n / teams)} | ${pc(a.goals / a.n)} | ${f3(a.xg / a.n)} | ${f3(a.sb16 / a.n)} | ${f2(a.dist / a.n)} |`,
      );
  }
}
