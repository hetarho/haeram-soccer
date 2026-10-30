import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../../public/art/matchday-print/result-badges-v1/', import.meta.url),
);
const packPath = new URL(
  '../../../public/presentation/themes/matchday-print.json',
  import.meta.url,
);
const pack = JSON.parse(await readFile(packPath));
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const outcome of ['win', 'draw', 'loss']) {
    const source = `${outcome}.png`;
    const crop = pipeline.bounds(pipeline.decode(source), 0, 0, 1, 1, 96);
    await pipeline.encode(source, `frame-${outcome}`, crop);
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
    const role = `image-art-result-${outcome}-badge`;
    Object.assign(record, dimensions, {
      role,
      mode: 'nine-slice',
      slice: UI_ART_ENCODING.frameSlice,
      optimization: {
        policy: 'compact-ui-and-responsive-scenes-v1',
        inputBytes: original.length,
        inputSha256: createHash('sha256').update(original).digest('hex'),
        ...dimensions,
        quality: UI_ART_ENCODING.quality,
      },
    });
    pack.images.ui[role] = {
      resource: `../../art/matchday-print/result-badges-v1/${record.file}`,
      ...dimensions,
      mode: 'nine-slice',
      slice: UI_ART_ENCODING.frameSlice,
    };
  }
  await writeFile(
    `${output}/generation.json`,
    await format(
      JSON.stringify({
        method:
          'Three built-in image_gen edits; shared createUiArtPipeline alpha bounds and WebP encoding',
        date: '2026-10-30',
        sources: 'apps/web/design/matchday-print/result-badges/sources',
        prompts: 'apps/web/design/matchday-print/result-badges/prompts.json',
        geometry:
          'Opaque blank result tickets, transparent exterior, fixed source caps and filled centres; localized outcomes and scores remain live text.',
        assets: pipeline.assets,
      }),
      { parser: 'json' },
    ),
  );
  await writeFile(packPath, await format(JSON.stringify(pack), { parser: 'json' }));
  console.log(
    `Prepared ${pipeline.assets.length} result badge resources and synchronized theme metadata.`,
  );
} finally {
  await pipeline.close();
}
