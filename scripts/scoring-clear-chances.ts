/**
 * T689 diagnostic (measurement only, no engine change, cv04-alt, →MATCH-16 r58, MATCH-30): every
 * clear-chance decision near goal on observed matches — a carrier deciding where MATCH-16's clear
 * chance holds as `takesClearChance` reads it (revision 7+: `clearChance` whoever chases him) in the
 * box or within `revision6.clear.shootFrom` m of the goal — with how the possession reached it and
 * what it became. Grid-bands pairs as `scoring-chased-shots.ts` (equal top-tier pairs of four worlds,
 * the four tactics rotated, both venues), observed; a candidate is applied through
 * `scoring-candidate-patch.ts`.
 *
 * The decision is read live: `Tracer.hold` runs right after `decide` and before the in-stride carry,
 * so the match state there is the one the carrier decided on (the tally's own state, as
 * `scoring-box-entries.ts` reads it). The action's trace entry is the next one the tracer pushes; a
 * delivery's first-time finish (no decision) is left out. At the decision: the keeper's narrowing
 * (`keeperNarrowing`), his metres off his line, cv04-cha's chased state (`chased`), the opposing
 * outfielders goal-side of the carrier (nearer the goal's middle) in all and within 4 and 8 m, the
 * deepest one's metres from the goal line, `actionMix`'s shares (the strike's share after the
 * clear-chance floor and any candidate's redistribution) and whether a square target stood free
 * (`squareTarget`; both copied here from cv04-cha's uncommitted experiment with its defaults, so this
 * script reads the released engine as well as a patched one). How the possession reached it: the regain's zone (`Tally.regain`, else a
 * restart), the seconds and completed passes since, a completed through ball in it, and its first
 * box entry (MATCH-13's, as `Tally.movement` counts it) by pass kind or carry with its start band and
 * whether it ended behind the deepest outfielder. What it became: the action (strike, take-on,
 * square, a pass into the box, a pass out of it, a carry, a delivery) and then the possession's
 * first shot — from the goal area, the rest of the box or outside, its xG and goal — or a loss to
 * the keeper or an outfielder, a restart, or nothing within 40 entries.
 *
 * Beside it, every shot (MATCH-30's big chances are those of xG ≥ 0.30) split by whether it was a
 * clear chance's strike, the first shot after a clear chance's alternative, or neither, and every
 * box entry split by whether a clear-chance decision followed it in the same possession.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-clear-chances.ts \
 *     --start 0 --matches 100 --seeds a,b --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { actionMix, clearChance, DECISION_CONFIG } from '../packages/engine/src/grid/decide';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame, goalDistance, inBox, type Point } from '../packages/engine/src/match/pitch';
import { Tally } from '../packages/engine/src/grid/record';
import { keeperNarrowing } from '../packages/engine/src/grid/resolve';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import { onPitch, type GridState } from '../packages/engine/src/grid/state';
import { computeTags } from '../packages/engine/src/grid/tags';
import { Tracer, type TraceEntry } from '../packages/engine/src/grid/trace';

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
const RESTARTS = new Set(['corner', 'freeKick', 'throwIn', 'goalKick', 'kickoff', 'penalty']);
const QUIET = new Set(['whistle', 'yellow', 'secondYellow', 'red', 'sub', 'injury']);
const OPEN = new Set([
  'pass',
  'carry',
  'takeOn',
  'shot',
  'cross',
  'cutBack',
  'holdUp',
  'clearance',
]);
/** An action's outcome that hands the ball to the man in `by` (a foul or the ball out does not). */
const LOST = new Set(['intercepted', 'tackled', 'loose']);
/** MATCH-30's big chance, as `Tally.shotDetail` counts it. */
const BIG = 0.3;
/** The narrowing below which cv04-clr's `c50` gives the shot way (its `clear.keeper`). */
const SHUT = 0.5;

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

const goalArea = (p: Point) => p[0] >= 99.5 && p[1] >= 24.84 && p[1] <= 43.16;
const placeOf = (p: Point) => (goalArea(p) ? 'goalArea' : inBox(p) ? 'box' : 'outside');
const band = (x: number, y: number) =>
  x >= 88.5 ? (y < 13.84 || y > 54.16 ? 'besideBox' : 'box') : x >= 70 ? 'frontOfBox' : 'deeper';
const lane = (y: number) =>
  y < 13.84 || y > 54.16 ? 'wide' : y < 24.84 || y > 43.16 ? 'half' : 'central';
const third = (x: number) => (x >= 70 ? 'final' : x >= 35 ? 'middle' : 'own');
const bucket = (n: number, edges: number[]) => {
  const i = edges.findIndex((e) => n < e);
  return i < 0
    ? `${edges[edges.length - 1]}+`
    : i === 0
      ? `<${edges[0]}`
      : `${edges[i - 1]}-${edges[i]}`;
};

/** A clear-chance decision near goal, read at `Tracer.hold`. */
interface Decision {
  at: number;
  side: 0 | 1;
  idx: number;
  position: string;
  place: string;
  dist: number;
  narrow: number;
  keeperOff: number;
  chase: string;
  goalSide: number;
  near4: number;
  near8: number;
  deepest: number;
  mix: Record<string, number>;
  square: number | undefined;
  since: number;
  possessionSince: number;
  regain: string;
}
/** A box entry as `Tally.movement` counts it. */
interface Entry {
  at: number;
  side: 0 | 1;
  how: string;
  from: Point;
  to: Point;
  behind: boolean;
  possessionSince: number;
}

type Hooked = Record<string, (...a: unknown[]) => unknown>;
let live: GridState | undefined;
let decisions: Decision[] = [];
let entries: Entry[] = [];
let regains: ({ at: Point; elapsed: number } | undefined)[] = [undefined, undefined];
let how = 'pass';
let traced: readonly TraceEntry[] | undefined;

const tallyProto = Tally.prototype as unknown as Hooked;
for (const name of Object.getOwnPropertyNames(Tally.prototype)) {
  const desc = Object.getOwnPropertyDescriptor(Tally.prototype, name);
  if (name === 'constructor' || !desc || typeof desc.value !== 'function') continue;
  const original = desc.value as (...a: unknown[]) => unknown;
  tallyProto[name] = function (this: Tally, ...a: unknown[]) {
    live = (this as unknown as { state?: GridState }).state ?? live;
    return original.apply(this, a);
  };
}
const regain = tallyProto.regain!;
tallyProto.regain = function (this: Tally, ...a: unknown[]) {
  const [side, , at] = a as [0 | 1, number, Point];
  const s = (this as unknown as { state?: GridState }).state;
  if (s) regains[side] = { at: [at[0], at[1]], elapsed: s.elapsed };
  return regain.apply(this, a);
};
for (const [name, label] of [
  ['carryEvent', 'carry'],
  ['passEvent', 'pass'],
  ['restartPass', 'restart'],
] as const) {
  const original = tallyProto[name]!;
  tallyProto[name] = function (this: Tally, ...a: unknown[]) {
    const kind = (a[2] as { kind?: string } | undefined)?.kind;
    how = label === 'pass' ? `pass-${kind ?? 'short'}` : label;
    try {
      return original.apply(this, a);
    } finally {
      how = 'pass';
    }
  };
}
const movement = tallyProto.movement!;
tallyProto.movement = function (this: Tally, ...a: unknown[]) {
  const [side, , from, to] = a as [0 | 1, number, Point, Point];
  const s = (this as unknown as { state?: GridState }).state;
  if (s && inBox(to) && !inBox(from)) {
    const foe = side === 0 ? 1 : 0;
    let deepest = -Infinity;
    for (const gp of s.players[foe])
      if (gp.onPitch && gp.slot > 0) deepest = Math.max(deepest, attackFrame(side, gp.pos)[0]);
    entries.push({
      at: traced?.length ?? -1,
      side,
      how,
      from: [from[0], from[1]],
      to: [to[0], to[1]],
      behind: to[0] > deepest,
      possessionSince: s.possessionSince,
    });
  }
  return movement.apply(this, a);
};

/** cv04-cha's `chased` defaults: a chaser within `reach` m, the keeper out beyond `out` m within `near` m, a square target `free` m clear. */
const CHASED = { reach: 4.6, out: 3, near: 8, free: 3 };
const isKeeper = (s: GridState, side: 0 | 1, slot: number) =>
  s.formation[side][slot]?.position === 'GK';

/** cv04-cha's `chasedState` (patch-only): `'out'`/`'set'` for a chased carrier at `c` (attack frame), else `'free'`. */
function chased(s: GridState, side: 0 | 1, c: Point): 'out' | 'set' | 'free' {
  const foe = side === 0 ? 1 : 0;
  let chaser = false,
    out = false;
  for (const opp of s.players[foe]) {
    if (!onPitch(opp)) continue;
    const o = attackFrame(side, opp.pos);
    const d = s.math.hypot(o[0] - c[0], o[1] - c[1]);
    if (isKeeper(s, foe, opp.slot)) {
      if (105 - o[0] > CHASED.out && d <= CHASED.near) out = true;
    } else if (d <= CHASED.reach) chaser = true;
  }
  return chaser ? (out ? 'out' : 'set') : 'free';
}

/**
 * cv04-cha's `squareTarget` (patch-only): the teammate of carrier `idx` at `c` in the box, 3–20 m
 * from him, `CHASED.free` m clear of every opponent with nobody within 1.5 m of the ball's line to
 * him and a clear chance where he stands; the nearest the goal, or undefined.
 */
function squareTarget(s: GridState, side: 0 | 1, idx: number, c: Point): number | undefined {
  const foe = side === 0 ? 1 : 0;
  const { hypot } = s.math;
  let best: number | undefined,
    bestGoal = Infinity;
  for (const mate of s.players[side]) {
    if (mate.idx === idx || !onPitch(mate) || isKeeper(s, side, mate.slot)) continue;
    const p = attackFrame(side, mate.pos);
    const len = hypot(p[0] - c[0], p[1] - c[1]);
    if (!inBox(p) || len < 3 || len > 20) continue;
    let open = true;
    for (const opp of s.players[foe]) {
      if (!onPitch(opp)) continue;
      const o = attackFrame(side, opp.pos);
      if (hypot(o[0] - p[0], o[1] - p[1]) < CHASED.free) {
        open = false;
        break;
      }
      const t = Math.min(
        1,
        Math.max(0, ((o[0] - c[0]) * (p[0] - c[0]) + (o[1] - c[1]) * (p[1] - c[1])) / (len * len)),
      );
      if (hypot(c[0] + (p[0] - c[0]) * t - o[0], c[1] + (p[1] - c[1]) * t - o[1]) < 1.5) {
        open = false;
        break;
      }
    }
    if (!open || !clearChance(s, side, p)) continue;
    const g = goalDistance(p, s.math);
    if (g < bestGoal) [best, bestGoal] = [mate.idx, g];
  }
  return best;
}

/** Reads the carrier's decision if it is a clear chance near goal. */
function inspect(s: GridState, at: number) {
  const [side, idx] = s.owner!;
  const me = s.players[side][idx];
  if (!me || !onPitch(me) || me.slot === 0) return;
  const position = s.formation[side][me.slot]?.position ?? '?';
  if (position === 'GK') return;
  const c = attackFrame(side, me.pos);
  const close =
    inBox(c) || goalDistance(c, s.math) <= DECISION_CONFIG.candidate.revision6.clear.shootFrom;
  if (!close || !clearChance(s, side, c)) return;
  const foe = side === 0 ? 1 : 0;
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp));
  const dist = Math.hypot(105 - c[0], 34 - c[1]);
  let goalSide = 0,
    near4 = 0,
    near8 = 0,
    deepest = -Infinity;
  for (const gp of s.players[foe]) {
    if (!onPitch(gp) || gp.slot === 0) continue;
    const o = attackFrame(side, gp.pos);
    deepest = Math.max(deepest, o[0]);
    if (Math.hypot(105 - o[0], 34 - o[1]) >= dist) continue;
    goalSide++;
    const d = Math.hypot(o[0] - c[0], o[1] - c[1]);
    if (d <= 4) near4++;
    if (d <= 8) near8++;
  }
  const mix = actionMix(s, side, idx, computeTags(s, side, idx));
  const r = regains[side];
  decisions.push({
    at,
    side,
    idx,
    position,
    place: placeOf(c),
    dist,
    narrow: keeper ? keeperNarrowing(s, side, c, keeper) : 1,
    keeperOff: keeper ? 105 - attackFrame(side, keeper.pos)[0] : 0,
    chase: chased(s, side, c),
    goalSide,
    near4,
    near8,
    deepest: 105 - deepest,
    mix: { ...mix },
    square: squareTarget(s, side, idx, c),
    since: s.elapsed - s.possessionSince,
    possessionSince: s.possessionSince,
    regain: r && Math.abs(r.elapsed - s.possessionSince) < 1e-6 ? third(r.at[0]) : 'restartOrLoose',
  });
}

const tracerProto = Tracer.prototype as unknown as Hooked;
const hold = tracerProto.hold!;
tracerProto.hold = function (this: Tracer, ...a: unknown[]) {
  traced = this.entries;
  if (live?.owner) inspect(live, this.entries.length);
  return hold.apply(this, a);
};

/** The possession's first shot from trace entry `at` on, or how it ended without one. */
function follow(trace: readonly TraceEntry[], at: number, side: 0 | 1) {
  const foe = side === 0 ? 1 : 0;
  let recycled = 0;
  for (let k = at; k < trace.length && k <= at + 40; k++) {
    const t = trace[k]!;
    if (QUIET.has(t.action) || t.idx < 0) continue;
    if (t.side !== side) return { end: RESTARTS.has(t.action) ? 'foeRestart' : 'loss', recycled };
    if (t.result !== undefined) {
      const p = attackFrame(side, t.shotAt ?? t.from ?? t.ball);
      return {
        end: `shot-${placeOf(p)}`,
        recycled,
        k,
        xg: t.xg ?? 0,
        goal: t.result === 'goal' ? 1 : 0,
        header: t.header ? 1 : 0,
      };
    }
    if (k > at && RESTARTS.has(t.action)) return { end: 'ownRestart', recycled };
    if (t.by && t.by[0] === foe && LOST.has(t.outcome))
      return { end: t.by[1] === t.slots[foe * 11] ? 'lossKeeper' : 'lossOutfield', recycled };
    if (k > at && t.outcome === 'complete' && t.to && !inBox(attackFrame(side, t.to))) recycled = 1;
  }
  return { end: 'none', recycled };
}

type Acc = Record<string, number>;
const rows = new Map<string, Acc>();
const add = (key: string, values: Record<string, number>) => {
  const a = rows.get(key) ?? { n: 0 };
  a.n!++;
  for (const [k, v] of Object.entries(values)) a[k] = (a[k] ?? 0) + v;
  rows.set(key, a);
};

let played = 0,
  shotsAll = 0,
  goalsAll = 0,
  finishes = 0,
  unmatched = 0;
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
  live = undefined;
  traced = undefined;
  decisions = [];
  entries = [];
  regains = [undefined, undefined];
  const trace: TraceEntry[] = playGrid(setup).trace ?? [];
  played++;
  // The shots that resolved a clear chance: its strike, or the first after its alternative.
  const shotFrom = new Map<number, string>();
  const valid: Decision[] = [];
  /** Clear-chance decisions a possession (side and start). */
  const chain = new Map<string, number>();
  for (const d of decisions) {
    const e = trace[d.at];
    if (!e || e.side !== d.side || e.idx !== d.idx || !OPEN.has(e.action)) {
      unmatched++;
      continue;
    }
    let p = d.at - 1;
    while (p >= 0 && (QUIET.has(trace[p]!.action) || trace[p]!.idx < 0)) p--;
    const prev = p >= 0 ? trace[p] : undefined;
    if (
      e.action === 'shot' &&
      prev &&
      prev.side === d.side &&
      (prev.action === 'cross' || prev.action === 'cutBack') &&
      prev.receiver === d.idx
    ) {
      finishes++;
      continue;
    }
    valid.push(d);
    const to = attackFrame(d.side, e.to ?? e.ball);
    const became =
      e.action === 'shot'
        ? 'strike'
        : e.action === 'pass'
          ? d.square !== undefined && e.receiver === d.square
            ? 'square'
            : inBox(to)
              ? 'passBox'
              : 'passOut'
          : e.action === 'cross' || e.action === 'cutBack'
            ? 'delivery'
            : e.action;
    const fl = follow(trace, d.at, d.side);
    if (fl.k !== undefined && !shotFrom.has(fl.k))
      shotFrom.set(fl.k, became === 'strike' ? 'clearStrike' : 'afterClearAlt');
    // How the possession reached it: passes since, a through ball, its first box entry.
    let passes = 0,
      through = 0;
    for (let k = d.at - 1; k >= 0; k--) {
      const t = trace[k]!;
      if (t.elapsed < d.possessionSince - 1e-6) break;
      if (QUIET.has(t.action) || t.idx < 0 || t.side !== d.side) continue;
      if (
        (t.action === 'pass' || t.action === 'cross' || t.action === 'cutBack') &&
        t.outcome === 'complete'
      ) {
        passes++;
        if (t.kind === 'through') through = 1;
      }
    }
    const entry = entries.find(
      (x) =>
        x.side === d.side && x.at < d.at && Math.abs(x.possessionSince - d.possessionSince) < 1e-6,
    );
    const entryHow = entry ? entry.how : 'none';
    const entryStart = entry
      ? `${band(entry.from[0], entry.from[1])}-${lane(entry.from[1])}`
      : 'none';
    const tactic = tactics[d.side];
    const shut = d.narrow < SHUT ? 'shut' : 'open';
    const values: Record<string, number> = {
      shot: fl.k !== undefined ? 1 : 0,
      goal: fl.goal ?? 0,
      xg: fl.xg ?? 0,
      big: (fl.xg ?? 0) >= BIG ? 1 : 0,
      bigGoal: (fl.xg ?? 0) >= BIG ? (fl.goal ?? 0) : 0,
      goalAreaShot: fl.end === 'shot-goalArea' ? 1 : 0,
      boxShot: fl.end === 'shot-box' ? 1 : 0,
      outsideShot: fl.end === 'shot-outside' ? 1 : 0,
      recycled: fl.recycled,
      mixShot: d.mix.shot ?? 0,
      mixTakeOn: d.mix.takeOn ?? 0,
      mixPass: d.mix.pass ?? 0,
      mixCarry: d.mix.carry ?? 0,
      narrow: d.narrow,
      keeperOff: d.keeperOff,
      dist: d.dist,
      goalSide: d.goalSide,
      near4: d.near4,
      near8: d.near8,
      deepest: d.deepest,
      since: d.since,
      passes,
      through,
      squareFree: d.square !== undefined ? 1 : 0,
      entryBehind: entry?.behind ? 1 : 0,
      st: d.position === 'ST' ? 1 : 0,
    };
    // The possession's first clear-chance decision: how often a possession reaches one, and how.
    const key = `${d.side}:${d.possessionSince}`;
    chain.set(key, (chain.get(key) ?? 0) + 1);
    if (chain.get(key) === 1) {
      add('first|all', values);
      add(`first|became|${became}`, values);
      add(`first|end|${fl.end}`, values);
      add(`first|regain|${d.regain}`, values);
      add(`first|since|${bucket(d.since, [4, 8, 15, 30])}`, values);
      add(`first|passes|${bucket(passes, [1, 2, 4, 7])}`, values);
      add(`first|through|${through}`, values);
      add(`first|entry|${entryHow}`, values);
      add(`first|entryStart|${entryStart}`, values);
      add(`first|entryBehind|${entry ? (entry.behind ? 'behind' : 'front') : 'none'}`, values);
      add(`first|chase|${d.chase}`, values);
      add(`first|shut|${shut}`, values);
      add(`first|place|${d.place}`, values);
      add(`first|position|${d.position}`, values);
      add(`first|tactic|${tactic}`, values);
      add(`first|against|${tactics[d.side === 0 ? 1 : 0]}`, values);
    }
    add('clear|all', values);
    add(`clear|became|${became}`, values);
    add(`clear|became|${became}|end|${fl.end}`, values);
    add(`clear|end|${fl.end}`, values);
    add(`clear|shut|${shut}`, values);
    add(`clear|shut|${shut}|became|${became}`, values);
    add(`clear|chase|${d.chase}`, values);
    add(`clear|chase|${d.chase}|became|${became}`, values);
    add(`clear|place|${d.place}`, values);
    add(`clear|place|${d.place}|became|${became}`, values);
    add(`clear|regain|${d.regain}`, values);
    add(`clear|since|${bucket(d.since, [4, 8, 15, 30])}`, values);
    add(`clear|passes|${bucket(passes, [1, 2, 4, 7])}`, values);
    add(`clear|through|${through}`, values);
    add(`clear|entry|${entryHow}`, values);
    add(`clear|entryStart|${entryStart}`, values);
    add(`clear|entryBehind|${entry ? (entry.behind ? 'behind' : 'front') : 'none'}`, values);
    add(`clear|goalSide|${bucket(d.goalSide, [1, 2, 3, 5])}`, values);
    add(`clear|near8|${bucket(d.near8, [1, 2, 3])}`, values);
    add(`clear|deepest|${bucket(d.deepest, [6, 12, 16.5, 25])}`, values);
    add(`clear|position|${d.position}`, values);
    add(`clear|tactic|${tactic}`, values);
    add(`clear|against|${tactics[d.side === 0 ? 1 : 0]}`, values);
  }
  for (const n of chain.values()) add(`chain|${bucket(n, [2, 3, 5])}`, { decisions: n });
  // Every shot, by whether it resolved a clear chance.
  trace.forEach((t, k) => {
    if (t.result === undefined) return;
    shotsAll++;
    goalsAll += t.result === 'goal' ? 1 : 0;
    const setPiece = RESTARTS.has(t.action) || t.kind === 'penalty';
    const p = attackFrame(t.side, t.shotAt ?? t.from ?? t.ball);
    const cls = setPiece ? 'setPiece' : (shotFrom.get(k) ?? 'other');
    const xg = t.xg ?? 0;
    const values = {
      goal: t.result === 'goal' ? 1 : 0,
      xg,
      big: xg >= BIG ? 1 : 0,
      bigGoal: xg >= BIG && t.result === 'goal' ? 1 : 0,
    };
    add(`shot|all`, values);
    add(`shot|${cls}`, values);
    add(`shot|${cls}|${placeOf(p)}`, values);
  });
  // Every box entry, by whether a clear-chance decision followed it in its possession.
  for (const x of entries) {
    const led = valid.some(
      (d) =>
        d.side === x.side && d.at > x.at && Math.abs(d.possessionSince - x.possessionSince) < 1e-6,
    );
    const fl = follow(trace, Math.max(0, x.at), x.side);
    const values = {
      shot: fl.k !== undefined ? 1 : 0,
      goal: fl.goal ?? 0,
      xg: fl.xg ?? 0,
      behind: x.behind ? 1 : 0,
    };
    const tag = led ? 'clear' : 'none';
    const startBand = `${band(x.from[0], x.from[1])}-${lane(x.from[1])}`;
    add(`entry|${tag}`, values);
    add(`entry|${tag}|how|${x.how}`, values);
    add(`entry|${tag}|start|${startBand}`, values);
    add(`entry|${tag}|behind|${x.behind}`, values);
    add(`entry|${tag}|end|${fl.end}`, values);
  }
}

const report = {
  kind: 't689-clear-chances',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  seeds,
  start,
  matches: played,
  shots: shotsAll,
  goals: goalsAll,
  finishes,
  unmatched,
  rows: [...rows.entries()].map(([key, a]) => ({
    key,
    ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, +v.toFixed(4)])),
  })),
};
if (out) writeFileSync(out, JSON.stringify(report) + '\n');
console.log(
  `done ${played} matches, ${shotsAll} shots, ${goalsAll} goals, ${finishes} first-time finishes left out, ${unmatched} unmatched holds`,
);
