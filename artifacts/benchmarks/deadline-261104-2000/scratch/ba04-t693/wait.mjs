// Exits once `dir` holds at least `count` career files (*.json) or `minutes` pass, printing them.
import { readdirSync } from 'node:fs';
const [dir, count, minutes] = process.argv.slice(2);
const until = Date.now() + Number(minutes) * 60000;
const done = () => readdirSync(dir).filter((f) => f.endsWith('.json'));
while (done().length < Number(count) && Date.now() < until)
  await new Promise((resolve) => setTimeout(resolve, 15000));
console.log(`${new Date().toISOString()} ${done().length} done: ${done().join(' ')}`);
