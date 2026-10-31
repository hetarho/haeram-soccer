// Authored on a 24px integer grid: finer steps, with the same filled pixel silhouettes.
// Shared by semantic SVGs and the lossless PNG masks used by the shell.
const glyphs = {
  home: 'M11 2h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-3v9H5v-9H2v-2h1v-1h1v-1h1v-1h1v-1h1v-1h1V5h1V4h1V3h1Z M8 13v4h3v-4Z M14 15v7h3v-7Z',
  ball: 'M8 2h8v1h3v2h2v3h1v8h-1v3h-2v2h-3v1H8v-1H5v-2H3v-3H2V8h1V5h2V3h3Z M8 4v1H6v2H4v10h2v2h2v1h8v-1h2v-2h2V7h-2V5h-2V4Z M10 8h4v1h2v5h-2v2h-4v-2H8V9h2Z M6 5h2v3H6Z M16 5h2v3h-2Z M4 14h4v2H4Z M16 14h4v2h-4Z M11 18h2v2h-2Z',
  table: 'M3 3h18v18H3Z M5 5v4h14V5Z M5 11v3h3v-3Z M10 11v3h9v-3Z M5 16v3h3v-3Z M10 16v3h9v-3Z',
  cup: 'M6 2h12v3h4v7h-1v2h-2v1h-3v2h-3v3h5v2H6v-2h5v-3H8v-2H5v-1H3v-2H2V5h4Z M4 7v4h1v1h2V7Z M17 7v5h2v-1h1V7Z',
  people: 'M7 3h3v2h4V3h3v1h2v2h2v2h1v5h-5v9H7v-9H2V8h1V6h2V4h2Z M9 7v2h6V7Z M9 12v2h6v-2Z',
  training: 'M2 8h2V5h3v6h10V5h3v3h2v8h-2v3h-3v-6H7v6H4v-3H2Z',
  trend:
    'M12 3h9v9h-2V7h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H5v1H2v-3h2v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1V8h1V7h1V6h1V5h-5Z',
  history: 'M4 2h14v2h2v18H6v-1H4Z M6 4v13h10V4Z M8 19v1h10v-1Z M10 7h2v5h3v2h-5Z',
  menu: 'M3 4h18v2H3Z M3 11h18v2H3Z M3 18h18v2H3Z',
  bell: 'M11 2h2v2h3v1h2v2h1v9h1v1h1v2H3v-2h1v-1h1V7h1V5h2V4h3Z M7 8v8H6v1h12v-1h-1V8h-1V6H8v2Z M10 21h4v1h-1v1h-2v-1h-1Z',
  news: 'M3 3h15v4h4v14H5v-1H3Z M5 5v13h1v1h12V5Z M20 9v10h1V9Z M7 7h5v5H7Z M14 7h2v2h-2Z M14 11h2v1h-2Z M7 14h9v2H7Z',
  eye: 'M8 5h8v1h3v2h2v2h1v4h-1v2h-2v2h-3v1H8v-1H5v-2H3v-2H2v-4h1V8h2V6h3Z M8 7v1H6v2H4v4h2v2h2v1h8v-1h2v-2h2v-4h-2V8h-2V7Z M10 9h4v1h1v4h-1v1h-4v-1H9v-4h1Z',
  play: 'M6 3h2v1h2v1h2v1h2v1h2v1h2v1h2v2h1v2h-1v2h-2v1h-2v1h-2v1h-2v1h-2v1H8v1H6Z',
  pause: 'M5 3h5v18H5Z M14 3h5v18h-5Z',
  replay:
    'M9 3h8v1h3v2h1v3h1v7h-1v3h-2v1h-3v1H9v-1H6v-2H4v-3H3v-2h2v2h1v2h2v1h2v1h6v-1h2v-2h1v-2h1V9h-1V7h-2V6h-2V5h-5v1H8v1H6v1h4v2H3V3h2v3h1V5h1V4h2Z',
  close:
    'M4 3h2v1h1v1h1v1h1v1h1v1h1v1h2V8h1V7h1V6h1V5h1V4h1V3h2v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v2h1v1h1v1h1v1h1v1h1v1h1v3h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-2v1h-1v1H9v1H8v1H7v1H6v1H4v-3h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2H9v-1H8V9H7V8H6V7H5V6H4Z',
  chevronDown:
    'M4 8h2v1h1v1h1v1h1v1h1v1h1v1h2v-1h1v-1h1v-1h1v-1h1V9h1V8h2v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-4v-1H9v-1H8v-1H7v-1H6v-1H5v-1H4Z',
  chevronRight:
    'M8 3h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1v4h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H8v-3h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2h-1v-1h-1v-1h-1V9h-1V8H9V7H8Z',
  chevronLeft:
    'M14 3h2v4h-1v1h-1v1h-1v1h-1v1h-1v2h1v1h1v1h1v1h1v1h1v4h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1H9v-1H8v-1H7v-4h1V9h1V8h1V7h1V6h1V5h1V4h1Z',
  check:
    'M19 4h3v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5v-1H4v-1H3v-1H2v-3h3v1h1v1h1v1h1v1h1v-1h1v-1h1v-1h1v-1h1v-1h1V9h1V8h1V7h1V6h1V5h1Z',
  filter: 'M3 4h18v2H3Z M6 11h12v2H6Z M9 18h6v2H9Z',
  star: 'M11 2h2v3h1v3h2v1h6v2h-1v1h-2v1h-1v1h-1v3h1v4h-3v-1h-2v-1h-2v1H9v1H6v-4h1v-3H6v-1H5v-1H3v-1H2V9h6V8h2V5h1Z',
  liddedCup:
    'M11 1h2v2h3v1h2v2H6V4h2V3h3Z M6 8h12v2h4v5h-1v1h-4v2h-4v2h5v2H6v-2h5v-2H7v-2H3v-1H2v-5h4Z M4 12v2h3v-2Z M17 12v2h3v-2Z',
  continentalCup:
    'M6 4h12V2h5v10h-1v2h-2v1h-3v2h-4v3h5v2H6v-2h5v-3H7v-2H4v-1H2v-2H1V2h5Z M3 4v7h1v1h3V6H4V4Z M20 4v2h-3v6h3v-1h1V4Z',
  medal:
    'M4 2h5v3h1v3H7V6H6V4H4Z M15 2h5v2h-2v2h-1v2h-3V5h1Z M9 8h6v1h3v2h1v7h-1v2h-3v1H9v-1H6v-2H5v-7h1V9h3Z M9 10v1H7v7h2v1h6v-1h2v-7h-2v-1Z M10 12h4v5h-4Z',
  promotion:
    'M4 2h16v12h-1v3h-2v2h-2v1h-2v1h-2v-1H9v-1H7v-2H5v-3H4Z M6 4v10h1v2h1v1h2v1h1v1h2v-1h1v-1h2v-1h1v-2h1V4Z M11 6h2v1h1v1h1v1h1v2h-3v5h-2v-5H8V9h1V8h1V7h1Z',
  relegation:
    'M4 2h16v12h-1v3h-2v2h-2v1h-2v1h-2v-1H9v-1H7v-2H5v-3H4Z M6 4v10h1v2h1v1h2v1h1v1h2v-1h1v-1h2v-1h1v-2h1V4Z M11 6h2v5h3v2h-1v1h-1v1h-1v1h-2v-1h-1v-1H9v-1H8v-2h3Z',
  more: 'M3 10h4v4H3Z M10 10h4v4h-4Z M17 10h4v4h-4Z',
  switch:
    'M15 2h2v1h1v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-1v1h-2v-3h1V9H3V7h14V6h-1V5h-1Z M7 11h2v3H8v1h13v2H7v1h1v1h1v3H7v-1H6v-1H5v-1H4v-1H3v-3h1v-1h1v-1h1v-1h1Z',
  boot: 'M5 3h7v9h2v2h3v1h4v2h1v4H2v-7h2V8h1Z M7 5v7h3V5Z M4 18v1h16v-1Z M12 8h3v2h-3Z M14 11h3v2h-3Z',
  supporters:
    'M3 3h4v4H3Z M17 3h4v4h-4Z M10 5h4v1h1v4h-1v1h-4v-1H9V6h1Z M2 9h6v3H6v9H3v-8H2Z M16 9h6v4h-1v8h-3v-9h-2Z M9 13h6v1h2v8H7v-8h2Z',
  manager:
    'M9 2h6v1h2v2h1v5h-1v2h-2v1H9v-1H7v-2H6V5h1V3h2Z M9 5v1H8v4h1v1h6v-1h1V6h-1V5Z M7 15h3v2h1v2h2v-2h1v-2h3v1h3v2h1v4H3v-4h1v-2h3Z',
  shirt: 'M7 3h3v2h4V3h3v1h2v2h2v2h1v5h-5v9H7v-9H2V8h1V6h2V4h2Z M9 7v2h6V7Z M15 11v3h1v-3Z',
  heart:
    'M5 3h4v1h2v2h2V4h2V3h4v1h2v2h1v7h-1v2h-2v2h-2v2h-2v2h-2v1h-2v-1H9v-2H7v-2H5v-2H3v-2H2V6h1V4h2Z M5 6v2H4v3h2V8h3V6Z',
};

export function pixelIcon(name) {
  const d = glyphs[name];
  if (!d) throw new Error(`Missing pixel glyph: ${name}`);
  return {
    type: 'svg',
    viewBox: '0 0 24 24',
    shapeRendering: 'crispEdges',
    layers: [{ d, fill: 'currentColor', fillRule: 'evenodd' }],
  };
}
