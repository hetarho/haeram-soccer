/**
 * Measurement only (ideation own-club-match-edge): does the own club get the same outcome curve
 * as other clubs at equal prepared strengths? T434 read it on revision 2; T467 reads it on
 * revision 3 (symmetric match context, →MATCH-2) against MATCH-2's target, `outcomeTarget`.
 *
 * A 1950 쉬움 ENG founding simulated for 10 seasons (built once through `cachedWorld`, recording
 * each season's tier-0 champions before the close) has its next season's league fixtures replayed
 * by seed in two readings:
 *   - founding: the founded club's own league fixtures, as T434 read them;
 *   - top: the median-strength club of the founding country's top tier taken as the own club on a
 *     probe-only copy (its squad as the own squad at its 조직력, its tactic, its named manager's
 *     ability without a style, morale 60; the founding build stays, so its home strength counts).
 * Each own fixture plays on the detailed engine as played (`simulateMatch`) and on the aggregate
 * path (`simulateAggregate`); the other fixtures of the same league play the aggregate path as the
 * reference at the same gaps, read from both sides. Every sample is bucketed by its prepared gap
 * from the side's own view: `prepareMatch`'s home-minus-away strength before the day's form, with
 * diminishing returns undone so it reads on the target's axis (the raw gap `outcomeTarget` and the
 * parity tool take). Seed i sets `w.seed = <seed>:probe<i>`; the world is never settled.
 * Indicative, not a MATCH-28 verdict.
 *
 *   pnpm exec tsx scripts/own-edge-probe.ts --seeds 10 --seasons 10 --out <file.json>
 */
import { writeFileSync } from 'node:fs';
import { activeMatchModel } from '../packages/contracts/src/match-model';
import type { Fixture, World } from '../packages/contracts/src/types';
import { simulateAggregate } from '../packages/engine/src/aggregate/engine';
import { buildEffects } from '../packages/engine/src/build';
import { createWorld } from '../packages/engine/src/founding';
import { clubManager } from '../packages/engine/src/managerMarket';
import { matchForm, prepareMatch, simulateMatch } from '../packages/engine/src/match';
import { effectiveGap } from '../packages/engine/src/match-rules';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { clubStyle, findClub, rating, squad } from '../packages/engine/src/world';
import { cachedWorld, ENABLED_RELEASE } from '../tests/fixtures/worlds';
import { gapBucket, outcomeTarget } from './lib/match-parity';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
};
const SEEDS = Number(arg('seeds', '10'));
const SEASONS = Number(arg('seasons', '10'));
const OUT = arg('out', '');
const FOUNDING = {
  country: 'ENG' as const,
  name: 'Probe Town',
  color: '#3A7BC2',
  seed: 'own-edge',
  level: 'easy' as const,
};
const round2 = (x: number) => Math.round(100 * x) / 100;

/** Each tier-0 league's champion of a season whose rounds are all played, before it closes. */
function champions(w: World) {
  const tables = new Map<string, Map<string, { points: number; played: number; gd: number }>>();
  for (const f of w.fixtures) {
    if (f.kind !== 'league' || !f.score || findClub(w, f.home).tier !== 0) continue;
    const table = tables.get(f.groupKey) ?? new Map();
    tables.set(f.groupKey, table);
    for (const [club, us, them] of [
      [f.home, f.score.home, f.score.away],
      [f.away, f.score.away, f.score.home],
    ] as const) {
      const row = table.get(club) ?? { points: 0, played: 0, gd: 0 };
      row.points += us > them ? 3 : us === them ? 1 : 0;
      row.played++;
      row.gd += us - them;
      table.set(club, row);
    }
  }
  return [...tables.entries()].map(([groupKey, table]) => {
    const order = [...table.values()].sort((x, y) => y.points - x.points || y.gd - x.gd);
    return {
      groupKey,
      year: w.year,
      ppm: order[0]!.points / order[0]!.played,
      lead: order[0]!.points - (order[1]?.points ?? 0),
    };
  });
}

const t0 = Date.now();
const built = cachedWorld(
  `own-edge-probe:T467:${JSON.stringify(FOUNDING)}:${SEASONS}`,
  () => {
    const w = createWorld(FOUNDING, ENABLED_RELEASE);
    const titles = [];
    for (let s = 0; s < SEASONS && !w.bankrupt; s++) {
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      if (w.bankrupt) break;
      titles.push(...champions(w));
      closeSeason(w);
      w.revision++;
    }
    return { world: w, titles };
  },
  { input: { founding: FOUNDING, seasons: SEASONS } },
);
const buildSeconds = (Date.now() - t0) / 1000;
const world = built.world;

/** The raw gap whose diminishing-returns value is `effective` (monotonic, so bisection). */
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
/** Home-minus-away prepared strength before the day's form: [raw, after diminishing returns]. */
function preparedGap(w: World, f: Fixture) {
  const { strength } = prepareMatch(w, f);
  const form = matchForm(w, f);
  const effective = strength[0]! - form[0] - (strength[1]! - form[1]);
  return [rawGap(effective), effective] as const;
}

interface Sample {
  gap: number;
  effective: number;
  us: number;
  them: number;
}
function tally(samples: Sample[]) {
  const n = samples.length;
  let w = 0,
    d = 0,
    pts = 0,
    pts2 = 0,
    exp = 0,
    tw = 0,
    td = 0,
    gap = 0,
    eff = 0,
    gf = 0,
    ga = 0;
  for (const s of samples) {
    const p = s.us > s.them ? 3 : s.us === s.them ? 1 : 0;
    if (p === 3) w++;
    if (p === 1) d++;
    pts += p;
    pts2 += p * p;
    const t = outcomeTarget(s.gap);
    tw += t.homeWin;
    td += t.draw;
    exp += 3 * t.homeWin + t.draw;
    gap += s.gap;
    eff += s.effective;
    gf += s.us;
    ga += s.them;
  }
  const ppm = pts / n;
  const sd = Math.sqrt(Math.max(0, pts2 / n - ppm * ppm));
  const pct = (x: number) => Math.round((1000 * x) / n) / 10;
  return {
    n,
    gap: round2(gap / n),
    effectiveGap: round2(eff / n),
    ppm: round2(ppm),
    ppmCi: round2((1.96 * sd) / Math.sqrt(n)),
    targetPpm: round2(exp / n),
    edge: round2(ppm - exp / n),
    wdl: [pct(w), pct(d), pct(n - w - d)],
    targetWdl: [pct(tw), pct(td), pct(n - tw - td)],
    winCi: round2(100 * 1.96 * Math.sqrt(((w / n) * (1 - w / n)) / n)),
    goals: [round2(gf / n), round2(ga / n)],
  };
}
function report(samples: Sample[]) {
  const buckets = new Map<number, Sample[]>();
  for (const s of samples) {
    const b = gapBucket(s.gap);
    buckets.set(b, [...(buckets.get(b) ?? []), s]);
  }
  return {
    all: tally(samples),
    buckets: [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([bucket, list]) => ({ bucket, ...tally(list) })),
  };
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

function read(label: string, w: World) {
  const own = w.playerClub;
  const ownFixture = (f: Fixture) => f.home === own || f.away === own;
  const pending = (f: Fixture) => (f.kind === 'league' || f.kind === 'lower') && !f.score;
  const ownFixtures = w.fixtures.filter((f) => pending(f) && ownFixture(f));
  const groupKey = ownFixtures[0]!.groupKey;
  const others = w.fixtures.filter((f) => pending(f) && !ownFixture(f) && f.groupKey === groupKey);
  const started = Date.now();
  const samples = {
    detailed: [] as Sample[],
    aggregate: [] as Sample[],
    reference: [] as Sample[],
  };
  for (const f of ownFixtures) {
    const home = f.home === own;
    const [raw, eff] = preparedGap(w, f);
    for (let seed = 0; seed < SEEDS; seed++)
      for (const path of ['detailed', 'aggregate'] as const) {
        const { score } = withSeed(w, seed, () =>
          path === 'detailed'
            ? simulateMatch(w, f, false, true).record
            : simulateAggregate(w, f).record,
        );
        samples[path].push({
          gap: home ? raw : -raw,
          effective: home ? eff : -eff,
          us: home ? score.home : score.away,
          them: home ? score.away : score.home,
        });
      }
  }
  const ownSeconds = (Date.now() - started) / 1000;
  for (const f of others) {
    const [raw, eff] = preparedGap(w, f);
    for (let seed = 0; seed < SEEDS; seed++) {
      const { score } = withSeed(w, seed, () => simulateAggregate(w, f).record);
      samples.reference.push(
        { gap: raw, effective: eff, us: score.home, them: score.away },
        { gap: -raw, effective: -eff, us: score.away, them: score.home },
      );
    }
  }
  const club = findClub(w, own);
  const opponents = ownFixtures.map((f) =>
    rating(w, findClub(w, f.home === own ? f.away : f.home), f),
  );
  const result = {
    reading: label,
    club: { id: club.id, name: club.name, tier: club.tier, cohesion: club.cohesion ?? 0.8 },
    year: ownFixtures[0]!.year,
    groupKey,
    fixtures: { own: ownFixtures.length, reference: others.length },
    seeds: SEEDS,
    ownXi: rating(w, club, ownFixtures[0]),
    opponentXi: {
      mean: round2(opponents.reduce((a, b) => a + b, 0) / opponents.length),
      min: Math.min(...opponents),
      max: Math.max(...opponents),
    },
    manager: { ability: w.manager.ability, style: w.manager.style ?? null },
    morale: w.morale,
    homeStrength: buildEffects(w).homeStrength,
    detailed: report(samples.detailed),
    aggregate: report(samples.aggregate),
    reference: report(samples.reference),
    seconds: { own: ownSeconds, all: (Date.now() - started) / 1000 },
  };
  const line = (k: 'detailed' | 'aggregate' | 'reference') =>
    `${k} ${JSON.stringify(result[k].all)}`;
  console.log(`[${label}] ${club.name} ${result.year} ${groupKey} own ${result.ownXi}`);
  for (const k of ['detailed', 'aggregate', 'reference'] as const) console.log(line(k));
  return result;
}

/** A probe-only copy with the median-strength club of the founding country's top tier as own. */
function topCopy() {
  const w = structuredClone(world);
  const top = w.clubs
    .filter((c) => c.country === FOUNDING.country && c.tier === 0)
    .map((c) => ({ c, r: rating(w, c) }))
    .sort((a, b) => a.r - b.r || a.c.id.localeCompare(b.c.id));
  const club = top[Math.floor(top.length / 2)]!.c;
  const adaptation = club.cohesion ?? 0.8;
  const players = squad(w, club).map((p) => ({
    ...structuredClone(p),
    status: 'active' as const,
    adaptation,
  }));
  const ability = clubManager(w, club).ability;
  w.players = players;
  w.playerClub = club.id;
  w.lineup = undefined;
  w.tactic = clubStyle(club);
  w.manager = { ...w.manager, ability, style: undefined };
  w.morale = 60;
  return w;
}

const readings = [read('founding', world), read('top', topCopy())];

const titles = built.titles;
const ppms = titles.map((t) => t.ppm);
const leads = titles.map((t) => t.lead).sort((a, b) => a - b);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b),
    m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)]! : (s[m - 1]! + s[m]!) / 2;
};
const summary = {
  task: 'T467',
  indicative: `one founding, ${SEEDS} seeds a fixture; no MATCH-28 equivalence claimed`,
  founding: FOUNDING,
  seasons: SEASONS,
  model: activeMatchModel(world),
  readings,
  titles: {
    leagues: titles.length,
    // T410's figures are medians: points a match and the lead over second.
    ppm: round2(median(ppms)),
    meanPpm: round2(ppms.reduce((a, b) => a + b, 0) / ppms.length),
    ppmRange: [round2(Math.min(...ppms)), round2(Math.max(...ppms))],
    medianLead: median(leads),
    leadsOf10: leads.filter((x) => x >= 10).length,
    leadsOf2: leads.filter((x) => x <= 2).length,
    maxLead: leads.at(-1),
  },
  seconds: { build: buildSeconds, all: (Date.now() - t0) / 1000 },
};
console.log(JSON.stringify(summary.titles));
if (OUT) writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
