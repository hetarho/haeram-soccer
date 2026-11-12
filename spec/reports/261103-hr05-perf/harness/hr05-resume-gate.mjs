import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
const pinned = 'f0ea7ada0945cd29431dd54694218f7af0306aee';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), pinned);
assert.equal(git('status', '--porcelain'), '');
const file = '.tmp/verification/latest.json';
const report = JSON.parse(readFileSync(file));
assert.equal(report.source.commit, pinned);
assert.equal(report.source.tree, git('rev-parse', 'HEAD^{tree}'));
assert.equal(report.source.dirty, false);
assert.equal(report.stages.length, 9);
assert(report.stages.every(s => s.exitCode === 0));
copyFileSync(file, '.tmp/hr05-batch-initial.json');
const analysis = JSON.parse(readFileSync('.tmp/hr05-browser-660/analysis.json'));
assert(analysis.parity.every(p => p.runs === 8 && p.allFactsEqual && p.allDatesEqual && p.allReloadDatesEqual));
const log = readFileSync('.git/gusta/v1/logs/check-9f466888-fe78-4502-8438-3a4bb2d3745c.log', 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
const passed = log.split('\n').flatMap(line => {
  const match = line.match(/^\s*✓\s+\d+\s+(\[chromium\] › .*) \([\d.]+(?:ms|s|m)\)$/);
  return match ? [match[1]] : [];
});
assert(passed.length > 0);
assert(!/^\s*(?:✘|×|\d+\) \[chromium\])/m.test(log));
const collect = extra => {
  const r = spawnSync('pnpm', ['exec', 'playwright', 'test', '--project=chromium', '--list', '--reporter=json', ...extra], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.status !== 0) throw Error(r.stderr + r.stdout);
  return JSON.parse(r.stdout);
};
const flat = report => {
  const rows = [];
  function walk(suites, titles = [], depth = 0) {
    for (const suite of suites) {
      const path = depth ? [...titles, suite.title] : titles;
      for (const spec of suite.specs ?? []) for (const test of spec.tests) rows.push({ id: spec.id, project: test.projectName, file: spec.file, titles: [...path, spec.title], key: [test.projectName, spec.file, ...path, spec.title].join('\0'), visibleKey: [test.projectName, spec.file, ...path.filter(Boolean), spec.title].join('\0') });
      walk(suite.suites ?? [], path, depth + 1);
    }
  }
  walk(report.suites);
  return rows;
};
const all = collect([]), allRows = flat(all);
assert.equal(allRows.length, 349);
const visible = passed.map(line => {
  const tokens = line.split('›').map(s => s.trim());
  const location = tokens[1].replace(/:\d+:\d+$/, '');
  tokens[1] = relative(all.config.rootDir, resolve(location)).replaceAll('\\', '/');
  return tokens.join(' › ');
});
const visibleKeys = visible.map(line => {
  const [project, location, ...titles] = line.split('›').map(s => s.trim());
  return [project.slice(1, -1), location, ...titles].join('\0');
});
assert.equal(new Set(visibleKeys).size, passed.length);
const completed = visibleKeys.map(key => {
  const found = allRows.filter(r => r.visibleKey === key);
  assert.equal(found.length, 1, 'Unknown or ambiguous completed case: ' + key);
  return found[0];
});
const keys = completed.map(r => r.key);
const normalized = completed.map(r => ['[' + r.project + ']', r.file, ...r.titles.filter(Boolean)].join(' › '));
writeFileSync('.tmp/hr05-e2e-passed.list', normalized.join('\n') + '\n');
const rest = collect(['--test-list-invert', '.tmp/hr05-e2e-passed.list']), restRows = flat(rest), done = new Set(keys);
assert.equal(restRows.length + keys.length, allRows.length);
assert.deepEqual(restRows.map(r => r.key).sort(), allRows.filter(r => !done.has(r.key)).map(r => r.key).sort());
const coverage = { source: pinned, tree: report.source.tree, reason: 'Original 1-hour command combined a 30-minute browser matrix and regression suite. It was interrupted before the bound, with no test failures reported; resume only the exact uncompleted Chromium cases. All per-test timeouts and assertions remain unchanged.', initialLog: 'check-9f466888-fe78-4502-8438-3a4bb2d3745c.log', total: allRows.length, previouslyPassed: keys.length, toRun: restRows.length, completedCases: normalized, remainingKeys: restRows.map(r => r.key), started: new Date().toISOString() };
writeFileSync('.tmp/hr05-e2e-coverage.json', JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ source: pinned, total: coverage.total, previouslyPassed: coverage.previouslyPassed, toRun: coverage.toRun }));
const start = performance.now();
const result = spawnSync('pnpm', ['run', 'test:e2e', '--project=chromium', '--test-list-invert', '.tmp/hr05-e2e-passed.list'], { stdio: 'inherit', env: { ...process.env, BROWSER_TEST_PORT: '4185' } });
const e2e = JSON.parse(readFileSync('.tmp/verification/e2e-results.json'));
assert.equal(e2e.stats.expected, restRows.length);
assert.equal(e2e.stats.unexpected, 0);
assert.equal(e2e.stats.flaky, 0);
assert.equal(e2e.stats.skipped, 0);
assert.equal(result.status, 0);
assert.equal(git('rev-parse', 'HEAD'), pinned);
assert.equal(git('status', '--porcelain'), '');
coverage.finished = new Date().toISOString();
coverage.passed = true;
coverage.executed = e2e.stats.expected;
coverage.elapsedMs = Math.round(performance.now() - start);
writeFileSync('.tmp/hr05-e2e-coverage.json', JSON.stringify(coverage, null, 2) + '\n');
report.stages.push({ stage: 'test:e2e', command: 'pnpm run test:e2e --project=chromium --test-list-invert .tmp/hr05-e2e-passed.list', started: coverage.started, finished: coverage.finished, elapsedMs: coverage.elapsedMs, exitCode: 0, coverage: { total: coverage.total, previouslyPassed: coverage.previouslyPassed, resumedPassed: coverage.executed } });
report.finished = coverage.finished;
report.elapsedMs = Date.parse(report.finished) - Date.parse(report.started);
report.passed = true;
report.execution = 'Stage-complete coordinator verification with explicit continuation; the initial combined command was interrupted, not a passing full-suite invocation. Fixed source and exact 349-case Chromium coverage verified.';
writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log('PASS all fixed-source coordinator scopes, including 349/349 exact Chromium cases across initial and resumed execution');
