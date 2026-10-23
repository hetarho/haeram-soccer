import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = resolve(root, 'apps/web/design/home-print/sources');
const output = resolve(root, 'apps/web/public/art/matchday-print/home');
const manifestPath = resolve(output, 'generation.json');
const hash = (data) => createHash('sha256').update(data).digest('hex');

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const asset of manifest.assets) {
    if (hash(await readFile(resolve(output, asset.file))) !== asset.sha256)
      throw new Error(`Changed home asset: ${asset.file}`);
  }
  console.log(`${manifest.assets.length} print home assets verified`);
} else {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const assets = [];
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
    const encoded = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.91).split(',')[1];
    }, png.toString('base64'));
    const data = Buffer.from(encoded, 'base64');
    await writeFile(resolve(output, file), data);
    assets.push({ file, source, crop, filter, bytes: data.length, sha256: hash(data) });
  };

  const frames = decode('frames.png');
  for (const [index, name] of ['ticket', 'stamp', 'dark', 'tile', 'button', 'selected'].entries())
    await encode(
      frames.file,
      `frame-${name}`,
      bounds(frames, index % 3, Math.floor(index / 3), 3, 2, 220),
      "format=rgba,lut=a='if(lt(val,96),0,val)'",
    );

  const icons = decode('icons.png');
  const names = [
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
  for (const [index, name] of names.entries())
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
        method: 'Built-in image_gen; deterministic ffmpeg atlas slicing and Chromium WebP encoding',
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
  await browser.close();
}
