// node patch.mjs <tree> <patches.mjs>: exact string replacements in a scratch tree, each must match once or more.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [tree, mod] = process.argv.slice(2);
const patches = (await import(mod)).default;
for (const p of patches) {
  const f = join(tree, p.file);
  const src = readFileSync(f, 'utf8');
  if (!src.includes(p.from)) throw new Error('patch miss ' + p.file + ': ' + p.from.slice(0, 100));
  writeFileSync(f, src.split(p.from).join(p.to));
  console.log('patched', p.file);
}
