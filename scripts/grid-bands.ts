/**
 * Grid-engine distribution check (MATCH-23, T215, docs/CALIBRATION.md).
 *
 * Plays grid matches between equal-strength top-tier sides of ENG/ESP/GER/ITA (ratings within 2
 * points, the four tactics mixed, modern-era rules) and prints every MATCH-23 row with its band,
 * the measured value and pass/fail, plus added time and ball in play.
 *
 *   pnpm exec tsx scripts/grid-bands.ts             600 matches
 *   pnpm exec tsx scripts/grid-bands.ts --quick     150 matches
 *   options: --matches N, --year Y (default 2024)
 */
import { TD } from '../packages/contracts/src/detail';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { createWorld, rating } from '../packages/engine/src/index';
import { playGrid, type GridResult } from '../packages/engine/src/grid/engine';
import { M } from '../packages/engine/src/grid/record';
import { buildGridSetup } from '../packages/engine/src/grid/setup';

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const matches = option('matches', args.includes('--quick') ? 150 : 600);
const year = option('year', 2024);
const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const COUNTRIES = ['ENG', 'ESP', 'GER', 'ITA'];

/** Equal pairs from four worlds: top-tier clubs of one country whose ratings differ by at most 2. */
function pairs(): { w: World; home: Club; away: Club }[] {
  const out: { w: World; home: Club; away: Club }[] = [];
  for (let k = 1; k <= 4; k++) {
    const w = createWorld({
      country: 'ENG',
      name: 'Grid Bands',
      color: '#2a5d8f',
      seed: `grid-bands-${k}`,
      level: 'normal',
    });
    for (const country of COUNTRIES) {
      const clubs = w.clubs
        .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
        .map((c) => ({ c, r: rating(w, c) }));
      for (let i = 0; i < clubs.length; i++)
        for (let j = i + 1; j < clubs.length; j++)
          if (Math.abs(clubs[i]!.r - clubs[j]!.r) <= 2)
            out.push({ w, home: clubs[i]!.c, away: clubs[j]!.c });
    }
  }
  return out;
}

export function playBands(n: number, matchYear = year): GridResult[] {
  const all = pairs();
  const results: GridResult[] = [];
  for (let i = 0; i < n; i++) {
    const { w, home, away } = all[i % all.length]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      id: `bands:${i}`,
      year: matchYear,
      home: home.id,
      away: away.id,
    };
    const tactics: [Tactic, Tactic] = [TACTICS[i % 4]!, TACTICS[Math.floor(i / 4) % 4]!];
    results.push(playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: true, tactics })));
  }
  return results;
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};
const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);

/** Every MATCH-23 row: label, band [lo, hi] and measured value. */
export function measure(
  results: GridResult[],
): { label: string; band: [number, number]; value: number }[] {
  const n = results.length;
  const teams = 2 * n;
  const sum = (f: (r: GridResult, side: 0 | 1) => number) =>
    results.reduce((acc, r) => acc + f(r, 0) + f(r, 1), 0);
  const metric = (m: number) => sum((r, side) => r.record.metrics[side]![m]!);
  const td = (k: number) => sum((r, side) => r.record.detail![side]![k]!);
  const passes = metric(M.passes);
  const directions = [0, 1, 2].map((d) => sum((r, side) => r.diagnostics.directions[side]![d]!));
  const dirTotal = directions[0]! + directions[1]! + directions[2]!;
  const spells = results.flatMap((r) => r.diagnostics.possessions);
  const shots = results.flatMap((r) => r.diagnostics.shots);
  const goals = shots.filter((s) => s.goal);
  const distance = (s: { x: number; y: number }) => Math.hypot(105 - s.x, 34 - s.y);
  const inGoalArea = (s: { x: number; y: number }) => s.x >= 99.5 && Math.abs(s.y - 34) <= 9.16;
  const inBox = (s: { x: number; y: number }) => s.x >= 88.5 && Math.abs(s.y - 34) <= 20.16;
  const yellows = td(TD.yellowCards);
  const reds = td(TD.redCards);
  const ballInPlay = results.reduce((a, r) => a + r.diagnostics.ballInPlay, 0) / 60 / n;
  return [
    { label: 'passes attempted (team)', band: [430, 520], value: passes / teams },
    { label: 'pass completion %', band: [76, 84], value: pct(metric(M.completed), passes) },
    { label: 'pass forward %', band: [30, 40], value: pct(directions[0]!, dirTotal) },
    { label: 'pass lateral %', band: [45, 55], value: pct(directions[1]!, dirTotal) },
    { label: 'pass back %', band: [12, 18], value: pct(directions[2]!, dirTotal) },
    { label: 'possessions (team)', band: [85, 105], value: spells.length / teams },
    {
      label: 'median passes per possession',
      band: [2, 4],
      value: median(spells.map((p) => p.passes)),
    },
    {
      label: 'possessions ending in a shot %',
      band: [10, 15],
      value: pct(spells.filter((p) => p.shot).length, spells.length),
    },
    { label: 'shots (team)', band: [11, 14], value: metric(M.shots) / teams },
    { label: 'on target %', band: [30, 37], value: pct(metric(M.onTarget), metric(M.shots)) },
    {
      label: 'xG per shot',
      band: [0.09, 0.12],
      value: shots.reduce((a, s) => a + s.xg, 0) / Math.max(1, shots.length),
    },
    {
      label: 'shots from goal area %',
      band: [6, 9],
      value: pct(shots.filter(inGoalArea).length, shots.length),
    },
    {
      label: 'shots from rest of box %',
      band: [48, 58],
      value: pct(shots.filter((s) => inBox(s) && !inGoalArea(s)).length, shots.length),
    },
    {
      label: 'shots from outside %',
      band: [32, 42],
      value: pct(shots.filter((s) => !inBox(s)).length, shots.length),
    },
    {
      label: 'mean shot distance m',
      band: [15, 18],
      value: shots.reduce((a, s) => a + distance(s), 0) / Math.max(1, shots.length),
    },
    {
      label: 'shots from 30 m+ %',
      band: [0, 10],
      value: pct(shots.filter((s) => distance(s) >= 30).length, shots.length),
    },
    {
      label: 'shots from own half %',
      band: [0, 0.5],
      value: pct(shots.filter((s) => s.x < 52.5).length, shots.length),
    },
    { label: 'crosses (team)', band: [13, 20], value: td(TD.crosses) / teams },
    {
      label: 'cross completion %',
      band: [20, 30],
      value: pct(td(TD.crossesCompleted), td(TD.crosses)),
    },
    { label: 'take-ons (team)', band: [14, 20], value: td(TD.takeOns) / teams },
    { label: 'take-on success %', band: [40, 60], value: pct(metric(M.dribbles), td(TD.takeOns)) },
    {
      label: 'tackles + interceptions (team)',
      band: [22, 30],
      value: (metric(M.tackles) + metric(M.interceptions)) / teams,
    },
    { label: 'throw-ins (team)', band: [17, 23], value: td(TD.throwIns) / teams },
    { label: 'corners (team)', band: [4, 6], value: td(TD.corners) / teams },
    { label: 'goal kicks (team)', band: [7, 9], value: td(TD.goalKicks) / teams },
    { label: 'fouls (team)', band: [10, 13], value: td(TD.fouls) / teams },
    { label: 'offsides (team)', band: [1.5, 2.5], value: td(TD.offsides) / teams },
    { label: 'yellow cards (match)', band: [3.3, 4.3], value: yellows / n },
    { label: 'red cards (match)', band: [0.08, 0.15], value: reds / n },
    { label: 'goals (match)', band: [2.6, 2.9], value: goals.length / n },
    {
      label: 'set-piece goals (no pens) %',
      band: [20, 28],
      value: pct(goals.filter((g) => g.setPiece).length, goals.length),
    },
    {
      label: 'penalty goals %',
      band: [6, 9],
      value: pct(goals.filter((g) => g.penalty).length, goals.length),
    },
    {
      label: 'headed goals %',
      band: [14, 20],
      value: pct(goals.filter((g) => g.header).length, goals.length),
    },
    {
      label: 'goals by FW %',
      band: [50, 60],
      value: pct(goals.filter((g) => g.line === 'FW').length, goals.length),
    },
    {
      label: 'goals by MF %',
      band: [27, 37],
      value: pct(goals.filter((g) => g.line === 'MF').length, goals.length),
    },
    {
      label: 'goals by DF %',
      band: [8, 15],
      value: pct(goals.filter((g) => g.line === 'DF').length, goals.length),
    },
    { label: 'ball in play (min)', band: [54, 58], value: ballInPlay },
  ];
}

if (process.argv[1]?.endsWith('grid-bands.ts')) {
  const started = performance.now();
  const results = playBands(matches);
  const rows = measure(results);
  const added =
    results.reduce((a, r) => a + (r.record.added ?? []).reduce((x, y) => x + y, 0), 0) /
    results.length;
  const width = Math.max(...rows.map((r) => r.label.length));
  console.log(`grid bands: ${matches} matches, year ${year}, seeds grid-bands-1..4`);
  console.log(`${'measure'.padEnd(width)}  band            value    ok`);
  for (const row of rows) {
    const ok = row.value >= row.band[0] && row.value <= row.band[1];
    const band = `${row.band[0]}–${row.band[1]}`.padEnd(14);
    console.log(
      `${row.label.padEnd(width)}  ${band}  ${row.value.toFixed(2).padStart(7)}  ${ok ? 'pass' : 'FAIL'}`,
    );
  }
  console.log(`added time per match ${added.toFixed(2)} min`);
  console.log(
    `passed ${rows.filter((r) => r.value >= r.band[0] && r.value <= r.band[1]).length}/${rows.length}`,
  );
  console.log(`${((performance.now() - started) / matches).toFixed(1)} ms a match`);
}
