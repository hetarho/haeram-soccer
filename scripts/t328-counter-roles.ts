/**
 * T328/T334 scratch measurement: counter's 4-4-2 role tables and candidate-model behaviour overrides,
 * driven through grid-bands' exported condition fixtures and forced-formation conditioning. A
 * variant is a role map this process passes in for the counter formation (FORMATIONS.counter.slots
 * swapped in memory before any squad, world or match is built); `--behaviour a+b` and `--patch
 * <json>` patch the candidate configs in this process the same way (scripts/
 * t328-counter-roles-variants.ts). The source tables and configs are never edited.
 *
 *   pnpm exec tsx scripts/t328-counter-roles.ts --variant base --behaviour settled2
 *     --partition calibration --round 0 --per 300 --core 1200
 *     --set all|counter|press|counterpress|<tactic+tactic>|others|none
 *     --only counter-press,press-counter --gap 600
 *     --jobs 4 --trace 40 --chunk 150 --out <file.json>
 *
 * `--set counter` plays only the pairings with counter, `press` those with press, `counterpress`
 * either (`press+balanced` and the like name any tactics), `all` every pairing (the base run the report pools the rest from); `--only` narrows to
 * the named pairings; `--trace` observes that many matches a venue of counter v press for through
 * balls received in behind; `--gap N` also plays every gap condition N times (T336: MATCH-2's
 * outcome curve under the same overrides, kept as gap and 90-minute score only). Read the output
 * with scripts/t328-counter-roles-report.ts.
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PD, TD } from '../packages/contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Tactic } from '../packages/contracts/src/types';
import { FORMATIONS } from '../packages/engine/src/player';
import { rating } from '../packages/engine/src/index';
import { validateFullMatchRecord } from '../packages/engine/src/match-model';
import { playGrid } from '../packages/engine/src/grid/engine';
import { M } from '../packages/engine/src/grid/record';
import { attackFrame, inBox } from '../packages/engine/src/grid/pitch';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import {
  conditionClubs,
  conditionFixture,
  forcedGap,
  forceTacticRosters,
  type ConditionParams,
} from './grid-bands';
import {
  buildInvariantReport,
  conditionOf,
  CORPUS_CONFIG,
  type MatchSample,
  type Partition,
} from './lib/match-parity';
import { applyBehaviour, behaviourOf, VARIANTS } from './t328-counter-roles-variants';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};

const variant = opt('variant', 'base');
const spec = VARIANTS[variant];
if (!spec) throw new Error(`unknown variant ${variant}`);
// The measurement's role map for counter: swapped in before anything reads the table.
(FORMATIONS.counter as { slots: unknown }).slots = spec.map(([position, role]) => ({
  position,
  role,
}));
// The measurement's behaviour overrides (T334): candidate configs patched in this process only.
const behaviour = opt('behaviour', '');
const patch = opt('patch', '');
for (const p of behaviourOf(behaviour, patch || undefined)) applyBehaviour(p);

const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
interface Job {
  condition: string;
  from: number;
  count: number;
  partition: Partition;
  round: number;
  trace: number;
}

/** Per counter slot: shots, goals, xG (hundredths), box entries. */
function roleTally() {
  return Array.from({ length: 12 }, () => ({ shots: 0, goals: 0, xg: 0, entries: 0 }));
}

function playJob(job: Job) {
  const c = conditionOf(job.condition);
  const params = c.params as ConditionParams;
  const r = conditionClubs(c, job.partition, job.round);
  const samples: MatchSample[] = [];
  const roles = roleTally();
  let counterSides = 0;
  const side = {
    entries: 0,
    entriesConceded: 0,
    through: 0,
    throughDone: 0,
    passes: 0,
    passesAgainst: 0,
    xg: 0,
    xgAgainst: 0,
    shots: 0,
    shotsAgainst: 0,
    frontEntries: 0,
  };
  const traced = {
    through: 0,
    inBehind: 0,
    box: 0,
    shot: 0,
    byRole: {} as Record<string, number>,
    behindByRole: {} as Record<string, number>,
  };
  let invalid = 0;
  // Consume the club stream for the fixtures before `from`, so chunks of a condition read as one run.
  for (let i = 0; i < job.from + job.count; i++) {
    const { w, home, away, f } = conditionFixture(c, job.partition, job.round, i, r);
    if (i < job.from) continue;
    const observe = i - job.from < job.trace;
    const setup = buildGridSetup(w, f, {
      observe,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      ...(c.family === 'tactics' ? { tactics: [params.home!, params.away!] } : {}),
      ...(params.decide ? { decide: params.decide } : {}),
    });
    const fatigueApplied =
      c.family === 'tactics' && forceTacticRosters(w, f, setup, [home, away], params.fatigue);
    const result = playGrid(setup);
    if (validateFullMatchRecord(result.record).length) invalid++;
    const rec = result.record;
    // Counter side readings (each side that plays counter).
    for (const sd of [0, 1] as const) {
      if (setup.tactics[sd] !== 'counter') continue;
      counterSides++;
      const opp = (1 - sd) as 0 | 1;
      side.entries += rec.detail![sd]![TD.boxEntries]!;
      side.frontEntries += rec.detail![sd]![TD.frontOfBoxEntries]!;
      side.entriesConceded += rec.detail![opp]![TD.boxEntries]!;
      side.through += rec.detail![sd]![TD.throughBalls]!;
      side.throughDone += rec.detail![sd]![TD.throughBallsCompleted]!;
      side.passes += rec.metrics[sd]![M.passes]!;
      side.passesAgainst += rec.metrics[opp]![M.passes]!;
      side.xg += rec.xg![sd]!;
      side.xgAgainst += rec.xg![opp]!;
      side.shots += rec.metrics[sd]![M.shots]!;
      side.shotsAgainst += rec.metrics[opp]![M.shots]!;
      // Each player's slot: a starter's own, a substitute the slot of the player he replaced.
      const slotById = new Map(setup.rosters[sd].slice(0, 11).map((p, idx) => [p.id, idx]));
      for (const inc of rec.incidents ?? [])
        if (inc.side === sd && inc.kind === 'sub' && inc.other && slotById.has(inc.player))
          slotById.set(inc.other, slotById.get(inc.player)!);
      const slotOfIdx = (idx: number) => slotById.get(setup.rosters[sd][idx]?.id ?? '') ?? 11;
      const lines = rec.lineCounts!;
      const start = sd === 0 ? 0 : lines[0];
      for (const line of rec.players.slice(start, start + lines[sd])) {
        const slot = slotById.get(line.id) ?? 11;
        roles[slot]!.shots += line.metrics[M.shots]!;
        roles[slot]!.goals += line.metrics[M.goals]!;
        roles[slot]!.xg += line.detail?.[PD.xg] ?? 0;
        roles[slot]!.entries += line.detail?.[PD.boxEntries] ?? 0;
      }
      if (result.trace) {
        const t = result.trace;
        for (let k = 0; k < t.length; k++) {
          const e = t[k]!;
          if (
            e.side !== sd ||
            e.action !== 'pass' ||
            e.kind !== 'through' ||
            e.outcome !== 'complete'
          )
            continue;
          if (e.receiver === undefined) continue;
          traced.through++;
          const slotOfReceiver = slotOfIdx(e.receiver);
          const roleName =
            slotOfReceiver < 11 ? `${spec[slotOfReceiver]![0]}:${spec[slotOfReceiver]![1]}` : 'sub';
          traced.byRole[roleName] = (traced.byRole[roleName] ?? 0) + 1;
          // His next touch, and whether the move reached the box or a shot before the ball changed sides.
          for (let j = k + 1; j < t.length; j++) {
            const n = t[j]!;
            if (n.side !== sd || n.idx < 0) break;
            if (n.idx === e.receiver && j === k + 1) {
              if (n.tags?.inBehind) {
                traced.inBehind++;
                traced.behindByRole[roleName] = (traced.behindByRole[roleName] ?? 0) + 1;
              }
            }
            if (n.from && inBox(attackFrame(sd, n.from))) {
              traced.box++;
              break;
            }
            if (n.action === 'shot') {
              traced.shot++;
              break;
            }
            if (n.outcome !== 'complete') break;
          }
        }
      }
    }
    samples.push({
      record: rec,
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: c.id,
      gap:
        c.family === 'tactics'
          ? forcedGap([home, away], setup.rosters, setup.tactics)
          : rating(w, home, f) + 3 - rating(w, away, f),
      ...(c.family !== 'tactics' || fatigueApplied
        ? { freshness: result.diagnostics.freshness }
        : {}),
    });
  }
  const invariants = buildInvariantReport(samples).filter((x) => x.failed).length;
  const slim = samples.map((s) =>
    c.family === 'gap'
      ? {
          record: { score: s.record.regulation ?? s.record.score },
          incidentsTracked: true,
          condition: s.condition,
          gap: s.gap,
        }
      : c.family === 'tactics'
        ? {
            record: {
              ...s.record,
              players: [],
              highlights: [],
              lineCounts: undefined,
              incidents: undefined,
            },
            incidentsTracked: false,
            condition: s.condition,
            freshness: s.freshness,
          }
        : s,
  );
  return {
    condition: job.condition,
    samples: slim,
    roles,
    counterSides,
    side,
    traced,
    invalid,
    invariants,
  };
}

if (args.includes('--child')) {
  process.on('message', (job: Job) => process.send!(playJob(job)));
} else {
  const partition = opt('partition', 'calibration') as Partition;
  const round = Number(opt('round', '0'));
  const per = Number(opt('per', '150'));
  const core = Number(opt('core', '600'));
  const set = opt('set', 'counter');
  const only = opt('only', '')
    .split(',')
    .filter(Boolean)
    .map((x) => `tactics:${x}`);
  const trace = Number(opt('trace', '0'));
  const workers = Number(opt('jobs', '4'));
  const chunk = Number(opt('chunk', '150'));
  const out = opt('out', `t328-${variant}.json`);
  // The tactics whose pairings a `--set` of tactic names (`counter`, `press+balanced`, …) plays.
  const setTactics = (set === 'counterpress' ? 'counter+press' : set).split('+');
  if (!['all', 'none', 'others'].includes(set))
    for (const t of setTactics)
      if (!TACTICS.includes(t as Tactic)) throw new Error(`unknown --set ${set}`);
  const conditions: { id: string; count: number; trace: number }[] = [];
  for (const h of TACTICS)
    for (const a of TACTICS) {
      const withCounter = h === 'counter' || a === 'counter';
      const id = `tactics:${h}-${a}`;
      if (
        set === 'none' ||
        (set === 'others' && withCounter) ||
        (!['all', 'others'].includes(set) && !setTactics.some((t) => t === h || t === a)) ||
        (only.length > 0 && !only.includes(id))
      )
        continue;
      const pressCounter = (h === 'counter' && a === 'press') || (h === 'press' && a === 'counter');
      conditions.push({ id, count: per, trace: pressCounter ? trace : 0 });
    }
  if (core > 0) conditions.push({ id: 'core:equal-top-tier', count: core, trace: 0 });
  const gap = Number(opt('gap', '0'));
  if (gap > 0)
    for (const c of CORPUS_CONFIG.conditions)
      if (c.family === 'gap') conditions.push({ id: c.id, count: gap, trace: 0 });
  const queue: Job[] = conditions.flatMap((c) =>
    Array.from({ length: Math.ceil(c.count / chunk) }, (_, k) => ({
      condition: c.id,
      from: k * chunk,
      count: Math.min(chunk, c.count - k * chunk),
      partition,
      round,
      trace: k === 0 ? c.trace : 0,
    })),
  );
  const started = performance.now();
  const done: ReturnType<typeof playJob>[] = [];
  await Promise.all(
    Array.from({ length: Math.min(workers, queue.length) }, async () => {
      const child = fork(fileURLToPath(import.meta.url), [...args, '--child'], {
        execArgv: process.execArgv,
      });
      for (let job = queue.shift(); job; job = queue.shift()) {
        const next = job;
        const res = await new Promise<ReturnType<typeof playJob>>((resolve, reject) => {
          child.once('message', (m) => resolve(m as ReturnType<typeof playJob>));
          child.once('exit', (code) =>
            reject(new Error(`child exited ${code} on ${next.condition}`)),
          );
          child.send(next);
        });
        child.removeAllListeners('exit');
        done.push(res);
        console.log(
          `${variant} ${res.condition} +${res.samples.length} (${((performance.now() - started) / 1000).toFixed(0)} s)`,
        );
      }
      child.kill();
    }),
  );
  writeFileSync(
    out,
    JSON.stringify({
      variant,
      slots: spec,
      behaviour,
      patch,
      set,
      partition,
      round,
      per,
      core,
      gap,
      seconds: (performance.now() - started) / 1000,
      chunks: done,
    }),
  );
  console.log(`wrote ${out} in ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
