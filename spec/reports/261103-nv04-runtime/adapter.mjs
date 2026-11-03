import { readFile } from 'node:fs/promises';
import { executeAgentAdapter } from '/Users/ihaelam/project/haeram-spec-creator/src/agent-adapter.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const job = JSON.parse(input);
job.ownerInstructions = {
  mode: 'autopilot; no questions; no subagents; reversible decisions delegated',
  scope: 'Continue the recovered cv03 takeover implementation. Finish T685, T686, T678, T679 and any actual release or CI fixes. T689 follows only after the takeover release and retains its existing measurement requirements. Do not start unrelated ideation while this approved implementation remains.',
  publication: 'The owner explicitly authorizes a main push after the release gate passes and remote preservation of all unfinished work before 2026-11-04 09:30 Asia/Seoul. The host owns all pushes, release tests, CI and deadline snapshots. Do not run them in this unit.',
  permissions: 'Use acceptEdits and the provided allowlist. Do not bypass permissions or change permission configuration. Git commits are available through the allowed Git commands in this Claude unit.',
  deadline: 'Implementation stops at 2026-11-04 09:10 Asia/Seoul. Preserve measurements and partial results incrementally in task results and reports. Keep generated portable/prepared fixture artifacts consistent when their dependencies change.',
};
try {
  const failure = JSON.parse(await readFile(new URL('./repair.json', import.meta.url), 'utf8'));
  if (job.gateRepair) job.releaseFailure = failure;
} catch {}
const result = await executeAgentAdapter({ provider: 'claude', job });
process.stdout.write(`${JSON.stringify(result)}\n`);
