/**
 * T840 (measurement only): the released model's first full read (→MATCH-2/16/23/28/38/39, ARCH-31).
 *
 *   curve  — (a) the own club's outcome shares, goals and per-side MATCH-23 team rows over own
 *            league fixtures, beside the same reads of clubs nobody owns in the same league at the
 *            same prepared gaps (`own-edge-probe`'s gap: prepareMatch strength before form, the
 *            diminishing returns undone), each own sample compared with the reference mean of
 *            its gap bucket; MATCH-28's margins and 95% intervals.
 *   stage  — (c)/(d) own matches over the ten tactic pairings in 1975 and 2024, each played as
 *            `candidateMatch` plays an observed own fixture (aggregate path with the attribution
 *            trace, detail, script, validation, staging): the script's invention, the sequence
 *            rows MATCH-23 reads on scripts, the 31 picture metrics, the fit lines, the clock
 *            rates between fixed moments and the attribution's metres from place.
 *   sum    — pools `stage` outputs into one table.
 *
 * A takeover of the median-rated English top-flight club (`historyWorld` + `takeOver`, as
 * `careerWorld`), never settled; seed i sets `w.seed = <seed>:probe<i>` as `own-edge-probe` does.
 *
 *   pnpm exec tsx scripts/model-verdict.ts curve --year 2024 --seeds 16 --ref-seeds 4 --out F
 *   pnpm exec tsx scripts/model-verdict.ts stage --set all|tune|held [--only 0,1] --out F
 *   pnpm exec tsx scripts/model-verdict.ts sum F1 F2 … --out F
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { TD } from '../packages/contracts/src/detail';
import { activeMatchModel } from '../packages/contracts/src/match-model';
import type { MatchScript, ScriptBeat } from '../packages/contracts/src/match-script';
import type { Fixture, MatchRecord, Tactic, World } from '../packages/contracts/src/types';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from '../packages/engine/src/aggregate/config';
import {
  aggregateRecord,
  matchdayRosters,
  playAggregate,
  simulateAggregate,
} from '../packages/engine/src/aggregate/engine';
import { isPassKind } from '../packages/engine/src/aggregate/ledger';
import { opposingCell, placeDistance } from '../packages/engine/src/aggregate/place';
import type { AggregateAttributionTrace } from '../packages/engine/src/aggregate/types';
import { careerFunds } from '../packages/engine/src/career.testkit';
import { M } from '../packages/engine/src/grid/record';
import { eraRules } from '../packages/engine/src/grid/setup';
import { historyWorld } from '../packages/engine/src/history';
import { clubManager } from '../packages/engine/src/managerMarket';
import { matchForm, prepareMatch, simulateMatch } from '../packages/engine/src/match';
import { MATCH_MODEL_RELEASE } from '../packages/engine/src/match-model-release';
import { effectiveGap } from '../packages/engine/src/match-rules';
import { matchDetail } from '../packages/engine/src/script/build';
import { compareRecord, countScript, scriptCost } from '../packages/engine/src/script/count';
import { stagingSides } from '../packages/engine/src/script/playback';
import { validateScript } from '../packages/engine/src/script/validate';
import { writeScript } from '../packages/engine/src/script/write';
import { STAGING_CONFIG } from '../packages/engine/src/staging/config';
import { clockRates } from '../packages/engine/src/staging/frames';
import { fitLines, stagingMetrics } from '../packages/engine/src/staging/measure';
import { advance, createStaging } from '../packages/engine/src/staging/staging';
import { takeOver } from '../packages/engine/src/takeover';
import { npcTactic } from '../packages/engine/src/tactics';
import { findClub, rating } from '../packages/engine/src/world';
import { gapBucket } from './lib/match-parity';

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1]!;
};
const OUT = opt('out', '');
const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const r2 = (x: number) => Math.round(100 * x) / 100;
const r3 = (x: number) => Math.round(1000 * x) / 1000;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sdOf = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)]! : (s[m - 1]! + s[m]!) / 2;
};

/** The median-rated top-flight club of `country` in a fresh world, taken over as a career does. */
function verdictWorld(seed: string, year: number): World {
  const w = historyWorld(seed, MATCH_MODEL_RELEASE, year);
  const top = w.clubs
    .filter((c) => c.country === 'ENG' && c.tier === 0)
    .map((c) => ({ c, r: rating(w, c) }))
    .sort((a, b) => a.r - b.r || a.c.id.localeCompare(b.c.id));
  takeOver(w, top[Math.floor(top.length / 2)]!.c.id, { tier: 'oil', traits: [] }, undefined);
  w.cash = careerFunds(w).toString();
  return w;
}

function withSeed<T>(w: World, seed: number, run: () => T): T {
  const saved = w.seed;
  try {
    w.seed = `${saved}:probe${seed}`;
    return run();
  } finally {
    w.seed = saved;
  }
}

function rawGap(effective: number) {
  let lo = -400,
    hi = 400;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (effectiveGap(mid) < effective) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Home-minus-away prepared strength before the day's form, on the target's raw-gap axis. */
function preparedGap(w: World, f: Fixture) {
  const { strength } = prepareMatch(w, f);
  const form = matchForm(w, f);
  return rawGap(strength[0]! - form[0] - (strength[1]! - form[1]));
}

/** One side's per-match rows (MATCH-23 per team; ratios kept as numerator/denominator). */
function sideRow(r: MatchRecord, side: 0 | 1) {
  const m = r.metrics[side]!,
    o = r.metrics[1 - side]!,
    d = r.detail?.[side] ?? [];
  const us = side === 0 ? r.score.home : r.score.away,
    them = side === 0 ? r.score.away : r.score.home;
  return {
    win: us > them ? 1 : 0,
    draw: us === them ? 1 : 0,
    loss: us < them ? 1 : 0,
    points: us > them ? 3 : us === them ? 1 : 0,
    goalsFor: us,
    goalsAgainst: them,
    shots: m[M.shots]!,
    onTarget: m[M.onTarget]!,
    xg: r.xg?.[side] ?? 0,
    passes: m[M.passes]!,
    completed: m[M.completed]!,
    possessionShare: m[M.passes]! / Math.max(1, m[M.passes]! + o[M.passes]!),
    crosses: d[TD.crosses] ?? 0,
    takeOns: d[TD.takeOns] ?? 0,
    tacklesInterceptions: m[M.tackles]! + m[M.interceptions]!,
    throwIns: d[TD.throwIns] ?? 0,
    corners: d[TD.corners] ?? 0,
    goalKicks: d[TD.goalKicks] ?? 0,
    fouls: d[TD.fouls] ?? 0,
    offsides: d[TD.offsides] ?? 0,
    yellow: d[TD.yellowCards] ?? 0,
    red: d[TD.redCards] ?? 0,
  };
}
type Row = ReturnType<typeof sideRow>;
interface SideSample {
  gap: number;
  tactic: Tactic;
  row: Row;
}

/** MATCH-28: outcome rates ±3 pp; means ±max(5% of |reference mean|, 0.1 reference SD). */
function compare(own: readonly SideSample[], ref: readonly SideSample[]) {
  const buckets = new Map<number, SideSample[]>();
  for (const s of ref) {
    const b = gapBucket(s.gap);
    buckets.set(b, [...(buckets.get(b) ?? []), s]);
  }
  const usable = own.filter((s) => (buckets.get(gapBucket(s.gap))?.length ?? 0) >= 20);
  const keys = Object.keys(usable[0]!.row) as (keyof Row)[];
  const rows: Record<string, unknown> = {};
  for (const k of keys) {
    const isRate = k === 'win' || k === 'draw' || k === 'loss';
    const o = usable.map((s) => s.row[k]);
    // The reference read at the own sample's gap: each own sample against its bucket's mean.
    const weight = new Map<number, number>();
    for (const s of usable) weight.set(gapBucket(s.gap), (weight.get(gapBucket(s.gap)) ?? 0) + 1);
    let refMean = 0,
      refVar = 0;
    const refAll: number[] = [];
    for (const [b, n] of weight) {
      const xs = buckets.get(b)!.map((s) => s.row[k]);
      const w = n / usable.length;
      refMean += w * mean(xs);
      refVar += (w * w * sdOf(xs) ** 2) / xs.length;
      refAll.push(...xs);
    }
    const ownMean = mean(o);
    const diff = ownMean - refMean;
    const half = 1.96 * Math.sqrt(sdOf(o) ** 2 / o.length + refVar);
    const margin = isRate ? 0.03 : Math.max(0.05 * Math.abs(refMean), 0.1 * sdOf(refAll));
    const lo = diff - half,
      hi = diff + half;
    rows[k] = {
      own: r3(ownMean),
      reference: r3(refMean),
      diff: r3(diff),
      ci: [r3(lo), r3(hi)],
      margin: r3(margin),
      verdict:
        lo >= -margin && hi <= margin
          ? 'equivalent'
          : hi < -margin || lo > margin
            ? 'different'
            : 'insufficient',
    };
  }
  return { ownSamples: usable.length, dropped: own.length - usable.length, rows };
}

function curve() {
  const year = Number(opt('year', '2024'));
  const seeds = Number(opt('seeds', '16'));
  const refSeeds = Number(opt('ref-seeds', '4'));
  const w = verdictWorld(`t840-curve-${year}`, year);
  const own = w.playerClub;
  const pending = (f: Fixture) => f.kind === 'league' && !f.score;
  const ownFixtures = w.fixtures.filter((f) => pending(f) && (f.home === own || f.away === own));
  const groupKey = ownFixtures[0]!.groupKey;
  const others = w.fixtures.filter(
    (f) => pending(f) && f.home !== own && f.away !== own && f.groupKey === groupKey,
  );
  const t0 = Date.now();
  const ownSamples: SideSample[] = [];
  let scriptProblems = 0;
  for (const f of ownFixtures) {
    const home = f.home === own;
    const gap = preparedGap(w, f);
    const tactic = prepareMatch(w, f).tactics[home ? 0 : 1];
    for (let s = 0; s < seeds; s++) {
      const playback = withSeed(w, s, () => simulateMatch(w, f, false));
      if (playback.problems?.length) scriptProblems++;
      ownSamples.push({
        gap: home ? gap : -gap,
        tactic,
        row: sideRow(playback.record, home ? 0 : 1),
      });
    }
  }
  const ownSeconds = (Date.now() - t0) / 1000;
  const refSamples: SideSample[] = [];
  for (const f of others) {
    const gap = preparedGap(w, f);
    const tactics = prepareMatch(w, f).tactics;
    for (let s = 0; s < refSeeds; s++) {
      const { record } = withSeed(w, s, () => simulateAggregate(w, f));
      refSamples.push(
        { gap, tactic: tactics[0], row: sideRow(record, 0) },
        { gap: -gap, tactic: tactics[1], row: sideRow(record, 1) },
      );
    }
  }
  const club = findClub(w, own);
  const result = {
    task: 'T840',
    read: 'a',
    model: w.matchModel,
    year,
    club: { id: club.id, name: club.name, tier: club.tier, rating: r2(rating(w, club)) },
    manager: { ability: w.manager.ability, style: w.manager.style ?? null },
    morale: w.morale,
    ownTactic: w.tactic,
    fixtures: { own: ownFixtures.length, reference: others.length },
    seeds: { own: seeds, reference: refSeeds },
    ownMatches: ownSamples.length,
    referenceSides: refSamples.length,
    scriptProblems,
    gaps: {
      own: [
        r2(Math.min(...ownSamples.map((s) => s.gap))),
        r2(Math.max(...ownSamples.map((s) => s.gap))),
      ],
      ownMean: r2(mean(ownSamples.map((s) => s.gap))),
    },
    comparison: compare(ownSamples, refSamples),
    // The same reads against reference sides playing the own club's tactic only.
    sameTactic: compare(
      ownSamples,
      refSamples.filter((s) => s.tactic === ownSamples[0]!.tactic),
    ),
    referenceTactics: Object.fromEntries(
      TACTICS.map((t) => [t, refSamples.filter((s) => s.tactic === t).length]),
    ),
    seconds: { own: ownSeconds, all: (Date.now() - t0) / 1000 },
  };
  console.log(JSON.stringify({ ...result, comparison: undefined, sameTactic: undefined }));
  for (const [k, v] of Object.entries(result.comparison.rows)) console.log(k, JSON.stringify(v));
  console.log('same tactic', result.sameTactic.ownSamples, result.sameTactic.dropped);
  for (const [k, v] of Object.entries(result.sameTactic.rows)) console.log(k, JSON.stringify(v));
  if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
}

// ---------------------------------------------------------------------------------------------
const PAIRINGS = TACTICS.flatMap((a, i) => TACTICS.slice(i).map((b) => [a, b] as const));
const YEARS = [1975, 2024] as const;

interface Plan {
  index: number;
  year: number;
  pairing: string;
  ownTactic: Tactic;
  oppTactic: Tactic;
  tune: boolean;
}
/** 40 matches: each pairing twice a year; the first of each is a tuning match. */
const PLANS: Plan[] = YEARS.flatMap((year, y) =>
  PAIRINGS.flatMap(([a, b], p) =>
    [0, 1].map((k) => ({
      index: y * 20 + p * 2 + k,
      year,
      pairing: `${a}/${b}`,
      ownTactic: k === 0 ? a : b,
      oppTactic: k === 0 ? b : a,
      tune: k === 0,
    })),
  ),
);

const goalOf = (side: 0 | 1): readonly [number, number] => (side === 0 ? [105, 34] : [0, 34]);
const dist2 = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const DELIVERIES = new Set(['pass', 'throwIn', 'goalKick', 'corner', 'freeKick', 'kickOff']);

/** MATCH-23's sequence rows read on a script: a possession is a run of one side's beats. */
function sequenceRows(script: MatchScript) {
  const beats = script.beats.filter((b) => b.period !== 5 && b.kind !== 'stoppage');
  const spells: { side: 0 | 1; passes: number; shot: boolean }[] = [];
  let cur: (typeof spells)[number] | undefined;
  for (const b of beats) {
    if (!cur || cur.side !== b.side) {
      cur = { side: b.side, passes: 0, shot: false };
      spells.push(cur);
    }
    if (DELIVERIES.has(b.kind) && b.receiver !== undefined) cur.passes++;
    if (b.kind === 'shot' || b.kind === 'penalty' || b.shot !== undefined) cur.shot = true;
  }
  const shots = beats.filter((b: ScriptBeat) => b.kind === 'shot' || b.kind === 'penalty');
  const distances = shots.map((b) => dist2(b.from, goalOf(b.side)));
  return {
    possessionsPerTeam: spells.length / 2,
    medianPasses: median(spells.map((s) => s.passes)),
    possessionShotShare: spells.filter((s) => s.shot).length / Math.max(1, spells.length),
    shots: shots.length,
    meanShotDistance: mean(distances),
    shotsFrom30: distances.filter((d) => d >= 30).length,
  };
}

/** T822/T824's metres from place, as `players.place.test` reads them. */
function placeDistances(match: ReturnType<typeof playAggregate>, trace: AggregateAttributionTrace) {
  const { plan, facts, participation } = match;
  const shapes = [plan.sides[0].shape, plan.sides[1].shape] as const;
  const attempts: number[] = [],
    winners: number[] = [];
  for (const side of [0, 1] as const)
    facts.ledger.sides[side].moves.forEach((move, index) => {
      const t = trace.moves[side][index];
      if (!t) return;
      const add = (
        counts: readonly number[],
        owner: 0 | 1,
        cell: number,
        ip: boolean,
        into: number[],
      ) =>
        counts.forEach((count, line) => {
          if (!count) return;
          const spans = participation.stints[owner]
            .filter((s) => s.line === line && (move.period === 'extra' ? s.to > 90 : s.from < 90))
            .map((s) => ({
              slot: s.slot,
              minutes: Math.max(
                0,
                Math.min(s.to, move.period === 'extra' ? 120 : 90) -
                  Math.max(s.from, move.period === 'extra' ? 90 : 0),
              ),
            }));
          const minutes = spans.reduce((n, x) => n + x.minutes, 0);
          if (minutes <= 0) return;
          const d =
            spans.reduce(
              (n, x) => n + x.minutes * placeDistance(shapes, owner, x.slot, cell, ip),
              0,
            ) / minutes;
          for (let k = 0; k < count; k++) into.push(Math.round(10 * d) / 10);
        });
      add(t.attempts, side, move.from, true, attempts);
      add(
        t.won,
        side === 0 ? 1 : 0,
        opposingCell(isPassKind(move.kind) ? move.to : move.from),
        false,
        winners,
      );
    });
  return { attempts, winners };
}

function pickFixtures(w: World) {
  const own = w.playerClub;
  const fixtures = w.fixtures.filter(
    (f) => f.kind === 'league' && !f.score && (f.home === own || f.away === own),
  );
  const used = new Set<string>();
  return (plan: Plan) => {
    const want = (home: boolean) =>
      fixtures.find((f) => {
        const opp = findClub(w, f.home === own ? f.away : f.home);
        return !used.has(f.id) && npcTactic(opp) === plan.oppTactic && (f.home === own) === home;
      });
    const home = plan.index % 2 === 0;
    const f = want(home) ?? want(!home);
    if (!f) throw new Error(`no ${plan.oppTactic} opponent left for ${plan.pairing} ${plan.year}`);
    used.add(f.id);
    return f;
  };
}

function stageOne(w: World, f: Fixture, plan: Plan) {
  const t0 = Date.now();
  w.tactic = plan.ownTactic;
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const match = playAggregate(w, f, prepared, rosters, undefined, undefined, trace);
  const record = aggregateRecord(f, rosters, match, activeMatchModel(w)!);
  const managers = prepared.teams.map((club) =>
    club.id === w.playerClub ? w.manager : clubManager(w, club),
  );
  const detail = matchDetail(match, rosters, trace);
  const written = writeScript(detail, `${w.seed}:${f.id}`);
  const ownSide = f.home === w.playerClub ? 0 : 1;
  const base = {
    index: plan.index,
    year: plan.year,
    pairing: plan.pairing,
    tune: plan.tune,
    fixture: f.id,
    ownSide,
    tactics: prepared.tactics,
    score: [record.score.home, record.score.away],
    incidents: (record.incidents ?? []).map((x) => x.kind),
    place: placeDistances(match, trace),
  };
  if ('problems' in written) return { ...base, problems: written.problems };
  const script = written.script;
  const problems = [
    ...validateScript(detail, script),
    ...compareRecord(detail, countScript(script, detail), record),
  ];
  const sides = stagingSides(detail, rosters, managers);
  const staged = advance(createStaging(script, sides), Infinity);
  const metrics = stagingMetrics(staged.frames, staged.events, script, sides);
  const fit = fitLines(staged.frames, staged.events, script, detail);
  const rates = clockRates(script, { ...staged, added: record.added });
  // Contested events by kind: how many, how many needed the lunge, and how many ended with the
  // scripted man beyond `limits.contest` of the ball in the event's frame.
  const contests: Record<string, [number, number, number]> = {};
  let fi = 0;
  for (const e of staged.events) {
    if (!['intercept', 'tackle', 'foul', 'loose', 'block', 'save'].includes(e.kind)) continue;
    while (fi + 1 < staged.frames.length && staged.frames[fi + 1]!.t <= e.t + 1e-9) fi++;
    const c = (contests[e.kind] ??= [0, 0, 0]);
    c[0]++;
    if (e.stretch) c[1]++;
    const at =
      e.other &&
      staged.frames[fi]!.p.find(
        (q) => q.player.side === e.other!.side && q.player.line === e.other!.line,
      );
    if (at && e.at && dist2(at.at, e.at) > STAGING_CONFIG.limits.contest) c[2]++;
  }
  const [lo, hi] = STAGING_CONFIG.limits.clockRate;
  const rateList = rates.map((r) => r.rate);
  // Scenes to look at: each kind's worst instance, with its scripted minute and players.
  const nameOf = (side: 0 | 1, line: number) => {
    const id = detail.sides[side].lines[line]?.id;
    return rosters[side].find((x) => x.id === id)?.name ?? `${side}:${line}`;
  };
  const minuteAt = (t: number) => {
    const f = staged.frames.find((x) => x.t >= t - 1e-9) ?? staged.frames.at(-1)!;
    return f.clock === undefined ? null : Math.floor(f.clock / 60) + 1;
  };
  const worstContest = (kind: 'block' | 'save') => {
    let best: { metres: number; minute: number | null; actor: string; other: string } | null = null;
    fi = 0;
    for (const e of staged.events) {
      if (e.kind !== kind || !e.other || !e.actor) continue;
      while (fi + 1 < staged.frames.length && staged.frames[fi + 1]!.t <= e.t + 1e-9) fi++;
      const at = staged.frames[fi]!.p.find(
        (q) => q.player.side === e.other!.side && q.player.line === e.other!.line,
      );
      if (!at) continue;
      const metres = dist2(at.at, e.at);
      if (!best || metres > best.metres)
        best = {
          metres: r2(metres),
          minute: minuteAt(e.t),
          actor: nameOf(e.actor.side, e.actor.line),
          other: nameOf(e.other.side, e.other.line),
        };
    }
    return best;
  };
  // Teammates within the huddle distance in open play outside the boxes, run by run.
  const huddleRuns = new Map<string, { start: number; last: number }>();
  const episodes: {
    side: 0 | 1;
    a: number;
    b: number;
    start: number;
    seconds: number;
    own: boolean;
  }[] = [];
  const H = STAGING_CONFIG.limits.huddle;
  const inBox = (v: readonly [number, number]) =>
    (v[0] <= 16.5 || v[0] >= 88.5) && v[1] >= 13.84 && v[1] <= 54.16;
  staged.frames.forEach((f, k) => {
    if (!f.live || f.phase === 'setPiece') return;
    for (const side of [0, 1] as const) {
      const team = f.p.filter((q) => q.player.side === side && q.slot !== 0);
      for (let x = 0; x < team.length; x++)
        for (let y = x + 1; y < team.length; y++) {
          const a = team[x]!,
            b = team[y]!;
          if (dist2(a.at, b.at) >= H.distance) continue;
          if (inBox(a.at) && inBox(b.at) && a.at[0] < 52.5 === b.at[0] < 52.5) continue;
          const key = `${side}:${a.player.line}:${b.player.line}`;
          const run = huddleRuns.get(key);
          if (run && run.last === k - 1) run.last = k;
          else {
            if (run)
              episodes.push({
                side,
                a: a.player.line,
                b: b.player.line,
                start: run.start,
                seconds: (run.last - run.start + 1) * STAGING_CONFIG.tick,
                own: staged.frames[run.start]!.team === side,
              });
            huddleRuns.set(key, { start: k, last: k });
          }
        }
    }
  });
  for (const [key, run] of huddleRuns) {
    const [side, a, b] = key.split(':').map(Number) as [0 | 1, number, number];
    episodes.push({
      side,
      a,
      b,
      start: run.start,
      seconds: (run.last - run.start + 1) * STAGING_CONFIG.tick,
      own: staged.frames[run.start]!.team === side,
    });
  }
  const long = episodes.filter((e) => e.seconds > H.seconds);
  const lineOf = (side: 0 | 1, line: number) => detail.sides[side].lines[line]?.role ?? '?';
  const longest = long.sort((x, y) => y.seconds - x.seconds)[0];
  const huddles = {
    long: long.length,
    inPossession: long.filter((e) => e.own).length,
    pairs: Object.entries(
      long.reduce<Record<string, number>>((o, e) => {
        const k = [lineOf(e.side, e.a), lineOf(e.side, e.b)].sort().join('+');
        o[k] = (o[k] ?? 0) + 1;
        return o;
      }, {}),
    )
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5),
    longest: longest && {
      seconds: r2(longest.seconds),
      minute: minuteAt(staged.frames[longest.start]!.t),
      players: [nameOf(longest.side, longest.a), nameOf(longest.side, longest.b)],
      roles: [lineOf(longest.side, longest.a), lineOf(longest.side, longest.b)],
      inPossession: longest.own,
    },
  };
  const longStretches = rates.filter((r) => r.to - r.from >= 10);
  const worstRate = longStretches.sort(
    (x, y) => Math.abs(Math.log(y.rate)) - Math.abs(Math.log(x.rate)),
  )[0];
  const scenes = {
    block: worstContest('block'),
    save: worstContest('save'),
    huddle: huddles.longest,
    clock: worstRate && {
      rate: r3(worstRate.rate),
      period: worstRate.period,
      fromMinute: r2(worstRate.startSeconds / 60),
      toMinute: r2(worstRate.endSeconds / 60),
      stagedSeconds: r2(worstRate.to - worstRate.from),
      beats: [
        ...new Set(
          staged.frames
            .filter((f) => f.t >= worstRate.from && f.t <= worstRate.to)
            .map((f) => f.beat),
        ),
      ]
        .map((i) => script.beats.find((b) => b.index === i))
        .filter((b) => b !== undefined)
        .map(
          (b) =>
            `${b!.kind}/${b!.move}${b!.incidents?.length ? '+' + b!.incidents.map((x) => x.kind).join('+') : ''}`,
        ),
    },
  };
  return {
    ...base,
    problems,
    validateScript: validateScript(detail, script).length,
    huddles,
    scenes,
    invention: scriptCost(script, detail),
    contests,
    sequences: sequenceRows(script),
    metrics: metrics.map((m) => ({ id: m.id, value: m.value, limit: m.limit, pass: m.pass })),
    failing: metrics.filter((m) => !m.pass).map((m) => m.id),
    fit: fit.map((m) => ({ id: m.id, value: m.value, ...(m.detail ? { detail: m.detail } : {}) })),
    clock: {
      stretches: rates.length,
      outside: rates.filter((r) => r.rate < lo || r.rate > hi).length,
      min: r3(Math.min(...rateList)),
      median: r3(median(rateList)),
      max: r3(Math.max(...rateList)),
      worst: rates
        .filter((r) => r.rate < lo || r.rate > hi)
        .slice(0, 6)
        .map((r) => ({
          period: r.period,
          from: r3(r.startSeconds / 60),
          to: r3(r.endSeconds / 60),
          rate: r3(r.rate),
        })),
      all: rates.map((r) => [
        r.period,
        r2(r.startSeconds),
        r2(r.endSeconds),
        r2(r.to - r.from),
        r3(r.rate),
      ]),
    },
    seconds: (Date.now() - t0) / 1000,
  };
}

function stage() {
  const set = opt('set', 'all');
  const only = opt('only', '');
  const chosen = PLANS.filter(
    (p) =>
      (set === 'all' || (set === 'tune') === p.tune) &&
      (!only || only.split(',').map(Number).includes(p.index)),
  );
  const out: unknown[] = [];
  for (const year of YEARS) {
    const plans = PLANS.filter((p) => p.year === year);
    if (!chosen.some((p) => p.year === year)) continue;
    const w = verdictWorld(`t840-stage-${year}`, year);
    const pick = pickFixtures(w);
    // Fixtures are assigned over all of the year's plans, so a subset reads the same matches.
    const fixtures = new Map(plans.map((p) => [p.index, pick(p)]));
    for (const plan of chosen.filter((p) => p.year === year)) {
      const row = stageOne(w, fixtures.get(plan.index)!, plan);
      const r = row as {
        failing?: string[];
        fit?: { id: string; value: number }[];
        seconds?: number;
      };
      console.log(
        `#${plan.index} ${year} ${plan.pairing} ${row.fixture} ${JSON.stringify(row.score)} problems ${row.problems.length} failing ${r.failing?.length ?? '-'} ${JSON.stringify(r.fit?.slice(0, 3).map((m) => m.value))} ${r.seconds}s`,
      );
      out.push(row);
    }
  }
  if (OUT)
    writeFileSync(OUT, `${JSON.stringify({ task: 'T840', read: 'c', set, matches: out })}\n`);
}

// ---------------------------------------------------------------------------------------------
interface StageRow {
  index: number;
  year: number;
  pairing: string;
  tune: boolean;
  fixture: string;
  ownSide: 0 | 1;
  score: number[];
  problems: string[];
  validateScript?: number;
  invention?: Record<string, number>;
  sequences?: ReturnType<typeof sequenceRows>;
  metrics?: { id: string; value: number; limit: string; pass: boolean }[];
  failing?: string[];
  fit?: { id: string; value: number }[];
  clock?: { stretches: number; outside: number; min: number; median: number; max: number };
  place: { attempts: number[]; winners: number[] };
  seconds?: number;
}

function summarise(rows: readonly StageRow[]) {
  const ok = rows.filter((r) => r.metrics);
  const fitOf = (r: StageRow, id: string) => r.fit?.find((m) => m.id === id)?.value ?? 0;
  const metricIds = [...new Set(ok.flatMap((r) => r.metrics!.map((m) => m.id)))];
  const metrics = Object.fromEntries(
    metricIds.map((id) => {
      const vals = ok.flatMap((r) => r.metrics!.filter((m) => m.id === id));
      return [
        id,
        {
          limit: vals[0]!.limit,
          matches: vals.length,
          failing: vals.filter((v) => !v.pass).length,
          mean: r3(mean(vals.map((v) => v.value))),
          worst: r3(Math.max(...vals.map((v) => v.value))),
          best: r3(Math.min(...vals.map((v) => v.value))),
        },
      ];
    }),
  );
  const attempts = rows.flatMap((r) => r.place.attempts),
    winners = rows.flatMap((r) => r.place.winners);
  const seq = (k: keyof ReturnType<typeof sequenceRows>) =>
    r3(mean(ok.map((r) => r.sequences![k])));
  const shots = ok.reduce((n, r) => n + r.sequences!.shots, 0);
  return {
    matches: rows.length,
    staged: ok.length,
    scriptFailures: rows.filter((r) => r.problems.length).length,
    exactness: {
      exact: ok.filter((r) => fitOf(r, 'fit.exact') !== 0).length,
      performed: ok.filter((r) => fitOf(r, 'fit.performed') !== 0).length,
      recast: ok.filter((r) => fitOf(r, 'fit.recast') !== 0).length,
      validateScript: ok.filter((r) => (r.validateScript ?? 0) !== 0).length,
    },
    failingLimits: ok.reduce((n, r) => n + r.failing!.length, 0),
    invention: {
      links: r2(mean(ok.map((r) => r.invention!.links!))),
      linkMetres: r2(mean(ok.map((r) => r.invention!.linkMetres!))),
      miscontrols: r2(mean(ok.map((r) => r.invention!.miscontrols!))),
      connectiveRestarts: r2(mean(ok.map((r) => r.invention!.connectiveRestarts!))),
    },
    sequences: {
      possessionsPerTeam: seq('possessionsPerTeam'),
      medianPasses: seq('medianPasses'),
      possessionShotShare: seq('possessionShotShare'),
      meanShotDistance: r3(
        ok.reduce((n, r) => n + r.sequences!.meanShotDistance * r.sequences!.shots, 0) / shots,
      ),
      shotsFrom30Share: r3(ok.reduce((n, r) => n + r.sequences!.shotsFrom30, 0) / shots),
      shotsPerTeam: r2(shots / ok.length / 2),
    },
    fit: Object.fromEntries(
      ['fit.stretch', 'fit.late', 'fit.orphans', 'fit.stagedSeconds', 'fit.clockRatio'].map(
        (id) => [id, r3(mean(ok.map((r) => fitOf(r, id))))],
      ),
    ),
    clock: {
      stretches: ok.reduce((n, r) => n + r.clock!.stretches, 0),
      outside: ok.reduce((n, r) => n + r.clock!.outside, 0),
      matchesOutside: ok.filter((r) => r.clock!.outside > 0).length,
      min: Math.min(...ok.map((r) => r.clock!.min)),
      median: r3(median(ok.map((r) => r.clock!.median))),
      max: Math.max(...ok.map((r) => r.clock!.max)),
    },
    place: {
      median: median(attempts),
      far: r3(attempts.filter((d) => d > 20).length / attempts.length),
      winnersFar: r3(winners.filter((d) => d > 20).length / winners.length),
      target: AC.place.target,
    },
    metrics,
    seconds: r2(mean(ok.map((r) => r.seconds ?? 0))),
  };
}

function sum() {
  const files = argv.slice(1).filter((a, i, all) => a !== '--out' && all[i - 1] !== '--out');
  const rows = files.flatMap(
    (f) => (JSON.parse(readFileSync(f, 'utf8')) as { matches: StageRow[] }).matches,
  );
  rows.sort((a, b) => a.index - b.index);
  const result = {
    task: 'T840',
    read: 'c+d',
    all: summarise(rows),
    tune: summarise(rows.filter((r) => r.tune)),
    held: summarise(rows.filter((r) => !r.tune)),
    perMatch: rows.map((r) => ({
      index: r.index,
      year: r.year,
      pairing: r.pairing,
      fixture: r.fixture,
      ownSide: r.ownSide,
      score: r.score,
      problems: r.problems.slice(0, 4),
      failing: r.failing,
      fit: r.fit?.slice(0, 5).map((m) => m.value),
      clockOutside: r.clock?.outside,
      invention: r.invention && {
        links: r.invention.links,
        linkMetres: r.invention.linkMetres,
        miscontrols: r.invention.miscontrols,
        connectiveRestarts: r.invention.connectiveRestarts,
      },
    })),
  };
  console.log(
    JSON.stringify(
      { all: { ...result.all, metrics: undefined }, tune: { ...result.tune, metrics: undefined } },
      null,
      1,
    ),
  );
  if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
}

/** The own fixtures of `curve` whose script fails, with their problems (`--from`/`--to` seeds). */
function problems() {
  const year = Number(opt('year', '2024'));
  const from = Number(opt('from', '0')),
    to = Number(opt('to', '16'));
  const w = verdictWorld(`t840-curve-${year}`, year);
  const own = w.playerClub;
  const fixtures = w.fixtures.filter(
    (f) => f.kind === 'league' && !f.score && (f.home === own || f.away === own),
  );
  const out: unknown[] = [];
  for (let s = from; s < to; s++)
    for (const f of fixtures) {
      const playback = withSeed(w, s, () => simulateMatch(w, f, false));
      if (playback.problems?.length) {
        out.push({ seed: s, fixture: f.id, problems: playback.problems.slice(0, 12) });
        console.log(s, f.id, JSON.stringify(playback.problems.slice(0, 6)));
      }
    }
  if (OUT) writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
}

if (mode === 'curve') curve();
else if (mode === 'problems') problems();
else if (mode === 'stage') stage();
else if (mode === 'sum') sum();
else throw new Error('mode: curve | stage | sum');
