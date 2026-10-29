import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../public/art/matchday-print/ratings-v1/', import.meta.url),
);
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const tier of ['iron', 'bronze', 'silver', 'gold', 'elite']) {
    const variant = ['iron', 'bronze', 'elite'].includes(tier) ? `${tier}-bright` : tier;
    const source = `${variant}.png`;
    const sheet = pipeline.decode(source);
    const crop = pipeline.bounds(sheet, 0, 0, 1, 1, 96);
    await pipeline.encode(source, `frame-${variant}`, crop);
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
      role: `image-art-rating-${tier}`,
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
  }
  await writeFile(
    `${output}/generation.json`,
    await format(
      JSON.stringify({
        method:
          'Five individual built-in image_gen edits; shared createUiArtPipeline crop and WebP encoding',
        date: '2026-10-29',
        sources: 'apps/web/design/rating-print/sources',
        prompts: 'apps/web/design/rating-print/prompts.json',
        revisionPrompts: 'apps/web/design/rating-print/brightness-prompts.json',
        geometry:
          'Five filled rarity skins; fixed 22px source caps, independently stretched edges and centre. Live numbers are rendered separately.',
        assets: pipeline.assets,
      }),
      { parser: 'json' },
    ),
  );
  console.log(`Encoded ${pipeline.assets.length} rating resources.`);
} finally {
  await pipeline.close();
}
