import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';

export function careerRecords(w: World) {
  const seasons = w.history.filter((h) => h.played > 0);
  const best = (compare: (a: SeasonArchive, b: SeasonArchive) => number) =>
    seasons.slice().sort((a, b) => compare(a, b) || a.year - b.year)[0];
  const leader = (index: number, role?: string) =>
    w.players
      .filter((p) => p.career[index] > 0 && (!role || p.role === role))
      .slice()
      .sort((a, b) => b.career[index] - a.career[index] || a.id.localeCompare(b.id))[0];
  return {
    seasons: w.history.length,
    finish: best((a, b) => a.tier - b.tier || a.rank - b.rank),
    points: best((a, b) => b.points * a.played - a.points * b.played),
    attack: best((a, b) => b.gf * a.played - a.gf * b.played),
    supporters: w.history.slice().sort((a, b) => b.fans - a.fans || a.year - b.year)[0],
    scorer: leader(0),
    creator: leader(1),
    keeper: leader(9, 'GK'),
  };
}
