import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  createUiArtPipeline,
  isolatedAtlasBounds,
  UI_PICTOGRAMS,
  verifyUiAssets,
} from './ui-art-resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = 'apps/web/design/sticker-club/sources';
const output = resolve(root, 'apps/web/public/art/sticker-club/ui');

if (process.argv.includes('--check')) {
  console.log(`${await verifyUiAssets(output)} sticker UI assets verified`);
} else {
  const { assets, decode, encode, close } = await createUiArtPipeline({
    sources: resolve(root, sourceDirectory),
    output,
  });
  try {
    const frames = decode('frames.png');
    const frameBounds = isolatedAtlasBounds(frames, 3, 2, 220);
    for (const [index, name] of [
      'panel',
      'primary',
      'dark',
      'tile',
      'button',
      'selected',
    ].entries())
      await encode(
        frames.file,
        `frame-${name}`,
        frameBounds[index],
        "format=rgba,lut=a='if(lt(val,96),0,if(gt(val,220),255,val))'",
      );

    const icons = decode('icons.png');
    const iconBounds = isolatedAtlasBounds(icons, 4, 4);
    for (const [index, name] of UI_PICTOGRAMS.entries())
      await encode(
        icons.file,
        `icon-${name}`,
        iconBounds[index],
        "format=rgba,lut=a='if(lt(val,96),0,if(gt(val,220),255,val))',scale=192:192:force_original_aspect_ratio=decrease,pad=192:192:(ow-iw)/2:(oh-ih)/2:color=black@0",
      );

    const material = decode('materials.png');
    const crops = ['cream', 'forest', 'orange', 'ivory'].map((name, index) => ({
      name,
      crop: {
        x: Math.floor(((index % 2) * material.width) / 2) + 2,
        y: Math.floor((Math.floor(index / 2) * material.height) / 2) + 2,
        width: Math.floor(material.width / 2) - 4,
        height: Math.floor(material.height / 2) - 4,
      },
    }));
    for (const { name, crop } of crops) await encode(material.file, name, crop, 'scale=512:512');
    await encode('sidebar.png', 'sidebar-clubhouse', undefined, 'scale=600:-1');
    await encode('../../home-themes/captures/sticker.png', 'masthead', {
      x: 20,
      y: 25,
      width: 228,
      height: 85,
    });
    await encode(material.file, 'rule-dark', { ...crops[1].crop, width: 400, height: 4 });
    await encode(material.file, 'rule-light', { ...crops[0].crop, width: 400, height: 4 });
    await encode(material.file, 'rule-light-vertical', { ...crops[0].crop, width: 4, height: 300 });
    await writeFile(
      resolve(output, 'generation.json'),
      JSON.stringify(
        {
          method:
            'Built-in image_gen; deterministic isolated-silhouette slicing and Chromium WebP encoding',
          date: '2026-10-24',
          reference: 'apps/web/design/home-themes/captures/sticker.png',
          sources: sourceDirectory,
          prompts: 'apps/web/design/sticker-club/prompts.json',
          geometry:
            'Nine-slice frames retain fixed die-cut corners; independent matte materials tile behind live HTML.',
          assets,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `${assets.length} sticker UI assets encoded (${assets.reduce((sum, a) => sum + a.bytes, 0)} bytes)`,
    );
  } finally {
    await close();
  }
}
