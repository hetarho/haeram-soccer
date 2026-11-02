import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { staffRolePalette, staffRoleSkin } from './source.mjs';

const publicRoot = new URL('../../public/', import.meta.url);
const output = new URL('art/shared/staff-role-badges-v1/', publicRoot);
const registry = JSON.parse(
  await readFile(new URL('presentation/themes/index.json', publicRoot), 'utf8'),
);
const json = async (path, value) =>
  writeFile(path, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));
const geometry = { width: 96, height: 40, mode: 'nine-slice', slice: 8 };
await mkdir(output, { recursive: true });
const assets = [];
for (const [post, palette] of Object.entries(staffRolePalette)) {
  const file = `frame-${post}.svg`;
  const svg = staffRoleSkin(palette);
  await writeFile(new URL(file, output), svg);
  assets.push({
    file,
    source: `source.mjs#${post}`,
    role: `image-art-staff-role-${post}`,
    ...geometry,
    ...palette,
    bytes: Buffer.byteLength(svg),
    sha256: createHash('sha256').update(svg).digest('hex'),
  });
}
await json(new URL('generation.json', output), {
  method: 'Native SVG artwork; deterministic source.mjs palette and clipped double-keyline skins',
  sources: 'apps/web/design/staff-role-badges/source.mjs',
  geometry:
    'Blank colour plates with transparent clipped corners; all job labels remain live text.',
  assets,
});
for (const entry of registry.entries) {
  const path = new URL(`presentation/themes/${entry.resource}`, publicRoot);
  const pack = JSON.parse(await readFile(path, 'utf8'));
  for (const [post, palette] of Object.entries(staffRolePalette)) {
    pack.images.ui[`image-art-staff-role-${post}`] = {
      resource: `../../art/shared/staff-role-badges-v1/frame-${post}.svg`,
      ...geometry,
    };
    pack.tokens.ui[`staff-role-${post}-fill`] = palette.fill;
    pack.tokens.ui[`staff-role-${post}-text`] = palette.ink;
  }
  await json(path, pack);
}
console.log(`Prepared ${assets.length} staff role resources in ${fileURLToPath(output)}`);
