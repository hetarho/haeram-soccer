// T689 cv04-sho: node wait.mjs FILE [SECONDS] — blocks until FILE exists (a runner's .status.json), at most
// SECONDS (default 540), so a long run is awaited in one call.
import { existsSync } from 'node:fs';

const [file, limit = '540'] = process.argv.slice(2);
const until = Date.now() + Number(limit) * 1000;
while (!existsSync(file) && Date.now() < until) await new Promise((r) => setTimeout(r, 2000));
console.log(existsSync(file) ? `ready ${file}` : `timeout ${file}`);
