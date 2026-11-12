/**
 * T689 diagnostic (measurement only, no engine change): where a club's top scorer's share comes
 * from — how many of the team's shots he takes (allocation) against how well he converts them
 * (finishing). Grid-bands design (equal top-tier pairs of four worlds, the four tactics rotated by
 * override, both venues), released match model (MATCH_MODEL_REVISION).
 *
 *   pnpm exec tsx scripts/scoring-concentration.ts --matches N --seeds a,b,c,d --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { FORMATIONS } from '../packages/engine/src/player';
import { playGrid } from '../packages/engine/src/grid/engine';
import { M } from '../packages/engine/src/match/record';
import { buildGridSetup } from '../packages/engine/src/grid/setup';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const matches = Number(opt('matches', '400'));
const seeds = opt('seeds', 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4').split(',');
const out = opt('out', '');
const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const COUNTRIES = ['ENG', 'ESP', 'GER', 'ITA'];

const pairs: { w: World; seed: string; home: Club; away: Club }[] = [];
for (const seed of seeds) {
  const w = careerWorld({ country: 'ENG', seed });
  for (const country of COUNTRIES) {
    const clubs = w.clubs
      .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
      .map((c) => ({ c, r: rating(w, c) }));
    for (let i = 0; i < clubs.length; i++)
      for (let j = i + 1; j < clubs.length; j++)
        if (Math.abs(clubs[i]!.r - clubs[j]!.r) <= 2)
          pairs.push({ w, seed, home: clubs[i]!.c, away: clubs[j]!.c });
  }
}

interface PlayerAcc {
  shots: number;
  goals: number;
  positions: Map<string, number>;
}
interface ClubAcc {
  seed: string;
  matches: number;
  shots: number;
  goals: number;
  players: Map<string, PlayerAcc>;
}
const clubs = new Map<string, ClubAcc>();
const byPos = new Map<string, { shots: number; goals: number; apps: number }>();
let matchTopShotShare = 0,
  matchTopShotShareN = 0,
  totalShots = 0,
  totalGoals = 0,
  hatTricks = 0;
const started = performance.now();
for (let i = 0; i < matches; i++) {
  const { w, seed, home, away } = pairs[i % pairs.length]!;
  const f: Fixture = {
    ...w.fixtures[0]!,
    id: `t689:${i}`,
    year: 2024,
    home: home.id,
    away: away.id,
  };
  const tactics: [Tactic, Tactic] = [TACTICS[i % 4]!, TACTICS[Math.floor(i / 4) % 4]!];
  const setup = buildGridSetup(w, f, {
    observe: false,
    recordPlayers: true,
    tactics,
    model: MATCH_MODEL_REVISION,
  });
  const where = new Map<string, { side: 0 | 1; pos: string }>();
  ([0, 1] as const).forEach((side) =>
    setup.rosters[side].forEach((p, k) =>
      where.set(p.id, { side, pos: FORMATIONS[tactics[side]].slots[k]?.position ?? 'SUB' }),
    ),
  );
  const r = playGrid(setup).record;
  const sideShots: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  for (const line of r.players) {
    const at = where.get(line.id);
    if (!at) continue;
    const club = at.side === 0 ? r.home : r.away;
    let c = clubs.get(club);
    if (!c) clubs.set(club, (c = { seed, matches: 0, shots: 0, goals: 0, players: new Map() }));
    let p = c.players.get(line.id);
    if (!p) c.players.set(line.id, (p = { shots: 0, goals: 0, positions: new Map() }));
    const shots = line.metrics[M.shots]!,
      goals = line.metrics[M.goals]!;
    if (goals >= 3) hatTricks++;
    p.shots += shots;
    p.goals += goals;
    p.positions.set(at.pos, (p.positions.get(at.pos) ?? 0) + 1);
    sideShots[at.side].set(line.id, shots);
    const bp = byPos.get(at.pos) ?? { shots: 0, goals: 0, apps: 0 };
    bp.shots += shots;
    bp.goals += goals;
    bp.apps += 1;
    byPos.set(at.pos, bp);
  }
  ([0, 1] as const).forEach((side) => {
    const club = clubs.get(side === 0 ? r.home : r.away)!;
    const team = r.metrics[side]![M.shots]!;
    club.matches++;
    club.shots += team;
    club.goals += side === 0 ? r.score.home : r.score.away;
    totalShots += team;
    if (team > 0) {
      matchTopShotShare += Math.max(0, ...sideShots[side].values()) / team;
      matchTopShotShareN++;
    }
  });
  totalGoals += r.score.home + r.score.away;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** Seed-cluster interval: mean of the seeds' means ± 1.96 × their sd / √seeds. */
function clustered(rows: { seed: string; v: number }[]) {
  const perSeed = seeds
    .map((s) => rows.filter((r) => r.seed === s).map((r) => r.v))
    .filter((v) => v.length)
    .map(mean);
  const m = mean(perSeed);
  const sd = Math.sqrt(
    mean(perSeed.map((x) => (x - m) ** 2)) * (perSeed.length / Math.max(1, perSeed.length - 1)),
  );
  const half = (1.96 * sd) / Math.sqrt(Math.max(1, perSeed.length));
  return {
    mean: +m.toFixed(4),
    ci: [+(m - half).toFixed(4), +(m + half).toFixed(4)],
    seeds: perSeed.length,
    rows: rows.length,
  };
}
const scored = [...clubs.entries()].filter(([, c]) => c.goals >= 20);
const perClub = scored.map(([id, c]) => {
  const players = [...c.players.entries()];
  const [topId, top] = players.reduce((a, b) => (b[1].goals > a[1].goals ? b : a));
  const shooter = players.reduce((a, b) => (b[1].shots > a[1].shots ? b : a));
  const mainPos = [...top.positions.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const restShots = c.shots - top.shots,
    restGoals = c.goals - top.goals;
  return {
    club: id,
    seed: c.seed,
    matches: c.matches,
    goals: c.goals,
    shots: c.shots,
    topScorer: topId,
    topScorerPosition: mainPos,
    topScorerGoals: top.goals,
    topGoalShare: top.goals / c.goals,
    topShotShare: top.shots / c.shots,
    topConversion: top.goals / Math.max(1, top.shots),
    restConversion: restGoals / Math.max(1, restShots),
    topScorerIsTopShooter: shooter[0] === topId,
    topGoalsPer38: (38 * top.goals) / c.matches,
  };
});
const pick = (k: keyof (typeof perClub)[number]) =>
  clustered(perClub.map((c) => ({ seed: c.seed, v: Number(c[k]) })));
const positions = [...byPos.entries()]
  .map(([pos, v]) => ({
    pos,
    apps: v.apps,
    shotsPerApp: +(v.shots / v.apps).toFixed(3),
    shotShare: +(v.shots / totalShots).toFixed(4),
    goalShare: +(v.goals / totalGoals).toFixed(4),
    conversion: +(v.goals / Math.max(1, v.shots)).toFixed(4),
  }))
  .sort((a, b) => b.shotShare - a.shotShare);
const report = {
  kind: 't689-concentration-decomposition',
  model: MATCH_MODEL_REVISION,
  design:
    'grid-bands pairs (equal top-tier, rating gap ≤ 2), tactics rotated by override, both venues, year 2024',
  seeds,
  matches,
  msPerMatch: +((performance.now() - started) / matches).toFixed(1),
  goalsPerMatch: +(totalGoals / matches).toFixed(3),
  shotsPerTeam: +(totalShots / (2 * matches)).toFixed(2),
  hatTricksPerMatch: +(hatTricks / matches).toFixed(4),
  meanMatchTopShooterShotShare: +(matchTopShotShare / matchTopShotShareN).toFixed(4),
  clubsWith20Goals: perClub.length,
  topGoalShare: pick('topGoalShare'),
  topShotShare: pick('topShotShare'),
  topConversion: pick('topConversion'),
  restConversion: pick('restConversion'),
  topGoalsPer38: pick('topGoalsPer38'),
  topScorerIsTopShooter: perClub.filter((c) => c.topScorerIsTopShooter).length,
  topScorerPositions: Object.fromEntries(
    [...new Set(perClub.map((c) => c.topScorerPosition))].map((p) => [
      p,
      perClub.filter((c) => c.topScorerPosition === p).length,
    ]),
  ),
  positions,
  perClub,
};
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, perClub: undefined, positions: undefined }, null, 1));
console.table(positions);
