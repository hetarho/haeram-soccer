// T689 cv04-own (cv04-ent's, its paths moved): node collect.mjs NAME… — copies the runner's band-check logs
// (.tmp/cv04-own/logs/bands-NAME-400.log) into bands/bands-NAME-400.txt.
import { copyFileSync, mkdirSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const own = new URL('../', import.meta.url);
mkdirSync(new URL('bands/', own), { recursive: true });
for (const n of process.argv.slice(2)) {
  copyFileSync(new URL(`.tmp/cv04-own/logs/bands-${n}-400.log`, root), new URL(`bands/bands-${n}-400.txt`, own));
  console.log('copied', n);
}
