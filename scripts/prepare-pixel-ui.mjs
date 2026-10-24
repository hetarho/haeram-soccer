import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createUiArtPipeline, verifyUiAssets } from './ui-art-resources.mjs';
import { pixelUiSources } from '../apps/web/design/pixel-ui/source.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = 'apps/web/design/pixel-ui';
const output = resolve(root, 'apps/web/public/art/pixel/ui');
if (process.argv.includes('--check'))
  console.log(`${await verifyUiAssets(output)} pixel UI assets verified`);
else {
  const theme = JSON.parse(
    await readFile(resolve(root, 'apps/web/public/presentation/themes/pixel.json'), 'utf8'),
  );
  const pipeline = await createUiArtPipeline({ sources: resolve(root, sources), output });
  try {
    for (const { name, svg, source } of pixelUiSources(theme))
      await pipeline.encodeSvg(svg, name, `${sources}/${source}`, 'png');
    await writeFile(
      resolve(output, 'generation.json'),
      JSON.stringify(
        {
          method:
            'Native pixel-grid SVG sources and existing semantic glyph paths; lossless Chromium PNG encoding',
          date: '2026-10-24',
          sources,
          geometry:
            '128px stepped frames use a 16px nine-slice region; 32px discrete materials repeat independently. Live text remains HTML.',
          assets: pipeline.assets,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`${pipeline.assets.length} pixel UI assets encoded`);
  } finally {
    await pipeline.close();
  }
}
