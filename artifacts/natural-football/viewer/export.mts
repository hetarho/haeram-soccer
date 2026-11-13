/**
 * Engine-only export of one own match, staged as the game stages a watched match.
 *
 * Run with the TARGET checkout's own tsx, cwd = that checkout (its engine is the one imported):
 *
 *   cd <worktree> && pnpm exec tsx <abs>/viewer/export.mts --out <abs file.json.gz>
 *       [--seed viewer-2] [--year 2024] [--country ENG] [--club ENG:0:0:0] [--repo <worktree>]
 *   cd <worktree> && pnpm exec tsx <abs>/viewer/export.mts --scan 1-12 [--year …]   (settle only)
 *
 * Path: `careerWorld` (fresh world, takeover of `--club`) → `advanceToNextMatch` (the day loop the
 * game's worker runs, `advanceDays(w, 1, …)`, which settles the own match and writes its script)
 * → `stagedPlayback` (`stageFrames`, the generator the game's staging worker drains). Only these
 * three stable entry points are touched. The first own LEAGUE match is taken (cup ties skipped).
 * Nothing is written inside the checkout; `--out` must lie outside it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};

const repo = resolve(opt('repo', process.cwd())!);
const country = opt('country', 'ENG')!;
const year = Number(opt('year', '2024'));
const club = opt('club', `${country}:0:0:0`)!;
const seedArg = opt('seed', 'viewer-2')!;

// The target checkout's engine, never this file's neighbours.
const load = (path: string) => import(pathToFileURL(join(repo, path)).href);
const { careerWorld } = await load('packages/engine/src/career.testkit.ts');
const { advanceToNextMatch, stagedPlayback } = await load('packages/engine/src/testing.ts');

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The career's first own league match, settled (not staged). */
function settleLeague(seed: string) {
  const world = careerWorld({ country, seed, club, year });
  if (world.settings?.responsibilities) world.settings.responsibilities.sales = 'delegated';
  for (let n = 0; n < 12; n++) {
    const playback = advanceToNextMatch(world);
    if (!playback) return { world, playback: undefined };
    if (playback.record.kind === 'league') return { world, playback };
  }
  return { world, playback: undefined };
}

const clubOf = (world: Any, id: string) => {
  const c = world.clubs.find((x: Any) => x.id === id);
  return c ? { id: c.id, name: c.name, short: c.short, color: c.color, tier: c.tier } : { id };
};
const describe = (world: Any, record: Any) => {
  const goals = record.highlights
    .filter((h: Any) => h.side === 0 || h.side === 1)
    .map((h: Any) => `${h.minute}'${h.side ? 'A' : 'H'}`);
  return `${clubOf(world, record.home).name} ${record.score.home}-${record.score.away} ${clubOf(world, record.away).name} [${record.kind} r${record.round}] ${goals.join(' ')}`;
};

if (opt('scan')) {
  const [from, to] = opt('scan')!.split('-').map(Number);
  for (let n = from!; n <= (to ?? from!); n++) {
    const seed = `viewer-${n}`;
    const t0 = Date.now();
    const { world, playback } = settleLeague(seed);
    console.log(
      `${seed}: ${playback ? describe(world, playback.record) : 'no league match'} (${Date.now() - t0} ms)`,
    );
  }
  process.exit(0);
}

const outArg = opt('out');
if (!outArg) throw new Error('usage: export.mts --out <file.json.gz> [--seed s] [--year y] …');
const out = isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg);
const inside = relative(repo, out);
if (!inside.startsWith('..') && !isAbsolute(inside))
  throw new Error(`--out must lie outside the checkout (${repo})`);

const t0 = Date.now();
const { world, playback } = settleLeague(seedArg);
const t1 = Date.now();
if (!playback) throw new Error(`${seedArg}: no own league match`);
if (!playback.script || !playback.staging)
  throw new Error(`${seedArg}: the settled match has no script (problems: ${playback.problems})`);
const staged = stagedPlayback(playback);
const t2 = Date.now();
if (!staged.frames.length) throw new Error(`${seedArg}: staging produced no frames`);

// ---- compact copy: only what the pitch, clock and score read -------------------------------
const PLAYER_KEYS = ['id', 'position', 'velocity', 'state'];
const pick = (o: Any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const players = (sides: Any) => sides && sides.map((side: Any[]) => side.map((m) => pick(m, PLAYER_KEYS)));
const frames = staged.frames.map((frame: Any) => {
  // Everything the frame carries except season statistics; motion keeps its player essentials.
  const { metrics: _m, xg: _x, players: framePlayers, motion, ...rest } = frame;
  return {
    ...rest,
    players: players(framePlayers),
    motion: motion?.map((sample: Any) => ({ ...sample, players: players(sample.players) })),
  };
});
const { material: _mat, players: _lines, detail: _det, metrics: _met, ...record } = staged.record;
const squads = staged.squads.map((squad: Any[]) =>
  squad.map((p) => ({ id: p.id, name: p.name, position: p.position })),
);

const git = (...a: string[]) => {
  try {
    return execFileSync('git', ['-C', repo, ...a], {
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
  } catch {
    return '';
  }
};
const meta = {
  repo,
  head: git('rev-parse', '--short', 'HEAD'),
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  dirtyEngineFiles: git('status', '--porcelain', '--', 'packages/engine').split('\n').filter(Boolean)
    .length,
  engine: world.engine,
  model: staged.record.model,
  seed: seedArg,
  year,
  club,
  fixture: { id: staged.record.id, kind: staged.record.kind, round: staged.record.round },
  home: clubOf(world, staged.record.home),
  away: clubOf(world, staged.record.away),
  score: staged.record.score,
  summary: describe(world, staged.record),
  frames: frames.length,
  samples: frames.reduce((n: number, f: Any) => n + (f.motion?.length ?? 0), 0),
  ms: { settle: t1 - t0, stage: t2 - t1 },
  exportedAt: new Date().toISOString(),
};
const round = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value;
const json = JSON.stringify({ v: 1, meta, playback: { record, frames, squads } }, round);
const gz = gzipSync(json, { level: 9 });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gz);
console.log(
  `${meta.summary}\n${out}: ${(gz.length / 1048576).toFixed(2)} MB gz (${(json.length / 1048576).toFixed(1)} MB json), ` +
    `${meta.frames} frames, ${meta.samples} samples; settle ${meta.ms.settle} ms, stage ${meta.ms.stage} ms, ` +
    `total ${Date.now() - t0} ms; ${meta.head}${meta.dirtyEngineFiles ? ` +${meta.dirtyEngineFiles} engine files dirty` : ''}`,
);
