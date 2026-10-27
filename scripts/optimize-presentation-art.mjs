import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { FACILITY_ENCODING } from './art-resources.mjs';
import { UI_ART_ENCODING, verifyUiAssets } from './ui-art-resources.mjs';

const root = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
const write = process.argv.includes('--write');
const registry = JSON.parse(await readFile(resolve(root, 'presentation/themes/index.json')));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const policy = 'compact-ui-and-responsive-scenes-v1';
const report = [];
async function writeJson(path, value) {
  await writeFile(path, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));
}
function dimensions(path) {
  return JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      path,
    ]),
  ).streams[0];
}
async function encode(path, width, height, quality = UI_ART_ENCODING.quality) {
  const output = `${path}.optimized.webp`;
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    path,
    '-vf',
    `scale=${width}:${height}:flags=lanczos`,
    '-c:v',
    'libwebp',
    '-quality',
    String(quality),
    '-compression_level',
    '6',
    '-threads',
    '1',
    output,
  ]);
  await rename(output, path);
}
for (const entry of registry.entries) {
  const packPath = resolve(root, 'presentation/themes', entry.resource);
  const pack = JSON.parse(await readFile(packPath));
  const manifests = new Map();
  let before = 0,
    after = 0;
  for (const image of Object.values(pack.images.ui ?? {})) {
    const path = resolve(dirname(packPath), image.resource);
    let data = await readFile(path);
    before += data.length;
    if (path.endsWith('.webp')) {
      const manifestPath = resolve(dirname(path), 'generation.json');
      if (!manifests.has(manifestPath))
        manifests.set(manifestPath, JSON.parse(await readFile(manifestPath)));
      const record = manifests
        .get(manifestPath)
        .assets.find((asset) => path.endsWith(`/${asset.file}`));
      if (!record) throw new Error(`Missing provenance: ${path}`);
      if (write && record.optimization?.policy !== policy) {
        const old = dimensions(path);
        const target =
          image.mode === 'nine-slice'
            ? UI_ART_ENCODING.frameWidth
            : image.mode === 'tile'
              ? UI_ART_ENCODING.tileWidth
              : path.includes('/icon-')
                ? UI_ART_ENCODING.iconWidth
                : path.includes('/sidebar-')
                  ? UI_ART_ENCODING.sidebarWidth
                  : old.width;
        const width = Math.min(target, old.width);
        const height = Math.max(1, Math.round((old.height * width) / old.width));
        await encode(path, width, height);
        data = await readFile(path);
        record.optimization = {
          policy,
          inputBytes: record.bytes,
          inputSha256: record.sha256,
          width,
          height,
          quality: UI_ART_ENCODING.quality,
        };
        Object.assign(record, { bytes: data.length, sha256: hash(data), width, height });
      }
      if (hash(data) !== record.sha256) throw new Error(`Changed UI asset: ${path}`);
      const size = dimensions(path);
      if (!write && (image.width !== size.width || image.height !== size.height))
        throw new Error(`Incorrect UI dimensions: ${path}`);
      Object.assign(image, size);
      if (image.mode === 'nine-slice') image.slice = UI_ART_ENCODING.frameSlice;
      if (data.length > (path.includes('/sidebar-') ? 65_000 : 35_000))
        throw new Error(`UI resource exceeds 35 KB: ${path}`);
    }
    after += data.length;
  }
  for (const [path, manifest] of manifests) if (write) await writeJson(path, manifest);
  const frameDirectories = new Set(
    Object.values(pack.images.ui ?? {})
      .filter((image) => image.mode === 'nine-slice')
      .map((image) => dirname(resolve(dirname(packPath), image.resource))),
  );
  for (const directory of frameDirectories) await verifyUiAssets(directory);
  report.push({ theme: pack.id, group: 'ui', before, after });
  // Each smooth pack already records every distinct final scene in its generation manifest.
  const directory = resolve(root, 'art', pack.id);
  const manifestPath = resolve(directory, 'generation.json');
  const manifest = await readFile(manifestPath)
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  if (manifest?.jobs) {
    before = 0;
    after = 0;
    let smallTotal = 0;
    for (const job of manifest.jobs) {
      const path = resolve(directory, `${job.asset}.webp`);
      let data = await readFile(path);
      before += data.length;
      const small = path.replace(/\.webp$/, '.small.webp');
      if (write && job.optimization?.policy !== policy) {
        // Make the small representation before replacing the old deployment image.
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          path,
          '-vf',
          `scale=${FACILITY_ENCODING.smallWidth}:${FACILITY_ENCODING.smallHeight}:flags=lanczos`,
          '-c:v',
          'libwebp',
          '-quality',
          String(FACILITY_ENCODING.smallQuality),
          '-compression_level',
          '6',
          '-threads',
          '1',
          small,
        ]);
        await encode(
          path,
          FACILITY_ENCODING.width,
          FACILITY_ENCODING.height,
          FACILITY_ENCODING.quality,
        );
        data = await readFile(path);
        job.optimization = {
          policy,
          inputBytes: job.bytes,
          inputSha256: job.sha256,
          quality: FACILITY_ENCODING.quality,
        };
        Object.assign(job, {
          width: FACILITY_ENCODING.width,
          height: FACILITY_ENCODING.height,
          bytes: data.length,
          sha256: hash(data),
        });
        const compact = await readFile(small);
        job.small = {
          file: `${job.asset}.small.webp`,
          width: FACILITY_ENCODING.smallWidth,
          height: FACILITY_ENCODING.smallHeight,
          bytes: compact.length,
          sha256: hash(compact),
        };
      }
      if (data.length > FACILITY_ENCODING.maxBytes)
        throw new Error(`Scene exceeds budget: ${path}`);
      if (job.small) {
        const compact = await readFile(small);
        smallTotal += compact.length;
        if (compact.length > FACILITY_ENCODING.smallMaxBytes)
          throw new Error(`Small scene exceeds budget: ${small}`);
        if (hash(compact) !== job.small.sha256) throw new Error(`Changed small scene: ${small}`);
      }
      if (hash(data) !== job.sha256) throw new Error(`Changed scene: ${path}`);
      after += data.length;
    }
    if (write) {
      const slot = pack.images.facility;
      const smallOverrides = Object.fromEntries(
        Object.entries(slot.overrides ?? {}).map(([key, url]) => [
          key,
          url.replace(/\.webp$/, '.small.webp'),
        ]),
      );
      slot.variants = [
        {
          pattern: slot.pattern.replace(/\.webp$/, '.small.webp'),
          overrides: smallOverrides,
          width: FACILITY_ENCODING.smallWidth,
          height: FACILITY_ENCODING.smallHeight,
        },
        {
          pattern: slot.pattern,
          overrides: slot.overrides,
          width: FACILITY_ENCODING.width,
          height: FACILITY_ENCODING.height,
        },
      ];
      await writeJson(manifestPath, manifest);
    }
    report.push({ theme: pack.id, group: 'facility', before, after, small: smallTotal });
  }
  if (write) await writeJson(packPath, pack);
}
console.log(JSON.stringify({ policy, groups: report }, null, 2));
