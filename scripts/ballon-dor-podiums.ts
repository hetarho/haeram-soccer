/**
 * How the Ballon d'Or podium spreads over clubs (→PLAYER-27), measurement only: each world seed
 * plays a career's seasons from the 1950 takeover; at every close, on the world as the award reads
 * it, the podium is decided once per share variant (`BALLON_DOR_CONFIG.shares`), so every variant
 * reads the same seasons. Real football's three-from-one-club podiums: 1988, 1989 and 2010.
 *
 * T803: the summary also reads who keeps winning (`scripts/lib/ballon-dor-winners.ts`): different
 * winners, the most wins of one player, the longest run of consecutive wins, the winners' ages and
 * lines, how many played for the season's strongest club and, counted apart, for the owner's club.
 * `--variants` (default every one) limits the variants played.
 *
 *   pnpm exec tsx scripts/ballon-dor-podiums.ts --seeds a,b --seasons N --variants released --out FILE
 *     [--setting flat|spread]   WORLD-6's squad spread for the run (T808), else the released default
 */
import { writeFileSync } from 'node:fs';
import type { BallonDorPlace, World } from '../packages/contracts/src/types';
import { BALLON_DOR_CONFIG } from '../packages/engine/src/ballon-dor';
import { ballonDorPodium } from '../packages/engine/src/ballon-dor-award';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { finishEurope } from '../packages/engine/src/europe';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { careerEnded } from '../packages/engine/src/owner';
import { lineOf } from '../packages/engine/src/player';
import { squad } from '../packages/engine/src/world';
import { type Winner, winnerSummary } from './lib/ballon-dor-winners';
import { squadSpreadSetting } from './lib/squad-spread-setting';

const args = process.argv.slice(2);
// T808: `--setting flat|spread` lives the careers on that squad spread (→WORLD-6).
const SETTING = squadSpreadSetting(args)[1] ?? '';
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const seeds = opt('seeds', 'podium-1').split(',');
const seasons = Number(opt('seasons', '20'));
const out = opt('out', '');
// The released award (every teammate in full) and a grid of second/third shares.
const GRID: Record<string, readonly number[]> = { released: [1] };
for (const second of [0.5, 0.53, 0.55, 0.57, 0.6])
  for (const third of [0.25, 0.3, 0.35])
    GRID[`s${Math.round(second * 100)}t${Math.round(third * 100)}`] = [1, second, third];
const chosen = opt('variants', '').split(',').filter(Boolean);
for (const name of chosen)
  if (!GRID[name]) throw new Error(`unknown variant ${name}: ${Object.keys(GRID).join(', ')}`);
const VARIANTS: Record<string, readonly number[]> = chosen.length
  ? Object.fromEntries(chosen.map((name) => [name, GRID[name]!]))
  : GRID;

interface Row {
  seed: string;
  year: number;
  variant: string;
  podium: Pick<BallonDorPlace, 'name' | 'club' | 'points' | 'honours' | 'goals'>[];
  clubs: number;
  winner: Winner;
}

/** The winner as the award read him: his age from his birth year, his line, his club's standing. */
function winnerOf(w: World, seed: string, place: BallonDorPlace, strongest: number): Winner {
  const club = w.clubs.find((entry) => entry.id === place.club);
  const player =
    w.players.find((p) => p.id === place.id) ??
    (club && squad(w, club).find((p) => p.id === place.id));
  return {
    seed,
    year: w.year,
    id: place.id,
    ...(player ? { age: w.year - player.born } : {}),
    line: lineOf(place.position),
    strongest: club?.strength === strongest,
    own: place.club === w.playerClub,
  };
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
    // The season's highest strength among the clubs that can field a winner (→PLAYER-27).
    const strongest = Math.max(
      ...read!.clubs.filter((club) => !club.representative).map((club) => club.strength),
    );
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
        winner: winnerOf(read!, seed, podium[0]!, strongest),
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
  const read = winnerSummary(mine.map((r) => r.winner));
  return {
    variant,
    seasons: n,
    oneClubPct: pct(mine.filter((r) => r.clubs === 1).length),
    twoClubsPct: pct(mine.filter((r) => r.clubs === 2).length),
    threeClubsPct: pct(mine.filter((r) => r.clubs === 3).length),
    winnerEuropePct: pct(mine.filter((r) => r.podium[0]?.honours.includes('europe')).length),
    podiumWithoutTrophyPct: pct(mine.filter((r) => r.podium.some((p) => !p.honours.length)).length),
    winners: read.distinctWinners,
    mostWins: read.mostWins,
    longestRun: read.longestRun,
    ageMin: read.ageMin,
    ageMedian: read.ageMedian,
    ageMax: read.ageMax,
    ageUnknown: read.ageUnknown,
    GK: read.GK,
    DF: read.DF,
    MF: read.MF,
    FW: read.FW,
    strongestClubPct: pct(read.strongestClub),
    ownClubWins: read.ownClub,
  };
});
console.table(summary);
console.log(
  "Real (recalled, not read against the lists): Ballon d'Or 1956–2025, 69 awards (none in 2020), about 47 winners, most wins 8 (Messi), longest run 4 (Messi 2009–12); winners mostly aged 23–31 and forwards or attacking midfielders, defenders 4, a keeper once (Yashin); the winner's club also European champion in about 30% of years.",
);
if (out)
  writeFileSync(
    out,
    JSON.stringify(
      { seeds, seasons, ...(SETTING ? { setting: SETTING } : {}), summary, rows },
      null,
      1,
    ),
  );
