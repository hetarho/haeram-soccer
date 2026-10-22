import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Standard uses official Lucide geometry; pixel resources never pass through this generator.
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const source = dirname(require.resolve('lucide-static/package.json'));
const themePath = resolve(root, 'apps/web/public/presentation/themes/standard.json');
const licensePath = resolve(root, 'apps/web/public/presentation/themes/Lucide-LICENSE.txt');
const theme = JSON.parse(await readFile(themePath, 'utf8'));
const nodes = JSON.parse(await readFile(resolve(source, 'icon-nodes.json'), 'utf8'));
const license = await readFile(resolve(source, 'LICENSE'), 'utf8');

const roles = {
  home: 'house',
  ball: 'volleyball',
  table: 'table-2',
  cup: 'trophy',
  people: 'users',
  training: 'dumbbell',
  trend: 'building',
  history: 'rotate-ccw-clock',
  menu: 'menu',
  more: 'ellipsis',
  switch: 'arrow-right-left',
  bell: 'bell',
  news: 'newspaper',
  eye: 'eye',
  play: 'play',
  pause: 'pause',
  replay: 'rotate-ccw',
  close: 'x',
  chevronDown: 'chevron-down',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  check: 'check',
  filter: 'sliders-horizontal',
  star: 'star',
  liddedCup: 'award',
  continentalCup: 'globe',
  medal: 'medal',
  promotion: 'arrow-up',
  relegation: 'arrow-down',
  'trophy.league': 'trophy',
  'trophy.cup': 'award',
  'trophy.continental': 'globe',
  'trophy.final': 'medal',
  'trophy.promotion': 'arrow-up',
  'trophy.relegation': 'arrow-down',
  'trophy.best': 'star',
};

/** Exact primitive conversion for the pinned upstream nodes; path geometry stays untouched. */
function pathOf([tag, attributes]) {
  if (tag === 'path') return attributes.d;
  const value = (key) => Number(attributes[key] ?? 0);
  if (tag === 'circle') {
    const cx = value('cx'),
      cy = value('cy'),
      r = value('r');
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  if (tag === 'rect') {
    const x = value('x'),
      y = value('y'),
      width = value('width'),
      height = value('height');
    const rx = Math.min(value('rx'), width / 2);
    const ry = Math.min(attributes.ry === undefined ? rx : value('ry'), height / 2);
    if (!rx || !ry) return `M${x} ${y}h${width}v${height}h${-width}Z`;
    return `M${x + rx} ${y}h${width - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${height - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${2 * rx - width}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${2 * ry - height}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
  }
  throw new Error(`Unsupported upstream primitive ${tag}; preserve its geometry before adding it.`);
}

function icon(name, stroke = 'currentColor') {
  if (!nodes[name]) throw new Error(`Unknown Lucide icon ${name}`);
  return {
    type: 'svg',
    viewBox: '0 0 24 24',
    shapeRendering: 'geometricPrecision',
    layers: nodes[name].map((node) => ({
      d: pathOf(node),
      fill: 'none',
      stroke,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })),
  };
}

theme.icons = Object.fromEntries(
  Object.entries(roles).map(([role, name]) => [
    role,
    role.startsWith('trophy.')
      ? {
          default: icon(
            name,
            ['trophy.league', 'trophy.best'].includes(role) ? '#e1c583' : undefined,
          ),
          variants: { unearned: icon(name) },
        }
      : { default: icon(name) },
  ]),
);
const generated = JSON.stringify(theme, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(themePath, 'utf8')) !== generated)
    throw new Error('Standard theme icons differ from the pinned Lucide source; regenerate them.');
  if ((await readFile(licensePath, 'utf8')) !== license)
    throw new Error('The shipped Lucide license differs from its upstream source.');
} else {
  await writeFile(themePath, generated);
  await writeFile(licensePath, license);
}
console.log(`Standard icons: ${Object.keys(theme.icons).length} official Lucide semantic roles.`);
