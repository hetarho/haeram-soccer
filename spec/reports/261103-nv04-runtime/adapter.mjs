import { readFile } from 'node:fs/promises';
import { executeAgentAdapter } from '/Users/ihaelam/project/gusta/src/agent-adapter.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const job = JSON.parse(input);
job.ownerInstructions = {
  mode: 'autopilot; no questions; no subagents; reversible decisions delegated',
  scope: 'Continue the recovered cv03 takeover implementation. Finish T685, T686, T678, T679 and any actual release or CI fixes. T689 follows only after the takeover release and retains its existing measurement requirements. Do not start unrelated ideation while this approved implementation remains.',
  publication: 'The owner explicitly authorizes a main push after the release gate passes and remote preservation of all unfinished work before 2026-11-04 09:30 Asia/Seoul. The host owns all pushes, release tests, CI and deadline snapshots. Do not run them in this unit.',
  permissions: 'Use acceptEdits and the provided allowlist. Do not bypass permissions or change permission configuration. Git commits are available through the allowed Git commands in this Claude unit.',
  repositoryRules: 'Read and follow applicable AGENTS.md files before changing their paths. In particular, apps/web/AGENTS.md requires the shared design-system and resource-skin guides for visual/theme changes and preservation of artwork/resource handoff metadata.',
  deadline: 'Implementation stops at 2026-11-04 09:10 Asia/Seoul. Preserve measurements and partial results incrementally in task results and reports. Keep generated portable/prepared fixture artifacts consistent when their dependencies change.',
  releasedPrerequisite: 'The takeover release prerequisite is now satisfied. Main code commit 420ea7a5 was pushed at 05:50 KST and CI run 41716276177 passed all nine jobs at 06:45 KST. Main metadata HEAD is bc4f224e. Do not return no_work to wait for this gate again. T689 is the remaining task: continue its measured scoring investigation on the released source, preserve the existing acceptance and publication requirements, and record partial results before the 09:10 stop if the full task cannot finish. No scoring source commit unless its realism gate passes; partial candidate source may be backed up only by the host WIP checkpoint.',
};
try {
  const failure = JSON.parse(await readFile(new URL('./repair.json', import.meta.url), 'utf8'));
  if (job.gateRepair) job.releaseFailure = failure;
} catch {}
const result = await executeAgentAdapter({ provider: 'claude', job });
process.stdout.write(`${JSON.stringify(result)}\n`);
