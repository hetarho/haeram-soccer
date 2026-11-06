// T689 cv04-ent (cv04-kpr's, its paths moved): node collect.mjs NAME… — copies the runner's band-check logs
// (.tmp/cv04/logs/bands-NAME-400.log) into bands/bands-NAME-400.txt; `--same-diff PATCH` reports whether the
// working tree's engine diff equals PATCH (this window adds no switch, so it should equal cv04-kpr's patch).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const ent = root + 'artifacts/benchmarks/scoring-261106-cv04-ent/';
const args = process.argv.slice(2);
if (args[0] === '--same-diff') {
  const diff = execFileSync('git', ['-C', root, 'diff', '--', 'packages/engine/src'], { encoding: 'utf8' });
  console.log(args[1], diff === readFileSync(root + args[1], 'utf8') ? 'diff equal' : 'diff DIFFERS');
} else {
  mkdirSync(ent + 'bands', { recursive: true });
  for (const n of args) {
    copyFileSync(root + '.tmp/cv04/logs/bands-' + n + '-400.log', ent + 'bands/bands-' + n + '-400.txt');
    console.log('copied', n);
  }
}
