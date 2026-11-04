// Exits once `file` contains `text` or `minutes` pass.
import { existsSync, readFileSync } from 'node:fs';
const [file, text, minutes] = process.argv.slice(2);
const until = Date.now() + Number(minutes) * 60000;
const has = () => existsSync(file) && readFileSync(file, 'utf8').includes(text);
while (!has() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10000));
console.log(`${new Date().toISOString()} ${has() ? 'found' : 'timeout'}`);
