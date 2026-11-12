/**
 * T689 diagnostic (measurement only, no engine change): where each slot's shots come from on
 * observed matches — the chance's origin (a pass or through ball to the shooter, his own carry or
 * take-on, an opponent's action just before, a rebound, a set piece, a penalty), its place (goal
 * area, rest of the box, outside) and its xG — so the striker slot's excess can be traced to a
 * football situation. Grid-bands pairs as `scoring-concentration.ts` (equal top-tier pairs of four
 * worlds, the four tactics rotated by override, both venues), observed: MATCH-7 plays the same
 * result path. A candidate is applied through `scoring-candidate-patch.ts`.
 *
 * A delivery's finish (→MATCH-33) is the receiver's own `shot` entry after the `cross` or
 * `cutBack` that reached him, so it reads as `pass-cross` / `pass-cutBack`. A restart has no
 * `from`: its place reads the ball after the kick, so the restarts' place rows are not shot places;
 * leave penalties and direct restarts out of place comparisons. `originPlaceBetween` rows (T689
 * cv04-blk) split each origin and place by whether a defending outfielder stood between the shooter
 * and the goal's middle as the entry was traced (`alone` is →MATCH-35's carrier with nobody between).
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-shot-origins.ts \
 *     --start 0 --matches 100 --seeds a,b --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { FORMATIONS } from '../packages/engine/src/player';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame } from '../packages/engine/src/match/pitch';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import type { TraceEntry } from '../packages/engine/src/grid/trace';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const start = Number(opt('start', '0'));
const matches = Number(opt('matches', '100'));
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

type Acc = { shots: number; goals: number; xg: number };
const cells = new Map<string, Acc>();
const add = (key: string, goal: boolean, xg: number) => {
  const a = cells.get(key) ?? { shots: 0, goals: 0, xg: 0 };
  a.shots++;
  a.goals += goal ? 1 : 0;
  a.xg += xg;
  cells.set(key, a);
};
const BETWEEN = { corridor: 6, ahead: 3 };
/** Whether a defending outfielder stands between the shooter at `at` (attack frame) and the goal. */
const between = (e: TraceEntry, at: readonly [number, number]): boolean => {
  const foe = 1 - e.side;
  const [gx, gy] = [105, 34];
  const [dx, dy] = [gx - at[0], gy - at[1]];
  const len2 = dx * dx + dy * dy;
  for (let slot = 1; slot < 11; slot++) {
    const k = foe * 11 + slot;
    const x = e.positions[k * 2]!,
      y = e.positions[k * 2 + 1]!;
    if (Number.isNaN(x)) continue;
    const [ox, oy] = attackFrame(e.side, [x, y]);
    if (ox < at[0] + BETWEEN.ahead) continue;
    const t =
      len2 > 0 ? Math.max(0, Math.min(1, ((ox - at[0]) * dx + (oy - at[1]) * dy) / len2)) : 0;
    if (Math.hypot(ox - (at[0] + t * dx), oy - (at[1] + t * dy)) <= BETWEEN.corridor) return true;
  }
  return false;
};
/**
 * A shot's keeper and chaser as its entry was traced: `out` when the defending keeper stands more
 * than KEEPER_OUT m off his goal line, `chased` when a defending outfielder is within the pressure
 * radius (4.6 m, →MATCH-15) of the shooter.
 */
const KEEPER_OUT = 3;
const situation = (e: TraceEntry, at: readonly [number, number]): string => {
  const foe = 1 - e.side;
  let out = false,
    chased = false;
  for (let slot = 0; slot < 11; slot++) {
    const k = foe * 11 + slot;
    const x = e.positions[k * 2]!,
      y = e.positions[k * 2 + 1]!;
    if (Number.isNaN(x)) continue;
    const [ox, oy] = attackFrame(e.side, [x, y]);
    if (slot === 0) out = 105 - ox > KEEPER_OUT;
    else if (Math.hypot(ox - at[0], oy - at[1]) <= 4.6) chased = true;
  }
  return `${out ? 'keeperOut' : 'keeperSet'}|${chased ? 'chased' : 'free'}`;
};
const RESTARTS = new Set(['corner', 'freeKick', 'throwIn', 'goalKick', 'kickoff', 'penalty']);
let played = 0;
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
  played++;
  // A shot within three entries of a corner or free kick reads as its set piece's second phase.
  let setPieceUntil = -1;
  trace.forEach((e, k) => {
    if (e.action === 'corner' || e.action === 'freeKick') setPieceUntil = k + 3;
    if (e.result === undefined) return;
    const prev = trace[k - 1];
    const direct = e.action === 'shot' || RESTARTS.has(e.action);
    const shooter = !direct && e.receiver !== undefined ? e.receiver : e.idx;
    let origin: string;
    if (e.action === 'penalty' || e.kind === 'penalty') origin = 'penalty';
    else if (e.action === 'cross') origin = e.header ? 'cross-header' : 'cross-foot';
    else if (e.action === 'cutBack') origin = 'cutBack';
    else if (RESTARTS.has(e.action)) origin = `restart-${e.action}`;
    else if (k <= setPieceUntil) origin = 'setPiece-2nd';
    else if (prev && prev.side === e.side && prev.result !== undefined) origin = 'rebound';
    else if (prev && prev.side === e.side && prev.receiver === e.idx)
      origin = prev.kind === 'through' ? 'through' : `pass-${prev.action}`;
    else if (prev && prev.side === e.side && prev.idx === e.idx) origin = `self-${prev.action}`;
    else if (prev && prev.side !== e.side) origin = `opp-${prev.action}:${prev.outcome}`;
    else origin = 'other';
    const at = attackFrame(e.side, e.shotAt ?? e.from ?? e.ball);
    const place =
      at[0] >= 99.5 && at[1] >= 24.84 && at[1] <= 43.16
        ? 'goalArea'
        : at[0] >= 88.5 && at[1] >= 13.84 && at[1] <= 54.16
          ? 'box'
          : 'outside';
    const p = pos(e.side, shooter);
    const goal = e.result === 'goal';
    const xg = e.xg ?? 0;
    add(`pos|${p}`, goal, xg);
    add(`origin|${origin}`, goal, xg);
    add(`posOrigin|${p}|${origin}`, goal, xg);
    add(`posPlace|${p}|${place}`, goal, xg);
    add(`place|${place}`, goal, xg);
    add(`originPlace|${origin}|${place}`, goal, xg);
    add(`posOriginPlace|${p}|${origin}|${place}`, goal, xg);
    // T689 cv04-blk (→MATCH-35 r52): whether a defending outfielder stood between the shooter and
    // the goal's middle as the entry was traced — within BETWEEN.corridor m of that line and at
    // least BETWEEN.ahead m nearer the goal than the shooter (the narrowing's `corridor`/`ahead`).
    const split = between(e, at) ? 'between' : 'alone';
    add(`originPlaceBetween|${origin}|${place}|${split}`, goal, xg);
    add(`originPlaceSituation|${origin}|${place}|${split}|${situation(e, at)}`, goal, xg);
  });
}
const rows = [...cells.entries()].map(([key, a]) => ({ key, ...a, xg: +a.xg.toFixed(3) }));
const report = {
  kind: 't689-shot-origins',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  seeds,
  start,
  matches: played,
  rows,
};
if (out) writeFileSync(out, JSON.stringify(report) + '\n');
console.log(`done ${played} matches, ${rows.length} rows`);
