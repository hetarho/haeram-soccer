// Builds a history-lived career world as Host does (generateHistory + takeOver + read models).
import v8 from 'node:v8';
import { writeFileSync } from 'node:fs';
import { generateHistory } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/history';
import { takeOver } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/takeover';
import { initializeReadModels } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/read-models';
import { careerClub } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/career.testkit';
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const [seed = 'perf-261027', year = '1980', out] = process.argv.slice(2);
const t = cpu();
const h = generateHistory(seed, Number(year) as any);
const w = takeOver(h, careerClub('ENG'), { tier: 'oil', traits: [] } as any);
initializeReadModels(w);
console.error('built', year, ((cpu() - t) / 1000).toFixed(0) + 's');
writeFileSync(out!, v8.serialize(w));
