// T689 cv04-alt: node keep-logs.mjs — renames this evidence's `logs/*.log` (written before run.mjs moved
// to `.txt`; the repository ignores `*.log`) to `.txt`, unchanged.
import { readdirSync, renameSync } from 'node:fs';

const logs = new URL('../logs/', import.meta.url);
for (const f of readdirSync(logs))
  if (f.endsWith('.log')) {
    renameSync(new URL(f, logs), new URL(f.replace(/\.log$/, '.txt'), logs));
    console.log(f);
  }
