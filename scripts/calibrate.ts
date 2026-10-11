/**
 * Match-outcome calibration harness (MATCH-11, docs/CALIBRATION.md).
 *
 * Simulates thousands of fixtures per strength-gap bucket on both engine paths (the duel chain
 * and the team-level summary) and whole 20-club double round robins, and prints them next to
 * real-football targets: a ClubElo-style mapping of one rating point to 16 Elo points, the draw
 * share of top European leagues by expected score, and season-level points per game.
 *
 *   pnpm exec tsx scripts/calibrate.ts            full run (about a minute)
 *   pnpm exec tsx scripts/calibrate.ts --quick    smaller samples
 *   options: --matches N (gap sample per path), --tier N (sample per tier), --seasons N,
 *            --only curves|tiers|seasons|own
 */
import type { Club, Fixture, Player, Tactic } from '../packages/contracts/src/types';
import {
  activePlayers,
  clubOf,
  createWorld,
  fixturesFor,
  integer,
  moraleStrength,
  random,
  rating,
  simulateMatch,
} from '../packages/engine/src/index';

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const quick = args.includes('--quick');
const MATCHES = option('matches', quick ? 6000 : 30000);
const PER_TIER = option('tier', quick ? 1500 : 4000);
const SEASONS = option('seasons', quick ? 40 : 200);

// ---- Targets ---------------------------------------------------------------------------------
/** One rating point is worth this many Elo points (a division gap of ~11 points ≈ 175 Elo). */
const ELO_PER_POINT = 16;
/** Beyond this gap even a massive favourite keeps losing about one match in twenty. */
const TARGET_SATURATION = 25;
const expected = (gap: number) => 1 / (1 + 10 ** ((-ELO_PER_POINT * gap) / 400));
/** Draw share by the favourite's expected score: long-run top-league averages. */
const DRAWS: [number, number][] = [
  [0.5, 0.28],
  [0.7, 0.22],
  [0.8, 0.15],
  [0.88, 0.1],
  [0.93, 0.08],
  [1, 0],
];
function drawShare(e: number) {
  const x = Math.max(e, 1 - e);
  for (let i = 1; i < DRAWS.length; i++) {
    const [x0, d0] = DRAWS[i - 1],
      [x1, d1] = DRAWS[i];
    if (x <= x1) return d0 + ((d1 - d0) * (x - x0)) / (x1 - x0);
  }
  return 0;
}
/** Target home win / draw / away win for a home-minus-away match-strength gap. */
function target(gap: number) {
  const capped = Math.sign(gap) * Math.min(Math.abs(gap), TARGET_SATURATION);
  const e = expected(capped),
    d = drawShare(e);
  return { w: e - d / 2, d, l: 1 - e - d / 2, e };
}

// ---- World and clubs -------------------------------------------------------------------------
const w = createWorld({
  country: 'ENG',
  name: 'Calibration',
  color: '#335577',
  seed: 'calibration',
  difficulty: 1,
});
let serial = 0;
function makeClub(strength: number): Club {
  const club: Club = {
    id: `CAL:0:0:${serial++}`,
    name: `Calibration ${serial}`,
    short: 'CAL',
    country: 'ENG',
    tier: 0,
    group: 0,
    strength,
    reputation: 50,
    fans: 10000,
    color: '#335577',
  };
  w.clubs.push(club);
  return club;
}
/** A few clubs per strength level, so tactics and generated squads vary inside a bucket. */
const pools = new Map<number, Club[]>();
function poolClub(strength: number, u: number) {
  let pool = pools.get(strength);
  if (!pool) {
    pool = Array.from({ length: 8 }, () => makeClub(strength));
    pools.set(strength, pool);
  }
  return pool[Math.floor(u * pool.length)];
}
/** Home-minus-away match strength exactly as simulateMatch computes it for two unowned clubs. */
const gapOf = (home: Club, away: Club) => rating(w, home) + 3 - rating(w, away);
const fixture = (id: string, home: Club, away: Club): Fixture => ({
  id,
  year: w.year,
  round: 1,
  kind: 'league',
  home: home.id,
  away: away.id,
  country: 'ENG',
  groupKey: 'ENG:0:0',
});

// ---- Match statistics ------------------------------------------------------------------------
interface Tally {
  n: number;
  w: number;
  d: number;
  l: number;
  goals: number;
  home: number;
  away: number;
  rout: number;
  possession: number;
  passes: number;
  completed: number;
  shots: number;
  gap: number;
}
const tally = (): Tally => ({
  n: 0,
  w: 0,
  d: 0,
  l: 0,
  goals: 0,
  home: 0,
  away: 0,
  rout: 0,
  possession: 0,
  passes: 0,
  completed: 0,
  shots: 0,
  gap: 0,
});
function play(t: Tally, f: Fixture, gap: number, duel: boolean) {
  const { score, metrics } = simulateMatch(w, f, false, duel).record;
  t.n++;
  t.gap += gap;
  if (score.home > score.away) t.w++;
  else if (score.home === score.away) t.d++;
  else t.l++;
  t.goals += score.home + score.away;
  t.home += score.home;
  t.away += score.away;
  if (Math.abs(score.home - score.away) >= 5) t.rout++;
  t.possession += metrics[0][11] / 90;
  t.passes += metrics[0][2] + metrics[1][2];
  t.completed += metrics[0][3] + metrics[1][3];
  t.shots += metrics[0][4] + metrics[1][4];
}
const pct = (part: number, whole: number) => (whole ? ((100 * part) / whole).toFixed(1) : '-');
const fixed = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

/** Fixtures across the whole gap range, five tiers deep, bucketed by the actual match gap. */
function gapCurve(duel: boolean) {
  const r = random('calibration:gaps');
  const buckets = new Map<number, Tally>();
  const bases = [77, 66, 55, 44, 86];
  for (let i = 0; i < MATCHES; i++) {
    const base = bases[i % bases.length] + (r() - 0.5) * 6,
      spread = (r() - 0.5) * 76;
    const home = poolClub(clampStrength(base + spread / 2), r()),
      away = poolClub(clampStrength(base - spread / 2), r());
    const gap = gapOf(home, away),
      bucket = Math.max(-35, Math.min(40, Math.round(gap / 5) * 5));
    if (!buckets.has(bucket)) buckets.set(bucket, tally());
    play(buckets.get(bucket)!, fixture(`cal:gap:${i}`, home, away), gap, duel);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]);
}
const clampStrength = (value: number) => Math.max(15, Math.min(99, Math.round(value)));

function printCurve(title: string, rows: [number, Tally][]) {
  console.log(`\n### ${title}\n`);
  console.log(
    '| gap | n | target W/D/L % | engine W/D/L % | goals | home–away | 5+ margin % | home poss % | pass % | passes/side | shots/side |',
  );
  console.log('|---:|---:|---|---|---:|---|---:|---:|---:|---:|---:|');
  let error = 0,
    weight = 0;
  for (const [bucket, t] of rows) {
    const goal = target(t.gap / t.n);
    if (Math.abs(bucket) <= 30) {
      error +=
        Math.abs(goal.w - t.w / t.n) + Math.abs(goal.d - t.d / t.n) + Math.abs(goal.l - t.l / t.n);
      weight += 3;
    }
    console.log(
      `| ${bucket > 0 ? '+' : ''}${bucket} | ${t.n} | ${(goal.w * 100).toFixed(0)}/${(goal.d * 100).toFixed(0)}/${(goal.l * 100).toFixed(0)} | ${pct(t.w, t.n)}/${pct(t.d, t.n)}/${pct(t.l, t.n)} | ${fixed(t.goals / t.n)} | ${fixed(t.home / t.n)}–${fixed(t.away / t.n)} | ${pct(t.rout, t.n)} | ${pct(t.possession, t.n)} | ${pct(t.completed, t.passes)} | ${fixed(t.passes / t.n / 2, 0)} | ${fixed(t.shots / t.n / 2, 1)} |`,
    );
  }
  console.log(
    `\nMean absolute W/D/L error against the target, gaps −30…+30: ${fixed((100 * error) / weight, 1)} points`,
  );
}

/** Ordinary league fixtures inside each tier's strength range (MATCH-11 goals parity). */
const TIERS: [string, number, number][] = [
  ['tier 1 (72–82)', 72, 82],
  ['tier 2 (61–71)', 61, 71],
  ['tier 3 (50–60)', 50, 60],
  ['tier 4 (39–49)', 39, 49],
  ['amateur (35–52)', 35, 52],
];
function tierTable() {
  console.log('\n### Ordinary league fixtures per tier (both clubs drawn from the tier range)\n');
  console.log(
    '| tier | path | home W/D/A % | goals | 5+ margin % | pass % | passes/side | shots/side | duel ÷ summary goals |',
  );
  console.log('|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (const [label, low, high] of TIERS) {
    const results = [true, false].map((duel) => {
      const r = random(`calibration:tier:${label}`),
        t = tally();
      for (let i = 0; i < PER_TIER; i++) {
        const home = poolClub(integer(r, low, high), r()),
          away = poolClub(integer(r, low, high), r());
        if (home === away) continue;
        play(t, fixture(`cal:tier:${label}:${i}`, home, away), gapOf(home, away), duel);
      }
      return t;
    });
    const ratio = results[0].goals / results[0].n / (results[1].goals / results[1].n);
    results.forEach((t, index) =>
      console.log(
        `| ${label} | ${index ? 'summary' : 'duel'} | ${pct(t.w, t.n)}/${pct(t.d, t.n)}/${pct(t.l, t.n)} | ${fixed(t.goals / t.n)} | ${pct(t.rout, t.n)} | ${pct(t.completed, t.passes)} | ${fixed(t.passes / t.n / 2, 0)} | ${fixed(t.shots / t.n / 2, 1)} | ${index ? '' : fixed(ratio)} |`,
      ),
    );
  }
}

// ---- Seasons ---------------------------------------------------------------------------------
interface SeasonSummary {
  champion: number[];
  bottom: number[];
  dominant: number[];
  /** Sum over seasons of the dominant club's XI rating over the league average. */
  gap: number;
  title: number;
  unbeaten: number;
  losses: number;
  draws: number;
  goals: number;
  matches: number;
  homeWins: number;
  allDraws: number;
}
type Outcome = (f: Fixture, gap: number, r: () => number) => { home: number; away: number };
const engineOutcome =
  (duel: boolean): Outcome =>
  (f) =>
    simulateMatch(w, f, false, duel).record.score;
/** Outcomes drawn straight from the target curve: what Elo says this league should look like. */
const eloOutcome: Outcome = (_f, gap, r) => {
  const goal = target(gap),
    u = r();
  return u < goal.w
    ? { home: 1, away: 0 }
    : u < goal.w + goal.d
      ? { home: 0, away: 0 }
      : { home: 0, away: 1 };
};

/**
 * The same leagues for every outcome model, so the rows compare like with like. Leagues with a
 * dominant club keep the tier-1 spread of ten points one tier lower (62–72): generated skills stop
 * at 95, so a club far above a 72–82 league could not field the squad its strength promises.
 */
const leagues = new Map<string, Club[]>();
function league(boost: number | undefined, index: number) {
  const key = `${boost}:${index}`;
  let clubs = leagues.get(key);
  if (!clubs) {
    const r = random(`calibration:league:${key}`),
      low = boost === undefined ? 72 : 62;
    clubs = Array.from({ length: 20 }, () => makeClub(integer(r, low, low + 10)));
    if (boost !== undefined) {
      const others = clubs.slice(1).reduce((sum, club) => sum + club.strength, 0) / 19;
      clubs[0].strength = Math.round(others + boost);
    }
    leagues.set(key, clubs);
  }
  return clubs;
}

/** 20-club double round robins; `boost` lifts club 0 that far over the league average. */
function seasons(boost: number | undefined, outcome: Outcome, tag: string): SeasonSummary {
  const summary: SeasonSummary = {
    champion: [],
    bottom: [],
    dominant: [],
    gap: 0,
    title: 0,
    unbeaten: 0,
    losses: 0,
    draws: 0,
    goals: 0,
    matches: 0,
    homeWins: 0,
    allDraws: 0,
  };
  const r = random(`calibration:outcomes:${tag}:${boost}`);
  const count = Math.max(1, Math.round(SEASONS / 10));
  for (let index = 0; index < count; index++) {
    const clubs = league(boost, index);
    const gaps = new Map<string, number>();
    for (const home of clubs)
      for (const away of clubs)
        if (home !== away) gaps.set(`${home.id}|${away.id}`, gapOf(home, away));
    const perLeague = Math.ceil(SEASONS / count);
    for (let season = 0; season < perLeague && summary.champion.length < SEASONS; season++) {
      const table = new Map(clubs.map((club) => [club.id, { points: 0, l: 0, d: 0, gd: 0 }]));
      for (const f of fixturesFor(clubs, w.year)) {
        const fx = { ...f, id: `cal:${tag}:${boost}:${index}:${season}:${f.id}` };
        const score = outcome(fx, gaps.get(`${f.home}|${f.away}`)!, r);
        const home = table.get(f.home)!,
          away = table.get(f.away)!;
        home.gd += score.home - score.away;
        away.gd += score.away - score.home;
        summary.goals += score.home + score.away;
        summary.matches++;
        if (score.home > score.away) {
          home.points += 3;
          away.l++;
          summary.homeWins++;
        } else if (score.home < score.away) {
          away.points += 3;
          home.l++;
        } else {
          home.points++;
          away.points++;
          home.d++;
          away.d++;
          summary.allDraws++;
        }
      }
      const order = [...table.entries()].sort(
        (a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd,
      );
      summary.champion.push(order[0][1].points / 38);
      summary.bottom.push(order[19][1].points / 38);
      if (boost !== undefined) {
        const row = table.get(clubs[0].id)!;
        summary.dominant.push(row.points / 38);
        summary.gap +=
          rating(w, clubs[0]) - clubs.slice(1).reduce((sum, club) => sum + rating(w, club), 0) / 19;
        if (order[0][0] === clubs[0].id) summary.title++;
        if (row.l === 0) summary.unbeaten++;
        summary.losses += row.l;
        summary.draws += row.d;
      }
    }
  }
  return summary;
}
const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? NaN;
};

function seasonTable() {
  console.log(
    `\n### 20-club seasons (${SEASONS} seasons per row; ordinary leagues 72–82, leagues with a dominant club 62–72 plus that club; Elo rows draw outcomes from the target curve)\n`,
  );
  console.log(
    '| league | outcomes | champion PPG (p10–p90) | bottom PPG | dominant rating gap | dominant PPG | dominant titles % | dominant unbeaten % | dominant L/D per season | goals | home W % | draws % |',
  );
  console.log('|---|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const boost of [undefined, 10, 15, 20, 25]) {
    for (const [label, outcome] of [
      ['Elo target', eloOutcome],
      ['duel', engineOutcome(true)],
      ['summary', engineOutcome(false)],
    ] as [string, Outcome][]) {
      const s = seasons(boost, outcome, label);
      const n = s.champion.length;
      const dominant = boost !== undefined;
      console.log(
        `| ${dominant ? `+${boost} club` : 'ordinary'} | ${label} | ${fixed(mean(s.champion))} (${fixed(quantile(s.champion, 0.1))}–${fixed(quantile(s.champion, 0.9))}) | ${fixed(mean(s.bottom))} | ${dominant ? `+${fixed(s.gap / n, 1)}` : '-'} | ${dominant ? fixed(mean(s.dominant)) : '-'} | ${dominant ? pct(s.title, n) : '-'} | ${dominant ? pct(s.unbeaten, n) : '-'} | ${dominant ? `${fixed(s.losses / n, 1)}/${fixed(s.draws / n, 1)}` : '-'} | ${label === 'Elo target' ? '-' : fixed(s.goals / s.matches)} | ${pct(s.homeWins, s.matches)} | ${pct(s.allDraws, s.matches)} |`,
      );
    }
  }
}

// ---- Own club --------------------------------------------------------------------------------
/** Role-shaped skills whose role rating (overall) is `level`, like generated squads. */
function shape(player: Player, level: number) {
  const bonus = { GK: 0, DEF: 10, MID: 8, FWD: 9 }[player.role];
  const base = level - bonus / 4;
  player.attack = Math.min(100, base + (player.role === 'FWD' ? bonus : 0));
  player.passing = Math.min(100, base + (player.role === 'MID' ? bonus : 0));
  player.defense = Math.min(100, base + (player.role === 'DEF' ? bonus : 0));
  player.stamina = Math.min(100, base);
  player.keeper = player.role === 'GK' ? level : 15;
  if (player.role === 'GK') player.attack = level - 20;
  player.fatigue = 0;
}

/**
 * The owner's club with every player rated `level`, a manager of `ability` and morale `morale`,
 * in a 20-club league of 72–82 clubs. Every league fixture plays the duel chain, as the own
 * league does in the game; fatigue and morale stay fixed so each row is one steady state.
 */
function ownSeasons(level: number, ability: number, morale: number, tactic: Tactic) {
  const own = createWorld({
    country: 'ENG',
    name: 'Calibration Owners',
    color: '#335577',
    seed: 'calibration-own',
    difficulty: 1,
  });
  for (const player of activePlayers(own)) shape(player, level);
  own.manager.ability = ability;
  own.morale = morale;
  own.tactic = tactic;
  const club = clubOf(own);
  const r = random('calibration:own:league');
  const rivals = Array.from({ length: 19 }, (_, i): Club => {
    const rival: Club = {
      id: `OWN:0:0:${i}`,
      name: `Rival ${i}`,
      short: 'RIV',
      country: 'ENG',
      tier: 0,
      group: 0,
      strength: integer(r, 72, 82),
      reputation: 50,
      fans: 10000,
      color: '#335577',
    };
    own.clubs.push(rival);
    return rival;
  });
  const clubs = [club, ...rivals];
  const result = { ppg: [] as number[], title: 0, unbeaten: 0, losses: 0, draws: 0 };
  for (let season = 0; season < SEASONS; season++) {
    const table = new Map(clubs.map((c) => [c.id, { points: 0, l: 0, d: 0, gd: 0 }]));
    for (const f of fixturesFor(clubs, own.year)) {
      const { score } = simulateMatch(
        own,
        { ...f, id: `own:${season}:${f.id}` },
        false,
        true,
      ).record;
      const home = table.get(f.home)!,
        away = table.get(f.away)!;
      home.gd += score.home - score.away;
      away.gd += score.away - score.home;
      if (score.home > score.away) {
        home.points += 3;
        away.l++;
      } else if (score.home < score.away) {
        away.points += 3;
        home.l++;
      } else {
        home.points++;
        away.points++;
        home.d++;
        away.d++;
      }
    }
    const row = table.get(club.id)!;
    const order = [...table.entries()].sort(
      (a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd,
    );
    result.ppg.push(row.points / 38);
    if (order[0][0] === club.id) result.title++;
    if (row.l === 0) result.unbeaten++;
    result.losses += row.l;
    result.draws += row.d;
  }
  const league = rivals.reduce((sum, rival) => sum + rating(own, rival), 0) / rivals.length;
  const extra = (ability - 50) / 4 + moraleStrength(own) - 4;
  return { rating: rating(own, club), league, extra, ...result };
}

function ownTable() {
  console.log(
    `\n### The owner's club in a 72–82 league (${SEASONS} seasons per row, all fixtures on the duel chain)\n`,
  );
  console.log(
    '| own XI | league XI | manager / morale | tactic | strength edge (home/away) | PPG | titles % | unbeaten % | L/D per season |',
  );
  console.log('|---:|---:|---|---|---|---:|---:|---:|---|');
  for (const [level, ability, morale, tactic] of [
    [85, 65, 60, 'balanced'],
    [90, 65, 60, 'balanced'],
    [95, 65, 60, 'balanced'],
    [95, 85, 100, 'balanced'],
    [95, 85, 100, 'press'],
  ] as [number, number, number, Tactic][]) {
    const s = ownSeasons(level, ability, morale, tactic);
    const edge = s.rating - s.league + s.extra;
    console.log(
      `| ${s.rating} | ${fixed(s.league, 1)} | ${ability} / ${morale} | ${tactic} | +${fixed(edge + 3, 1)} / +${fixed(edge, 1)} | ${fixed(mean(s.ppg))} | ${pct(s.title, SEASONS)} | ${pct(s.unbeaten, SEASONS)} | ${fixed(s.losses / SEASONS, 1)}/${fixed(s.draws / SEASONS, 1)} |`,
    );
  }
}

const started = performance.now();
console.log(
  `# Match calibration — ${MATCHES} gap fixtures and ${PER_TIER} tier fixtures per path, ${SEASONS} seasons per row`,
);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
if (!only || only === 'curves') {
  printCurve('Duel chain (own club and own-league fixtures)', gapCurve(true));
  printCurve('Team-level summary (every other fixture)', gapCurve(false));
}
if (!only || only === 'tiers') tierTable();
if (!only || only === 'seasons') seasonTable();
if (!only || only === 'own') ownTable();
console.log(`\n_${((performance.now() - started) / 1000).toFixed(1)} s_`);
