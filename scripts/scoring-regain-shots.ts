/**
 * T689 diagnostic (measurement only, no engine change): the shots struck straight after a won
 * interception or loose ball (`scoring-shot-origins.ts`'s `opp-*` origins) — who on the losing side
 * played the ball, from where in his own frame (band of MATCH-14), its kind, and who on the winning
 * side shot, from where — so the striker slot's share of these chances can be traced to the
 * losing side's build-up. Grid-bands pairs as `scoring-shot-origins.ts`, observed; a candidate is
 * applied through `scoring-candidate-patch.ts`.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-regain-shots.ts \
 *     --start 600 --matches 120 --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { FORMATIONS } from '../packages/engine/src/player';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame, BAND_EDGES } from '../packages/engine/src/grid/pitch';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import type { TraceEntry } from '../packages/engine/src/grid/trace';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const start = Number(opt('start', '600'));
const matches = Number(opt('matches', '120'));
const seeds = opt('seeds', 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4').split(',');
const out = opt('out', '');
const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const COUNTRIES = ['ENG', 'ESP', 'GER', 'ITA'];

const pairs: { w: World; home: Club; away: Club }[] = [];
for (const seed of seeds) {
  const w = careerWorld({ country: 'ENG', seed });
  for (const country of COUNTRIES) {
    const clubs = w.clubs
      .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
      .map((c) => ({ c, r: rating(w, c) }));
    for (let i = 0; i < clubs.length; i++)
      for (let j = i + 1; j < clubs.length; j++)
        if (Math.abs(clubs[i]!.r - clubs[j]!.r) <= 2)
          pairs.push({ w, home: clubs[i]!.c, away: clubs[j]!.c });
  }
}
const band = (x: number) => {
  let b = 0;
  while (b + 1 < BAND_EDGES.length && x >= BAND_EDGES[b + 1]!) b++;
  return b;
};
const cells = new Map<string, { shots: number; goals: number; xg: number }>();
const add = (key: string, goal: boolean, xg: number) => {
  const a = cells.get(key) ?? { shots: 0, goals: 0, xg: 0 };
  a.shots++;
  a.goals += goal ? 1 : 0;
  a.xg += xg;
  cells.set(key, a);
};
let allShots = 0;
for (let i = start; i < start + matches; i++) {
  const { w, home, away } = pairs[i % pairs.length]!;
  const f: Fixture = {
    ...w.fixtures[0]!,
    id: `t689:${i}`,
    year: 2024,
    home: home.id,
    away: away.id,
  };
  const tactics: [Tactic, Tactic] = [TACTICS[i % 4]!, TACTICS[Math.floor(i / 4) % 4]!];
  const setup = buildGridSetup(w, f, {
    observe: true,
    recordPlayers: true,
    tactics,
    model: MATCH_MODEL_REVISION,
  });
  const pos = (side: 0 | 1, idx: number) => FORMATIONS[tactics[side]].slots[idx]?.position ?? 'SUB';
  const trace: TraceEntry[] = playGrid(setup).trace ?? [];
  trace.forEach((e, k) => {
    if (e.result === undefined || e.action === 'penalty' || e.kind === 'penalty') return;
    allShots++;
    const prev = trace[k - 1];
    if (!prev || prev.side === e.side || !prev.from) return;
    const goal = e.result === 'goal';
    const xg = e.xg ?? 0;
    const loser = pos(prev.side, prev.idx);
    const lostBand = band(attackFrame(prev.side, prev.from)[0]);
    const what = `${prev.action}${prev.kind ? '/' + prev.kind : ''}:${prev.outcome}`;
    const shooter = pos(e.side, e.idx);
    add('all', goal, xg);
    add(`what|${what}`, goal, xg);
    add(`loser|${loser}`, goal, xg);
    add(`lostBand|${lostBand}`, goal, xg);
    add(`loserBand|${loser}|${lostBand}`, goal, xg);
    add(`shooter|${shooter}`, goal, xg);
    add(`whatShooter|${what}|${shooter}`, goal, xg);
    if (loser === 'GK' && prev.to) {
      // Where the keeper's ball was won: metres from where he played it, and its band in his frame.
      const won = attackFrame(prev.side, prev.to);
      const from = attackFrame(prev.side, prev.from);
      const metres = Math.hypot(won[0] - from[0], won[1] - from[1]);
      const after = e.elapsed - prev.elapsed;
      add(
        `gkWonAt|${metres < 5 ? '<5' : metres < 10 ? '5-10' : metres < 20 ? '10-20' : '20+'}m`,
        goal,
        xg,
      );
      add(`gkWonBand|${band(won[0])}`, goal, xg);
      add(`gkShotAfter|${after < 3 ? '<3' : after < 6 ? '3-6' : '6+'}s`, goal, xg);
      add(`gkBy|${prev.by ? pos(prev.by[0] as 0 | 1, prev.by[1] as number) : '-'}`, goal, xg);
      // How he came to have it: the entry before his distribution (a save he held or a cross he
      // claimed is the other side's shot or delivery; a back pass is his own side's).
      const got = trace[k - 2];
      add(
        `gkGot|${got ? `${got.side === prev.side ? 'own' : 'opp'}:${got.action}:${got.outcome}` : '-'}`,
        goal,
        xg,
      );
    }
  });
}
const rows = [...cells.entries()]
  .map(([key, v]) => ({ key, ...v, xg: +v.xg.toFixed(3) }))
  .sort((a, b) => a.key.localeCompare(b.key));
const report = {
  kind: 't689-regain-shots',
  model: MATCH_MODEL_REVISION,
  seeds,
  start,
  matches,
  allShots,
  rows,
};
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
for (const r of rows.filter((r) => r.shots >= 5))
  console.log(
    r.key.padEnd(48),
    String(r.shots).padStart(5),
    String(r.goals).padStart(4),
    (r.xg / r.shots).toFixed(3),
  );
console.log('all shots (no penalties)', allShots, 'matches', matches);
