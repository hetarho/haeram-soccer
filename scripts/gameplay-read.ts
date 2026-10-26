/**
 * T410 gameplay read of the released model (indicative, not a MATCH-28 verdict): one 1950 founding
 * simulated for 10 seasons (built once through `cachedWorld`), and per season and tier
 *   goals a match, home / draw / away shares, 0–0 share, biggest margin, the champions' points and
 *   their lead over second, the league top scorer's goals (season ledger), and the stronger side's
 *   win share by XI strength gap (0–5, 5–15, 15+, ratings read at the season's last round);
 * hat-tricks a match from a replay of each season's top-tier league fixtures on the aggregate path
 * (settled records of fixtures without the own club are not retained, →MATCH-25), on a copy of the
 * world at the season's start, so the season itself is untouched. Then 5 observed detailed fixtures
 * per MATCH-29 tactic pairing (calibration partition, round 0) read beside MATCH-23's bands.
 *
 *   pnpm exec tsx scripts/gameplay-read.ts [--seasons 10] [--per-pairing 5]
 *     [--out artifacts/benchmarks/gameplay-read.json]
 */
import { writeFileSync } from 'node:fs';
import { activeMatchModel } from '../packages/contracts/src/match-model';
import type { Fixture, World } from '../packages/contracts/src/types';
import { simulateAggregate } from '../packages/engine/src/aggregate/engine';
import { createWorld } from '../packages/engine/src/founding';
import { M } from '../packages/engine/src/grid/record';
import type { GridResult } from '../packages/engine/src/grid/engine';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { findClub, rating } from '../packages/engine/src/world';
import { cachedWorld, ENABLED_RELEASE } from '../tests/fixtures/worlds';
import { measure } from './grid-bands';
import { referenceCondition } from './match-parity';
import { CORPUS_CONFIG } from './lib/match-parity';
import { measurementIdentity } from './lib/measurement-identity';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
};
const SEASONS = Number(arg('seasons', '10'));
const PER_PAIRING = Number(arg('per-pairing', '5'));
const OUT = arg('out', 'artifacts/benchmarks/gameplay-read.json');
const FOUNDING = {
  country: 'ENG' as const,
  name: 'Gameplay Town',
  color: '#3A7BC2',
  seed: 'gameplay-read',
  level: 'normal' as const,
};
const GAPS = [
  ['0-5', 0, 5],
  ['5-15', 5, 15],
  ['15+', 15, Infinity],
] as const;

const round2 = (x: number) => Math.round(100 * x) / 100;
const share = (a: number, n: number) => round2((100 * a) / Math.max(1, n));

/** Hat-tricks a match of the season's top-tier league fixtures, replayed on a copy of `w`. */
function hatTricks(w: World) {
  const copy = structuredClone(w);
  copy.seed = `${w.seed}:gameplay-read`;
  const fixtures = copy.fixtures.filter(
    (f) => f.kind === 'league' && !f.score && findClub(copy, f.home).tier === 0,
  );
  let count = 0;
  for (const f of fixtures)
    count += simulateAggregate(copy, f).record.players.filter(
      (p) => p.metrics[M.goals]! >= 3,
    ).length;
  return { matches: fixtures.length, perMatch: count / Math.max(1, fixtures.length), count };
}

/** Per-tier reading of a season whose rounds are all played, before it closes. */
function readSeason(w: World) {
  const league = w.fixtures.filter(
    (f): f is Fixture & { score: NonNullable<Fixture['score']> } =>
      (f.kind === 'league' || f.kind === 'lower') && f.score !== undefined,
  );
  const tiers = new Map<number, typeof league>();
  for (const f of league) {
    const tier = findClub(w, f.home).tier;
    tiers.set(tier, [...(tiers.get(tier) ?? []), f]);
  }
  const ledger = w.npcSeason?.competitions ?? [];
  return [...tiers.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, fixtures]) => {
      let goals = 0,
        home = 0,
        draw = 0,
        away = 0,
        nil = 0,
        margin = 0;
      const gap = GAPS.map(() => ({ matches: 0, stronger: 0, draws: 0 }));
      const groups = new Map<string, Map<string, { points: number; gd: number }>>();
      for (const f of fixtures) {
        const { home: h, away: a } = f.score;
        goals += h + a;
        if (h > a) home++;
        else if (h < a) away++;
        else draw++;
        if (h + a === 0) nil++;
        margin = Math.max(margin, Math.abs(h - a));
        const diff = rating(w, findClub(w, f.home), f) - rating(w, findClub(w, f.away), f);
        const bin = GAPS.findIndex(([, lo, hi]) => Math.abs(diff) >= lo && Math.abs(diff) < hi);
        if (diff !== 0 && bin >= 0) {
          gap[bin]!.matches++;
          if (h === a) gap[bin]!.draws++;
          else if (h > a === diff > 0) gap[bin]!.stronger++;
        }
        const table = groups.get(f.groupKey) ?? new Map();
        groups.set(f.groupKey, table);
        for (const [club, us, them] of [
          [f.home, h, a],
          [f.away, a, h],
        ] as const) {
          const row = table.get(club) ?? { points: 0, gd: 0 };
          row.points += us > them ? 3 : us === them ? 1 : 0;
          row.gd += us - them;
          table.set(club, row);
        }
      }
      const champions = [...groups.entries()].map(([groupKey, table]) => {
        const order = [...table.values()].sort((x, y) => y.points - x.points || y.gd - x.gd);
        const scorers = ledger
          .filter((c) => c.groupKey === groupKey)
          .flatMap((c) =>
            c.players.map((p) => p.clubs.reduce((g, x) => g + x.metrics[M.goals]!, 0)),
          );
        return {
          groupKey,
          clubs: table.size,
          points: order[0]!.points,
          lead: order[0]!.points - (order[1]?.points ?? 0),
          topScorer: scorers.length ? Math.max(...scorers) : null,
        };
      });
      const n = fixtures.length;
      return {
        tier,
        matches: n,
        goalsPerMatch: round2(goals / n),
        homeDrawAway: [share(home, n), share(draw, n), share(away, n)],
        nilNil: share(nil, n),
        biggestMargin: margin,
        champions,
        strongerWins: GAPS.map(([key], i) => ({
          gap: key,
          matches: gap[i]!.matches,
          stronger: share(gap[i]!.stronger, gap[i]!.matches),
          draws: share(gap[i]!.draws, gap[i]!.matches),
        })),
      };
    });
}

const started = Date.now();
const built = cachedWorld(
  `gameplay-read:${JSON.stringify(FOUNDING)}:${SEASONS}`,
  () => {
    const w = createWorld(FOUNDING, ENABLED_RELEASE);
    const seasons = [];
    for (let s = 0; s < SEASONS && !w.bankrupt; s++) {
      const t0 = Date.now();
      const replay = hatTricks(w);
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      if (w.bankrupt) break;
      const tiers = readSeason(w);
      closeSeason(w);
      w.revision++;
      seasons.push({
        year: w.year - 1,
        tiers,
        hatTricks: replay,
        seconds: (Date.now() - t0) / 1000,
      });
      console.log(`season ${s + 1}/${SEASONS} done in ${(Date.now() - t0) / 1000} s`);
    }
    return { model: activeMatchModel(w), seasons };
  },
  { input: { founding: FOUNDING, seasons: SEASONS } },
);
const seasonSeconds = (Date.now() - started) / 1000;

const pairings = CORPUS_CONFIG.conditions.filter((c) => c.family === 'tactics');
const t1 = Date.now();
const observed = pairings.flatMap((c) =>
  referenceCondition(c.id, 'calibration', 0, PER_PAIRING).map((s) => ({ ...s, pairing: c.id })),
);
const bands = measure(observed as unknown as GridResult[]).map((row) => ({
  ...row,
  value: round2(row.value),
  inBand: row.value >= row.band[0] && row.value <= row.band[1],
}));
const perMatch = (f: (r: (typeof observed)[number]['record']) => number) =>
  round2(observed.reduce((a, s) => a + f(s.record), 0) / observed.length);
const detailed = {
  pairings: pairings.length,
  perPairing: PER_PAIRING,
  matches: observed.length,
  shots: perMatch((r) => r.metrics[0]![M.shots]! + r.metrics[1]![M.shots]!),
  xg: perMatch((r) => (r.xg?.[0] ?? 0) + (r.xg?.[1] ?? 0)),
  passes: perMatch((r) => r.metrics[0]![M.passes]! + r.metrics[1]![M.passes]!),
  goals: perMatch((r) => r.score.home + r.score.away),
  bands,
  seconds: (Date.now() - t1) / 1000,
};

const summary = {
  task: 'T410',
  indicative: 'one founding, 10 seasons, 5 fixtures a pairing; no MATCH-28 equivalence claimed',
  founding: FOUNDING,
  identity: measurementIdentity('scripts/gameplay-read.ts'),
  ...built,
  detailed,
  seconds: { seasons: seasonSeconds, detailed: detailed.seconds },
};
writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify({ seasons: built.seasons.length, detailed: { ...detailed, bands: undefined } }),
);
