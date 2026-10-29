import { uiIconSvg, uiSvg, UI_PICTOGRAMS } from '../../../../scripts/ui-art-resources.mjs';

// Native pixel source: two source pixels become one CSS pixel at a 16px frame slice / 8px edge.
const frames = {
  panel: ['#191d1e', '#42544b', '#617465'],
  primary: ['#2e713d', '#245a32', '#78ad78'],
  dark: ['#0c0f10', '#35453d', '#4f6255'],
  tile: ['#191d1e', '#344239', '#4c5d50'],
  button: ['#202927', '#465b4d', '#6b816d'],
  selected: ['#2e713d', '#88bc7f', '#bcda9f'],
};
const outline = 'M8 0H120V4H124V8H128V120H124V124H120V128H8V124H4V120H0V8H4V4H8Z';
const inside = 'M10 4H118V8H122V10H124V118H120V122H118V124H10V120H6V118H4V10H8V6H10Z';
const face = 'M12 8H116V12H120V116H116V120H12V116H8V12H12Z';
const glyphs = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
};
const addedGlyphs = {
  boot: 'M3 2h5v7h2v2h4v3H1v-4h2Z M9 7h2v2H9Z',
  supporters: 'M2 1h3v3H2ZM11 1h3v3h-3ZM6 3h4v4H6ZM1 5h4v2H3v7H1ZM11 5h4v9h-2V7h-2ZM5 8h6v7H5Z',
  manager: 'M6 1h4v2h2v4h-2v2H6V7H4V3h2ZM4 10h3l1 3 1-3h3v2h2v4H2v-4h2Z',
  shirt: 'M4 1h3v2h2V1h3v2h2v2h2v4h-4v7H4V9H0V5h2V3h2Z',
  heart: 'M2 2h4v2h4V2h4v2h2v6h-2v2h-2v2h-2v2H6v-2H4v-2H2v-2H0V4h2Z',
};
const roles = { league: 'table', office: 'trend' };
function pixelFrame(fill, edge, light) {
  return uiSvg(
    128,
    128,
    `<path d="${outline}" fill="${edge}"/><path d="${inside}" fill="${light}"/><path d="${face}" fill="${fill}"/>`,
    true,
  );
}

/** Portable detail resources extend the same stepped grid as the original UI. */
export function pixelDetailSources() {
  const sources = [];
  const add = (name, svg) => sources.push({ name, svg, source: `source.mjs#${name}` });
  for (const [name, colors] of Object.entries({
    'frame-secondary': ['#324b36', '#617b56', '#a1cf9b'],
    'frame-tertiary': ['#202927', '#344239', '#526a57'],
    'frame-input': ['#121b16', '#465b4d', '#7a9378'],
    'frame-dropdown': ['#121b16', '#465b4d', '#7a9378'],
    'frame-disabled': ['#29302b', '#3c493f', '#5f6c60'],
    'frame-rating-iron': ['#8fa5b3', '#334e60', '#c1d7dc'],
    'frame-rating-bronze': ['#d7924d', '#6c4125', '#f4ca86'],
    'frame-rating-silver': ['#dbe8e8', '#667f85', '#f1fff5'],
    'frame-rating-gold': ['#f1d58a', '#8e6a2b', '#fff4ba'],
    'frame-rating-elite': ['#b985e0', '#623f87', '#e0c5f8'],
  }))
    add(name, pixelFrame(...colors));
  for (const checked of [false, true])
    add(
      `icon-checkbox-${checked ? 'on' : 'off'}`,
      uiSvg(
        32,
        32,
        `<path d="M4 0h24v4h4v24h-4v4H4v-4H0V4h4Z" fill="#7a9378"/><path d="M4 4h24v24H4Z" fill="${checked ? '#a1cf9b' : '#121b16'}"/>${checked ? '<path d="M6 14h4v4h4v-4h4v-4h4V6h4v8h-4v4h-4v4h-4v4h-4v-4H6Z" fill="#14291b"/>' : ''}`,
        true,
      ),
    );
  for (const [name, fill, grain] of [
    ['canvas', '#111415', '#19201c'],
    ['quiet', '#1c2720', '#29382b'],
    ['ivory', '#2c3c2f', '#384c38'],
    ['table-heading', '#344733', '#3f5440'],
  ])
    add(
      name,
      uiSvg(
        32,
        32,
        `<path fill="${fill}" d="M0 0h32v32H0Z"/><path fill="${grain}" d="M4 8h2v2H4ZM20 4h2v2h-2ZM14 20h2v2h-2ZM26 28h2v2h-2Z"/>`,
        true,
      ),
    );
  add(
    'rule-content',
    uiSvg(64, 2, '<path d="M0 0h64v2H0Z" fill="#596e5c" fill-opacity=".65"/>', true),
  );
  add('rule-tab-active', uiSvg(64, 4, '<path d="M0 0h64v4H0Z" fill="#a1cf9b"/>', true));
  add(
    'icon-formation-marker',
    uiSvg(
      32,
      32,
      '<path d="M10 0h12v2h4v4h4v4h2v12h-2v4h-4v4h-4v2H10v-2H6v-4H2v-4H0V10h2V6h4V2h4Z" fill="#e3edce"/><path d="M10 4h12v2h4v4h2v12h-2v4h-4v2H10v-2H6v-4H4V10h2V6h4Z" fill="#2e713d"/>',
      true,
    ),
  );
  add(
    'sticky-column-shadow',
    uiSvg(
      16,
      32,
      '<path d="M0 0h2v32H0Z" fill="#a1cf9b" fill-opacity=".5"/><path d="M2 0h4v32H2Z" fill="#000" fill-opacity=".35"/><path d="M6 0h4v32H6Z" fill="#000" fill-opacity=".18"/><path d="M10 0h4v32h-4Z" fill="#000" fill-opacity=".08"/>',
      true,
    ),
  );
  return sources;
}

export function pixelUiSources(theme) {
  const sources = [];
  const add = (name, svg) => sources.push({ name, svg, source: `source.mjs#${name}` });
  for (const [name, [fill, edge, light]] of Object.entries(frames))
    add(`frame-${name}`, pixelFrame(fill, edge, light));
  for (const name of UI_PICTOGRAMS) {
    const icon = addedGlyphs[name]
      ? {
          viewBox: '0 0 16 16',
          shapeRendering: 'crispEdges',
          layers: [{ d: addedGlyphs[name], fill: 'currentColor' }],
        }
      : theme.icons[roles[name] || name].default;
    add(`icon-${name}`, uiIconSvg(icon));
  }
  for (const [name, fill, grain] of [
    ['canvas', '#111415', '#151b1a'],
    ['quiet', '#191d1e', '#1f2623'],
    ['dark', '#0c0f10', '#111713'],
    ['primary', '#2e713d', '#347643'],
  ])
    add(
      name,
      uiSvg(
        32,
        32,
        `<path fill="${fill}" d="M0 0h32v32H0Z"/><path fill="${grain}" d="M6 10h2v2H6ZM24 26h2v2h-2Z"/>`,
        true,
      ),
    );
  let wordmark = '';
  for (const [index, letter] of [...'HAERAM'].entries())
    glyphs[letter].forEach((row, y) =>
      [...row].forEach((on, x) => {
        if (on === '1')
          wordmark += `<rect x="${(index * 6 + x) * 12 + 8}" y="${y * 12 + 24}" width="12" height="12" fill="#f3f2e8"/>`;
      }),
    );
  add(
    'masthead',
    uiSvg(
      448,
      144,
      wordmark +
        '<path d="M8 122h128v6H8Z" fill="#79b771"/><path d="M148 122h12v6h-12ZM170 122h12v6h-12Z" fill="#4b6550"/>',
      true,
    ),
  );
  // Low pixel terrace silhouette belongs below the sidebar text, never behind data.
  let terrace =
    '<path d="M0 0h384v192H0Z" fill="#0c0f10"/><path d="M0 148h384v44H0Z" fill="#192b20"/>';
  terrace +=
    '<path d="M22 92h4v70h-4ZM16 86h18v4H16ZM18 82h4v4h-4ZM28 82h4v4h-4Z" fill="#748a66"/>';
  terrace +=
    '<path d="M58 138h8v-6h228v6h12v10H58Z" fill="#526850"/><path d="M66 148h228v27H66Z" fill="#24382b"/>';
  for (let x = 72; x < 294; x += 28) terrace += `<path d="M${x} 148h4v27h-4Z" fill="#668060"/>`;
  for (let y = 154; y < 176; y += 6) terrace += `<path d="M70 ${y}h220v2H70Z" fill="#3d5540"/>`;
  terrace +=
    '<path d="M0 178h384v4H0ZM0 188h384v2H0Z" fill="#65845d"/><path d="M330 142h2v36h-2Z" fill="#98b47c"/><path d="M332 142h14v10h-14Z" fill="#2e713d"/>';
  add('sidebar-terrace', uiSvg(384, 192, terrace, true));
  add('rule-dark', uiSvg(64, 2, '<path d="M0 0h64v2H0Z" fill="#42554a"/>', true));
  add('rule-light', uiSvg(64, 2, '<path d="M0 0h64v2H0Z" fill="#526a57"/>', true));
  add('rule-light-vertical', uiSvg(2, 64, '<path d="M0 0h2v64H0Z" fill="#526a57"/>', true));
  return sources;
}
