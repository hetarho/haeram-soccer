// usage: node .tmp/entry-size.mjs <dist dir> — gzip and raw bytes of the entry index.html declares
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = process.argv[2];
const paths = Array.from(readFileSync(`${dir}/index.html`, 'utf8').matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g), (m) => dir + m[1]);
const gz = paths.reduce((n, p) => n + gzipSync(readFileSync(p)).length, 0);
const raw = paths.reduce((n, p) => n + readFileSync(p).length, 0);
console.log(JSON.stringify({ dir, files: paths.map((p) => p.slice(dir.length)), gzipBytes: gz, rawBytes: raw }));
