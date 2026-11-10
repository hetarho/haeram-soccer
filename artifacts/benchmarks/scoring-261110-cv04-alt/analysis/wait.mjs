// T689 cv04-alt: node wait.mjs MINUTES FILE… — blocks until every FILE exists or MINUTES pass; exit 0 when all exist.
import { existsSync } from 'node:fs';

const [minutes, ...files] = process.argv.slice(2);
const until = Date.now() + Number(minutes) * 60_000;
while (Date.now() < until && !files.every((f) => existsSync(f)))
  await new Promise((r) => setTimeout(r, 5000));
const done = files.every((f) => existsSync(f));
console.log(`${new Date().toISOString()} ${done ? 'all present' : 'waiting: ' + files.filter((f) => !existsSync(f)).join(' ')}`);
process.exitCode = done ? 0 : 1;
