// T689 cv04-own: node same.mjs A.json B.json … (pairs) — whether two diagnostic reports carry the same rows and
// matches, everything but the candidate file's path (`patch`), so an earlier window's read stands on this source.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
for (let i = 0; i + 1 < args.length; i += 2) {
  const [a, b] = [args[i], args[i + 1]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const strip = ({ patch: _patch, ...rest }) => JSON.stringify(rest);
  console.log(strip(a) === strip(b) ? 'same' : 'DIFFERS', args[i], args[i + 1]);
}
