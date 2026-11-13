/** Export a frozen seeded fixture through the target checkout's own engine. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { CountryCode, MatchPlayback } from '../../packages/contracts/src/types';
import { message } from '../../packages/contracts/src/messages';
import { presentationSamples, PITCH_METRES } from '../../apps/web/src/entities/match/logic';
import type { ComparisonExport } from './data';
import { pressureDiagnostics } from './diagnostics';

const argv = process.argv.slice(2);
const opt = (key: string, fallback?: string) => {
  const at = argv.indexOf(`--${key}`);
  return at < 0 ? fallback : argv[at + 1];
};
const repo = resolve(opt('repo', process.cwd())!);
const out = opt('out');
if (!out)
  throw new Error(
    message('naturalFootball.usage', {
      command: 'export.ts --repo PATH --out FILE.json.gz [--seed viewer-2]',
    }),
  );
const country = opt('country', 'ENG') as CountryCode;
const year = Number(opt('year', '2024'));
const seed = opt('seed', 'viewer-2')!;
const club = opt('club', `${country}:0:0:0`)!;
const load = (path: string) => import(pathToFileURL(join(repo, path)).href);
const { careerWorld }: typeof import('../../packages/engine/src/career.testkit') = await load(
  'packages/engine/src/career.testkit.ts',
);
const { advanceToNextMatch, stagedPlayback }: typeof import('../../packages/engine/src/testing') =
  await load('packages/engine/src/testing.ts');
const world = careerWorld({ country, year, seed, club });
if (world.settings) world.settings.responsibilities.sales = 'delegated';
let playback: MatchPlayback | undefined;
for (let attempt = 0; attempt < 12; attempt++) {
  playback = advanceToNextMatch(world);
  if (!playback || playback.record.kind === 'league') break;
}
if (!playback || playback.record.kind !== 'league' || !playback.script || !playback.staging)
  throw new Error(message('naturalFootball.noMatch', { seed }));
const staged = stagedPlayback(playback);
if (!staged.frames.length) throw new Error(message('naturalFootball.noMatch', { seed }));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// material is derived from the script. All settled facts, including player counters, stay in the digest.
const record = { ...staged.record, material: undefined };
const inputHash = hash({
  country,
  year,
  seed,
  club,
  fixture: staged.record.id,
  squads: staged.squads,
});
const { samples } = presentationSamples(staged.frames);
// Raw on-screen displacement maximum includes presentation transitions; retain it in evidence
// only. It is not displayed or treated as a running/sprint-speed measurement.
let maxSpeed = 0;
for (let i = 1; i < samples.length; i++) {
  const before = samples[i - 1],
    now = samples[i],
    dt = now.time - before.time;
  if (dt <= 0 || staged.frames[now.frame].period !== staged.frames[before.frame].period) continue;
  for (const [side, players] of (now.players ?? []).entries())
    for (const player of players) {
      const was = before.players?.[side].find((p) => p.id === player.id);
      if (was)
        maxSpeed = Math.max(
          maxSpeed,
          Math.hypot(
            (player.position[0] - was.position[0]) * PITCH_METRES[0],
            (player.position[1] - was.position[1]) * PITCH_METRES[1],
          ) / dt,
        );
    }
}
const { pressureSeconds, pressureSpells2, pressureSpells5 } = pressureDiagnostics(staged.frames);
const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const clubName = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
const data: ComparisonExport = {
  version: 1,
  meta: {
    head,
    seed,
    year,
    country,
    club,
    fixture: record.id,
    home: clubName(record.home),
    away: clubName(record.away),
    inputHash,
    recordHash: hash(record),
    exportedAt: new Date().toISOString(),
    diagnostics: {
      samples: samples.length,
      maxSpeed,
      pressureSeconds,
      pressureSpells2,
      pressureSpells5,
    },
  },
  playback: {
    record,
    squads: staged.squads,
    frames: compactFrames(staged.frames),
  },
};
function compactFrames(frames: MatchPlayback['frames']): MatchPlayback['frames'] {
  const reduced = frames.map((frame) => ({
    ...frame,
    metrics: [[], []],
    players: frame.players?.map((side) =>
      side.map(({ id, position, velocity, state }) => ({ id, position, velocity, state })),
    ) as typeof frame.players,
    motion: frame.motion?.map((sample) => ({
      ...sample,
      players: sample.players.map((side) =>
        side.map(({ id, position, velocity, state }) => ({ id, position, velocity, state })),
      ) as typeof sample.players,
    })),
  }));
  // Only transient picture coordinates/times are rounded (0.001 playback units/seconds).
  // Frozen squads, settled records and their comparison digests keep their exact values.
  return JSON.parse(
    JSON.stringify(reduced, (_key, value: unknown) =>
      typeof value === 'number' && !Number.isInteger(value)
        ? Math.round(value * 1000) / 1000
        : value,
    ),
  ) as MatchPlayback['frames'];
}
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), gzipSync(JSON.stringify(data), { level: 9 }));
console.log(JSON.stringify({ out: resolve(out), ...data.meta }));
