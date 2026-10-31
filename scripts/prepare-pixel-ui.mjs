import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createUiArtPipeline, verifyUiAssets } from './ui-art-resources.mjs';
import { pixelUiSources } from '../apps/web/design/pixel-ui/source.mjs';
import { pixelIcon } from '../apps/web/design/pixel-ui/icons.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = 'apps/web/design/pixel-ui';
const output = resolve(root, 'apps/web/public/art/pixel/ui');
if (process.argv.includes('--check'))
  console.log(`${await verifyUiAssets(output)} pixel UI assets verified`);
else {
  const themePath = resolve(root, 'apps/web/public/presentation/themes/pixel.json');
  const theme = JSON.parse(await readFile(themePath, 'utf8'));
  const pipeline = await createUiArtPipeline({ sources: resolve(root, sources), output });
  try {
    for (const { name, svg, source } of pixelUiSources())
      await pipeline.encodeSvg(svg, name, `${sources}/${source}`, 'png');
    for (const [name, icon] of Object.entries(theme.icons))
      if (!name.startsWith('trophy.')) icon.default = pixelIcon(name);
    await writeFile(themePath, JSON.stringify(theme, null, 2) + '\n');
    await writeFile(
      resolve(output, 'generation.json'),
      JSON.stringify(
        {
          method:
            'Native pixel-grid SVG sources and 24px semantic glyph paths; lossless Chromium PNG encoding',
          date: '2026-10-30',
          sources,
          geometry:
            '24px integer-grid glyphs share SVG and PNG geometry. 128px stepped frames use a 16px nine-slice region; 32px discrete materials repeat independently. Live text remains HTML.',
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
