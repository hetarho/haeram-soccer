// Waits until a directory holds at least N .json files (or the run log says all done), then lists them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const [dir, count, log] = process.argv.slice(2);
const n = Number(count);
const ready = () =>
  readdirSync(dir).filter((f) => f.endsWith('.json')).length >= n ||
  (log && existsSync(log) && readFileSync(log, 'utf8').includes('all done'));
while (!ready()) await new Promise((resolve) => setTimeout(resolve, 15000));
console.log(new Date().toISOString(), readdirSync(dir).join(' '));
