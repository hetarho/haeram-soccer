import { uiSvg } from '../../../../../scripts/ui-art-resources.mjs';

/** Editable 240×80 night-time facade, on the facility family's native integer grid. */
export function stadiumExteriorSource() {
  const shapes = [];
  const rect = (x, y, width, height, fill) =>
    shapes.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`);
  const path = (d, fill) => shapes.push(`<path d="${d}" fill="${fill}"/>`);
  rect(0, 0, 240, 80, '#172b40');
  rect(0, 17, 240, 15, '#243e50');
  for (const [x, y] of [[18, 8], [69, 4], [132, 10], [178, 6], [224, 12]])
    rect(x, y, 1, 1, '#abb8a3');
  for (const x of [47, 188]) {
    rect(x, 9, 2, 29, '#0d1d28');
    for (let y = 15; y < 33; y += 5) path(`M${x} ${y}h2v1h-2Z`, '#718585');
    rect(x - 6, 4, 14, 7, '#0a1820');
    for (let i = 0; i < 4; i++) {
      rect(x - 5 + i * 3, 5, 2, 2, '#efd99d');
      rect(x - 5 + i * 3, 8, 2, 2, '#c9bb83');
    }
  }
  for (const x of [0, 221]) {
    rect(x + 8, 33, 4, 35, '#0a2023');
    path(`M${x} 22h17v4h5v19h-4v6H${x}Z`, '#102e2d');
    rect(x + 3, 26, 12, 3, '#23463b');
    rect(x + 1, 33, 15, 3, '#1c3e35');
  }
  // Long backs of stands; the pitch is entirely hidden behind the outer wall.
  path('M16 37L72 23H112V27L170 23L225 37V41H16Z', '#102129');
  path('M18 36L72 23H111V26H73L23 39H17Z', '#72817a');
  path('M130 26L170 23L225 37V39L169 27H130Z', '#65766f');
  rect(23, 39, 195, 14, '#2f4547');
  for (let x = 26; x < 218; x += 5) rect(x, 39, 1, 14, '#6c7b70');
  for (const x of [30, 63, 173, 207]) {
    rect(x, 34, 2, 19, '#0f252a');
    rect(x, 34, 1, 18, '#839082');
  }
  rect(12, 49, 216, 19, '#60443b');
  rect(12, 48, 216, 2, '#aa8b65');
  // Raised central brick entrance with a stepped gable and stone gate piers.
  path('M78 42V32H94V29H106V25H131V28H142V32H160V68H78Z', '#342c2b');
  path('M81 43V34H97V31H108V28H130V31H141V34H157V68H81Z', '#805040');
  for (let y = 36; y < 66; y += 4) {
    if (y >= 50) rect(14, y, 64, 1, '#76503e');
    for (let x = 83 + (y % 8 ? 4 : 0); x < 155; x += 8)
      rect(x, y, 5, 1, '#a16d4b');
    if (y >= 50) for (let x = 162; x < 226; x += 8) rect(x, y, 5, 1, '#906349');
  }
  path('M78 32H95V29H106V25H132V28H144V32H160V35H142V32H130V29H108V32H97V35H78Z', '#c1a47a');
  for (const [x, width] of [[91, 5], [144, 5]]) {
    rect(x, 39, width, 29, '#bda47c');
    rect(x, 38, width, 2, '#d2bc93');
    rect(x + 3, 42, 2, 24, '#8e785d');
  }
  path('M98 65V49H101V44H105V41H137V44H141V49H144V65Z', '#152626');
  path('M98 49V46H101V42H105V39H137V42H141V46H144V49H141V47H137V44H105V47H101V49Z', '#d0b78a');
  rect(100, 50, 42, 16, '#153c34');
  for (let x = 101; x < 142; x += 4) {
    rect(x, 49, 1, 17, '#83a078');
    rect(x, 48, 1, 1, '#c1c190');
  }
  rect(100, 55, 42, 1, '#9bac7b');
  rect(100, 62, 42, 1, '#9bac7b');
  rect(120, 49, 2, 17, '#b4b788');
  for (const x of [62, 164]) {
    rect(x, 54, 12, 14, '#182627');
    rect(x + 2, 54, 1, 14, '#72857a');
    rect(x + 9, 54, 1, 14, '#72857a');
    rect(x + 2, 58, 8, 1, '#b5b28b');
    rect(x + 5, 59, 1, 9, '#a8a683');
    rect(x + 1, 56, 2, 1, '#e5cf94');
  }
  rect(10, 67, 220, 2, '#a28a68');
  rect(0, 69, 240, 11, '#37494b');
  rect(0, 70, 240, 1, '#71817a');
  rect(0, 76, 240, 1, '#25373b');
  for (let x = 9; x < 240; x += 22) rect(x, 71, 1, 5, '#26383c');
  for (let x = 0; x < 240; x += 25) rect(x, 77, 1, 3, '#1b3037');
  rect(97, 69, 48, 1, '#c7b580');
  rect(102, 71, 39, 1, '#847e60');
  for (const x of [13, 24, 195, 209, 221]) {
    rect(x, 63, 9, 5, '#16382e');
    rect(x + 2, 62, 5, 2, '#315442');
  }
  return uiSvg(240, 80, shapes.join(''), true);
}
