import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { pixelDetailSources } from '../apps/web/design/pixel-ui/source.mjs';
import {
  createUiArtPipeline,
  isolatedAtlasBounds,
  uiSvg,
  verifyUiAssets,
  UI_ART_ENCODING,
} from './ui-art-resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const themes = {
  standard: {
    source: 'standard-ui',
    canvas: '#14271e',
    sheet: '#203a2d',
    detail: '#2d4b39',
    secondary: '#365e46',
    tertiary: '#223e30',
    field: '#182f24',
    disabled: '#29392f',
    disabledText: '#cbd8cc',
    secondaryText: '#f2f4ee',
    rule: '#9bbca1',
    primary: '#98e4a7',
    header: '#304d3b',
  },
  pixel: {
    source: 'pixel-ui',
    canvas: '#111415',
    sheet: '#1c2720',
    detail: '#2c3c2f',
    secondary: '#324b36',
    tertiary: '#202927',
    field: '#121b16',
    disabled: '#29302b',
    disabledText: '#c3ccc5',
    secondaryText: '#f3f2e8',
    rule: '#596e5c',
    primary: '#a1cf9b',
    header: '#344733',
  },
  'sticker-club': {
    source: 'sticker-club',
    canvas: '#eddfbb',
    sheet: '#f7f0dc',
    detail: '#fffbed',
    secondary: '#dce9c5',
    tertiary: '#fffbed',
    field: '#fffcf2',
    disabled: '#e3dcc7',
    disabledText: '#4c614c',
    secondaryText: '#17382b',
    rule: '#355841',
    primary: '#b84620',
    header: '#e4edcf',
  },
};
const tiers = {
  iron: ['#8fa5b3', '#112b3b'],
  bronze: ['#d7924d', '#382211'],
  silver: ['#dbe8e8', '#243a45'],
  gold: ['#f1d58a', '#493211'],
  elite: ['#b985e0', '#2e123f'],
};
const atlas = [
  ['frame-secondary', 'image-art-control-secondary', 'nine-slice'],
  ['frame-tertiary', 'image-art-control-tertiary', 'nine-slice'],
  ['frame-input', 'image-art-control-input', 'nine-slice'],
  ['frame-disabled', 'image-art-control-disabled', 'nine-slice'],
  ['frame-dropdown', 'image-art-control-dropdown', 'nine-slice'],
  ['icon-checkbox-off', 'image-art-control-checkbox-off', 'image'],
  ['icon-checkbox-on', 'image-art-control-checkbox-on', 'image'],
  ['rule-tab-active', 'image-art-tab-active', 'image'],
  // The generated heading plate is retained in source; a tiled material gives long tables a quiet band.
  null,
  ...['iron', 'bronze', 'silver', 'gold', 'elite'].map((tier) => [
    `frame-rating-${tier}`,
    `image-art-rating-${tier}`,
    'nine-slice',
  ]),
  ['icon-formation-marker', 'image-art-formation-marker', 'image'],
  // Native tonal rules have constant thickness when stretched across a table.
  null,
];
const materials = [
  ['canvas', 'image-art-paper'],
  ['quiet', 'image-art-paper-quiet'],
  ['ivory', 'image-art-paper-detail'],
  ['table-heading', 'image-art-table-heading'],
];
const roleFor = new Map(
  [
    ...atlas.filter(Boolean),
    ...materials.map(([name, role]) => [name, role, 'tile']),
    ['rule-content', 'image-art-content-rule', 'image'],
    ['sticky-column-shadow', 'image-art-table-sticky-shadow', 'image'],
  ].map(([name, role, mode]) => [name, { role, mode }]),
);
const json = async (path, value) =>
  writeFile(path, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));
const hash = (data) => createHash('sha256').update(data).digest('hex');

function detailTokens(id, config) {
  const pixel = id === 'pixel';
  const v = (role) => `var(--${role})`;
  const tokens = {
    accent: config.primary,
    'accent-text': v('image-accent'),
    'image-accent': id === 'sticker-club' ? '#9b3617' : config.primary,
    'image-canvas': config.canvas,
    'image-quiet': config.sheet,
    'image-detail': config.detail,
    'image-detail-material': v('image-art-paper-detail'),
    'image-detail-frame': 'none',
    'image-inset-frame': 'none',
    'image-content-frame': 'none',
    'image-disclosure-rule': 'none',
    'image-section-rule': v('image-art-content-rule'),
    'image-control-fill-mode': 'fill',
    'button-supporting-material': 'none',
    'button-secondary-fill': config.secondary,
    'button-secondary-text': config.secondaryText,
    'button-tertiary-fill': config.tertiary,
    'button-tertiary-text': config.secondaryText,
    'button-secondary-frame': v('image-art-control-secondary'),
    'button-secondary-frame-slice': v('image-art-control-secondary-slice'),
    'button-tertiary-frame': v('image-art-control-tertiary'),
    'button-tertiary-frame-slice': v('image-art-control-tertiary-slice'),
    'supporting-button-frame-width': pixel ? '4px' : '6px',
    'image-field-frame': v('image-art-control-input'),
    'image-field-frame-slice': v('image-art-control-input-slice'),
    'image-field-frame-width': pixel ? '4px' : '6px',
    'image-select-frame': v('image-art-control-dropdown'),
    'image-select-frame-slice': v('image-art-control-dropdown-slice'),
    'image-field-fill': config.field,
    'image-field-material': 'none',
    'input-min-height': '44px',
    'input-padding': '9px 12px',
    'choice-label-min-height': '44px',
    'listbox-border-width': '1px',
    'checkbox-frame': 'none',
    'checkbox-border-width': '0px',
    'checkbox-padding': '0px',
    'checkbox-fill': 'transparent',
    'checkbox-off-art': v('image-art-control-checkbox-off'),
    'checkbox-on-art': v('image-art-control-checkbox-on'),
    'checkbox-art-size': '100% 100%',
    'checkbox-art-repeat': 'no-repeat',
    'checkbox-mark-content': 'none',
    'image-disabled-frame': v('image-art-control-disabled'),
    'image-disabled-material': 'none',
    'image-disabled-text': config.disabledText,
    'image-disabled-filter': 'none',
    'image-disabled-opacity': '1',
    'panel-padding': '8px',
    'content-panel-padding': '0px',
    'panel-heading-padding': '6px 10px',
    'panel-heading-size': '18px',
    'panel-heading-line-height': '1.3',
    'panel-body-padding': '8px 10px',
    'panel-footer-padding': '6px 10px',
    'panel-footer-fill': v('image-quiet'),
    'panel-mobile-margin-bottom': '0px',
    'panel-heading-align': 'center',
    'content-divider-width': '0px',
    'content-divider-image': v('image-art-content-rule'),
    'attribute-gap': '4px 16px',
    'attribute-size': '13px',
    'attribute-margin': '0px',
    'attribute-padding-block': '3px 0px',
    'attribute-label-color': v('text-muted'),
    'attribute-align-items': 'flex-start',
    'attribute-min-height': '32px',
    'attribute-line-height': '24px',
    'attribute-rating-min-width': '28px',
    'attribute-rating-min-height': '24px',
    'attribute-rating-padding': '2px 4px',
    'attribute-rating-value-size': '13px',
    'attribute-rating-border-width': '1px',
    'attribute-rating-frame-width': pixel ? '2px' : '1.5px',
    'page-tabs-margin-bottom': '2px',
    'tab-font-size': '14px',
    'tab-weight': '500',
    'tab-selected-weight': '700',
    'tab-active-height': '3px',
    'tab-baseline-border-width': '0px',
    'image-tab-baseline': v('image-art-content-rule'),
    'image-tab-active-rule': v('image-art-tab-active'),
    'table-heading-padding': '5px 6px',
    'table-cell-padding': '4px 6px',
    'standings-cell-padding': '3px 6px',
    'standings-cell-padding-mobile': '3px 4px',
    'table-legend-padding': '6px 8px',
    'table-body-size': '13px',
    'table-line-height': '1.35',
    'table-heading-size': '11px',
    'table-header-fill': config.header,
    'table-header-text': config.secondaryText,
    'table-header-material-size': pixel ? '32px' : '256px',
    'image-table-header-material': v('image-art-table-heading'),
    'table-rule-border-width': '0px',
    'image-table-row-rule': v('image-art-content-rule'),
    'table-alt-fill': config.sheet,
    'table-own-fill': config.detail,
    'image-table-own-material': v('image-detail-material'),
    'table-row-height': '44px',
    'table-badge-border-width': '1px',
    'table-badge-frame-width': '2px',
    'table-badge-font-size': '11px',
    'table-rating-padding': '2px 5px',
    'rating-fill-mode': 'fill',
    'rating-material': 'none',
    'image-table-sticky-shadow': v('image-art-table-sticky-shadow'),
    'table-sticky-shadow-width': pixel ? '8px' : '10px',
    'analysis-paper': v('image-art-analysis-paper'),
    'analysis-paper-size': pixel ? '32px' : '256px',
    'analysis-pitch-ground': config.canvas,
    'analysis-pitch-stripe': config.sheet,
    'analysis-pitch-stripe-alt': config.detail,
    'analysis-pitch-line': id === 'sticker-club' ? '#245d3d80' : '#c7d4b380',
    'analysis-pitch-edge': id === 'sticker-club' ? '#245d3d50' : '#c7d4b350',
    'formation-marker': v('image-art-formation-marker'),
    'formation-marker-fallback': 'transparent',
    'card-padding': '10px 12px',
    'card-gap': '8px',
    'card-title-size': '15px',
    'card-sheet-title-size': '17px',
    'card-body-size': '13px',
    'preview-padding': '16px',
    'preview-section-gap': '16px',
    'preview-label-gap': '6px',
    'preview-label-padding': '4px',
    'preview-example-gap': '8px',
    'preview-label-divider-image': 'none',
    'preview-label-color': v('image-muted'),
    'section-rule-height': pixel ? '2px' : '1px',
  };
  for (const [tier, [fill, text]] of Object.entries(tiers))
    Object.assign(tokens, {
      [`rating-${tier}-frame`]: v(`image-art-rating-${tier}`),
      [`rating-${tier}-slice`]: v(`image-art-rating-${tier}-slice`),
      [`rating-${tier}-fill`]: fill,
      [`rating-${tier}-text`]: text,
    });
  return tokens;
}

for (const [id, config] of Object.entries(themes)) {
  const pixel = id === 'pixel';
  const sourceDirectory = `apps/web/design/${config.source}${pixel ? '' : '/details-v1'}`;
  const output = resolve(root, `apps/web/public/art/${id}/details-v1`);
  if (process.argv.includes('--check')) {
    console.log(`${id}: ${await verifyUiAssets(output)} detail resources verified`);
    continue;
  }
  const pipeline = await createUiArtPipeline({
    sources: resolve(root, sourceDirectory, pixel ? '' : 'sources'),
    output,
  });
  try {
    if (pixel) {
      for (const { name, svg, source } of pixelDetailSources())
        await pipeline.encodeSvg(svg, name, `${sourceDirectory}/${source}`, 'png');
    } else {
      const sheet = pipeline.decode('components.png');
      const bounds = isolatedAtlasBounds(sheet, 4, 4, 240);
      for (const [index, entry] of atlas.entries()) {
        if (!entry) continue;
        const [name, , mode] = entry;
        await pipeline.encode(
          'components.png',
          name,
          bounds[index],
          `format=rgba,lut=a='if(lt(val,180),0,if(gt(val,240),255,val))'${mode === 'image' && name.startsWith('icon-') ? ',scale=128:128:force_original_aspect_ratio=decrease,pad=128:128:(ow-iw)/2:(oh-ih)/2:color=black@0' : ''}`,
        );
      }
      const material = pipeline.decode('materials.png');
      for (const [index, [name]] of materials.entries()) {
        const crop = {
          x: (index % 2) * Math.floor(material.width / 2) + 2,
          y: Math.floor(index / 2) * Math.floor(material.height / 2) + 2,
          width: Math.floor(material.width / 2) - 4,
          height: Math.floor(material.height / 2) - 4,
        };
        // Standard's fourth quadrant is the navigation material; use the sheet crop for the header.
        if (id === 'standard' && index === 3) {
          crop.x = Math.floor(material.width / 2) + 2;
          crop.y = 2;
        }
        await pipeline.encode('materials.png', name, crop, 'scale=256:256:flags=lanczos');
      }
      await pipeline.encodeSvg(
        uiSvg(64, 2, `<path fill="${config.rule}" fill-opacity=".35" d="M0 0h64v2H0Z"/>`),
        'rule-content',
        'native constant-thickness tonal rule in prepare-theme-details.mjs',
      );
      await pipeline.encodeSvg(
        uiSvg(
          20,
          128,
          `<defs><linearGradient id="depth"><stop stop-color="#07180f" stop-opacity=".35"/><stop offset="1" stop-color="#07180f" stop-opacity="0"/></linearGradient></defs><path fill="url(#depth)" d="M0 0h20v128H0Z"/><path stroke="${config.rule}" stroke-opacity=".5" d="M.5 0v128"/>`,
        ),
        'sticky-column-shadow',
        'native alpha-fade resource in prepare-theme-details.mjs',
      );
    }
    const packPath = resolve(root, `apps/web/public/presentation/themes/${id}.json`);
    const pack = JSON.parse(await readFile(packPath));
    for (const record of pipeline.assets) {
      const input = await readFile(resolve(root, sourceDirectory, 'sources', record.source)).catch(
        () => readFile(fileURLToPath(import.meta.url)),
      );
      const dimensions = JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'stream=width,height',
          '-of',
          'json',
          resolve(output, record.file),
        ]),
      ).streams[0];
      const { role, mode } = roleFor.get(record.file.replace(/\.(webp|png)$/, ''));
      const metadata = {
        resource: `../../art/${id}/details-v1/${record.file}`,
        ...dimensions,
        mode,
        ...(mode === 'nine-slice' ? { slice: pixel ? 16 : UI_ART_ENCODING.frameSlice } : {}),
      };
      pack.images.ui[role] = metadata;
      Object.assign(record, dimensions, {
        role,
        mode,
        ...(metadata.slice ? { slice: metadata.slice } : {}),
        ...(!pixel
          ? {
              optimization: {
                policy: 'compact-ui-and-responsive-scenes-v1',
                inputBytes: input.length,
                inputSha256: hash(input),
                ...dimensions,
                quality: UI_ART_ENCODING.quality,
              },
            }
          : {}),
      });
    }
    // Analysis shares the sheet material intentionally, with its own semantic role.
    pack.images.ui['image-art-analysis-paper'] = { ...pack.images.ui['image-art-paper-quiet'] };
    Object.assign(pack.tokens.ui, detailTokens(id, config));
    // Content aliases in older packs referenced the original tiles directly.
    pack.tokens.ui['image-canvas-material'] = 'var(--image-art-paper)';
    pack.tokens.ui['image-quiet-material'] = 'var(--image-art-paper-quiet)';
    const originalHashes = pixel
      ? { 'source.mjs': hash(await readFile(resolve(root, sourceDirectory, 'source.mjs'))) }
      : Object.fromEntries(
          await Promise.all(
            ['components.png', 'materials.png'].map(async (file) => [
              file,
              hash(await readFile(resolve(root, sourceDirectory, 'sources', file))),
            ]),
          ),
        );
    await json(resolve(output, 'generation.json'), {
      method: pixel
        ? 'Native integer-grid SVG detail sources; shared lossless PNG encoding'
        : 'Built-in image_gen atlases; shared isolated silhouette extraction and compact WebP encoding',
      date: '2026-10-29',
      sources: pixel ? sourceDirectory : `${sourceDirectory}/sources`,
      sourceHashes: originalHashes,
      ...(!pixel ? { prompts: `${sourceDirectory}/prompts.json` } : {}),
      geometry: pixel
        ? '128px stepped frames with 16px caps; 32px material and glyph grid. No interpolation.'
        : '192px nine-slice frames with 22px caps and authored centre fill; 64px glyphs, 256px repeating materials. Transparent exteriors retained.',
      assets: pipeline.assets,
    });
    await json(packPath, pack);
    console.log(
      `${id}: ${pipeline.assets.length} resources (${pipeline.assets.reduce((sum, asset) => sum + asset.bytes, 0)} bytes) prepared and registered`,
    );
  } finally {
    await pipeline.close();
  }
}
