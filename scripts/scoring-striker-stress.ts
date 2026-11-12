/**
 * T689 (measurement only, no engine change): the owner-profile striker stress case, the arm bl03's
 * held-out table measured (spec/reports/261103-bl03/scoring.md) rebuilt on the takeover worlds
 * (`careerWorld`; bl03's `createWorld` founding no longer exists). For each world seed and each own
 * tactic, one top-flight club plays 38 fixtures against another, the opponent's tactic rotating
 * through the four and the venue alternating every four; the `normal` arm fields its own squad at
 * strength 80, the `stress` arm at 75 with its ST slot replaced by the owner's retired striker at
 * his estimated peak (bl03's profile). Fitness is reset each match (no season), so the figures are
 * stress measurements, not season totals. Every record is checked with `validateFullMatchRecord`
 * and its scorer total against the score. A candidate is applied through
 * `scoring-candidate-patch.ts`. Fixture ids keep their `cf04-stress` prefix so the 261104 cf04
 * results replay.
 *
 *   pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/scoring-striker-stress.ts \
 *     --seeds a,b --games 38 --out FILE
 */
import { writeFileSync } from 'node:fs';
import { ATTRIBUTES } from '../packages/contracts/src/player';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Fixture, Player, Tactic } from '../packages/contracts/src/types';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { FORMATIONS, lineOf } from '../packages/engine/src/player';
import { npcSquad } from '../packages/engine/src/world';
import { playGrid } from '../packages/engine/src/grid/engine';
import { M } from '../packages/engine/src/match/record';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import { validateFullMatchRecord } from '../packages/engine/src/match-model';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const seeds = opt('seeds', 'cf04-stress-cal-1').split(',');
const games = Number(opt('games', '38'));
const out = opt('out', '');
const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];

function starPlayer(p: Player): Player {
  // bl03's owner retired OVR-85 profile with six outfield points for its OVR-91 peak.
  const values = [
    96.7, 75.76, 61.75, 74.13, 77.17, 66.66, 92.42, 81.58, 91.44, 66.35, 92.02, 13.05, 7.02, 13.81,
    69.27, 93.39,
  ];
  const copy = structuredClone(p);
  ATTRIBUTES.forEach((key, i) => (copy.attrs[key] = values[i]!));
  copy.position = 'ST';
  copy.positions = { ST: 3 };
  copy.traits = ['speedster', 'targetman'];
  return copy;
}

interface Row {
  seed: string;
  tactic: Tactic;
  arm: 'normal' | 'stress';
  games: number;
  goals: number;
  conceded: number;
  shots: number;
  opponentShots: number;
  hatTricks: number;
  maximum: number;
  topGoals: number;
  topShare: number;
  topSlot: string;
  starGoals?: number;
  starShots?: number;
  goalsByLine: Record<string, number>;
  invalid: number;
}
const rows: Row[] = [];
const started = performance.now();
for (const seed of seeds) {
  const w = careerWorld({ country: 'ENG', seed });
  const clubs = w.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub && !c.representative,
  );
  TACTICS.forEach((tactic, t) => {
    for (const arm of ['normal', 'stress'] as const) {
      const own = clubs[t % clubs.length]!,
        other = clubs[(t + 7) % clubs.length]!;
      const ownRoster = npcSquad(
        w.seed,
        2024,
        { ...own, strength: arm === 'stress' ? 75 : 80 },
        tactic,
      ).map((p) => ({ ...p, fatigue: 0 }));
      const st = FORMATIONS[tactic].slots.findIndex((s) => s.position === 'ST');
      const starId = arm === 'stress' ? ownRoster[st]!.id : undefined;
      if (arm === 'stress') ownRoster[st] = starPlayer(ownRoster[st]!);
      const slotOf = new Map<string, string>(
        ownRoster.map((p, k) => [p.id, FORMATIONS[tactic].slots[k]?.position ?? 'SUB']),
      );
      const scorers = new Map<string, number>();
      const row: Row = {
        seed,
        tactic,
        arm,
        games,
        goals: 0,
        conceded: 0,
        shots: 0,
        opponentShots: 0,
        hatTricks: 0,
        maximum: 0,
        topGoals: 0,
        topShare: 0,
        topSlot: '',
        goalsByLine: { FW: 0, MF: 0, DF: 0, GK: 0 },
        invalid: 0,
        ...(starId ? { starGoals: 0, starShots: 0 } : {}),
      };
      for (let i = 0; i < games; i++) {
        const side = (Math.floor(i / TACTICS.length) % 2) as 0 | 1;
        const opponentTactic = TACTICS[i % TACTICS.length]!;
        const opponentRoster = npcSquad(
          w.seed,
          2024,
          { ...other, strength: 80 },
          opponentTactic,
        ).map((p) => ({ ...p, fatigue: 0 }));
        const rosters: [Player[], Player[]] =
          side === 0 ? [ownRoster, opponentRoster] : [opponentRoster, ownRoster];
        const tactics: [Tactic, Tactic] =
          side === 0 ? [tactic, opponentTactic] : [opponentTactic, tactic];
        const f: Fixture = {
          ...w.fixtures[0]!,
          id: `cf04-stress:${seed}:${tactic}:${arm}:${i}`,
          year: 2024,
          round: i + 1,
          home: side === 0 ? own.id : other.id,
          away: side === 0 ? other.id : own.id,
        };
        const setup = buildGridSetup(w, f, {
          observe: false,
          recordPlayers: true,
          model: MATCH_MODEL_REVISION,
          lab: { rosters, tactics },
        });
        const m = playGrid(setup).record;
        const issues = validateFullMatchRecord(m);
        const lines =
          side === 0 ? m.players.slice(0, m.lineCounts![0]) : m.players.slice(m.lineCounts![0]);
        const scored = side === 0 ? m.score.home : m.score.away;
        if (lines.reduce((s, p) => s + p.metrics[M.goals]!, 0) !== scored)
          issues.push('scorer totals differ from score');
        row.invalid += issues.length;
        if (issues.length) throw new Error(issues.join('; '));
        row.goals += scored;
        row.conceded += side === 0 ? m.score.away : m.score.home;
        row.shots += m.metrics[side]![M.shots]!;
        row.opponentShots += m.metrics[1 - side]![M.shots]!;
        for (const line of lines) {
          const g = line.metrics[M.goals]!;
          scorers.set(line.id, (scorers.get(line.id) ?? 0) + g);
          row.maximum = Math.max(row.maximum, g);
          if (g >= 3) row.hatTricks++;
          const pos = slotOf.get(line.id);
          if (pos && pos !== 'SUB') row.goalsByLine[lineOf(pos as Player['position'])]! += g;
          if (line.id === starId) {
            row.starGoals! += g;
            row.starShots! += line.metrics[M.shots]!;
          }
        }
      }
      const [topId, topGoals] = [...scorers.entries()].reduce(
        (a, b) => (b[1] > a[1] ? b : a),
        ['', 0],
      );
      row.topGoals = topGoals;
      row.topShare = row.goals > 0 ? topGoals / row.goals : 0;
      row.topSlot = slotOf.get(topId) ?? '';
      rows.push(row);
    }
  });
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const arm = (a: 'normal' | 'stress') => {
  const r = rows.filter((x) => x.arm === a);
  const n = r.reduce((s, x) => s + x.games, 0);
  const goals = r.reduce((s, x) => s + x.goals, 0);
  return {
    teamSeasons: r.length,
    matches: n,
    goalsPerMatch: +(r.reduce((s, x) => s + x.goals + x.conceded, 0) / n).toFixed(3),
    ownGoalsPerMatch: +(goals / n).toFixed(3),
    ownShotsPerMatch: +(r.reduce((s, x) => s + x.shots, 0) / n).toFixed(2),
    topShare: +mean(r.map((x) => x.topShare)).toFixed(4),
    topGoalsPer38: +mean(r.map((x) => (38 * x.topGoals) / x.games)).toFixed(2),
    largestTopGoalsPer38: +Math.max(...r.map((x) => (38 * x.topGoals) / x.games)).toFixed(1),
    hatTricksPerOwnMatch: +(r.reduce((s, x) => s + x.hatTricks, 0) / n).toFixed(4),
    goalsByLine: Object.fromEntries(
      ['FW', 'MF', 'DF'].map((l) => [
        l,
        +(r.reduce((s, x) => s + x.goalsByLine[l]!, 0) / Math.max(1, goals)).toFixed(4),
      ]),
    ),
    ...(a === 'stress'
      ? {
          starGoalsPer38: +mean(r.map((x) => (38 * x.starGoals!) / x.games)).toFixed(2),
          starShotsPerMatch: +(r.reduce((s, x) => s + x.starShots!, 0) / n).toFixed(2),
        }
      : {}),
    invalid: r.reduce((s, x) => s + x.invalid, 0),
  };
};
const report = {
  kind: 't689-striker-stress',
  model: MATCH_MODEL_REVISION,
  patch: process.env.T689_PATCH_FILE ?? null,
  design:
    'careerWorld ENG takeover worlds, year 2024; per seed and own tactic one top-flight club vs another, 38 fixtures, opponent tactic rotating, venue alternating every 4; normal arm strength 80, stress arm 75 with bl03 peak-striker profile at ST; fitness reset each match',
  seeds,
  games,
  msPerMatch: +((performance.now() - started) / rows.reduce((s, x) => s + x.games, 0)).toFixed(1),
  normal: arm('normal'),
  stress: arm('stress'),
  rows,
};
if (out) writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 1));
