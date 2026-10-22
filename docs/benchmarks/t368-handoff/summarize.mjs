// Summarises probe logs into one row each: node summarize.mjs <log> ...
import { readFileSync } from 'node:fs';

const ids = [
  ['offsides', 'off'],
  ['goals', 'goals'],
  ['shots', 'shots'],
  ['shotsOutside', 'out%'],
  ['shotsFar', '30m%'],
  ['shotDistance', 'dist'],
  ['goalsFW', 'FW%'],
  ['throughBalls', 'TB'],
  ['throughBallsCompleted', 'TBc'],
  ['boxShots', 'boxSh'],
  ['bigChances', 'bigC'],
  ['boxEntries', 'boxE'],
  ['frontOfBoxEntries', 'front'],
  ['finalThirdPasses', 'F3'],
  ['progressivePasses', 'prog'],
  ['xtAdded', 'xT'],
  ['keyPasses', 'KP'],
  ['xa', 'xA'],
  ['crosses', 'cross'],
];
const short = { inside: 'in', outside: 'OUT', unresolved: 'unr' };
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8');
  const cells = [];
  const head = /core:equal-top-tier .*?: (\d+) matches \((\d+) s\)/.exec(text);
  const insideCore = /core (\d+)\/38 inside/.exec(text);
  const adv = /MATCH-30 advanced counters [^:]*: (.*)/.exec(text);
  for (const [id, label] of ids) {
    // "  keyPasses: inside [8.2, 10.7] 9.51 (9.29–9.72)" or "  outside      goals: 2.098 [..]"
    let m = new RegExp(`\\n  ${id}: (\\w+) (?:\\[[^\\]]*\\] )?([\\d.]+)`).exec(text);
    let status, value;
    if (m) [status, value] = [m[1], m[2]];
    else {
      m = new RegExp(`\\n  (\\w+)\\s+${id}: ([\\d.]+)`).exec(text);
      if (m) [status, value] = [m[1], m[2]];
    }
    cells.push(`${label} ${value ? Number(value).toFixed(2) : '?'}${status && status !== 'inside' ? (short[status] ?? status).slice(0, 3).toUpperCase() === 'OUT' ? '!' : '~' : ''}`);
  }
  const calls = /offside calls ([\d.]+)/.exec(text);
  const beyond = /completed to a receiver beyond the line ([\d.]+)/.exec(text);
  console.log(
    `${file.replace(/.*screen-/, '').replace('.log', '').padEnd(14)} n${head?.[1]} ${head?.[2]}s core ${insideCore?.[1]}/38 | ${adv?.[1]} | beyond ${beyond?.[1]} calls ${calls?.[1]}\n    ${cells.join('  ')}`,
  );
}
