// Markdown rows with intervals from probe logs: node table.mjs <name>=<log> ...
import { readFileSync } from 'node:fs';

const cols = [
  ['offsides', 1],
  ['goals', 2],
  ['shots', 1],
  ['shotsGoalArea', 1],
  ['shotsOutside', 1],
  ['shotDistance', 2],
  ['goalsMF', 1],
  ['goalsFW', 1],
  ['throughBalls', 2],
  ['throughBallsCompleted', 2],
  ['boxEntries', 1],
  ['frontOfBoxEntries', 1],
  ['finalThirdPasses', 1],
  ['progressivePasses', 1],
  ['xtAdded', 2],
  ['boxShots', 2],
  ['keyPasses', 1],
  ['cutBacks', 2],
];
const tag = { inside: '', outside: '✗', unresolved: '~', underpowered: '?' };
const rows = [];
for (const spec of process.argv.slice(2)) {
  const [name, file] = spec.split('=');
  const text = readFileSync(file, 'utf8');
  const cell = (id, d) => {
    let m = new RegExp(`\\n  ${id}: (\\w+) \\[[^\\]]*\\] ([\\d.]+) \\(([\\d.]+)–([\\d.]+)\\)`).exec(text);
    if (m) return `${Number(m[2]).toFixed(d)} [${Number(m[3]).toFixed(d)}, ${Number(m[4]).toFixed(d)}]${tag[m[1]] ?? ''}`;
    m = new RegExp(`\\n  (\\w+)\\s+${id}: ([\\d.]+) \\[([\\d.-]+), ([\\d.-]+)\\]`).exec(text);
    if (m) return `${Number(m[2]).toFixed(d)} [${Number(m[3]).toFixed(d)}, ${Number(m[4]).toFixed(d)}]${tag[m[1]] ?? ''}`;
    return '?';
  };
  const core = /core (\d+)\/38 inside/.exec(text)?.[1];
  const adv = /MATCH-30 advanced counters [^:]*: (.*)/.exec(text)?.[1] ?? '';
  const inside = /(\d+) inside/.exec(adv)?.[1];
  const calls = /offside calls ([\d.]+)/.exec(text)?.[1];
  const beyond = /completed to a receiver beyond the line ([\d.]+)/.exec(text)?.[1];
  rows.push(`| ${name} | ${core}/38 | ${inside} | ${beyond} | ${cols.map(([id, d]) => cell(id, d)).join(' | ')} |`);
}
console.log(`| setting | core inside | MATCH-30 inside | completed beyond the line | ${cols.map(([id]) => id).join(' | ')} |`);
console.log(`|${'---|'.repeat(cols.length + 4)}`);
for (const r of rows) console.log(r);
