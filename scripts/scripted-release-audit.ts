import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { canonical } from '../packages/contracts/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { simulateMatch } from '../packages/engine/src/match';
import { validateFullMatchRecord } from '../packages/engine/src/match-model';
import {
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../packages/engine/src/match-model-release';
// A preview audit only; T838 still gates production activation on capacity.
const release: MatchModelRelease = { revision: 'scripted-aggregate-11' };
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const output = process.argv[2] ?? '.tmp/scripted-release-audit.json';
mkdirSync(dirname(output), { recursive: true });
const report = {
  synthetic: true,
  source: {
    commit: git('rev-parse', 'HEAD'),
    tree: git('write-tree'),
    dirty: !!git('status', '--porcelain'),
  },
  machine: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  started: new Date().toISOString(),
  completed: false,
  finished: null as string | null,
  release,
  declaredRelease: MATCH_MODEL_RELEASE,
  sample: {
    mode: 'frozen-squad-fixtures',
    country: 'ENG',
    years: [1930, 1950, 1975, 1995, 2024],
    fixturesPerWorld: 40,
    expected: 200,
  },
  fixtures: [] as {
    seed: string;
    fixture: string;
    recordDigest: string;
    script: boolean;
    staging: boolean;
    material: boolean;
    frames: number;
    recordProblems: string[];
    scriptProblems: string[];
    revision: string | undefined;
  }[],
  exceptions: [] as { seed: string; fixture: string; error: string }[],
  totals: { attempted: 0, recordFailures: 0, scriptFailures: 0, exceptions: 0 },
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const year of report.sample.years) {
  const seed = `scripted-release-audit-${year}`;
  const world = careerWorld({ country: 'ENG', seed, year }, release);
  const fixtures = world.fixtures
    .filter(
      (f) => f.kind === 'league' && (f.home === world.playerClub || f.away === world.playerClub),
    )
    .slice(0, report.sample.fixturesPerWorld);
  for (const fixture of fixtures) {
    report.totals.attempted++;
    try {
      const playback = simulateMatch(world, fixture, true);
      const recordProblems = validateFullMatchRecord(playback.record);
      const scriptProblems = playback.problems ?? [];
      const row = {
        seed,
        fixture: fixture.id,
        recordDigest: createHash('sha256').update(canonical(playback.record)).digest('hex'),
        script: !!playback.script,
        staging: !!playback.staging,
        material: !!playback.record.material,
        frames: playback.frames.length,
        recordProblems,
        scriptProblems,
        revision: playback.record.model,
      };
      report.fixtures.push(row);
      if (recordProblems.length || row.revision !== release.revision)
        report.totals.recordFailures++;
      if (scriptProblems.length || !row.script || !row.staging || !row.material || row.frames)
        report.totals.scriptFailures++;
    } catch (error) {
      report.totals.exceptions++;
      report.exceptions.push({ seed, fixture: fixture.id, error: String(error) });
    }
    save();
  }
}
report.completed = true;
report.finished = new Date().toISOString();
save();
console.log(
  JSON.stringify({
    ...report.totals,
    expected: report.sample.expected,
    completed: report.completed,
  }),
);
process.exitCode =
  report.totals.attempted === report.sample.expected &&
  report.totals.recordFailures === 0 &&
  report.totals.scriptFailures === 0 &&
  report.totals.exceptions === 0
    ? 0
    : 1;
