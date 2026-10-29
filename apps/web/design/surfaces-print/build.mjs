import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../public/art/matchday-print/surfaces-v1/', import.meta.url),
);
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const [source, name, role, mode] of [
    ['canvas-grain-v2.png', 'canvas', 'image-art-paper', 'tile'],
    ['sheet-grain-v2.png', 'quiet', 'image-art-paper-quiet', 'tile'],
    ['detail-grain-v2.png', 'ivory', 'image-art-paper-detail', 'tile'],
    ['legacy-grain.png', 'grain-neutral', 'surface-grain', 'tile'],
  ]) {
    const sheet = pipeline.decode(source);
    const crop = mode === 'tile' ? undefined : pipeline.bounds(sheet, 0, 0, 1, 1, 96);
    await pipeline.encode(source, name, crop);
    const record = pipeline.assets.at(-1);
    const revised = source.endsWith('-grain-v2.png')
      ? record.file.replace('.webp', '-grain-v2.webp')
      : record.file;
    if (revised !== record.file) await rename(`${output}/${record.file}`, `${output}/${revised}`);
    record.file = revised;
    const dimensions = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        `${output}/${record.file}`,
      ]),
    ).streams[0];
    const original = await readFile(`${sources}/${source}`);
    Object.assign(record, dimensions, {
      role,
      mode,
      optimization: {
        policy: 'compact-ui-and-responsive-scenes-v1',
        inputBytes: original.length,
        inputSha256: createHash('sha256').update(original).digest('hex'),
        ...dimensions,
        quality: UI_ART_ENCODING.quality,
      },
    });
  }
  await writeFile(
    `${output}/generation.json`,
    await format(
      JSON.stringify({
        method:
          'Three built-in image_gen texture revisions plus same-size WebP encoding of retained neutral grain; shared createUiArtPipeline',
        date: '2026-10-29',
        sources: 'apps/web/design/surfaces-print/sources',
        prompts: 'apps/web/design/surfaces-print/prompts.json',
        legacyGrain:
          'apps/web/public/art/standard/grain.png (retained native 160px, alpha preserved)',
        revisionPrompts: 'apps/web/design/surfaces-print/grain-prompts-v2.json',
        geometry:
          'Three independent opaque repeating materials: canvas, content sheet and detail. No labels or frames are baked in.',
        assets: pipeline.assets,
      }),
      { parser: 'json' },
    ),
  );
  console.log(`Encoded ${pipeline.assets.length} surface resources.`);
} finally {
  await pipeline.close();
}
