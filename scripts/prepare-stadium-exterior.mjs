import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFacilityPanorama } from './art-resources.mjs';
import { createUiArtPipeline } from './ui-art-resources.mjs';
import { stadiumExteriorSource } from '../apps/web/design/pixel/stadium-exterior-v1/source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const family = 'stadium-exterior-v1';
const hash = (data) => createHash('sha256').update(data).digest('hex');
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

const selectedTheme = process.argv.includes('--theme')
  ? process.argv[process.argv.indexOf('--theme') + 1]
  : undefined;
for (const theme of ['matchday-print', 'standard', 'sticker-club', 'pixel']) {
  if (selectedTheme && theme !== selectedTheme) continue;
  const sources = resolve(root, 'apps/web/design', theme, family);
  const output = resolve(root, 'apps/web/public/art', theme, family);
  const manifestPath = resolve(output, 'generation.json');
  if (process.argv.includes('--check')) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const asset of manifest.assets) {
      const data = await readFile(resolve(output, asset.file));
      if (hash(data) !== asset.sha256) throw new Error(`Changed exterior: ${theme}/${asset.file}`);
    }
    console.log(`${theme}: exterior hashes match`);
    continue;
  }
  await mkdir(output, { recursive: true });
  let assets;
  let image;
  if (theme === 'pixel') {
    const pipeline = await createUiArtPipeline({ sources, output });
    try {
      await pipeline.encodeSvg(stadiumExteriorSource(), 'exterior', 'source.mjs', 'png');
      assets = pipeline.assets.map((asset) => ({ ...asset, width: 240, height: 80 }));
    } finally {
      await pipeline.close();
    }
    image = { resource: `/art/${theme}/${family}/exterior.png`, width: 240, height: 80 };
  } else {
    const encoded = await encodeFacilityPanorama(
      resolve(sources, 'sources/exterior.png'),
      resolve(output, 'exterior.webp'),
    );
    const { small, ...full } = encoded;
    assets = [{ file: 'exterior.webp', ...full }, { file: 'exterior.small.webp', ...small }];
    const resource = `/art/${theme}/${family}/exterior.webp`;
    image = {
      resource,
      width: full.width,
      height: full.height,
      variants: [
        { resource: resource.replace('.webp', '.small.webp'), width: small.width, height: small.height },
        { resource, width: full.width, height: full.height },
      ],
    };
  }
  await json(manifestPath, {
    method: theme === 'pixel' ? 'Native integer-grid SVG; lossless PNG' : 'Built-in image_gen; compact responsive WebP',
    date: '2026-11-04',
    source: `apps/web/design/${theme}/${family}`,
    purpose: 'General exterior cover for the stadium investment destination, independent of completed stage and era.',
    assets,
  });
  const themePath = resolve(root, 'apps/web/public/presentation/themes', `${theme}.json`);
  const pack = JSON.parse(await readFile(themePath, 'utf8'));
  pack.images.facility.exterior = image;
  await json(themePath, pack);
  console.log(`${theme}: stadium exterior prepared`);
}
