import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  FACILITY_ENCODING,
  encodeFacilityPanorama,
} from '../../../../../scripts/art-resources.mjs';

const root = 'apps/web/public/art/sticker-club';
const inventory = JSON.parse(await readFile(`${root}/generation.json`, 'utf8'));
const hashes = new Set();
for (const era of ['heritage', 'terraces', 'contemporary']) {
  for (const kind of ['stadium', 'locker']) {
    for (const stage of [9, 10]) {
      const id = `${era}-${kind}-${stage}`;
      const job = inventory.jobs.find((entry) => entry.id === id);
      if (!job) throw new Error(`Missing ${id}`);
      const output = `${root}/${job.asset}.webp`;
      if (process.argv.includes('--encode')) await encodeFacilityPanorama(job.source, output);
      for (const [file, width, height, budget, digest] of [
        [job.source, 0, 0, Infinity, job.sourceSha256],
        [output, 960, 320, FACILITY_ENCODING.maxBytes, job.sha256],
        [`${root}/${job.small.file}`, 480, 160, FACILITY_ENCODING.smallMaxBytes, job.small.sha256],
      ]) {
        const bytes = await readFile(file);
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== digest || hashes.has(hash) || bytes.length > budget)
          throw new Error(`Hash, uniqueness or budget: ${file}`);
        hashes.add(hash);
        const probe = JSON.parse(
          execFileSync(
            'ffprobe',
            [
              '-v',
              'error',
              '-select_streams',
              'v:0',
              '-show_entries',
              'stream=width,height',
              '-of',
              'json',
              file,
            ],
            { encoding: 'utf8' },
          ),
        ).streams[0];
        if (
          width
            ? probe.width !== width || probe.height !== height
            : Math.abs(probe.width / probe.height - 3) > 0.015
        )
          throw new Error(`Dimensions: ${file}`);
        execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
      }
    }
  }
}
console.log(`Validated ${hashes.size} unique decoded source and deployment images`);
