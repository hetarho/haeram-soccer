import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline, UI_ART_ENCODING } from '../../../../scripts/ui-art-resources.mjs';

const sources = fileURLToPath(new URL('./sources/', import.meta.url));
const output = fileURLToPath(
  new URL('../../public/art/matchday-print/controls-v1/', import.meta.url),
);
const roles = [
  ['button-secondary', 'frame-secondary', 'image-art-control-secondary', 'nine-slice'],
  ['button-tertiary', 'frame-tertiary', 'image-art-control-tertiary', 'nine-slice'],
  ['field-input', 'frame-input', 'image-art-control-input', 'nine-slice'],
  ['field-dropdown', 'frame-dropdown', 'image-art-control-dropdown', 'nine-slice'],
  ['checkbox-off', 'icon-checkbox-off', 'image-art-control-checkbox-off', 'image'],
  ['checkbox-on', 'icon-checkbox-on', 'image-art-control-checkbox-on', 'image'],
  ['control-disabled', 'frame-disabled', 'image-art-control-disabled', 'nine-slice'],
];
const pipeline = await createUiArtPipeline({ sources, output });
try {
  for (const [id, name, role, mode] of roles) {
    const source = `${id}.png`;
    const sheet = pipeline.decode(source);
    const crop = pipeline.bounds(sheet, 0, 0, 1, 1, 96);
    await pipeline.encode(
      source,
      name,
      crop,
      mode === 'image' ? 'scale=128:128:flags=lanczos' : '',
    );
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
  const manifest = {
    method: 'Built-in image_gen edits; shared createUiArtPipeline alpha bounds and WebP encoding',
    date: '2026-10-29',
    sources: 'apps/web/design/controls-print/sources',
    prompts: 'apps/web/design/controls-print/prompts.json',
    geometry:
      'Opaque surface artwork with transparent exterior; fixed 22px source caps and stretched centre/edges. Checkbox states are complete square images.',
    assets: pipeline.assets,
  };
  await writeFile(
    `${output}/generation.json`,
    await format(JSON.stringify(manifest), { parser: 'json' }),
  );
  console.log(`Encoded ${pipeline.assets.length} portable control resources.`);
} finally {
  await pipeline.close();
}
