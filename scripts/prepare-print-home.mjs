import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createUiArtPipeline, UI_PICTOGRAMS, verifyUiAssets } from './ui-art-resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = resolve(root, 'apps/web/design/home-print/sources');
const output = resolve(root, 'apps/web/public/art/matchday-print/home');
const manifestPath = resolve(output, 'generation.json');

if (process.argv.includes('--check')) {
  console.log(`${await verifyUiAssets(output)} print home assets verified`);
} else {
  const { assets, decode, bounds, encode, close } = await createUiArtPipeline({ sources, output });
  try {
    const frames = decode('frames.png');
    for (const [index, name] of ['ticket', 'stamp', 'dark', 'tile', 'button', 'selected'].entries())
      await encode(
        frames.file,
        `frame-${name}`,
        bounds(frames, index % 3, Math.floor(index / 3), 3, 2, 220),
        "format=rgba,lut=a='if(lt(val,96),0,val)'",
      );

    const icons = decode('icons.png');
    for (const [index, name] of UI_PICTOGRAMS.entries())
      await encode(
        icons.file,
        `icon-${name}`,
        bounds(icons, index % 4, Math.floor(index / 4), 4, 4),
        'scale=192:192:force_original_aspect_ratio=decrease,pad=192:192:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba',
      );

    const material = decode('materials.png');
    for (const [index, name] of ['paper', 'ink', 'vermilion', 'paper-quiet'].entries()) {
      const col = index % 2,
        row = Math.floor(index / 2);
      const x = Math.floor((col * material.width) / 2) + 2;
      const y = Math.floor((row * material.height) / 2) + 2;
      await encode(
        material.file,
        name,
        {
          x,
          y,
          width: Math.floor(material.width / 2) - 4,
          height: Math.floor(material.height / 2) - 4,
        },
        'scale=512:512' +
          (name === 'ink'
            ? ",lutrgb=r='24+(val-24)*0.30':g='24+(val-24)*0.30':b='20+(val-20)*0.30'"
            : name.startsWith('paper')
              ? ",lutrgb=r='237+(val-237)*0.55':g='224+(val-224)*0.55':b='199+(val-199)*0.55'"
              : name === 'vermilion'
                ? ",lutrgb=r='179+(val-179)*0.45':g='60+(val-60)*0.45':b='43+(val-43)*0.45'"
                : ''),
      );
    }
    await encode('sidebar.png', 'sidebar-terrace', undefined, 'scale=600:-1');

    // Fixed masthead and rules are sliced from the approved, already tracked concept image.
    const reference = '../../home-themes/captures/print.png';
    await encode(reference, 'masthead', { x: 18, y: 30, width: 226, height: 86 });
    await encode(reference, 'rule-dark', { x: 320, y: 71, width: 1070, height: 5 });
    await encode(reference, 'rule-light', { x: 32, y: 395, width: 205, height: 5 });
    await encode(reference, 'rule-light-vertical', { x: 685, y: 640, width: 5, height: 80 });

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          method:
            'Built-in image_gen; deterministic ffmpeg atlas slicing and Chromium WebP encoding',
          date: '2026-10-23',
          reference: 'apps/web/design/home-themes/captures/print.png',
          sources: 'apps/web/design/home-print/sources',
          prompts: 'apps/web/design/home-print/prompts.json',
          geometry:
            'Nine-slice frames: fixed corners, independently stretched edges; paper/ink tile separately.',
          assets,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `${assets.length} print home assets encoded (${assets.reduce((sum, a) => sum + a.bytes, 0)} bytes)`,
    );
  } finally {
    await close();
  }
}
