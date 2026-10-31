import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUiArtPipeline, isolatedAtlasBounds } from './ui-art-resources.mjs';
import { dropdownPixelSources } from '../apps/web/design/pixel/dropdown-v1/source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['trigger', 'popup', 'selection'];
const colors = {
  'matchday-print': {
    popup: '#fff6e6',
    selected: '#a63724',
    ink: '#fff1d8',
    triggerFrame: 'image-art-frame-ticket',
    popupFrame: 'image-art-frame-ticket',
    selectionFrame: 'image-art-frame-stamp',
  },
  standard: {
    popup: '#243e30',
    selected: '#afbf9a',
    ink: '#183522',
    triggerFrame: 'image-art-control-dropdown',
    popupFrame: 'image-art-control-dropdown',
    selectionFrame: 'image-art-frame-stamp',
  },
  pixel: { popup: '#1c2720', selected: '#375b3f', ink: '#f3f2e8' },
  'sticker-club': {
    popup: '#fffbef',
    selected: '#fff0a0',
    ink: '#17382b',
    triggerFrame: 'image-art-control-tertiary',
    popupFrame: 'image-art-control-tertiary',
    selectionFrame: 'image-art-frame-stamp',
  },
};
for (const [themeId, colorsForTheme] of Object.entries(colors)) {
  const pixel = themeId === 'pixel';
  const sources = `apps/web/design/${themeId}/dropdown-v1`;
  const output = `apps/web/public/art/${themeId}/dropdown-v1`;
  const pipeline = await createUiArtPipeline({
    sources: resolve(root, sources),
    output: resolve(root, output),
  });
  try {
    const themePath = resolve(root, `apps/web/public/presentation/themes/${themeId}.json`);
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    const native = pixel ? dropdownPixelSources() : null;
    const atlas = pixel ? null : pipeline.decode('sources/plates.png');
    const crops = pixel ? null : isolatedAtlasBounds(atlas, 1, 3);
    for (const [index, name] of names.entries()) {
      const filename = `frame-${name}`;
      let width = 128;
      let height = 128;
      const slice = pixel ? 16 : 22;
      if (pixel) {
        await pipeline.encodeSvg(native[index].svg, filename, `${sources}/source.mjs`, 'png');
      } else {
        const crop = crops[index];
        await pipeline.encode('sources/plates.png', filename, crop, 'scale=1152:384');
        width = 192;
        height = 64;
      }
      if (slice * 2 >= Math.min(width, height))
        throw new Error(`Dropdown corner caps exceed ${themeId}/${name}: ${width}x${height}`);
      const role = `image-art-dropdown-${name}`;
      Object.assign(pipeline.assets.at(-1), {
        role,
        width,
        height,
        mode: 'nine-slice',
        slice,
      });
      theme.images.ui[role] = {
        resource: `../../art/${themeId}/dropdown-v1/${filename}.${pixel ? 'png' : 'webp'}`,
        width,
        height,
        mode: 'nine-slice',
        slice,
      };
    }
    const v = (name) => `var(--${name})`;
    Object.assign(theme.tokens.ui, {
      'image-select-frame': v(colorsForTheme.triggerFrame || 'image-art-dropdown-trigger'),
      'image-select-frame-slice': v(
        `${colorsForTheme.triggerFrame || 'image-art-dropdown-trigger'}-slice`,
      ),
      'select-trigger-frame-width': colorsForTheme.triggerFrame ? '6px' : pixel ? '3px' : '4px',
      'select-popup-frame': v(colorsForTheme.popupFrame || 'image-art-dropdown-popup'),
      'select-popup-frame-slice': v(
        `${colorsForTheme.popupFrame || 'image-art-dropdown-popup'}-slice`,
      ),
      'select-popup-frame-width': pixel ? '4px' : '6px',
      'select-selection-frame': v(colorsForTheme.selectionFrame || 'image-art-dropdown-selection'),
      'select-selection-frame-slice': v(
        `${colorsForTheme.selectionFrame || 'image-art-dropdown-selection'}-slice`,
      ),
      'select-selection-frame-width': colorsForTheme.selectionFrame ? '4px' : '3px',
      'select-popup-fill': colorsForTheme.popup,
      'select-selection-fill': colorsForTheme.selected,
      'select-selection-text': colorsForTheme.ink,
      'select-selection-muted': colorsForTheme.ink,
      'select-font-family': 'var(--body)',
      'select-font-size': pixel ? '14px' : '13px',
      'select-chevron-size': pixel ? '12px' : '10px',
      'select-hint-size': '12px',
      'select-trigger-height': '36px',
      'select-option-height': '32px',
      'select-popup-max-height': '280px',
      'select-popup-min-width': '176px',
    });
    const sourceFile = pixel ? 'source.mjs' : 'sources/plates.png';
    await writeFile(
      resolve(root, output, 'generation.json'),
      JSON.stringify(
        {
          method: pixel
            ? 'Native integer-grid SVG sources; shared lossless Chromium PNG encoding'
            : 'Built-in image_gen atlas; shared createUiArtPipeline alpha slicing and WebP encoding',
          date: '2026-10-31',
          sources,
          source: sourceFile,
          sourceSha256: createHash('sha256')
            .update(await readFile(resolve(root, sources, sourceFile)))
            .digest('hex'),
          prompts: pixel ? undefined : `${sources}/prompts.json`,
          geometry:
            'Separate trigger, popup and selected-row nine-slice plates; filled centres and fixed source caps. Live labels, icons and focus remain HTML/SVG.',
          assets: pipeline.assets,
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(themePath, JSON.stringify(theme, null, 2) + '\n');
    console.log(`${themeId}: ${pipeline.assets.length} compact dropdown plates prepared`);
  } finally {
    await pipeline.close();
  }
}
