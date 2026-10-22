import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { facilityStageTop } from '../apps/web/src/presentation/facilityImages.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'apps/web/public/art/standard');
const planPath = resolve(destination, 'production-plan.json');
const progress = resolve(tmpdir(), 'haeram-painted-standard-r8p3');
const plan = JSON.parse(
  await readFile(planPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(resolve(destination, 'generation.json'), 'utf8');
  }),
);
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];

if (args.includes('--finalize')) {
  const sources = [];
  for (const job of plan.jobs) {
    const content = await readFile(resolve(destination, `${job.asset}.webp`));
    if (content.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP: ${job.asset}`);
    const record = JSON.parse(
      await readFile(resolve(progress, `${job.id}.json`), 'utf8').catch((error) => {
        if (error.code !== 'ENOENT' || !job.source) throw error;
        return JSON.stringify(job);
      }),
    );
    sources.push({
      ...record,
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  const themePath = resolve(root, 'apps/web/public/presentation/themes/standard.json');
  const theme = JSON.parse(await readFile(themePath, 'utf8'));
  theme.images.facility = {
    pattern: '/art/standard/{era}/{kind}-{stage}.webp',
    overrides: Object.fromEntries(
      ['heritage', 'terraces', 'contemporary'].flatMap((era) =>
        ['manager', 'staff'].map((kind) => [`${era}.${kind}.0`, `/art/standard/${kind}.webp`]),
      ),
    ),
  };
  await writeFile(themePath, JSON.stringify(theme, null, 2) + '\n');
  for (const folder of ['', 'heritage', 'terraces', 'contemporary'])
    for (const file of await readdir(resolve(destination, folder)))
      if (file.endsWith('.svg')) await unlink(resolve(destination, folder, file));
  await writeFile(
    resolve(destination, 'generation.json'),
    JSON.stringify(
      {
        method: 'built-in image_gen; source-preserving WebP encoding with ffmpeg',
        date: '2026-10-22',
        style: plan.style,
        styleReference: 'heritage/stadium-0.webp',
        jobs: plan.jobs.map((job) => ({
          ...job,
          ...sources.find((source) => source.id === job.id),
        })),
      },
      null,
      2,
    ) + '\n',
  );
  await unlink(planPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  console.log(`Integrated ${sources.length} painted scenes; removed superseded vector artwork.`);
} else {
  const source = value('--source');
  const asset = value('--asset');
  const job = plan.jobs.find((entry) => entry.asset === asset);
  if (!source || !job) throw new Error('Expected a source and an asset from the production plan');
  if (job.kind !== 'manager' && job.kind !== 'staff' && job.stage > facilityStageTop(job.kind))
    throw new Error(`Invalid completed stage: ${asset}`);
  const { stdout } = await execute('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    source,
  ]);
  const { width, height } = JSON.parse(stdout).streams[0];
  if (Math.abs(width / height - 3) > 0.015)
    throw new Error(`Expected a panoramic 3:1 source for ${asset}: ${width}x${height}`);
  const output = resolve(destination, `${asset}.webp`);
  await mkdir(dirname(output), { recursive: true });
  await execute('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-vf',
    'scale=1440:480',
    '-c:v',
    'libwebp',
    '-quality',
    '85',
    '-compression_level',
    '6',
    '-frames:v',
    '1',
    '-threads',
    '1',
    output,
  ]);
  const content = await readFile(output);
  const record = {
    id: job.id,
    source,
    width: 1440,
    height: 480,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  await mkdir(progress, { recursive: true });
  await writeFile(resolve(progress, `${job.id}.json`), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ asset, bytes: content.length }));
}
