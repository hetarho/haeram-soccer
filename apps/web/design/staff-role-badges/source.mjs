/** Shared informational colours, independent of club colours, actions and rating tiers. */
export const staffRolePalette = {
  manager: { fill: '#314c73', ink: '#ffffff', edge: '#1d304d' },
  director: { fill: '#d8b8ee', ink: '#38204d', edge: '#8554a5' },
  assistant: { fill: '#a2dbd0', ink: '#123d36', edge: '#397f73' },
  attack: { fill: '#ffb0a1', ink: '#4a1d14', edge: '#b75743' },
  defense: { fill: '#a5cafa', ink: '#15365f', edge: '#4677b7' },
  goalkeeping: { fill: '#f4d477', ink: '#45330a', edge: '#9b7a28' },
  fitness: { fill: '#f4ba83', ink: '#49290e', edge: '#a56a33' },
  youth: { fill: '#b6dda0', ink: '#244017', edge: '#618c49' },
  scout: { fill: '#e5bee0', ink: '#492043', edge: '#99558e' },
};

export function staffRoleSkin({ fill, edge }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="40" viewBox="0 0 96 40"><path d="M6 1H90L95 6V34L90 39H6L1 34V6Z" fill="${fill}" stroke="${edge}" stroke-width="2"/><path d="M7 4H89L92 7V33L89 36H7L4 33V7Z" fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width="2"/></svg>\n`;
}
