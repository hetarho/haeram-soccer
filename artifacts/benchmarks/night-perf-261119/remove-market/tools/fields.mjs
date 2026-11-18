import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
const w = v8.deserialize(readFileSync(process.argv[2]));
const total = JSON.stringify(w).length;
const rows = Object.entries(w).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0, Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : '']);
rows.sort((a, b) => b[1] - a[1]);
console.log('year', w.year, 'round', w.round, 'day', w.calendar?.day, 'total JSON MB', (total / 1e6).toFixed(1));
for (const [k, n, c] of rows.slice(0, 22)) console.log(k.padEnd(24), (n / 1e6).toFixed(2).padStart(7), 'MB', String(c).padStart(7), (100 * n / total).toFixed(1) + '%');
