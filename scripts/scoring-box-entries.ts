/**
 * T689 diagnostic (measurement only, no engine change): every box entry on observed matches —
 * MATCH-13's box entry exactly as `grid/record.ts` counts it (a completed pass or carry that ends in
 * the box from outside it, read where the tally counts it) — with how it was made (carry, or the
 * pass's kind), where it started, whether it ends in front of or behind the defending side's
 * deepest outfielder, the defenders goal-side of the ball and in the box, the back line's depth and
 * what follows in the possession (a shot and its xG, a loss, a recycle out of the box, an own
 * restart). Grid-bands pairs as `scoring-shot-origins.ts` (equal top-tier pairs of four worlds, the
 * four tactics rotated by override, both venues), observed: MATCH-7 plays the same result path. A
 * candidate is applied through `scoring-candidate-patch.ts`.
 *
 * The tally's `movement` is wrapped to read the match state at the entry; the trace entry of the
 * action under way (`Tracer.hold` starts it) is where the follow-up scan begins.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-box-entries.ts \
 *     --start 0 --matches 100 --seeds a,b --out FILE
 */
import { writeFileSync } from 'node:fs';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Club, Fixture, Tactic, World } from '../packages/contracts/src/types';
import { rating } from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { playGrid } from '../packages/engine/src/grid/engine';
import { attackFrame, inBox, type Point } from '../packages/engine/src/grid/pitch';
import { Tally } from '../packages/engine/src/grid/record';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import type { GridState } from '../packages/engine/src/grid/state';
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
const BACK = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB']);
const RESTARTS = new Set(['corner', 'freeKick', 'throwIn', 'goalKick', 'kickoff', 'penalty']);
const QUIET = new Set(['whistle', 'yellow', 'secondYellow', 'red', 'sub', 'injury']);

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

/** One box entry as the tally counts it, with the match state read at that moment. */
interface Entry {
  side: 0 | 1;
  idx: number;
  /** Index of the trace entry of the action under way. */
  at: number;
  how: string;
  from: Point;
  to: Point;
  behind: boolean;
  goalSide: number;
  defInBox: number;
  attInBox: number;
  backDepth: number;
  deepest: number;
  since: number;
}

/** The entries of the match's tracer, read at each action's start (`Tracer.hold`). */
let traced: readonly TraceEntry[] | undefined;
let how = 'pass';
let found: Entry[] = [];
type Hooked = Record<string, (...a: unknown[]) => unknown>;
const tracerProto = Tracer.prototype as unknown as Hooked;
const hold = tracerProto.hold!;
tracerProto.hold = function (this: Tracer, ...a: unknown[]) {
  traced = this.entries;
  return hold.apply(this, a);
};
const tallyProto = Tally.prototype as unknown as Hooked;
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
  const [side, idx, from, to] = a as [0 | 1, number, Point, Point];
  const s = (this as unknown as { state?: GridState }).state;
  if (s && inBox(to) && !inBox(from)) {
    const foe = side === 0 ? 1 : 0;
    const outfield = s.players[foe].filter((gp) => gp.onPitch && gp.slot > 0);
    const xs = outfield.map((gp) => attackFrame(side, gp.pos));
    const deepest = Math.max(...xs.map((p) => p[0]));
    const back = outfield
      .filter((gp) => BACK.has(s.formation[foe][gp.slot]?.position ?? ''))
      .map((gp) => attackFrame(side, gp.pos)[0]);
    const mates = s.players[side].filter((gp) => gp.onPitch && gp.slot > 0);
    found.push({
      side,
      idx,
      at: traced?.length ?? -1,
      how,
      from: [from[0], from[1]],
      to: [to[0], to[1]],
      behind: to[0] > deepest,
      goalSide: xs.filter((p) => p[0] > to[0]).length,
      defInBox: xs.filter((p) => inBox(p)).length,
      attInBox: mates.filter((gp) => inBox(attackFrame(side, gp.pos))).length,
      backDepth: back.length ? 105 - back.reduce((x, y) => x + y, 0) / back.length : NaN,
      deepest: 105 - deepest,
      since: s.elapsed - s.possessionSince,
    });
  }
  return movement.apply(this, a);
};

const band = (x: number, y: number) =>
  x >= 88.5 ? (y < 13.84 || y > 54.16 ? 'besideBox' : 'box') : x >= 70 ? 'frontOfBox' : 'deeper';
const lane = (y: number) =>
  y < 13.84 || y > 54.16 ? 'wide' : y < 24.84 || y > 43.16 ? 'half' : 'central';
const bucket = (n: number, edges: number[]) => {
  const i = edges.findIndex((e) => n < e);
  return i < 0
    ? `${edges[edges.length - 1]}+`
    : i === 0
      ? `<${edges[0]}`
      : `${edges[i - 1]}-${edges[i]}`;
};

/** What follows the entry in the possession, from the trace entry of its action on. */
function follow(trace: TraceEntry[], e: Entry) {
  let shot = false;
  let goal = false;
  let xg = 0;
  let first = '';
  for (let k = Math.max(0, e.at); k < trace.length; k++) {
    const t = trace[k]!;
    if (QUIET.has(t.action) || t.idx < 0) continue;
    if (t.side !== e.side) {
      first ||= RESTARTS.has(t.action) ? `foeRestart-${t.action}` : 'loss';
      break;
    }
    if (t.result !== undefined) {
      shot = true;
      goal ||= t.result === 'goal';
      xg += t.xg ?? 0;
      first ||= 'shot';
      continue;
    }
    if (k > e.at && RESTARTS.has(t.action)) {
      first ||= `ownRestart-${t.action}`;
      continue;
    }
    if (k > e.at && t.outcome === 'complete' && t.to && !inBox(attackFrame(e.side, t.to)))
      first ||= 'recycle';
    if (k > e.at + 40) break;
  }
  return { shot, goal, xg, first: first || 'other' };
}

type Acc = { n: number; shot: number; goal: number; xg: number };
const cells = new Map<string, Acc>();
const add = (key: string, f: ReturnType<typeof follow>) => {
  const a = cells.get(key) ?? { n: 0, shot: 0, goal: 0, xg: 0 };
  a.n++;
  a.shot += f.shot ? 1 : 0;
  a.goal += f.goal ? 1 : 0;
  a.xg += f.xg;
  cells.set(key, a);
};
let played = 0;
let possessionsWithEntry = 0;
let goalsAll = 0;
let shotsAll = 0;
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
  found = [];
  traced = undefined;
  const trace: TraceEntry[] = playGrid(setup).trace ?? [];
  played++;
  for (const t of trace)
    if (t.result !== undefined) {
      shotsAll++;
      goalsAll += t.result === 'goal' ? 1 : 0;
    }
  // Entries of one possession: consecutive entries of a side with no foe action between them.
  let lastSide = -1;
  let lastAt = -1;
  for (const e of found) {
    let same = e.side === lastSide;
    if (same)
      for (let k = Math.max(0, lastAt); k < e.at && same; k++) {
        const t = trace[k]!;
        if (!QUIET.has(t.action) && t.idx >= 0 && t.side !== e.side) same = false;
      }
    if (!same) possessionsWithEntry++;
    lastSide = e.side;
    lastAt = e.at;
    const fl = follow(trace, e);
    const tac = tactics[e.side];
    const foeTac = tactics[e.side === 0 ? 1 : 0];
    const start = `${band(e.from[0], e.from[1])}-${lane(e.from[1])}`;
    const end = e.to[0] >= 99.5 && e.to[1] >= 24.84 && e.to[1] <= 43.16 ? 'goalArea' : 'box';
    const gs = bucket(e.goalSide, [2, 4, 6, 8]);
    const depth = bucket(e.backDepth, [12, 16.5, 20, 25, 30]);
    const pace = bucket(e.since, [8, 15, 30]);
    add('all', fl);
    add(`how|${e.how}`, fl);
    add(`start|${start}`, fl);
    add(`end|${end}`, fl);
    add(`behind|${e.behind}`, fl);
    add(`goalSide|${gs}`, fl);
    add(`defInBox|${bucket(e.defInBox, [2, 4, 6])}`, fl);
    add(`attInBox|${bucket(e.attInBox, [1, 2, 3, 4])}`, fl);
    add(`backDepth|${depth}`, fl);
    add(`since|${pace}`, fl);
    add(`first|${fl.first}`, fl);
    add(`tactic|${tac}`, fl);
    add(`against|${foeTac}`, fl);
    add(`howStart|${e.how}|${start}`, fl);
    add(`howBehind|${e.how}|${e.behind}`, fl);
    add(`howFirst|${e.how}|${fl.first}`, fl);
    add(`startBehind|${start}|${e.behind}`, fl);
    add(`behindGoalSide|${e.behind}|${gs}`, fl);
    add(`depthBehind|${depth}|${e.behind}`, fl);
    add(`againstDepth|${foeTac}|${depth}`, fl);
  }
}
const rows = [...cells.entries()].map(([key, a]) => ({ key, ...a, xg: +a.xg.toFixed(3) }));
const report = {
  kind: 't689-box-entries',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  seeds,
  start,
  matches: played,
  shots: shotsAll,
  goals: goalsAll,
  possessionsWithEntry,
  rows,
};
if (out) writeFileSync(out, JSON.stringify(report) + '\n');
console.log(`done ${played} matches, ${rows.length} rows`);
