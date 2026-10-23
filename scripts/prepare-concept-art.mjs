import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPT_THEMES } from './generate-concept-themes.mjs';
import { encodeFacilityPanorama } from './art-resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const theme = value('--theme');
if (!Object.hasOwn(CONCEPT_THEMES, theme)) throw new Error('Expected a known --theme');
const destination = resolve(root, 'apps/web/public/art', theme);
const progress = resolve(root, '.tmp/theme-art', theme);
const planPath = resolve(destination, 'production-plan.json');

if (args.includes('--plan')) {
  const existing = JSON.parse(
    await readFile(resolve(root, 'apps/web/public/art/standard/generation.json'), 'utf8'),
  );
  const jobs = existing.jobs.map(({ id, asset, kind, era, stage, prompt }) => {
    const scene = prompt.includes('Scene:')
      ? prompt.slice(prompt.indexOf('Scene:'))
      : 'Scene: A modest English amateur football ground around 1950, a near rope-net goal at left, one small covered wooden stand across a worn grass pitch, a small brick clubhouse and mature trees. Capacity around 2500, natural low touchline viewpoint.';
    return {
      id,
      asset,
      kind,
      era,
      stage,
      prompt: `Use case: illustration-story. Asset: one FINAL panoramic 3:1 facility background, around 1920x640, for a football-management game. Image 1 is a STYLE reference ONLY: match its illustration medium; do not copy its stadium into a locker room, training ground, academy or office. Create a NEW distinct complete scene for the described kind, period and completed facility scale. Style: ${CONCEPT_THEMES[theme].style} Keep the main architecture and equipment visible in a narrow central horizontal band. Realistic scale and perspective rendered with this graphic language. Full-bleed rectangular panorama. No text, no stage/capacity numbers, letters, logos, labels, watermarks, borders, UI, people or faces. ${scene}`,
    };
  });
  await mkdir(destination, { recursive: true });
  await writeFile(
    planPath,
    JSON.stringify(
      { method: 'built-in image_gen', style: CONCEPT_THEMES[theme].style, jobs },
      null,
      2,
    ) + '\n',
  );
  console.log(`${theme}: planned ${jobs.length} distinct facility scenes`);
} else if (args.includes('--finalize')) {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const jobs = [];
  for (const job of plan.jobs) {
    const record = JSON.parse(await readFile(resolve(progress, `${job.id}.json`), 'utf8'));
    const image = await readFile(resolve(destination, `${job.asset}.webp`));
    if (createHash('sha256').update(image).digest('hex') !== record.sha256)
      throw new Error(`Changed artwork: ${job.id}`);
    jobs.push(record);
  }
  if (new Set(jobs.map((job) => job.sha256)).size !== jobs.length)
    throw new Error('Duplicate facility illustrations');
  await writeFile(
    resolve(destination, 'generation.json'),
    JSON.stringify(
      {
        method: 'built-in image_gen; source-preserving WebP encoding with ffmpeg',
        date: '2026-10-23',
        style: plan.style,
        styleReference: 'heritage/stadium-0.webp',
        jobs,
      },
      null,
      2,
    ) + '\n',
  );
  await unlink(planPath);
  console.log(`${theme}: integrated ${jobs.length} distinct generated illustrations`);
} else {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const source = value('--source');
  const job = plan.jobs.find((entry) => entry.asset === value('--asset'));
  if (!source || !job) throw new Error('Expected --source and a planned --asset');
  const output = resolve(destination, `${job.asset}.webp`);
  const encoded = await encodeFacilityPanorama(source, output, { quality: 88 });
  await mkdir(progress, { recursive: true });
  const record = {
    ...job,
    source,
    ...encoded,
  };
  await writeFile(resolve(progress, `${job.id}.json`), JSON.stringify(record, null, 2) + '\n');
  console.log(`${theme}/${job.id}: ${encoded.bytes} bytes`);
}
