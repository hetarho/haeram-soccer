import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

export const UI_PICTOGRAMS = [
  'home',
  'league',
  'cup',
  'history',
  'people',
  'training',
  'office',
  'boot',
  'supporters',
  'manager',
  'shirt',
  'bell',
  'menu',
  'switch',
  'play',
  'heart',
];

export function uiSvg(width, height, content, pixel = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${pixel ? ' shape-rendering="crispEdges"' : ''}>${content}</svg>`;
}

/** Raster UI glyphs retain the existing pack's exact native paths and optical weight. */
export function uiIconSvg(icon, color = '#ffffff') {
  const attributes = (layer) =>
    Object.entries(layer)
      .map(
        ([key, value]) =>
          `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${value}"`,
      )
      .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="${icon.viewBox}" shape-rendering="${icon.shapeRendering}" color="${color}">${icon.layers.map((layer) => `<path ${attributes(layer)}/>`).join('')}</svg>`;
}

export async function verifyUiAssets(output) {
  const manifest = JSON.parse(await readFile(resolve(output, 'generation.json'), 'utf8'));
  for (const asset of manifest.assets) {
    const hash = createHash('sha256')
      .update(await readFile(resolve(output, asset.file)))
      .digest('hex');
    if (hash !== asset.sha256) throw new Error(`Changed UI asset: ${asset.file}`);
  }
  return manifest.assets.length;
}

/** Shared deterministic atlas slicing and encoding; generated source art stays unchanged. */
export async function createUiArtPipeline({ sources, output }) {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const assets = [];
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  const rasterize = async (data, format = 'webp') =>
    Buffer.from(
      await page.evaluate(
        async ({ data, format }) => {
          const image = new Image();
          image.src = data;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          return canvas.toDataURL(`image/${format}`, 0.91).split(',')[1];
        },
        { data, format },
      ),
      'base64',
    );
  const encodeSvg = async (svg, name, source, format = 'webp') => {
    const data = await rasterize(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      format,
    );
    const file = `${name}.${format}`;
    await writeFile(resolve(output, file), data);
    assets.push({ file, source, bytes: data.length, sha256: hash(data) });
  };
  const decode = (file) => {
    const source = resolve(sources, file);
    const { width, height } = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        source,
      ]),
    ).streams[0];
    const pixels = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', source, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return { file, width, height, pixels };
  };
  const bounds = (sheet, col, row, cols, rows, threshold = 160) => {
    const left = Math.floor((col * sheet.width) / cols);
    const right = Math.floor(((col + 1) * sheet.width) / cols);
    const top = Math.floor((row * sheet.height) / rows);
    const bottom = Math.floor(((row + 1) * sheet.height) / rows);
    let x0 = right,
      x1 = left,
      y0 = bottom,
      y1 = top;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        if (sheet.pixels[(y * sheet.width + x) * 4 + 3] >= threshold) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (x1 < x0 || y1 < y0) throw new Error(`Empty atlas cell: ${sheet.file}/${col}/${row}`);
    const x = Math.max(left, x0 - 2),
      y = Math.max(top, y0 - 2);
    return { x, y, width: Math.min(right, x1 + 3) - x, height: Math.min(bottom, y1 + 3) - y };
  };
  const encode = async (source, name, crop, filter = '') => {
    const input = resolve(sources, source);
    const filters = [
      crop && `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1`,
      filter,
    ]
      .filter(Boolean)
      .join(',');
    const file = `${name}.webp`;
    const png = execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        input,
        ...(filters ? ['-vf', filters] : []),
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-threads',
        '1',
        '-f',
        'image2pipe',
        '-',
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const data = await rasterize(`data:image/png;base64,${png.toString('base64')}`);
    await writeFile(resolve(output, file), data);
    assets.push({ file, source, crop, filter, bytes: data.length, sha256: hash(data) });
  };

  return { assets, decode, bounds, encode, encodeSvg, close: () => browser.close() };
}

/** Find complete sticker silhouettes even when a generated atlas strays across grid gutters. */
export function isolatedAtlasBounds(sheet, cols, rows, threshold = 160) {
  const { width, height, pixels } = sheet;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const cells = new Map();
  const minimumArea = ((width * height) / (cols * rows)) * 0.015;
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed] || pixels[seed * 4 + 3] < threshold) continue;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    visited[seed] = 1;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width,
        y = Math.floor(index / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const next of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]) {
        if (next < 0 || visited[next] || pixels[next * 4 + 3] < threshold) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail < minimumArea) continue;
    const col = Math.min(cols - 1, Math.floor(((x0 + x1) / 2 / width) * cols));
    const row = Math.min(rows - 1, Math.floor(((y0 + y1) / 2 / height) * rows));
    const key = row * cols + col;
    if (cells.has(key))
      throw new Error(`Multiple silhouettes in atlas cell ${sheet.file}/${col}/${row}`);
    const x = Math.max(0, x0 - 2),
      y = Math.max(0, y0 - 2);
    cells.set(key, {
      x,
      y,
      width: Math.min(width, x1 + 3) - x,
      height: Math.min(height, y1 + 3) - y,
    });
  }
  return Array.from({ length: cols * rows }, (_, index) => {
    if (!cells.has(index))
      throw new Error(`Missing silhouette in atlas cell ${sheet.file}/${index}`);
    return cells.get(index);
  });
}
