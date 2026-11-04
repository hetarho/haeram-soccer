/**
 * T689 diagnostic (measurement only, no engine change): where each side's open-play shots come from
 * in press v counter (→MATCH-29), both venues alternating, observed — how long after its possession
 * began, whether that possession began with a ball won in open play or a restart, where it was won
 * (the shooting side's frame), how high the losing side's deepest outfielder stood when it lost the
 * ball (its own frame) and how many defending outfielders stood goal-side of the shooter when he
 * struck it. Possessions are counted with the same keys, so a shot rate per possession reads beside
 * the shots. Grid-bands pairs as `scoring-shot-origins.ts`; a candidate is applied through
 * `scoring-candidate-patch.ts`.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-press-counter.ts \
 *     --start 0 --matches 160 --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { FORMATIONS } from '../packages/engine/src/player';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame } from '../packages/engine/src/grid/pitch';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import type { TraceEntry } from '../packages/engine/src/grid/trace';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const start = Number(opt('start', '0'));
const matches = Number(opt('matches', '160'));
const seeds = opt('seeds', 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4').split(',');
const out = opt('out', '');
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

type Acc = { n: number; goals: number; xg: number };
const cells = new Map<string, Acc>();
const add = (key: string, goal = false, xg = 0) => {
  const a = cells.get(key) ?? { n: 0, goals: 0, xg: 0 };
  a.n++;
  a.goals += goal ? 1 : 0;
  a.xg += xg;
  cells.set(key, a);
};
const RESTARTS = new Set(['corner', 'freeKick', 'throwIn', 'goalKick', 'kickoff', 'penalty']);
const INCIDENTS = new Set(['yellow', 'secondYellow', 'red', 'sub', 'injury', 'whistle']);
const bucket = (x: number, edges: number[]) => {
  let k = 0;
  while (k < edges.length && x >= edges[k]!) k++;
  return k === 0
    ? `<${edges[0]}`
    : k === edges.length
      ? `>=${edges[k - 1]}`
      : `${edges[k - 1]}-${edges[k]}`;
};
const lineBand = (x: number) => bucket(x, [30, 40, 50]);
const dtBand = (x: number) => bucket(x, [8, 15, 25]);
const wonBand = (x: number) => (x < 52.5 ? 'ownHalf' : x < 70 ? 'midOpp' : 'final');

let played = 0;
const goals: Record<string, number> = {};
for (let i = start; i < start + matches; i++) {
  const { w, home, away } = pairs[i % pairs.length]!;
  const f: Fixture = {
    ...w.fixtures[0]!,
    id: `t689pc:${i}`,
    year: 2024,
    home: home.id,
    away: away.id,
  };
  const tactics: [Tactic, Tactic] = i % 2 === 0 ? ['press', 'counter'] : ['counter', 'press'];
  const setup = buildGridSetup(w, f, {
    observe: true,
    recordPlayers: true,
    tactics,
    model: MATCH_MODEL_REVISION,
  });
  const trace: TraceEntry[] = playGrid(setup).trace ?? [];
  played++;
  const lineOf = (side: 0 | 1, slot: number) => FORMATIONS[tactics[side]].slots[slot]?.position;
  // The deepest outfielder of `side` (its own frame: metres from its goal) and how many of its
  // outfielders stand goal-side of `x` (`side`'s own frame).
  const deepest = (e: TraceEntry, side: 0 | 1) => {
    let d = Infinity;
    for (let slot = 0; slot < 11; slot++) {
      const k = side * 11 + slot;
      const px = e.positions[k * 2]!;
      if (Number.isNaN(px) || lineOf(side, slot) === 'GK') continue;
      d = Math.min(d, side === 0 ? px : 105 - px);
    }
    return d;
  };
  const goalSide = (e: TraceEntry, side: 0 | 1, x: number) => {
    let n = 0;
    for (let slot = 0; slot < 11; slot++) {
      const k = side * 11 + slot;
      const px = e.positions[k * 2]!;
      if (Number.isNaN(px) || lineOf(side, slot) === 'GK') continue;
      if ((side === 0 ? px : 105 - px) < x) n++;
    }
    return n;
  };
  let poss: 0 | 1 | -1 = -1;
  let began = 0;
  let how = 'restart';
  let won = 'none';
  let line = 'none';
  let setPieceUntil = -1;
  let through = false;
  // Where `side`'s roster index `idx` stood at `e` (engine frame), if in a slot.
  const spot = (e: TraceEntry, side: 0 | 1, idx: number) => {
    for (let slot = 0; slot < 11; slot++)
      if (e.slots[side * 11 + slot] === idx)
        return [e.positions[(side * 11 + slot) * 2]!, e.positions[(side * 11 + slot) * 2 + 1]!];
    return undefined;
  };
  trace.forEach((e, k) => {
    if (INCIDENTS.has(e.action) || e.transition) return;
    if (e.action === 'corner' || e.action === 'freeKick') setPieceUntil = k + 3;
    if (e.side !== poss) through = false;
    // A through ball: its outcome, and for one received whether its receiver stood beyond the
    // second-last opponent and the ball in the opponents' half as it was played (an offside
    // position the draw let stand, →MATCH-18).
    if (e.kind === 'through' && !RESTARTS.has(e.action)) {
      const tac = tactics[e.side];
      add(`through|${tac}|${e.outcome}`);
      const foe: 0 | 1 = e.side === 0 ? 1 : 0;
      const p = e.receiver === undefined ? undefined : spot(e, e.side, e.receiver);
      if (p) {
        const rx = attackFrame(e.side, p as [number, number])[0];
        const xs: number[] = [];
        for (let slot = 0; slot < 11; slot++) {
          const px = e.positions[(foe * 11 + slot) * 2]!;
          if (!Number.isNaN(px)) xs.push(e.side === 0 ? px : 105 - px);
        }
        xs.sort((a, b) => b - a);
        const second = xs[1] ?? 105;
        const bx = attackFrame(e.side, e.from ?? e.ball)[0];
        const off = rx > 52.5 && rx > second && rx > bx;
        add(`throughRecv|${tac}|${e.outcome}|${off ? 'offsidePos' : 'onside'}`);
        through = true;
      }
    }
    if (e.side !== poss) {
      const prev = trace[k - 1];
      poss = e.side;
      began = e.elapsed;
      const tac = tactics[e.side];
      if (RESTARTS.has(e.action) || !prev || prev.side === e.side) {
        how = 'restart';
        won = 'none';
        line = 'none';
      } else {
        how = 'regain';
        won = wonBand(attackFrame(e.side, prev.ball)[0]);
        line = lineBand(deepest(prev, prev.side));
      }
      add(`poss|${tac}|${how}`);
      add(`poss|${tac}|${how}|${won}|${line}`);
    }
    if (e.result === undefined) return;
    const tac = tactics[e.side];
    if (e.result === 'goal') goals[tac] = (goals[tac] ?? 0) + 1;
    if (
      e.action === 'penalty' ||
      e.kind === 'penalty' ||
      RESTARTS.has(e.action) ||
      k <= setPieceUntil
    ) {
      add(`shot|${tac}|setPiece`, e.result === 'goal', e.xg ?? 0);
      return;
    }
    const at = attackFrame(e.side, e.shotAt ?? e.from ?? e.ball);
    const gs = goalSide(e, e.side === 0 ? 1 : 0, 105 - at[0]);
    const g = e.result === 'goal',
      xg = e.xg ?? 0;
    const dt = dtBand(e.elapsed - began);
    const prev = trace[k - 1];
    const via = prev && prev.side === e.side && prev.kind === 'through' ? 'through' : 'other';
    add(`shot|${tac}|open`, g, xg);
    add(`shot|${tac}|${how}`, g, xg);
    add(`shot|${tac}|dt|${dt}`, g, xg);
    add(`shot|${tac}|${how}|${won}|${line}`, g, xg);
    add(`shot|${tac}|gs|${Math.min(gs, 3)}`, g, xg);
    add(`shot|${tac}|${how}|dt|${dt}|gs|${Math.min(gs, 3)}`, g, xg);
    add(`shot|${tac}|via|${via}`, g, xg);
    add(`shot|${tac}|possThrough|${through}`, g, xg);
  });
}
const rows = [...cells.entries()]
  .map(([key, a]) => ({ key, ...a, xg: +a.xg.toFixed(3) }))
  .sort((a, b) => a.key.localeCompare(b.key));
const report = {
  kind: 't689-press-counter',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  seeds,
  start,
  matches: played,
  goals,
  rows,
};
if (out) writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(`done ${played} matches, goals ${JSON.stringify(goals)}`);
