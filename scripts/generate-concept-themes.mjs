import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const circle = (x, y, r) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const part = (d, colour = 'ink', fill = true) => ({ d, colour, fill });

// Original pictogram geometry, deliberately independent of Lucide and pixel resources.
const glyphs = {
  home: [
    part('M4 15L16 4 28 15 25 18 16 10 7 18Z', 'red'),
    part('M7 15H25V28H7Z', 'paper'),
    part(rect(13, 20, 6, 8), 'blue'),
  ],
  ball: [
    part(circle(16, 16, 12), 'paper'),
    part('M16 9L22 13 20 20H12L10 13Z'),
    part('M4 15L10 13M22 13L28 15M12 20L9 26M20 20L23 26M16 9V4', 'ink', false),
  ],
  table: [
    part(rect(6, 5, 21, 24), 'paper'),
    part(rect(11, 3, 11, 5), 'green'),
    part('M11 13H23M11 19H23M11 25H23M9 11V27', 'ink', false),
  ],
  cup: [
    part('M9 5H23V12C23 22 9 22 9 12ZM13 20H19V25H23V29H9V25H13Z', 'gold'),
    part('M9 8H4V12C4 17 9 17 11 16M23 8H28V12C28 17 23 17 21 16', 'gold', false),
  ],
  people: [
    part(circle(11, 10, 5), 'gold'),
    part(circle(23, 12, 4), 'blue'),
    part('M3 29V24C3 14 19 14 19 24V29Z', 'blue'),
    part('M19 29V24C19 21 18 19 17 18C24 15 30 20 30 25V29Z', 'red'),
  ],
  training: [
    part('M4 11H9V21H4ZM23 11H28V21H23ZM9 14H23V18H9Z', 'blue'),
    part(rect(1, 13, 3, 6), 'ink'),
    part(rect(28, 13, 3, 6), 'ink'),
  ],
  trend: [
    part('M5 29V8L18 3V29ZM18 11H28V29H18Z', 'blue'),
    part('M9 10H13V14H9ZM9 19H13V23H9ZM21 15H25V19H21ZM21 23H25V27H21Z', 'paper'),
  ],
  history: [
    part('M6 4H27V29H6L3 26V7Z', 'red'),
    part(rect(9, 7, 14, 18), 'paper'),
    part('M12 12H20M12 17H20M12 22H18M6 5V28', 'ink', false),
  ],
  menu: [part(rect(4, 6, 24, 4)), part(rect(4, 14, 24, 4)), part(rect(4, 22, 24, 4))],
  more: [part(circle(6, 16, 2.5)), part(circle(16, 16, 2.5)), part(circle(26, 16, 2.5))],
  switch: [
    part('M3 8H22V3L30 11 22 19V14H3Z', 'blue'),
    part('M29 24H10V29L2 21 10 13V18H29Z', 'gold'),
  ],
  bell: [
    part('M6 23L9 18V12C9 3 23 3 23 12V18L26 23Z', 'red'),
    part(circle(16, 27, 3), 'gold'),
    part(rect(14, 2, 4, 4), 'ink'),
  ],
  news: [
    part('M4 5H25V27H4ZM25 11H29V27H25Z', 'paper'),
    part(rect(8, 9, 13, 5), 'red'),
    part('M8 19H21M8 23H21', 'ink', false),
  ],
  eye: [
    part('M2 16Q16 0 30 16Q16 32 2 16Z', 'paper'),
    part(circle(16, 16, 6), 'blue'),
    part(circle(16, 16, 2)),
  ],
  play: [part('M10 4L29 16 10 28Z', 'green')],
  pause: [part(rect(7, 5, 6, 22), 'red'), part(rect(20, 5, 6, 22), 'red')],
  replay: [
    part('M24 9C17 0 3 8 5 19C7 29 22 31 27 21', 'blue', false),
    part('M24 2V13H14Z', 'blue'),
  ],
  close: [part('M7 3L16 12 25 3 29 7 20 16 29 25 25 29 16 20 7 29 3 25 12 16 3 7Z', 'red')],
  chevronDown: [part('M5 9L16 20 27 9 30 12 16 27 2 12Z')],
  chevronRight: [part('M9 3L25 16 9 29 5 25 16 16 5 7Z')],
  chevronLeft: [part('M23 3L7 16 23 29 27 25 16 16 27 7Z')],
  check: [part('M3 16L12 25 30 7 26 3 12 17 7 12Z', 'green')],
  filter: [
    part('M4 9H28M4 23H28', 'ink', false),
    part(rect(9, 5, 5, 8), 'blue'),
    part(rect(20, 19, 5, 8), 'gold'),
  ],
  star: [part('M16 2L20 11 30 12 23 20 25 30 16 25 7 30 9 20 2 12 12 11Z', 'gold')],
  liddedCup: [
    part('M9 9H23V15Q23 23 16 23Q9 23 9 15ZM14 23H18V27H24V30H8V27H14Z', 'gold'),
    part('M7 8Q16 0 25 8ZM14 2H18V5H14Z', 'gold'),
    part('M9 11H4V15Q4 20 10 20M23 11H28V15Q28 20 22 20', 'gold', false),
  ],
  continentalCup: [
    part(circle(16, 14, 11), 'blue'),
    part('M5 14H27M16 3C7 10 7 18 16 25C25 18 25 10 16 3M7 8H25M7 20H25', 'paper', false),
    part('M13 25H19V28H24V31H8V28H13Z', 'gold'),
  ],
  medal: [
    part('M5 2H13L19 15 12 20ZM19 2H27L20 20 13 15Z', 'red'),
    part(circle(16, 22, 9), 'gold'),
    part(circle(16, 22, 4), 'paper'),
  ],
  promotion: [part('M16 2L30 16H22V26H10V16H2Z', 'green'), part(rect(7, 29, 18, 2), 'gold')],
  relegation: [part('M10 3H22V14H30L16 28 2 14H10Z', 'red'), part(rect(7, 29, 18, 2), 'ink')],
};
const trophies = {
  'trophy.league': 'cup',
  'trophy.cup': 'liddedCup',
  'trophy.continental': 'continentalCup',
  'trophy.final': 'medal',
  'trophy.promotion': 'promotion',
  'trophy.relegation': 'relegation',
  'trophy.best': 'star',
};
const colours = {
  ink: '#172e27',
  paper: '#fff6df',
  red: '#db602f',
  blue: '#4d8eb2',
  green: '#368553',
  gold: '#e9b945',
};

function conceptIcon(name, style, unearned = false) {
  const drawing = glyphs[trophies[name] ?? name];
  if (!drawing) throw new Error(`Missing original pictogram: ${name}`);
  const layers = [];
  if (style === 'sticker-club')
    for (const layer of drawing)
      layers.push({
        d: layer.d,
        fill: layer.fill ? '#fff6df' : 'none',
        stroke: '#fff6df',
        strokeWidth: 5.2,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      });
  for (const layer of drawing) {
    const ink =
      style === 'matchday-print'
        ? trophies[name] && !unearned
          ? '#a63724'
          : 'currentColor'
        : unearned
          ? 'currentColor'
          : colours.ink;
    const fill =
      style === 'matchday-print'
        ? layer.colour === 'paper'
          ? 'var(--icon-paper, #f6eedb)'
          : ink
        : unearned
          ? layer.colour === 'paper'
            ? 'none'
            : ink
          : colours[layer.colour];
    layers.push({
      d: layer.d,
      fill: layer.fill && !(style === 'matchday-print' && unearned) ? fill : 'none',
      stroke: ink,
      strokeWidth: style === 'matchday-print' ? 1.8 : 1.6,
      strokeLinejoin: style === 'matchday-print' ? 'miter' : 'round',
      strokeLinecap: 'round',
    });
  }
  return {
    type: 'svg',
    viewBox: style === 'sticker-club' ? '-2 -2 36 36' : '0 0 32 32',
    shapeRendering: 'geometricPrecision',
    layers,
  };
}

export const CONCEPT_THEMES = {
  'matchday-print': {
    label: '기본 · 매치데이 인쇄',
    style:
      'Bold woodcut / linocut artwork printed in charcoal black and muted vermilion on warm cream newsprint. Flat ink masses, expressive carved hatching, selective coarse halftone and ink wear, crisp believable architecture. Vintage football match programme art, fully redrawn in this medium. No painted gouache, no photography, no gradients, no 3D.',
    palette: {
      bg: '#f1e8d3',
      text: '#262820',
      'text-muted': '#555547',
      'text-faint': '#5c594c',
      accent: '#a63724',
      'accent-fill': '#a63724',
      'accent-edge': '#792719',
      'accent-text': '#96321f',
      'on-accent': '#fff7e7',
      positive: '#2c603c',
      gold: '#795619',
      'gold-fill': '#a63724',
      'gold-edge': '#792719',
      warm: '#795619',
      'warm-soft': '#eadbc0',
      cool: '#315e75',
      'cool-soft': '#dce4df',
      danger: '#9b3026',
      focus: '#91311e',
      'trophy-silver': '#5c5c53',
      'danger-edge': '#9b3026',
      'field-line': '#fff7e7',
    },
    surfaces: {
      'surface-deep': '#e4dac3',
      surface: '#faf3e3',
      'surface-2': '#e9ddc3',
      'surface-3': '#d1c3a5',
      line: '#9c9078',
      'line-strong': '#665f4e',
      paper: 'var(--surface)',
      hud: '#f1e8d3',
      'brand-line': '#b8ac96',
      'nav-active': '#a63724',
      overlay: '#241f18bb',
      'subtle-fill': '#24231d09',
      'warm-tint': '#9b6d1510',
      'table-line': '#81745b55',
      'section-accent-line': '#a63724',
      'warning-line': '#8a672e',
      'critical-line': '#9b3026',
      'running-line': '#a63724',
      'secondary-control-line': '#8c7e64',
      'control-fill': '#faf3e3',
      'nav-surface': '#faf3e3',
      'nav-edge': '#81745b',
      'popover-edge': '#81745b',
      'scene-caption-surface': '#24251fe8',
      'scene-caption-text': '#fff2d8',
      'scene-caption-icon': '#f5d18c',
      'team-state-fill': 'var(--surface)',
      'fixture-control-fill': 'var(--accent-fill)',
      'fixture-control-text': 'var(--on-accent)',
      'fixture-control-edge': 'var(--accent-edge)',
      'inset-fill': 'rgb(38 40 32 / 0.035)',
      'inset-active-fill': 'var(--surface-2)',
      'relegation-text': 'var(--danger)',
      'series-points': 'var(--positive)',
      'series-reference': 'var(--gold)',
    },
    shape: {
      radius: '2px',
      'control-radius': '2px',
      'card-radius': '2px',
      'badge-radius': '1px',
      'scene-radius': '2px',
      'section-radius': '2px 2px 0 0',
      'dialog-radius': '4px',
      'tab-radius': '0 2px 2px 0',
      'control-shadow': '1px 2px 0 #3c34212b',
      'control-weight': '700',
      'nav-radius': '3px',
      'nav-shadow': '0 -2px 0 #665f4e20',
      'feedback-shadow-filter': 'drop-shadow(2px 3px 0 #3c342125)',
      'feedback-edge-shadow': 'inset 0 0 0 1px #665f4e',
      'popover-shadow': '3px 4px 0 #3c342128',
      shadow: '3px 4px 0 #3c342128',
      'control-hover-filter': 'brightness(0.97)',
      'control-active-filter': 'brightness(0.94)',
      'trophy-gold-shadow': 'none',
      'trophy-silver-shadow': 'none',
    },
  },
  'sticker-club': {
    label: '스티커 풋볼클럽',
    style:
      'Premium flat cartoon football illustration with rich grass green, cream, orange brick, bright sky blue and mustard. Confident thick dark ink contours, clean flat colour shapes, stylised rounded foliage, believable football architecture and minimal cel shadows. Completely original cartoon redraw, not painterly or photo-filtered. No gouache, no 3D, no photography, no white sticker border around the whole rectangular image.',
    palette: {
      bg: '#fff3da',
      text: '#17382b',
      'text-muted': '#405d47',
      'text-faint': '#4c614c',
      accent: '#226a46',
      'accent-fill': '#b84620',
      'accent-edge': '#79331d',
      'accent-text': '#245d3d',
      'on-accent': '#fffae9',
      positive: '#28643c',
      gold: '#785518',
      'gold-fill': '#226a46',
      'gold-edge': '#17472f',
      warm: '#805119',
      'warm-soft': '#f4dfb6',
      cool: '#2b6076',
      'cool-soft': '#dae7e5',
      danger: '#a83226',
      focus: '#184f37',
      'trophy-silver': '#52665a',
      'danger-edge': '#a83226',
      'field-line': '#fffae9',
    },
    surfaces: {
      'surface-deep': '#f0e1bd',
      surface: '#fffbef',
      'surface-2': '#e8ecd0',
      'surface-3': '#cfddad',
      line: '#b7b695',
      'line-strong': '#355841',
      paper: 'var(--surface)',
      hud: '#fff3da',
      'brand-line': '#48694a',
      'nav-active': '#226a46',
      overlay: '#17382bbd',
      'subtle-fill': '#214a2c09',
      'warm-tint': '#b9791610',
      'table-line': '#35584133',
      'section-accent-line': 'transparent',
      'warning-line': '#9b7a35',
      'critical-line': '#a83226',
      'running-line': '#226a46',
      'secondary-control-line': '#355841',
      'control-fill': '#fff7e5',
      'nav-surface': '#fffbef',
      'nav-edge': '#355841',
      'popover-edge': '#355841',
      'scene-caption-surface': '#17382bec',
      'scene-caption-text': '#fff7df',
      'scene-caption-icon': '#ffdc7b',
      'team-state-fill': 'var(--surface)',
      'fixture-control-fill': 'var(--accent-fill)',
      'fixture-control-text': 'var(--on-accent)',
      'fixture-control-edge': 'var(--accent-edge)',
      'inset-fill': 'rgb(23 56 43 / 0.035)',
      'inset-active-fill': 'var(--surface-2)',
      'relegation-text': 'var(--danger)',
      'series-points': 'var(--positive)',
      'series-reference': 'var(--gold)',
    },
    shape: {
      radius: '12px',
      'control-radius': '8px',
      'card-radius': '12px',
      'badge-radius': '5px',
      'scene-radius': '12px',
      'section-radius': '12px 12px 0 0',
      'dialog-radius': '16px',
      'tab-radius': '0 8px 8px 0',
      'control-shadow': '1px 2px 0 #17382b2b',
      'control-weight': '700',
      'nav-radius': '18px',
      'nav-shadow': '0 3px 0 #17382b25',
      'feedback-shadow-filter': 'drop-shadow(2px 3px 0 #17382b24)',
      'feedback-edge-shadow': 'inset 0 0 0 1px #355841',
      'popover-shadow': '2px 4px 0 #17382b28',
      shadow: '2px 4px 0 #17382b28',
      'control-hover-filter': 'brightness(0.98)',
      'control-active-filter': 'brightness(0.95)',
      'trophy-gold-shadow': 'none',
      'trophy-silver-shadow': 'none',
    },
  },
};

async function generateConceptThemes({ check = false } = {}) {
  const output = async (name, value) => {
    const path = resolve(root, `apps/web/public/presentation/themes/${name}`);
    const generated = JSON.stringify(value, null, 2) + '\n';
    if (check) {
      if ((await readFile(path, 'utf8')) !== generated)
        throw new Error(`Concept theme resource differs from its generator: ${name}`);
    } else await writeFile(path, generated);
  };
  const standard = JSON.parse(
    await readFile(resolve(root, 'apps/web/public/presentation/themes/standard.json'), 'utf8'),
  );
  for (const [id, config] of Object.entries(CONCEPT_THEMES)) {
    const theme = structuredClone(standard);
    theme.id = id;
    theme.colorScheme = 'light';
    theme.stylesheet = `${id}.css`;
    theme.tokens.palette = config.palette;
    theme.tokens.surfaces = config.surfaces;
    Object.assign(theme.tokens.shape, config.shape);
    theme.tokens.imageTreatment = {
      objectFit: 'cover',
      objectPosition: 'center',
      imageRendering: 'auto',
      filter: 'none',
      overlay: 'transparent',
    };
    theme.icons = Object.fromEntries(
      Object.keys(standard.icons).map((role) => [
        role,
        {
          default: conceptIcon(role, id),
          ...(trophies[role] ? { variants: { unearned: conceptIcon(role, id, true) } } : {}),
        },
      ]),
    );
    theme.images.facility = {
      pattern: `/art/${id}/{era}/{kind}-{stage}.webp`,
      overrides: Object.fromEntries(
        ['heritage', 'terraces', 'contemporary'].flatMap((era) =>
          ['manager', 'staff'].map((kind) => [`${era}.${kind}.0`, `/art/${id}/${kind}.webp`]),
        ),
      ),
    };
    await output(`${id}.json`, theme);
  }
  const registry = JSON.parse(
    await readFile(resolve(root, 'apps/web/public/presentation/themes/index.json'), 'utf8'),
  );
  for (const [id, { label }] of Object.entries(CONCEPT_THEMES)) {
    const entry = { id, label, resource: `${id}.json` };
    const index = registry.entries.findIndex((item) => item.id === id);
    if (index < 0) registry.entries.push(entry);
    else registry.entries[index] = entry;
  }
  await output('index.json', registry);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  await generateConceptThemes({ check });
  console.log(
    `${check ? 'Verified' : 'Generated'} two complete concept packs with 36 original semantic pictograms each.`,
  );
}
