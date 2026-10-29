import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  createUiArtPipeline,
  isolatedAtlasBounds,
  UI_PICTOGRAMS,
  uiSvg,
  verifyUiAssets,
} from './ui-art-resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = 'apps/web/design/page-refresh-v1';
const sources = resolve(root, sourceDirectory, 'sources');
const ratingsOnly = process.argv.includes('--ratings-only');
const tiers = {
  bronze: ['#bc7952', '#29180d'],
  silver: ['#dce3e8', '#20333e'],
  gold: ['#edc448', '#3d2a0b'],
  platinum: ['#b9edf2', '#15373c'],
  ruby: ['#c83255', '#ffffff'],
};
const json = async (path, value) =>
  writeFile(path, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));
const dimensions = (path) =>
  JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      path,
    ]),
  ).streams[0];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const id of ['matchday-print', 'standard', 'sticker-club', 'pixel']) {
  const output = resolve(root, `apps/web/public/art/${id}/page-refresh-v1`);
  if (process.argv.includes('--check')) {
    console.log(`${id}: ${await verifyUiAssets(output)} page-refresh resources verified`);
    continue;
  }
  const packPath = resolve(root, `apps/web/public/presentation/themes/${id}.json`);
  const pack = JSON.parse(await readFile(packPath, 'utf8'));
  const pipeline = await createUiArtPipeline({ sources, output });
  const usedSources = new Set();
  const pixel = id === 'pixel';
  const clay = id === 'sticker-club';
  async function register(name, role, mode = 'image', slice = clay ? 36 : 22) {
    const asset = pipeline.assets.findLast((item) => item.file.split('.')[0] === name);
    const size = dimensions(resolve(output, asset.file));
    Object.assign(asset, size, { role, mode, ...(mode === 'nine-slice' ? { slice } : {}) });
    pack.images.ui[role] = {
      resource: `../../art/${id}/page-refresh-v1/${asset.file}`,
      ...size,
      mode,
      ...(mode === 'nine-slice' ? { slice } : {}),
    };
  }
  async function crop(sheet, index, cols, rows, name, role, mode = 'image', bounds) {
    usedSources.add(sheet.file);
    await pipeline.encode(
      sheet.file,
      name,
      bounds?.[index] ?? pipeline.bounds(sheet, index % cols, Math.floor(index / cols), cols, rows),
    );
    await register(name, role, mode);
  }
  try {
    const ratings = !pixel && !clay ? pipeline.decode('rating-frames.png') : undefined;
    const components = clay ? pipeline.decode('sticker-components.png') : undefined;
    const clayBounds = components ? isolatedAtlasBounds(components, 4, 4, 220) : undefined;
    for (const [index, [tier, [fill, ink]]] of Object.entries(tiers).entries()) {
      const role = `image-art-rating-${tier}`;
      const name = `frame-rating-${tier}`;
      if (pixel) {
        const edge = tier === 'ruby' ? '#75233f' : '#4b5142';
        await pipeline.encodeSvg(
          uiSvg(
            64,
            64,
            `<path d="M4 0h56v4h4v56h-4v4H4v-4H0V4h4Z" fill="${edge}"/><path d="M4 4h56v56H4Z" fill="${fill}"/><path d="M8 8h48v4H8Zm0 4h4v40H8Z" fill="#fff7db" opacity=".65"/><path d="M12 52h44v4H12Z" fill="${edge}" opacity=".35"/>`,
            true,
          ),
          name,
          'scripts/prepare-page-refresh.mjs#pixel-rating',
          'png',
        );
        await register(name, role, 'nine-slice', 12);
      } else if (clay && tier !== 'ruby') {
        await crop(components, 12 + index, 4, 4, name, role, 'nine-slice', clayBounds);
      } else if (clay) {
        const ruby = pipeline.decode('sticker-ruby.png');
        await crop(ruby, 0, 1, 1, name, role, 'nine-slice');
      } else {
        await crop(ratings, index, 3, 2, name, role, 'nine-slice');
      }
      Object.assign(pack.tokens.ui, {
        [`rating-${tier}-frame`]: `var(--${role})`,
        [`rating-${tier}-slice`]: `var(--${role}-slice)`,
        [`rating-${tier}-fill`]: fill,
        [`rating-${tier}-text`]: ink,
      });
    }
    if (!ratingsOnly && id === 'standard') {
      const icons = pipeline.decode('stadium-icons.png');
      const bounds = isolatedAtlasBounds(icons, 4, 4, 160);
      for (const [index, name] of UI_PICTOGRAMS.entries())
        await crop(icons, index, 4, 4, `icon-${name}`, `image-art-icon-${name}`, 'image', bounds);
      const additional = [
        'eye',
        'news',
        'ball',
        'pause',
        'replay',
        'close',
        'chevronDown',
        'chevronRight',
        'chevronLeft',
        'check',
        'filter',
        'star',
        'liddedCup',
        'continentalCup',
        'medal',
        'trend',
      ];
      const details = pipeline.decode('stadium-details.png');
      const detailBounds = isolatedAtlasBounds(details, 4, 4, 160);
      for (const [index, name] of additional.entries())
        await crop(
          details,
          index,
          4,
          4,
          `icon-${name}`,
          `image-art-icon-${name}`,
          'image',
          detailBounds,
        );
      const roles = { table: 'league', more: 'menu', promotion: 'trend', relegation: 'switch' };
      for (const name of Object.keys(pack.icons).filter((role) => !role.startsWith('trophy.'))) {
        const resource = pack.images.ui[`image-art-icon-${roles[name] ?? name}`];
        if (resource)
          pack.icons[name] = {
            default: {
              type: 'image',
              resource: resource.resource,
              width: resource.width,
              height: resource.height,
            },
          };
      }
      usedSources.add('stadium-grass.png');
      await pipeline.encode('stadium-grass.png', 'quiet', undefined, 'scale=256:256');
      await register('quiet', 'image-art-controller-grass', 'tile');
      pack.tokens.ui['image-transport-material'] = 'var(--image-art-controller-grass)';
      pack.tokens.ui['transport-material-blend'] = 'soft-light';
    }
    if (!ratingsOnly && clay) {
      const controlRoles = [
        ['frame-primary', 'image-art-frame-stamp'],
        ['frame-secondary', 'image-art-control-secondary'],
        ['frame-tertiary', 'image-art-control-tertiary'],
        ['frame-input', 'image-art-control-input'],
        ['frame-dark', 'image-art-frame-dark'],
        ['frame-selected', 'image-art-frame-selected'],
        ['frame-disabled', 'image-art-control-disabled'],
        ['frame-popup', 'image-art-control-dropdown'],
        ['icon-checkbox-off', 'image-art-control-checkbox-off'],
        ['icon-checkbox-on', 'image-art-control-checkbox-on'],
        ['icon-formation-marker', 'image-art-formation-marker'],
        ['rule-tab-active', 'image-art-tab-active'],
      ];
      for (const [index, [name, role]] of controlRoles.entries())
        await crop(
          components,
          index,
          4,
          4,
          name,
          role,
          index < 8 ? 'nine-slice' : 'image',
          clayBounds,
        );
      pack.images.ui['image-art-frame-ticket'] = {
        ...pack.images.ui['image-art-control-tertiary'],
      };
      pack.images.ui['image-art-frame-button'] = {
        ...pack.images.ui['image-art-control-tertiary'],
      };
      pack.images.ui['image-art-frame-tile'] = { ...pack.images.ui['image-art-control-tertiary'] };
      const materials = pipeline.decode('sticker-materials.png');
      for (const [index, [name, role]] of [
        ['canvas', 'image-art-paper'],
        ['quiet', 'image-art-paper-quiet'],
        ['ivory', 'image-art-paper-detail'],
        ['primary', 'image-art-vermilion'],
      ].entries()) {
        const cell = {
          x: Math.floor(((index % 2) * materials.width) / 2) + 8,
          y: Math.floor((Math.floor(index / 2) * materials.height) / 2) + 8,
          width: Math.floor(materials.width / 2) - 16,
          height: Math.floor(materials.height / 2) - 16,
        };
        usedSources.add(materials.file);
        await pipeline.encode(materials.file, name, cell, 'scale=256:256');
        await register(name, role, 'tile');
      }
      Object.assign(pack.tokens.ui, {
        'image-primary': '#f4cf59',
        'image-on-primary': '#17382b',
        'image-on-primary-muted': '#344d35',
        'image-accent': '#715100',
        'accent-text': '#715100',
        'chart-primary': '#926300',
        'image-canvas': '#eee5ce',
        'image-quiet': '#f7f1df',
        'image-detail': '#fffbef',
        'image-control-shadow': 'none',
        'image-transport-material': 'var(--image-art-vermilion)',
        'transport-fill': '#f4cf59',
        'transport-text': '#17382b',
        'transport-muted': '#40543a',
        'transport-material-blend': 'normal',
        'image-button-frame': 'var(--image-art-control-tertiary)',
        'button-secondary-frame': 'var(--image-art-control-secondary)',
        'button-tertiary-frame': 'var(--image-art-control-tertiary)',
        'image-table-header-material': 'var(--image-art-paper-quiet)',
        'image-tab-active-rule': 'var(--image-art-tab-active)',
        'pitch-texture': 'var(--image-art-paper-quiet)',
      });
      Object.assign(pack.tokens.palette, {
        accent: '#f4cf59',
        'on-accent': '#17382b',
        'accent-text': '#715100',
      });
      pack.images.ui['image-art-table-heading'] = { ...pack.images.ui['image-art-paper-quiet'] };
      const dark = clayBounds[4];
      await pipeline.encode(
        components.file,
        'dark',
        {
          x: dark.x + Math.floor(dark.width / 3),
          y: dark.y + Math.floor(dark.height / 3),
          width: Math.floor(dark.width / 3),
          height: Math.floor(dark.height / 3),
        },
        'scale=256:256',
      );
      await register('dark', 'image-art-ink', 'tile');
    }
    if (!ratingsOnly && pixel) {
      await pipeline.encodeSvg(
        uiSvg(
          32,
          32,
          '<path fill="#c1cbb2" d="M0 0h32v32H0Z"/><path fill="#a6b996" d="M4 6h4v2H4Zm18 12h4v2h-4ZM10 26h4v2h-4Z"/><path fill="#d9e2c8" d="M14 10h2v2h-2Zm12 18h2v2h-2Z"/>',
          true,
        ),
        'controller-pixels',
        'scripts/prepare-page-refresh.mjs#pixel-controller',
        'png',
      );
      await register('controller-pixels', 'image-art-controller-pixels', 'tile');
      Object.assign(pack.tokens.ui, {
        'image-transport-material': 'var(--image-art-controller-pixels)',
        'transport-material-size': '64px',
        'transport-material-blend': 'normal',
      });
    }
    const sourceHashes = Object.fromEntries(
      await Promise.all(
        [...usedSources].map(async (file) => [file, hash(await readFile(resolve(sources, file)))]),
      ),
    );
    await json(resolve(output, 'generation.json'), {
      method: pixel
        ? 'Native integer-grid SVG through the shared lossless PNG pipeline'
        : 'Built-in image_gen originals through the shared deterministic crop/WebP pipeline',
      date: '2026-10-30',
      sources: `${sourceDirectory}/sources`,
      prompts: `${sourceDirectory}/prompts.json`,
      sourceHashes,
      geometry:
        'Filled nine-slice frames with fixed source-pixel caps; independent material tiles and live text.',
      assets: pipeline.assets,
    });
    await json(packPath, pack);
    console.log(`${id}: ${pipeline.assets.length} refreshed resources registered`);
  } finally {
    await pipeline.close();
  }
}
