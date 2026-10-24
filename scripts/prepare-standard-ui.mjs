import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createUiArtPipeline,
  isolatedAtlasBounds,
  uiSvg,
  verifyUiAssets,
} from './ui-art-resources.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = 'apps/web/design/standard-ui/sources';
const output = resolve(root, 'apps/web/public/art/standard/ui');
if (process.argv.includes('--check'))
  console.log(`${await verifyUiAssets(output)} stadium-green UI assets verified`);
else {
  const pipeline = await createUiArtPipeline({ sources: resolve(root, sourceDirectory), output });
  const { assets, decode, encode, encodeSvg } = pipeline;
  try {
    const frames = decode('frames.png');
    const bounds = isolatedAtlasBounds(frames, 3, 2, 220);
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
        bounds[index],
        "format=rgba,lut=a='if(lt(val,96),0,if(gt(val,220),255,val))'",
      );
    const require = createRequire(import.meta.url);
    const lucide = dirname(require.resolve('lucide-static/package.json'));
    const icons = {
      home: 'house',
      league: 'table-2',
      cup: 'trophy',
      history: 'rotate-ccw-clock',
      people: 'users',
      training: 'dumbbell',
      office: 'building',
      boot: 'footprints',
      supporters: 'users-round',
      manager: 'user-round',
      shirt: 'shirt',
      bell: 'bell',
      menu: 'menu',
      switch: 'arrow-right-left',
      play: 'play',
      heart: 'heart',
    };
    for (const [name, icon] of Object.entries(icons)) {
      const svg = (await readFile(resolve(lucide, `icons/${icon}.svg`), 'utf8'))
        .replace('width="24"', 'width="192"')
        .replace('height="24"', 'height="192"')
        .replaceAll('currentColor', '#ffffff');
      await encodeSvg(svg, `icon-${name}`, `lucide-static/icons/${icon}.svg`);
    }
    const grain = (
      await readFile(resolve(root, 'apps/web/public/art/standard/grain.png'))
    ).toString('base64');
    for (const [name, fill] of [
      ['canvas', '#14271e'],
      ['quiet', '#203127'],
      ['dark', '#10251b'],
      ['primary', '#98e4a7'],
    ])
      await encodeSvg(
        uiSvg(
          160,
          160,
          `<path d="M0 0h160v160H0Z" fill="${fill}"/><image href="data:image/png;base64,${grain}" width="160" height="160"/>`,
        ),
        name,
        'standard/grain.png + semantic palette',
      );
    await encode('sidebar.png', 'sidebar-terrace', undefined, 'scale=600:-1');
    await encodeSvg(
      uiSvg(
        512,
        166,
        '<text x="5" y="101" fill="#f2f4ee" font-family="Arial,sans-serif" font-size="94" font-weight="800" letter-spacing="-4">HAERAM</text><path d="M8 129h82v5H8Z" fill="#98e4a7"/>',
      ),
      'masthead',
      'native wordmark SVG in prepare-standard-ui.mjs',
    );
    await encodeSvg(
      uiSvg(64, 2, '<path d="M0 0h64v2H0Z" fill="#a2c3a7" fill-opacity="0.18"/>'),
      'rule-dark',
      'native tonal rule',
    );
    await encodeSvg(
      uiSvg(64, 2, '<path d="M0 0h64v2H0Z" fill="#cbd8cc" fill-opacity="0.22"/>'),
      'rule-light',
      'native tonal rule',
    );
    await encodeSvg(
      uiSvg(2, 64, '<path d="M0 0h2v64H0Z" fill="#cbd8cc" fill-opacity="0.22"/>'),
      'rule-light-vertical',
      'native tonal rule',
    );
    await writeFile(
      resolve(output, 'generation.json'),
      JSON.stringify(
        {
          method:
            'Built-in image_gen frame atlas/sidebar; pinned Lucide SVG geometry and reusable static grain; deterministic slicing and Chromium WebP encoding',
          date: '2026-10-24',
          sources: sourceDirectory,
          prompts: 'apps/web/design/standard-ui/prompts.json',
          license: 'presentation/themes/Lucide-LICENSE.txt',
          geometry:
            'Fixed quiet rounded corners; straight repeatable edges; matte materials tile separately behind live HTML.',
          assets,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`${assets.length} stadium-green UI assets encoded`);
  } finally {
    await pipeline.close();
  }
}
