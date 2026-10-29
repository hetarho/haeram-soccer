import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../public/art/matchday-print/hierarchy-v1/', import.meta.url),
);
const roles = [
  ['panel-sheet-v2', 'frame-panel', 'image-art-content-sheet', 'nine-slice', ''],
  ['table-header', 'frame-table-head', 'image-art-table-heading', 'image', ''],
  ['rule-quiet-v2', 'rule-content', 'image-art-content-rule', 'image', 'scale=384:4:flags=lanczos'],
  ['tab-active', 'rule-tab-active', 'image-art-tab-active', 'image', 'scale=192:6:flags=lanczos'],
];
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const [id, name, role, mode, filter] of roles) {
    const source = `${id}.png`;
    const sheet = pipeline.decode(source);
    // Isolate the authored paper sheet; the generated surrounding shadow is not a UI resource.
    const crop =
      id === 'panel-sheet-v2'
        ? { x: 36, y: 196, width: 1464, height: 686 }
        : pipeline.bounds(sheet, 0, 0, 1, 1, 96);
    await pipeline.encode(source, name, crop, filter);
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
      ...(mode === 'nine-slice' ? { slice: UI_ART_ENCODING.frameSlice } : {}),
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
        method: 'Built-in image_gen edits; shared createUiArtPipeline crop and WebP encoding',
        date: '2026-10-29',
        sources: 'apps/web/design/hierarchy-print/sources',
        prompts: 'apps/web/design/hierarchy-print/prompts.json',
        geometry:
          'Quiet sheet with fixed source caps and filled centre; header band and thin rule resources stretch independently.',
        assets: pipeline.assets,
      }),
      { parser: 'json' },
    ),
  );
  console.log(`Encoded ${pipeline.assets.length} hierarchy resources.`);
} finally {
  await pipeline.close();
}
