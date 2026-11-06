// T689 cv04-cha: node collect.mjs NAME… — copies the runner's band-check logs
// (.tmp/cv04/logs/bands-NAME-400.log) into bands/bands-NAME-400.txt, and with `--same A B` reports
// whether two shot-origin files hold the same rows.
import { copyFileSync, readFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const art = root + 'artifacts/benchmarks/scoring-261106-cv04-cha/';
const args = process.argv.slice(2);
if (args[0] === '--same') {
  const rows = (p) => JSON.stringify(JSON.parse(readFileSync(art + 'origins/' + p, 'utf8')).rows);
  console.log(args[1], args[2], rows(args[1]) === rows(args[2]) ? 'rows equal' : 'rows DIFFER');
} else
  for (const n of args) {
    const name = n.includes('@') ? n.replace('@', '-') : n + '-400';
    copyFileSync(root + '.tmp/cv04/logs/bands-' + name + '.log', art + 'bands/bands-' + name + '.txt');
    console.log('copied', name);
  }
