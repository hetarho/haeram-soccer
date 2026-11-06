// T689 cv04-sho (cv04-cha's, its paths moved): node collect.mjs NAME… — copies the runner's band-check
// logs (.tmp/cv04/logs/bands-NAME-400.log) into bands/bands-NAME-400.txt; `--same A B` reports whether two
// shot-origin files hold the same rows (A and B relative to the artifacts directory); `--same-chased A B`
// whether two chased-shot files hold the same rows apart from the `entry|` cross-tab and `origin|` rows (added later).
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const art = root + 'artifacts/benchmarks/';
const sho = art + 'scoring-261106-cv04-sho/';
const args = process.argv.slice(2);
if (args[0] === '--same') {
  const rows = (p) => JSON.stringify(JSON.parse(readFileSync(art + p, 'utf8')).rows);
  console.log(args[1], args[2], rows(args[1]) === rows(args[2]) ? 'rows equal' : 'rows DIFFER');
} else if (args[0] === '--same-chased') {
  const rows = (p) =>
    JSON.stringify(
      JSON.parse(readFileSync(art + p, 'utf8')).rows.filter(
        (r) => !r.key.startsWith('entry|') && !r.key.startsWith('origin|'),
      ),
    );
  console.log(args[1], args[2], rows(args[1]) === rows(args[2]) ? 'rows equal' : 'rows DIFFER');
} else {
  mkdirSync(sho + 'bands', { recursive: true });
  for (const n of args) {
    const name = n.includes('@') ? n.replace('@', '-') : n + '-400';
    copyFileSync(root + '.tmp/cv04/logs/bands-' + name + '.log', sho + 'bands/bands-' + name + '.txt');
    console.log('copied', name);
  }
}
