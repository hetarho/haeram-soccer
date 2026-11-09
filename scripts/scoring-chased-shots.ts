/**
 * T689 diagnostic (measurement only, no engine change, cv04-sho, →MATCH-35 r54): the open-play
 * shots a carrier strikes himself (`shot` entries) from the box beyond the goal area with nobody
 * between him and the goal, split chased or not and keeper set or out as `scoring-shot-origins.ts`
 * reads them, and what their recorded xG is made of. Grid-bands pairs as that script (equal
 * top-tier pairs of four worlds, the four tactics rotated, both venues), observed; a candidate is
 * applied through `scoring-candidate-patch.ts`.
 *
 * Each shot's state is rebuilt from the trace: every slot where it stood as the shot was struck
 * (the entry's `kick` after an in-stride carry, else the previous entry's snapshot, where a shot
 * struck at once is resolved) and the clock for the in-match drain; the shot reads its pressure
 * there, as `play` does after the carry. On that state the engine's own functions give the factors: the
 * place curve before pressure (`chanceXg`), the pressure factor, the keeper's narrowing
 * (`keeperNarrowing`), the closing and path blocks' unblocked shares (`closingBlockers`,
 * `shotBlockers`, `unblocked`) and the match's level factor (`shotContext`). Their product is
 * checked against the recorded xG (`match` counts shots within 1%); a rebuilt shot that misses
 * it still counts, read with that caveat. Beside each shot: its distance and angle to the goal's
 * middle, its MATCH-14 cell with SB16's goal per shot there (`baselines.json`), the nearest
 * defending outfielder's distance and where he stands against the ball along the shot's line
 * (`behind` more than `STRIDE` m nearer his own end than the ball, `goalSide` more than `STRIDE`
 * m nearer the goal, `level` between), and every closing blocker's class with his chance and
 * whether he was the one who blocked it.
 *
 * cv04-own adds `own|…` rows (`ownCarryRows`), the earlier rows unchanged: the same box's shots
 * after the shooter's own carry with or without a defender between, the chance the decision read
 * beside the recorded one, the metres carried after it and the free teammates it passed up.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-chased-shots.ts \
 *     --start 0 --matches 100 --seeds a,b --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { clearChance } from '../packages/engine/src/grid/decide';
import { CELL_BASELINES } from '../packages/engine/src/grid/baselines';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame, cellKey, cellOf, type Point } from '../packages/engine/src/grid/pitch';
import {
  chanceXg,
  closingBlockers,
  keeperNarrowing,
  SHOT_CONFIG,
  shotBlockers,
  shotContext,
  unblocked,
} from '../packages/engine/src/grid/resolve';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import {
  createState,
  enterSlot,
  onPitch,
  type GridPlayer,
  type GridState,
} from '../packages/engine/src/grid/state';
import { computeTags } from '../packages/engine/src/grid/tags';
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
/** `--debug`: print each rebuilt shot that misses its recorded xG. */
const debug = args.includes('--debug');
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

/** As `scoring-shot-origins.ts`: the narrowing's corridor and `ahead`, the keeper out past 3 m, a chaser within 4.6 m. */
const BETWEEN = { corridor: 6, ahead: 3 };
const KEEPER_OUT = 3;
const CHASE = 4.6;
/** Half a stride along the shot's line either side of the ball: within it a man stands level. */
const STRIDE = 0.75;
const GOAL: Point = [105, 34];
const RESTARTS = new Set(['corner', 'freeKick', 'throwIn', 'goalKick', 'kickoff', 'penalty']);

type Acc = Record<string, number>;
const rows = new Map<string, Acc>();
const add = (key: string, values: Record<string, number>) => {
  const a = rows.get(key) ?? { n: 0 };
  a.n!++;
  for (const [k, v] of Object.entries(values)) a[k] = (a[k] ?? 0) + v;
  rows.set(key, a);
};

/** Puts every slot of `positions`/`slots` (a trace entry's or kick's layout) on the rebuilt state. */
function place(
  s: GridState,
  layout: Pick<TraceEntry, 'positions' | 'slots'>,
  elapsed: number,
  ball: readonly [number, number],
  onAt: Map<string, number>,
) {
  s.elapsed = elapsed;
  s.ball = [ball[0], ball[1]];
  for (const side of [0, 1] as const)
    for (const gp of s.players[side]) {
      let k = -1;
      for (let slot = 0; slot < 11; slot++) if (layout.slots[side * 11 + slot] === gp.idx) k = slot;
      gp.sentOff = false;
      if (k < 0 || Number.isNaN(layout.positions[(side * 11 + k) * 2]!)) {
        gp.onPitch = false;
        continue;
      }
      if (gp.slot !== k) enterSlot(s, gp, k);
      gp.onPitch = true;
      gp.onAt = onAt.get(`${side}:${gp.idx}`) ?? 0;
      gp.pos = [layout.positions[(side * 11 + k) * 2]!, layout.positions[(side * 11 + k) * 2 + 1]!];
    }
}

/** cv04-own: a teammate at least this far up (attack frame) stands in the box or at its edge. */
const EDGE = 83;
/** cv04-own: as `Perf`'s entry `reach`, a defender goal-side within it leaves a teammate no chance. */
const OWN_REACH = 8;

/**
 * cv04-own (→MATCH-16 r56): a box shot beyond the goal area after the shooter's own carry, split by
 * whether a defender stood between as it was struck. Beside its recorded xG and factors (the state
 * as struck, already placed on `s`): the chance the decision read where he decided — the previous
 * entry's layout, after the carry — as `actionMix`'s in-box term does (`chanceXg` with the pressure
 * there × the path's unblocked share, temperature 1), the metres he carried after that decision
 * (to the kick of an in-stride carry, else 0) and what it passed up: teammates in the box or at its
 * edge with no defender goal-side within `OWN_REACH` m, and the best `chanceXg` at one of them.
 * Leaves `s` placed as struck again.
 */
function ownCarryRows(
  s: GridState,
  e: TraceEntry,
  prev: TraceEntry,
  group: 'between' | 'alone',
  struck: { from: Point; pressure: number; keeper: GridPlayer; onAt: Map<string, number> },
) {
  const { from, pressure, keeper, onAt } = struck;
  const foe = (1 - e.side) as 0 | 1;
  const placeXg = chanceXg(from, { pressure: 0, candidate: true }, s.math);
  const pf = Math.max(SHOT_CONFIG.pressureFloor, 1 - SHOT_CONFIG.pressure * pressure);
  const narrow = keeperNarrowing(s, e.side, from, keeper);
  const path = shotBlockers(s, e.side, from, false);
  const uClose = unblocked(closingBlockers(s, e.side, from, path));
  const uPath = unblocked(path);
  const level = shotContext(s).levelFactor;
  // Where he decided: the carry's end.
  place(s, prev, prev.elapsed, prev.ball, onAt);
  const me = s.players[e.side][e.idx]!;
  const c = attackFrame(e.side, me.pos);
  const decPressure = computeTags(s, e.side, e.idx).pressure;
  const decPath = unblocked(shotBlockers(s, e.side, c, false));
  const decision = chanceXg(c, { pressure: decPressure, candidate: true }, s.math) * decPath;
  const decNarrow = keeperNarrowing(s, e.side, c, keeper);
  const decClose = unblocked(closingBlockers(s, e.side, c, shotBlockers(s, e.side, c, false)));
  // The chance as it would be recorded from there, and whether MATCH-16's clear chance (whose shot
  // floor the in-box weight does not reach) held where he decided.
  const decRecorded = decision * decNarrow * decClose;
  const clear = clearChance(s, e.side, c);
  let free = 0,
    alt = 0;
  for (const gp of s.players[e.side]) {
    if (gp.idx === e.idx || !onPitch(gp) || gp.slot === 0) continue;
    const p = attackFrame(e.side, gp.pos);
    if (p[0] < EDGE || p[1] < 13.84 - 5.5 || p[1] > 54.16 + 5.5) continue;
    const d = Math.hypot(GOAL[0] - p[0], GOAL[1] - p[1]);
    let marked = false;
    for (const o of s.players[foe]) {
      if (!onPitch(o) || o.slot === 0) continue;
      const q = attackFrame(e.side, o.pos);
      if (
        Math.hypot(q[0] - p[0], q[1] - p[1]) <= OWN_REACH &&
        Math.hypot(GOAL[0] - q[0], GOAL[1] - q[1]) < d
      )
        marked = true;
    }
    if (marked) continue;
    free++;
    alt = Math.max(alt, chanceXg(p, { candidate: true }, s.math));
  }
  const carried = e.kick ? Math.hypot(from[0] - c[0], from[1] - c[1]) : 0;
  const values = {
    goals: e.result === 'goal' ? 1 : 0,
    xg: e.xg ?? 0,
    place: placeXg,
    pressureFactor: pf,
    narrow,
    unblockedClose: uClose,
    unblockedPath: uPath,
    level,
    decision,
    decisionPressure: decPressure,
    decisionPath: decPath,
    decisionNarrow: decNarrow,
    decisionClose: decClose,
    kick: e.kick ? 1 : 0,
    carried,
    freeMates: free,
    withFree: free > 0 ? 1 : 0,
    alt,
    altBetter: alt > decision ? 1 : 0,
    decisionRecorded: decRecorded,
    altBetterRecorded: alt > decRecorded ? 1 : 0,
    clear: clear ? 1 : 0,
  };
  add(`own|${group}`, values);
  add(`own|${group}|${e.kick ? 'stride' : 'still'}`, values);
  add(`own|${group}|${alt > decision ? 'altBetter' : 'shotBetter'}`, values);
  add(`own|${group}|${clear ? 'clear' : 'notClear'}`, values);
  add('own|any', values);
  place(s, e.kick ?? prev, e.kick ? e.kick.elapsed : prev.elapsed, prev.ball, onAt);
}

let played = 0,
  rebuilt = 0,
  matched = 0;
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
  const trace: TraceEntry[] = playGrid(setup).trace ?? [];
  played++;
  const s = createState(setup);
  const ctx = shotContext(s);
  // When each player first stood in a slot: his minutes for the drain.
  const onAt = new Map<string, number>();
  let setPieceUntil = -1;
  trace.forEach((e, k) => {
    for (let slot = 0; slot < 22; slot++) {
      const idx = e.slots[slot]!;
      const key = `${slot < 11 ? 0 : 1}:${idx}`;
      if (idx >= 0 && !onAt.has(key)) onAt.set(key, k === 0 ? 0 : e.elapsed);
    }
    if (e.action === 'corner' || e.action === 'freeKick') setPieceUntil = k + 3;
    // Open-play passes the opposing keeper won (→MATCH-31, MATCH-35 r55's race for a ball in
    // behind), beside the through balls and how many of them were completed into the box.
    if (e.action === 'pass') {
      const foeSide = (1 - e.side) as 0 | 1;
      const gk = e.slots[foeSide * 11];
      const keeperWon = e.by !== undefined && e.by[0] === foeSide && e.by[1] === gk ? 1 : 0;
      const end = attackFrame(e.side, e.to ?? e.ball);
      const complete = e.outcome === 'complete' ? 1 : 0;
      const intoBox = complete && end[0] >= 88.5 && end[1] >= 13.84 && end[1] <= 54.16 ? 1 : 0;
      add(`keeper|${e.kind === 'through' ? 'through' : 'other'}`, {
        passes: 1,
        complete,
        intoBox,
        keeperWon,
      });
    }
    if (e.action !== 'shot' || e.result === undefined || e.header || !e.from) return;
    if (k <= setPieceUntil || e.kind === 'penalty' || RESTARTS.has(e.action)) return;
    const prev = trace[k - 1];
    if (!prev) return;
    // The box beyond the goal area, as `scoring-shot-origins.ts` places a shot.
    const at = attackFrame(e.side, e.from);
    const inBox = at[0] >= 88.5 && at[1] >= 13.84 && at[1] <= 54.16;
    const goalArea = at[0] >= 99.5 && at[1] >= 24.84 && at[1] <= 43.16;
    if (!inBox || goalArea) return;
    const foe = (1 - e.side) as 0 | 1;
    // The shot as struck; its pressure is read there too (`play`'s tags, after the carry).
    place(s, e.kick ?? prev, e.kick ? e.kick.elapsed : prev.elapsed, prev.ball, onAt);
    const me = s.players[e.side][e.idx]!;
    if (!onPitch(me)) return;
    const pressure = computeTags(s, e.side, e.idx).pressure;
    const from = attackFrame(e.side, me.pos);
    const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[foe][0]!;
    const kp = attackFrame(e.side, keeper.pos);
    const keeperState = 105 - kp[0] > KEEPER_OUT ? 'keeperOut' : 'keeperSet';
    // Between, chaser and his place along the shot's line, as the shot was struck.
    const [dx, dy] = [GOAL[0] - from[0], GOAL[1] - from[1]];
    const len = Math.hypot(dx, dy);
    let between = false,
      chaser: { d: number; along: number } | undefined;
    const classOf = (along: number) =>
      along < -STRIDE ? 'behind' : along > STRIDE ? 'goalSide' : 'level';
    for (const gp of s.players[foe]) {
      if (!onPitch(gp) || gp.slot === 0) continue;
      const o = attackFrame(e.side, gp.pos);
      const along = len > 0 ? ((o[0] - from[0]) * dx + (o[1] - from[1]) * dy) / len : 0;
      const d = Math.hypot(o[0] - from[0], o[1] - from[1]);
      if (o[0] >= from[0] + BETWEEN.ahead && len > 0) {
        const t = Math.max(0, Math.min(1, along / len));
        if (Math.hypot(o[0] - (from[0] + t * dx), o[1] - (from[1] + t * dy)) <= BETWEEN.corridor)
          between = true;
      }
      if (d <= CHASE && (!chaser || d < chaser.d)) chaser = { d, along };
    }
    if (prev.side === e.side && prev.idx === e.idx && prev.action === 'carry')
      ownCarryRows(s, e, prev, between ? 'between' : 'alone', { from, pressure, keeper, onAt });
    if (between) return;
    const chased = chaser ? 'chased' : 'free';
    // The factors.
    const placeXg = chanceXg(from, { pressure: 0, candidate: true }, s.math);
    const pf = Math.max(SHOT_CONFIG.pressureFloor, 1 - SHOT_CONFIG.pressure * pressure);
    const narrow = keeperNarrowing(s, e.side, from, keeper);
    const path = shotBlockers(s, e.side, from, false);
    const closers = closingBlockers(s, e.side, from, path);
    const uClose = unblocked(closers);
    const uPath = unblocked(path);
    const rec = Math.min(
      SHOT_CONFIG.maxXg,
      placeXg * pf * narrow * uClose * uPath * ctx.levelFactor,
    );
    rebuilt++;
    const ok = Math.abs(rec - (e.xg ?? 0)) <= 0.01 * Math.max(rec, e.xg ?? 0) + 1e-6;
    if (ok) matched++;
    else if (debug)
      console.log(
        JSON.stringify({
          i,
          k,
          prev: `${prev.action}:${prev.outcome}:${prev.side === e.side ? 'own' : 'opp'}`,
          kick: !!e.kick,
          xg: e.xg,
          rec: +rec.toFixed(4),
          placeXg: +placeXg.toFixed(4),
          pressure,
          narrow: +narrow.toFixed(4),
          uClose: +uClose.toFixed(4),
          uPath: +uPath.toFixed(4),
        }),
      );
    const cell = cellOf(from);
    const sb = CELL_BASELINES[cell]?.goalPerShot ?? 0;
    const angle = Math.abs(Math.atan2(GOAL[1] - from[1], GOAL[0] - from[0])) * (180 / Math.PI);
    const goal = e.result === 'goal' ? 1 : 0;
    const blocked = e.result === 'block' ? 1 : 0;
    const byIdx = e.by?.[1];
    const closeBy = closers.some((b) => b.gp.idx === byIdx) ? blocked : 0;
    const pathBy = path.some((b) => b.gp.idx === byIdx) ? blocked : 0;
    const values: Record<string, number> = {
      goals: goal,
      xg: e.xg ?? 0,
      rebuilt: rec,
      match: ok ? 1 : 0,
      place: placeXg,
      pressure,
      pressureFactor: pf,
      narrow,
      unblockedClose: uClose,
      unblockedPath: uPath,
      level: ctx.levelFactor,
      dist: len,
      angle,
      sb16: sb,
      blocked,
      blockedClose: closeBy,
      blockedPath: pathBy,
      closers: closers.length,
      pathMen: path.length,
      keeperOff: 105 - kp[0],
    };
    const group = `${chased}|${keeperState}`;
    // The keeper as the shot's entry was traced (after the action), as `scoring-shot-origins.ts`
    // reads him, beside where he stood at the kick.
    const entryKeeper = attackFrame(e.side, [e.positions[foe * 22]!, e.positions[foe * 22 + 1]!]);
    const entryState = 105 - entryKeeper[0] > KEEPER_OUT ? 'keeperOut' : 'keeperSet';
    add(`entry|${group}|${entryState}`, { goals: goal, xg: e.xg ?? 0 });
    // Where the chance came from, as `scoring-shot-origins.ts` names a shot's origin.
    const before = k >= 2 ? trace[k - 2] : undefined;
    let origin: string;
    if (prev.side === e.side && prev.result !== undefined) origin = 'rebound';
    else if (prev.side === e.side && prev.receiver === e.idx)
      origin = prev.kind === 'through' ? 'through' : `pass-${prev.action}`;
    else if (prev.side === e.side && prev.idx === e.idx)
      origin =
        before && before.side === e.side && before.receiver === e.idx && before.kind === 'through'
          ? `self-${prev.action}-after-through`
          : `self-${prev.action}`;
    else if (prev.side !== e.side) origin = `opp-${prev.action}`;
    else origin = 'other';
    add(`origin|${group}|${origin}`, {
      goals: goal,
      xg: e.xg ?? 0,
      dist: len,
      keeperOff: 105 - kp[0],
    });
    add(`all|${group}`, values);
    add(`all|any`, values);
    add(`cell|${group}|${cellKey(cell)}`, { goals: goal, xg: e.xg ?? 0, sb16: sb, dist: len });
    if (chaser) {
      const cls = classOf(chaser.along);
      add(`chaser|${group}|${cls}`, { ...values, chaserDist: chaser.d, chaserAlong: chaser.along });
    }
    // Each closing blocker by where he stood against the ball, his chance and whether he blocked it.
    for (const b of closers) {
      const o = attackFrame(e.side, b.gp.pos);
      const along = len > 0 ? ((o[0] - from[0]) * dx + (o[1] - from[1]) * dy) / len : 0;
      const d = Math.hypot(o[0] - from[0], o[1] - from[1]);
      add(`closer|${group}|${classOf(along)}`, {
        chance: b.chance,
        d,
        blocked: blocked && b.gp.idx === byIdx ? 1 : 0,
        touch: d <= 1.2 ? 1 : 0,
      });
    }
  });
}

const report = {
  kind: 't689-chased-shots',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  seeds,
  start,
  matches: played,
  rebuilt,
  matched,
  rows: [...rows.entries()].map(([key, a]) => ({
    key,
    ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, +v.toFixed(4)])),
  })),
};
if (out) writeFileSync(out, JSON.stringify(report) + '\n');
console.log(
  `done ${played} matches, ${rebuilt} shots rebuilt, ${matched} within 1% of recorded xG`,
);
