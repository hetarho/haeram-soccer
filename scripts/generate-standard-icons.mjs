import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Original smooth icon source for the standard theme; never replaces painted facility art.
const root = fileURLToPath(new URL('../', import.meta.url));
const themePath = resolve(root, 'apps/web/public/presentation/themes/standard.json');
const theme = JSON.parse(await readFile(themePath, 'utf8'));
const f = (value) => +value.toFixed(3);

function capsule(x, y, endX, endY, radius = 1) {
  const length = Math.hypot(endX - x, endY - y);
  const dx = (-(endY - y) / length) * radius;
  const dy = ((endX - x) / length) * radius;
  return `M${f(x + dx)} ${f(y + dy)}L${f(endX + dx)} ${f(endY + dy)}A${radius} ${radius} 0 0 1 ${f(endX - dx)} ${f(endY - dy)}L${f(x - dx)} ${f(y - dy)}A${radius} ${radius} 0 0 1 ${f(x + dx)} ${f(y + dy)}Z`;
}
const circle = (x, y, r) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const roundRect = (x, y, w, h, r = 1.5) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
const chevron = (left, top, midX, midY, endX, endY) =>
  capsule(left, top, midX, midY) + capsule(midX, midY, endX, endY);
const cup =
  'M7 3Q7 2 8 2H16Q17 2 17 3V8Q17 13 13 14V18H16Q17 18 17 19V21H7V19Q7 18 8 18H11V14Q7 13 7 8Z' +
  roundRect(3, 4, 5, 7, 2) +
  roundRect(4.7, 5.7, 2, 3.6, 0.7) +
  roundRect(16, 4, 5, 7, 2) +
  roundRect(17.3, 5.7, 2, 3.6, 0.7);
const star =
  'M12 2.8Q12.5 2.8 12.8 3.5L15.1 8.2L20.3 9Q21.8 9.2 20.7 10.3L16.9 14L17.8 19.2Q18 20.7 16.6 20L12 17.5L7.4 20Q6 20.7 6.2 19.2L7.1 14L3.3 10.3Q2.2 9.2 3.7 9L8.9 8.2L11.2 3.5Q11.5 2.8 12 2.8Z';
const arrow = (down = false) =>
  down
    ? capsule(12, 4, 12, 18, 1.4) + chevron(6, 13, 12, 19, 18, 13)
    : capsule(12, 20, 12, 6, 1.4) + chevron(6, 11, 12, 5, 18, 11);
const medal = circle(12, 15, 6) + circle(12, 15, 3.8) + 'M5 2H9L12 8L9 9ZM15 2H19L15 9L12 8Z';
const iconPaths = {
  home: 'M3 10L10.5 3.5Q12 2.2 13.5 3.5L21 10Q22 11 21 12L20 12V20Q20 21 19 21H14V14H10V21H5Q4 21 4 20V12H3Q2 11 3 10Z',
  ball:
    circle(12, 12, 9.5) +
    circle(12, 12, 7.7) +
    'M12 7L16.7 10.4L14.9 15.8H9.1L7.3 10.4Z' +
    capsule(4, 8, 8, 10, 0.8) +
    capsule(16, 10, 20, 8, 0.8) +
    capsule(12, 16, 12, 21, 0.8),
  table:
    roundRect(3, 3, 18, 18, 2) +
    roundRect(5, 5, 14, 14, 0.5) +
    capsule(7, 8, 8, 8, 1) +
    capsule(11, 8, 17, 8, 0.8) +
    capsule(7, 12, 8, 12, 1) +
    capsule(11, 12, 17, 12, 0.8) +
    capsule(7, 16, 8, 16, 1) +
    capsule(11, 16, 17, 16, 0.8),
  cup,
  people:
    circle(9, 7, 3.5) +
    'M2 20V18Q2 12 9 12Q16 12 16 18V20Z' +
    'M16 4Q21 4 21 8Q21 11 17 11Q19 7 16 4ZM17 13Q22 14 22 19V20H18V18Q18 15 17 13Z',
  training:
    roundRect(2, 7, 3, 10, 1) +
    roundRect(6, 4, 3, 16, 1) +
    roundRect(9, 10.5, 6, 3, 0.5) +
    roundRect(15, 4, 3, 16, 1) +
    roundRect(19, 7, 3, 10, 1),
  trend:
    chevron(3, 18, 9, 12, 13, 15) + capsule(13, 15, 20, 6, 1.2) + chevron(14, 6, 20, 6, 20, 12),
  history:
    circle(12, 12, 9) +
    circle(12, 12, 7.1) +
    capsule(12, 7, 12, 12) +
    capsule(12, 12, 16, 14) +
    chevron(3, 3, 3, 8, 8, 8),
  menu:
    capsule(4, 5.5, 20, 5.5, 1.1) + capsule(4, 12, 20, 12, 1.1) + capsule(4, 18.5, 20, 18.5, 1.1),
  bell: 'M11 2H13V4Q19 5 19 11V15L21 18H3L5 15V11Q5 5 11 4ZM9 20H15Q15 23 12 23Q9 23 9 20Z',
  news:
    roundRect(3, 3, 15, 18, 2) +
    roundRect(5, 5, 11, 14, 0.6) +
    roundRect(6, 6, 4, 5, 0.5) +
    capsule(12, 7, 14, 7, 0.7) +
    capsule(12, 10, 14, 10, 0.7) +
    capsule(7, 14, 14, 14, 0.7) +
    capsule(7, 17, 14, 17, 0.7) +
    'M19 7H21V19Q21 21 19 21Z',
  eye:
    'M2 12Q6 5 12 5Q18 5 22 12Q18 19 12 19Q6 19 2 12ZM4.5 12Q7.5 17 12 17Q16.5 17 19.5 12Q16.5 7 12 7Q7.5 7 4.5 12Z' +
    circle(12, 12, 3),
  close: capsule(5.5, 5.5, 18.5, 18.5, 1.15) + capsule(18.5, 5.5, 5.5, 18.5, 1.15),
  chevronDown: chevron(5, 9, 12, 16, 19, 9),
  chevronRight: chevron(9, 5, 16, 12, 9, 19),
  chevronLeft: chevron(15, 5, 8, 12, 15, 19),
  check: chevron(4, 12, 9, 17, 20, 6),
  filter: capsule(3, 6, 21, 6, 1.15) + capsule(6, 12, 18, 12, 1.15) + capsule(9, 18, 15, 18, 1.15),
  star,
  liddedCup: cup + roundRect(6, 0.5, 12, 1.5, 0.7),
  continentalCup:
    'M8 3H16L15 13Q15 16 13 17V20H17V22H7V20H11V17Q9 16 9 13Z' +
    'M3 2H7V4H5V8Q5 12 9 12V14Q3 14 3 8ZM17 2H21V8Q21 14 15 14V12Q19 12 19 8V4H17Z',
  medal,
  promotion: arrow(),
  relegation: arrow(true),
};
const icon = (d, fill = 'currentColor', fillRule = 'nonzero') => ({
  type: 'svg',
  viewBox: '0 0 24 24',
  shapeRendering: 'geometricPrecision',
  layers: [{ d, fill, fillRule }],
});
const cutoutIcons = new Set([
  'ball',
  'table',
  'cup',
  'history',
  'news',
  'eye',
  'liddedCup',
  'medal',
]);
theme.icons = Object.fromEntries(
  Object.entries(iconPaths).map(([role, d]) => [
    role,
    {
      default: icon(d, 'currentColor', cutoutIcons.has(role) ? 'evenodd' : 'nonzero'),
    },
  ]),
);
for (const [role, path] of Object.entries({
  league: cup,
  cup,
  continental: iconPaths.continentalCup,
  final: medal,
  promotion: arrow(),
  relegation: arrow(true),
  best: star,
})) {
  theme.icons[`trophy.${role}`] = {
    default: icon(
      path,
      role === 'league' || role === 'best' ? '#e1c583' : 'currentColor',
      ['league', 'cup', 'final'].includes(role) ? 'evenodd' : 'nonzero',
    ),
    variants: {
      unearned: icon(
        path,
        'currentColor',
        ['league', 'cup', 'final'].includes(role) ? 'evenodd' : 'nonzero',
      ),
    },
  };
}

await writeFile(themePath, JSON.stringify(theme, null, 2) + '\n');
console.log(`Standard icons: ${Object.keys(theme.icons).length} smooth semantic roles.`);
