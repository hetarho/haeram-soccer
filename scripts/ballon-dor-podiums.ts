/**
 * How the Ballon d'Or podium spreads over clubs (→PLAYER-27), measurement only: each world seed
 * plays a career's seasons from the 1950 takeover; at every close, on the world as the award reads
 * it, the podium is decided once per share variant (`BALLON_DOR_CONFIG.shares`), so every variant
 * reads the same seasons. Real football's three-from-one-club podiums: 1988, 1989 and 2010.
 *
 *   pnpm exec tsx scripts/ballon-dor-podiums.ts --seeds a,b --seasons N --out FILE
 */
import { writeFileSync } from 'node:fs';
import type { BallonDorPlace, World } from '../packages/contracts/src/types';
import { BALLON_DOR_CONFIG } from '../packages/engine/src/ballon-dor';
import { ballonDorPodium } from '../packages/engine/src/ballon-dor-award';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { finishEurope } from '../packages/engine/src/europe';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { careerEnded } from '../packages/engine/src/owner';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const seeds = opt('seeds', 'podium-1').split(',');
const seasons = Number(opt('seasons', '20'));
const out = opt('out', '');
// The released award (every teammate in full) and a grid of second/third shares.
const VARIANTS: Record<string, readonly number[]> = { released: [1] };
for (const second of [0.5, 0.53, 0.55, 0.57, 0.6])
  for (const third of [0.25, 0.3, 0.35])
    VARIANTS[`s${Math.round(second * 100)}t${Math.round(third * 100)}`] = [1, second, third];

interface Row {
  seed: string;
  year: number;
  variant: string;
  podium: Pick<BallonDorPlace, 'name' | 'club' | 'points' | 'honours' | 'goals'>[];
  clubs: number;
}
const rows: Row[] = [];
const original = BALLON_DOR_CONFIG.shares;
for (const seed of seeds) {
  const w = careerWorld({ seed });
  for (let s = 0; s < seasons && !careerEnded(w); s++) {
    const started = Date.now();
    while (w.round < 46 && !careerEnded(w)) advanceRound(w, undefined, false);
    if (careerEnded(w)) break;
    let read: World | undefined;
    const year = w.year;
    closeSeason(w, (world) => {
      finishEurope(world);
      read = structuredClone(world);
    });
    w.revision++;
    const champions = w.history.find((h) => h.year === year)!.champions;
    for (const [variant, shares] of Object.entries(VARIANTS)) {
      BALLON_DOR_CONFIG.shares = shares;
      const podium = ballonDorPodium(read!, champions);
      if (!podium) continue;
      rows.push({
        seed,
        year,
        variant,
        podium: podium.map(({ name, club, points, honours, goals }) => ({
          name,
          club,
          points,
          honours,
          goals,
        })),
        clubs: new Set(podium.map((p) => p.club)).size,
      });
    }
    BALLON_DOR_CONFIG.shares = original;
    console.error(`${seed} ${year} ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}

const summary = Object.keys(VARIANTS).map((variant) => {
  const mine = rows.filter((r) => r.variant === variant);
  const n = mine.length;
  const pct = (k: number) => +((100 * k) / Math.max(1, n)).toFixed(1);
  return {
    variant,
    seasons: n,
    oneClubPct: pct(mine.filter((r) => r.clubs === 1).length),
    twoClubsPct: pct(mine.filter((r) => r.clubs === 2).length),
    threeClubsPct: pct(mine.filter((r) => r.clubs === 3).length),
    winnerEuropePct: pct(mine.filter((r) => r.podium[0]?.honours.includes('europe')).length),
    podiumWithoutTrophyPct: pct(mine.filter((r) => r.podium.some((p) => !p.honours.length)).length),
  };
});
console.table(summary);
if (out) writeFileSync(out, JSON.stringify({ seeds, seasons, summary, rows }, null, 1));
