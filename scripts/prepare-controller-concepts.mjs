import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createUiArtPipeline } from './ui-art-resources.mjs';
import { controllerPixelConcepts } from '../apps/web/design/pixel/controller-concepts-v1/source.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const groups = {
  'matchday-print': ['P1', 'P2', 'P3'],
  standard: ['G1', 'G2', 'G3'],
  pixel: ['X1', 'X2', 'X3'],
  'sticker-club': ['S1', 'S2', 'S3'],
};
for (const [theme, ids] of Object.entries(groups)) {
  const directory = resolve('apps/web/design', theme, 'controller-concepts-v1');
  const output = resolve(directory, 'tiles');
  const pipeline = await createUiArtPipeline({ sources: resolve(directory, 'sources'), output });
  const sourceHashes = {};
  try {
    for (const id of ids) {
      if (theme === 'pixel') {
        const svg = controllerPixelConcepts()[id];
        sourceHashes[id] = hash(svg);
        await pipeline.encodeSvg(
          svg,
          id,
          'design/pixel/controller-concepts-v1/source.mjs#' + id,
          'png',
        );
      } else {
        const file = id + '.png';
        sourceHashes[file] = hash(await readFile(resolve(directory, 'sources', file)));
        await pipeline.encode(file, id, undefined, 'scale=256:256');
      }
    }
    const size = theme === 'pixel' ? 32 : 256;
    await writeFile(
      resolve(output, 'generation.json'),
      JSON.stringify(
        {
          status: 'proposed',
          theme,
          sourceHashes,
          assets: pipeline.assets.map((asset) => ({
            ...asset,
            width: size,
            height: size,
            mode: 'tile',
            displaySize: theme === 'pixel' ? 64 : 256,
          })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(theme + ': ' + pipeline.assets.length + ' proposed controller materials');
  } finally {
    await pipeline.close();
  }
}
