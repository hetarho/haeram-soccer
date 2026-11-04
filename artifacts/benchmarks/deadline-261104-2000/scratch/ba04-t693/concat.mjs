// Joins every career file of a directory (one owner-balance --out file a career) into one array.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const careers = readdirSync(dir)
  .filter((name) => name.endsWith('.json') && !name.startsWith('driver'))
  .sort()
  .flatMap((name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')));
writeFileSync(out, JSON.stringify(careers));
console.log(`${careers.length} careers`);
