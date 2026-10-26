// Times one more season of a kept world (a storage-benchmark century world) and, run under
// `node --cpu-prof`, profiles it: where a late-century season of the released model spends its time.
// usage: tsx profile-season.mts <world.json> [label]
import { readFileSync } from 'node:fs';
const W = '/Users/ihaelam/project/haeram-soccer/.claude/worktrees/agent-abeb76f2995c876f0';
const { simulateSeason } = await import(`${W}/packages/engine/src/index.ts`);
const [file, label = 'season'] = process.argv.slice(2);
const w = JSON.parse(readFileSync(file, 'utf8'));
console.log(label, 'year', w.year, 'round', w.round, 'history', w.history.length, 'people', Object.keys(w.people ?? {}).length, 'ownMatches', w.ownMatches.length, 'events', w.events.length, 'model', w.matchModel?.coverage ?? 'none');
const t = performance.now();
simulateSeason(w);
console.log(label, 'season ms', Math.round(performance.now() - t));
