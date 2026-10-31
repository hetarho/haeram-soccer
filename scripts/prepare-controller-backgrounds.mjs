import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { createUiArtPipeline } from './ui-art-resources.mjs';
import { controllerPixelConcepts } from '../apps/web/design/pixel/controller-concepts-v1/source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const role = 'image-art-controller-background';
const selections = [
  ['matchday-print', 'P3', '#612f37', '#fff4dc', '#e9d5bd'],
  ['standard', 'G1', '#183e30', '#f0f7e7', '#d1e1c9'],
  ['pixel', 'X2', '#202e48', '#e4f2ef', '#adcaca'],
  ['sticker-club', 'S1', '#f0cd67', '#2b402e', '#4e5c36'],
];
const hash = (data) => createHash('sha256').update(data).digest('hex');
const json = async (path, value) =>
  writeFile(path, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));

for (const [theme, candidate, fill, ink, muted] of selections) {
  const sourceDirectory = `apps/web/design/${theme}/controller-concepts-v1`;
  const output = resolve(root, `apps/web/public/art/${theme}/controller-v1`);
  const pipeline = await createUiArtPipeline({
    sources: resolve(root, sourceDirectory, 'sources'),
    output,
  });
  try {
    const pixel = theme === 'pixel';
    const size = pixel ? 32 : 256;
    const source = pixel ? 'source.mjs#X2' : `sources/${candidate}.png`;
    const original = pixel
      ? controllerPixelConcepts().X2
      : await readFile(resolve(root, sourceDirectory, source));
    if (pixel) {
      await pipeline.encodeSvg(original, 'material', `${sourceDirectory}/${source}`, 'png');
    } else {
      await pipeline.encode(`${candidate}.png`, 'material', undefined, 'scale=256:256');
    }
    const asset = pipeline.assets[0];
    Object.assign(asset, {
      source: `${sourceDirectory}/${source}`,
      width: size,
      height: size,
      role,
      mode: 'tile',
    });
    await json(resolve(output, 'generation.json'), {
      theme,
      selectedCandidate: candidate,
      selectedOn: '2026-10-31',
      sourceHashes: { [source]: hash(original) },
      assets: pipeline.assets,
    });
    const packPath = resolve(root, `apps/web/public/presentation/themes/${theme}.json`);
    const pack = JSON.parse(await readFile(packPath, 'utf8'));
    pack.images.ui[role] = {
      resource: `../../art/${theme}/controller-v1/${asset.file}`,
      width: size,
      height: size,
      mode: 'tile',
    };
    Object.assign(pack.tokens.ui, {
      'image-transport-material': `var(--${role})`,
      'transport-material-size': pixel ? '64px' : '256px',
      'transport-material-blend': 'normal',
      'transport-fill': fill,
      'transport-text': ink,
      'transport-muted': muted,
    });
    await json(packPath, pack);
    console.log(`${theme}: selected ${candidate}`);
  } finally {
    await pipeline.close();
  }
}
