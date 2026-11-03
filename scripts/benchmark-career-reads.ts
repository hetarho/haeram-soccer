/** Synthetic reader scaling plus optional local-save measurements; never modifies an input save. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { gzipSync } from 'node:zlib';
import type { World, SeasonArchive } from '../packages/contracts/src/types';
import { canonical } from '../packages/contracts/src/index';
import { facts, result } from '../tests/fixtures/read-facts';
import { initializeReadModels, refreshReadModels } from '../packages/engine/src/read-models';
import { clubNews, deriveClubNews } from '../packages/engine/src/news';
import { clubMilestones } from '../packages/engine/src/goals';
import { europeanCoefficient } from '../packages/engine/src/europe';
import { eventsInSeason } from '../packages/engine/src/season-index';
import { tallies } from '../apps/web/src/runtime/playerTallies';
import { decode, checkpoint } from '../apps/web/src/adapters/persistence';
import { createWorld } from '../packages/engine/src/founding';
import { CHECKPOINT_LIMIT, SLOT } from '../apps/web/src/adapters/repository';

const arg = (flag: string) => process.argv[process.argv.indexOf(flag) + 1];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function synthetic(seasons: number) {
  const w = facts();
  for (let season = 0; season < seasons; season++) {
    w.year = 1930 + season;
    for (let n = 1; n <= 46; n++) {
      const m = result(w, n, n % 4);
      if (n % 6 === 0) m.kind = 'europe';
      w.ownMatches.push(m);
      w.events.push({
        year: w.year,
        round: n,
        kind: 'transfer-in',
        title: `선수 ${n}`,
        detail: '합성 기록',
      });
    }
    if (season < seasons - 1)
      w.history.push({
        year: w.year,
        tier: 0,
        rank: 2,
        played: 46,
        won: 30,
        fans: 1000,
        champions: [],
        europe: [],
      } as unknown as SeasonArchive);
  }
  w.round = 46;
  return w;
}
function readers(w: World) {
  return [clubNews(w), tallies(w), clubMilestones(w), europeanCoefficient(w)];
}
function scaling(seasons: number) {
  const source = synthetic(seasons),
    maintained = structuredClone(source);
  const start = performance.now();
  initializeReadModels(maintained);
  const reconstructionMs = performance.now() - start;
  const plainTimes: number[] = [],
    maintainedTimes: number[] = [];
  for (let i = 0; i < 45; i++) {
    // Alternate order so warm-up/host load cannot consistently favor one side.
    const a = () => {
      const t = performance.now();
      readers(source);
      plainTimes.push(performance.now() - t);
    };
    const b = () => {
      const t = performance.now();
      readers(maintained);
      maintainedTimes.push(performance.now() - t);
    };
    if (i % 2) {
      a();
      b();
    } else {
      b();
      a();
    }
  }
  const recordsBefore = maintained.ownMatches.length;
  const updateTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    maintained.ownMatches.push(result(maintained, 47 + i));
    const t = performance.now();
    refreshReadModels(maintained);
    updateTimes.push(performance.now() - t);
  }
  const journal = JSON.stringify({
    newsJournal: maintained.newsJournal,
    careerReads: maintained.careerReads,
  });
  return {
    synthetic: true,
    seasons,
    year: source.year,
    matches: recordsBefore,
    events: source.events.length,
    reconstructionMs,
    legacyReaderMedianMs: median(plainTimes.slice(5)),
    incrementalReaderMedianMs: median(maintainedTimes.slice(5)),
    nextResultMedianMs: median(updateTimes),
    journalUtf8Bytes: Buffer.byteLength(journal),
    journalGzipBytes: gzipSync(journal).length,
    recentNews: clubNews(maintained).length,
    legacyCurrentNews: deriveClubNews(source).length,
    currentSeasonLedgerRows: eventsInSeason(source, source.year).length,
  };
}
async function codec(w: World) {
  const old = { ...w };
  delete old.newsJournal;
  delete old.careerReads;
  const newer = { ...old };
  const start = performance.now();
  initializeReadModels(newer);
  const initializeMs = performance.now() - start;
  const cases = [];
  const inputs = [
    ['original', old],
    ['incremental', newer],
  ] as const;
  for (const [label, world] of inputs) {
    if (label === 'original' && process.argv.includes('--incremental-only')) continue;
    console.log(
      JSON.stringify({
        stage: 'checkpoint',
        label,
        year: world.year,
        matches: world.ownMatches.length,
      }),
    );
    const t = performance.now();
    try {
      const { raw } = await checkpoint(world);
      cases.push({
        label,
        checkpointUtf16Bytes: raw.length * 2,
        withinCheckpointLimit: 2 * (raw.length + SLOT[0].length) <= CHECKPOINT_LIMIT,
        encodeValidateMs: performance.now() - t,
        summariesSurvive:
          label === 'original' ||
          canonical((await decode(raw)).world.newsJournal) === canonical(world.newsJournal),
      });
    } catch (error) {
      cases.push({ label, failure: String(error), encodeValidateMs: performance.now() - t });
    }
  }
  return {
    year: w.year,
    matches: w.ownMatches.length,
    events: w.events.length,
    seasons: w.history.length,
    initializeMs,
    cases,
  };
}
const report: Record<string, unknown> = {
  kind: 'incremental-career-reads',
  at: new Date().toISOString(),
  source: {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  },
  environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model },
  methodology:
    'Synthetic 46-match seasons, 45 interleaved reader pairs (first five discarded); 20 new-result updates. Reader group includes news, cached tallies, milestones and European coefficient. No browser rendering, worker transfer or IndexedDB I/O is timed. Synthetic summaries are not a whole-world century capacity claim.',
  scaling: [1, 20, 80, 100].map(scaling),
  checkpoint: await codec(
    createWorld({
      country: 'ENG',
      name: 'Codec Fixture',
      color: '#223344',
      seed: 'career-read-codec',
      level: 'normal',
    }),
  ),
};
if (process.argv.includes('--save')) {
  try {
    report.localCareer = await codec((await decode(readFileSync(arg('--save'), 'utf8'))).world);
  } catch (error) {
    report.localCareer = {
      failure: String(error),
      note: 'Input file was read only and never modified.',
    };
  }
}
const output = process.argv.includes('--output')
  ? arg('--output')
  : 'artifacts/benchmarks/incremental-career-reads-261103.json';
mkdirSync(output.substring(0, output.lastIndexOf('/')) || '.', { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
