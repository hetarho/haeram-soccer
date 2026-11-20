import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRgbPng, encodeRgbPng } from './png.mjs';
import { LARGE_STADIUM_FAMILY, SCENE_HEIGHT, SCENE_WIDTH, largeStadiumScenes } from './source.mjs';

/**
 * Renders the stadium and locker-room scenes for stages 9 and 10 in each era.
 *
 * `node apps/web/design/pixel/large-stadium-v1/prepare.mjs` writes lossless PNG sources, encodes
 * the lossless 240×80 WebP deployment files into the existing `{era}/{kind}-{stage}` slots and
 * records their hashes in `generation.json`. `--check` regenerates nothing: it decodes the
 * committed PNG sources and deployed WebP files with ffmpeg and compares every pixel and hash.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const sourcesDir = resolve(here, 'sources');
const record = resolve(here, 'generation.json');
const deployRoot = resolve(root, 'apps/web/public');
const hash = (data) => createHash('sha256').update(data).digest('hex');

const sourceName = (scene) => `${scene.name}.png`;
const deployFile = (scene) => `/art/scenes/${scene.era}/${scene.kind}-${scene.stage}.webp`;

function encodeWebp(pngFile, webpFile) {
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      pngFile,
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      '-lossless',
      '1',
      '-compression_level',
      '9',
      '-pix_fmt',
      'rgb24',
      webpFile,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

/** Decodes a WebP back to raw RGB pixels with ffmpeg, the same decoder used to check it. */
function decodeWebp(webpFile) {
  const { width, height } = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', webpFile],
      { encoding: 'utf8' },
    ),
  ).streams[0];
  const rgb = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', webpFile, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return { width, height, rgb: new Uint8Array(rgb) };
}

const sameBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

async function prepare() {
  const scenes = largeStadiumScenes();
  await rm(sourcesDir, { recursive: true, force: true });
  await mkdir(sourcesDir, { recursive: true });
  const assets = [];
  for (const scene of scenes) {
    const png = encodeRgbPng(SCENE_WIDTH, SCENE_HEIGHT, scene.rgb);
    const sourcePath = resolve(sourcesDir, sourceName(scene));
    await writeFile(sourcePath, png);
    const deployPath = resolve(deployRoot, `.${deployFile(scene)}`);
    await mkdir(dirname(deployPath), { recursive: true });
    encodeWebp(sourcePath, deployPath);
    const webp = await readFile(deployPath);
    assets.push({
      era: scene.era,
      kind: scene.kind,
      stage: scene.stage,
      file: deployFile(scene),
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      bytes: webp.length,
      sha256: hash(webp),
      source: `sources/${sourceName(scene)}`,
      sourceBytes: png.length,
      sourceSha256: hash(png),
    });
  }
  await writeFile(
    record,
    `${JSON.stringify(
      {
        family: LARGE_STADIUM_FAMILY,
        date: '2026-11-20',
        method:
          'Native 240×80 RGB integer-grid source (source.mjs) written as lossless PNG; lossless WebP deployment via ffmpeg libwebp (-lossless 1, compression level 9); no browser raster.',
        source: 'apps/web/design/pixel/large-stadium-v1',
        purpose:
          'Stadium steps 9 and 10 and their locker rooms in each era, for the existing {era}/{kind}-{stage} slots (ECON-32, WEB-72). Working artwork awaiting visual review; the stage maximum is not raised here.',
        assets,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`prepared ${assets.length} scene sources and deployment files`);
}

async function check() {
  const scenes = largeStadiumScenes();
  const recorded = JSON.parse(await readFile(record, 'utf8'));
  if (recorded.assets.length !== scenes.length) throw new Error('Scene count changed');
  for (const scene of scenes) {
    const asset = recorded.assets.find(
      (entry) =>
        entry.era === scene.era && entry.kind === scene.kind && entry.stage === scene.stage,
    );
    if (!asset) throw new Error(`Missing record: ${scene.name}`);
    const png = await readFile(resolve(sourcesDir, sourceName(scene)));
    if (hash(png) !== asset.sourceSha256) throw new Error(`Changed source: ${scene.name}`);
    const decoded = decodeRgbPng(png);
    if (decoded.width !== SCENE_WIDTH || decoded.height !== SCENE_HEIGHT)
      throw new Error(`Bad source size: ${scene.name}`);
    if (!sameBytes(decoded.rgb, scene.rgb))
      throw new Error(`Source differs from generator: ${scene.name}`);
    const deployPath = resolve(deployRoot, `.${deployFile(scene)}`);
    const webp = await readFile(deployPath);
    if (hash(webp) !== asset.sha256) throw new Error(`Changed deployment: ${deployFile(scene)}`);
    const pixels = decodeWebp(deployPath);
    if (pixels.width !== SCENE_WIDTH || pixels.height !== SCENE_HEIGHT)
      throw new Error(`Bad deployment size: ${deployFile(scene)}`);
    if (!sameBytes(pixels.rgb, scene.rgb))
      throw new Error(`Deployment is not lossless: ${deployFile(scene)}`);
  }
  console.log(`${scenes.length} scene sources and deployment files match their generator`);
}

if (process.argv.includes('--check')) await check();
else await prepare();
