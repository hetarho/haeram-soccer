import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../public/art/matchday-print/analysis-v1/', import.meta.url),
);
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const [source, name, role, mode] of [
    ['analysis-paper.png', 'paper-quiet', 'image-art-analysis-paper', 'tile'],
    ['formation-marker.png', 'icon-formation-marker', 'image-art-formation-marker', 'image'],
  ]) {
    const sheet = pipeline.decode(source);
    const crop = mode === 'tile' ? undefined : pipeline.bounds(sheet, 0, 0, 1, 1, 96);
    await pipeline.encode(source, name, crop);
    const record = pipeline.assets.at(-1);
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
          'Two individual built-in image_gen calls; shared createUiArtPipeline crop and WebP encoding',
        date: '2026-10-29',
        sources: 'apps/web/design/analysis-print/sources',
        prompts: 'apps/web/design/analysis-print/prompts.json',
        geometry:
          'Quiet tiled paper and a transparent circular marker. Pitch lines, labels and graph facts remain live.',
        assets: pipeline.assets,
      }),
      { parser: 'json' },
    ),
  );
  console.log(`Encoded ${pipeline.assets.length} analysis resources.`);
} finally {
  await pipeline.close();
}
