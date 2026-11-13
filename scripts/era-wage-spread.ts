/**
 * The era's star pay spread on the strongest clubs' books (CLUB-48, CLUB-25, ECON-36; T693).
 *
 * Lives ownerless worlds from 1930 (→WORLD-13) and, at each chosen season's close, reads every
 * book-keeping club's season book (→ECON-36): its income, its wage bill (the squad's alone; staff
 * pay sits in operating expenses, →ECON-30) and the same squad priced player by player the day
 * before the close, split into its ordinary part (each player priced at OVR 80 at most) and each
 * star term (the points above 80, the scarcity premium, the top-flight terms from 85). Each star
 * keeps his wage W and his OVR-80 wage W80 (his own age and potential, CLUB-48 r53, through the
 * production `ordinaryWageUnits`), so any spread s prices him at W80 × (W / W80)^s (→CLUB-48)
 * without living the world again: a club's income, squad and strength do not depend on wages
 * before a takeover; only its books' cash and debt would differ once history replays on another
 * spread. Each star also keeps T693's W80 (his potential lowered alike) and his age, so every
 * reading sits beside T693's on the same books (T694).
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
 *     --countries ENG,ESP,FRA,GER --out rows.json
 *   pnpm exec tsx scripts/era-wage-spread.ts --in a.json,b.json --fit         the least compression
 *   pnpm exec tsx scripts/era-wage-spread.ts --in a.json --spread table.json  a table on kept rows
 *
 * Rows written before T694 hold [W, W80] with T693's W80; read with `--in` they count it as both.
 *
 * A season Y is the one starting in Y (w.year = Y), closed in the summer of Y + 1. `--spread`
 * reads { shared: [[year, s], ...], own: { CODE: { through, spread } } } and, when living, also
 * prices every squad exactly through the production function at that table (`exact` below).
 *
 * T696: `--means` lives the world with `--spread`'s table in force and LEAGUE-10's means level on
 * (measurement overrides of `STAR_SPREAD_CONFIG` and the contract wage limit, never game settings), so each
 * row holds the book as lived (`wages` is the wage bill at the table) beside its generated squad's
 * cost at the same strength (`generated`). Every live run also writes `<out>.extra.json`: each
 * season's champions from `w.history`, the clubs the means level sold down ({ year, code, from,
 * to }) and the run's seconds per season. `--until YEAR` lives on past the last row year.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --spread table.json --means \
 *     --out lived.json                                                     a candidate world
 *   pnpm exec tsx scripts/era-wage-spread.ts --in lived.json --lived --extra lived.extra.json
 *   pnpm exec tsx scripts/era-wage-spread.ts --champions-released a.extra.json \
 *     --champions-candidate b.extra.json                                    LEAGUE-10's champions
 *
 * T697: `--cups` lives the world with the books counting their clubs' cup and continental money
 * (→ECON-36; a measurement override of `BOOK_COMPETITIONS`), beside `--spread` and `--means` or
 * without them for the fit. `--observe-cups` leaves it out of the income but records, at each
 * close, every top-flight book's competition money and, for each club the means level sells down,
 * the level its book would have kept with that season's money in it (the historical search),
 * in `<out>.extra.json`; `--screen` reads those extras.
 * T712: `--ability-fit` lives the world, from its generation, on CLUB-25 r61's ability-fit wage (a
 * measurement override of `ABILITY_FIT`); the production side of a comparison runs without it.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --spread table.json --means \
 *     --observe-cups --out screen.json                                     T697's screen world
 *   pnpm exec tsx scripts/era-wage-spread.ts --screen a.extra.json,b.extra.json
 *
 * T698: CLUB-48 r57's champions part reads the real leagues' 1980/81–2009/10 spread (LEAGUE-10
 * r17, `CHAMPION_BAND`, each country's real values beside) and history's noise. `--placebo SALT`
 * lives the released world with its first season's (1930/31) results drawn with that salt
 * (`RESULTS_LUCK`, a measurement override) and records it in the extra; a placebo needs only its
 * champions, so one row year is enough. `--champions-placebo` groups such extras by salt and
 * prints, per set and country, the points outside the real spread pooled over the seeds against
 * `--champions-released`, and the allowance (the largest excess in any country of any set, at
 * least 0); with `--champions-candidate` beside them the candidate reads released + allowance.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 2009 --countries POR \
 *     --until 2009 --placebo placebo-1 --out placebo-1-0.json             one placebo world
 *   pnpm exec tsx scripts/era-wage-spread.ts --champions-placebo p.extra.json,... \
 *     --champions-released r.extra.json,...                               the noise and the allowance
 *   pnpm exec tsx scripts/era-wage-spread.ts --champions-placebo p.extra.json,... \
 *     --champions-released r.extra.json,... --champions-candidate c.extra.json,...  a candidate
 *
 * T803: `--champions-runs` reads archived extras (every value after it, shell-expanded or
 * comma-separated) and prints, per country and world, the longest run of consecutive titles, the
 * runs of five or more and the most titles of one club in any ten seasons, for 1955–2009 and
 * 1980–2009, pooled per kind of world beside; `--out FILE` writes the whole report there.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --champions-runs dir/*.extra.json --out runs.md
 *
 * T808: `--setting flat|spread` lives the world on WORLD-6's squad spread (`SQUAD_SPREAD`, a
 * measurement override) and records it in the extra as `squads`; without it the released default.
 * `--allowance N` gives the champions part a recorded allowance instead of `--champions-placebo`.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --champions-released flat-0.extra.json,... \
 *     --champions-candidate spread-0.extra.json,... --allowance 6
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { longestRuns, median, mostInWindow, runsOfAtLeast, within } from './lib/title-runs';
import { squadSpreadSetting } from './lib/squad-spread-setting';
import type { Club, World } from '../packages/contracts/src/types';
import { historyWorld } from '../packages/engine/src/history';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay, SEASON_END_DAY } from '../packages/engine/src/calendar';
import { squad } from '../packages/engine/src/world';
import { overall } from '../packages/engine/src/player-state';
import { footballQuote } from '../packages/engine/src/quotes';
import { BOOK_COMPETITIONS, keepsBooks } from '../packages/engine/src/books';
import { RESULTS_LUCK } from '../packages/engine/src/results-only';
import { npcWageBill } from '../packages/engine/src/books';
import {
  ABILITY_FIT,
  MARKET_CONFIG,
  marketPoints,
  marketWageAt,
  marketWageUnits,
  ordinaryWageUnits,
  STAR_SPREAD_CONFIG,
  starPaySpread,
  starWagePremium,
} from '../packages/engine/src/market-prices';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const list = (name: string, fallback: string) => option(name, fallback).split(',').filter(Boolean);
/** T808: `--setting flat|spread` lives the worlds on that squad spread (→WORLD-6). */
const SQUADS = squadSpreadSetting(args)[1];

/** CLUB-48's band: the median of the three strongest top-flight clubs, and every club without a project. */
const BAND = { strongest: 0.7, every: 1 };

type Table = typeof STAR_SPREAD_CONFIG;
/** [W, W80, T693's W80, age]; rows written before T694 hold [W, T693's W80]. */
type Star = [number, number, number?, number?];
/** Under 24, a player's promise counts in his wage (`MARKET_CONFIG.promise.none`). */
const YOUNG = MARKET_CONFIG.promise.none;
interface Row {
  seed: string;
  year: number;
  code: string;
  id: string;
  tier: number;
  strength: number;
  project: boolean;
  /** The settled book, minor units of the season's money. */
  income: number;
  wages: number;
  costs: number;
  /** The squad priced the day before the close at the released curve (s = 1). */
  repriced: number;
  /** Players at OVR 80 or below, and every star at W80. */
  ordinary: number;
  /** The star terms above W80: the points above 80, the scarcity premium, the top-flight terms. */
  points: number;
  scarcity: number;
  top: number;
  /** Sum of W of the players at OVR 80 or below. */
  base: number;
  /** Each star (OVR above 80): [W, W80, T693's W80 (potential lowered alike), age]. */
  stars: Star[];
  /** The squad priced through the production function at `--spread`, when given. */
  exact?: number;
  /** `--means`: the club's generated squad at its strength, priced as the books price a squad. */
  generated?: number;
}
/** What a live run keeps beside its rows (`<out>.extra.json`). */
interface Extra {
  seed: string;
  means: boolean;
  /** T697: competition money in the books' income (`--cups`). */
  cups?: boolean;
  /** T698: the placebo salt 1930/31's results were drawn afresh with (`--placebo`). */
  placebo?: string;
  /** T808: the squad spread the world was lived on (`--setting`), absent on the default. */
  squads?: string;
  table?: Table;
  champions: { year: number; code: string; club: string }[];
  /**
   * Every club the means level sold down; with `--observe-cups` also the division its book was
   * earned in (`book`), the season's competition money (`money`) and the level the book would
   * have paid with that money in it (`withMoney`, T697's one-step counterfactual).
   */
  sold: {
    year: number;
    code: string;
    id: string;
    tier: number;
    from: number;
    to: number;
    book?: number;
    money?: number;
    withMoney?: number;
  }[];
  /** `--observe-cups`: each top-flight book's competition money at each close (T697). */
  competitions?: CompetitionRow[];
  seasons: number;
  seconds: number;
}
/** A top-flight book at a close: its strength, its income without competition money and that money. */
interface CompetitionRow {
  year: number;
  code: string;
  id: string;
  strength: number;
  income: number;
  prizes: number;
  bonuses: number;
  gates: number;
}
const MEANS = args.includes('--means');
/** T697: competition money in force (`--cups`), or observed beside the books without it. */
const CUPS = args.includes('--cups');
const OBSERVE_CUPS = args.includes('--observe-cups');
/**
 * T712: CLUB-25 r61's ability-fit wage in the lived world from its generation (`--ability-fit`), a
 * measurement override of `ABILITY_FIT`, never a game setting.
 */
const FIT = args.includes('--ability-fit');
if (FIT) ABILITY_FIT.inForce = true;
/** T698: a placebo set, the world's first season's results drawn with this salt (`--placebo`). */
const PLACEBO = option('placebo', '');

function readTable(path: string): Table {
  return JSON.parse(readFileSync(path, 'utf8')) as Table;
}
function withTable<T>(table: Table, run: () => T): T {
  const kept = { shared: STAR_SPREAD_CONFIG.shared, own: STAR_SPREAD_CONFIG.own };
  STAR_SPREAD_CONFIG.shared = table.shared;
  STAR_SPREAD_CONFIG.own = table.own;
  try {
    return run();
  } finally {
    STAR_SPREAD_CONFIG.shared = kept.shared;
    STAR_SPREAD_CONFIG.own = kept.own;
  }
}

/** One club's squad priced the day before the close. */
function priceSquad(w: World, club: Club) {
  const from = MARKET_CONFIG.star.from,
    promise = MARKET_CONFIG.promise.wage;
  let base = 0,
    ordinary = 0,
    points = 0,
    scarcity = 0,
    top = 0;
  const stars: Star[] = [];
  for (const p of squad(w, club)) {
    const ovr = overall(p),
      age = w.year - p.born,
      q = (units: number) => Number(footballQuote(club.country, w.year, units));
    const full = q(marketWageUnits(club.tier, ovr, age, p.potential));
    if (Number(marketWageAt(club.country, w.year, club.tier, p, ovr)) !== full)
      throw new Error('measure the released curve: the tree prices with a spread below 1');
    if (ovr <= from) {
      base += full;
      ordinary += full;
      continue;
    }
    // W80 at his own age and potential; the points between W80 and W are his market points at
    // his OVR less those at 80, at his promise (the age terms cancel).
    const w80Units = ordinaryWageUnits(club.tier, age, p.potential),
      pointsUnits =
        w80Units *
        MARKET_CONFIG.perPoint **
          (marketPoints(ovr, age, p.potential, promise) -
            marketPoints(from, age, p.potential, promise)),
      w80 = q(w80Units);
    ordinary += w80;
    points += q(pointsUnits) - w80;
    scarcity += q(pointsUnits * starWagePremium(ovr)) - q(pointsUnits);
    top += full - q(pointsUnits * starWagePremium(ovr));
    stars.push([full, w80, q(ordinaryWageUnits(club.tier, age, p.potential - (ovr - from))), age]);
  }
  return {
    base,
    ordinary,
    points,
    scarcity,
    top,
    stars,
    repriced: ordinary + points + scarcity + top,
  };
}

function live(seed: string, years: number[], codes: string[], table?: Table, until = 0) {
  const w = historyWorld(seed),
    rows: Row[] = [],
    last = Math.max(...years, until);
  const t0 = performance.now();
  const sold: Extra['sold'] = [];
  const competitions: CompetitionRow[] = [];
  if (CUPS) BOOK_COMPETITIONS.inForce = true;
  if (PLACEBO) {
    RESULTS_LUCK.salt = PLACEBO;
    RESULTS_LUCK.season = w.year;
  }
  if (OBSERVE_CUPS)
    BOOK_COMPETITIONS.observe = (c, m, released) => {
      if (c.tier === 0)
        competitions.push({
          year: w.year,
          code: c.country,
          id: c.id,
          strength: c.strength,
          income: Number(released),
          prizes: Number(m.prizes),
          bonuses: Number(m.bonuses),
          gates: Number(m.gates),
        });
    };
  if (MEANS && table) {
    STAR_SPREAD_CONFIG.shared = table.shared;
    STAR_SPREAD_CONFIG.own = table.own;
  }
  const first = w.year;
  while (w.year <= last) {
    const season = w.year;
    if (!years.includes(season)) {
      while (w.year === season)
        advanceDays(w, SEASON_END_DAY + 1 - currentDay(w), undefined, false);
      continue;
    }
    advanceDays(w, SEASON_END_DAY - currentDay(w), undefined, false);
    const clubs = w.clubs.filter((c) => codes.includes(c.country) && keepsBooks(w, c));
    const lived = (c: Club) => ({
      base: 0,
      ordinary: 0,
      points: 0,
      scarcity: 0,
      top: 0,
      stars: [] as Star[],
      repriced: squad(w, c).reduce(
        (sum, p) => sum + Number(marketWageAt(c.country, w.year, c.tier, p)),
        0,
      ),
      generated: Number(npcWageBill(w, c)),
    });
    const priced = new Map(
      clubs.map((c) => [
        c.id,
        {
          ...(MEANS
            ? lived(c)
            : { ...priceSquad(w, c), generated: undefined as number | undefined }),
          strength: c.strength,
          tier: c.tier,
          project: (c.project ?? 0) > 0,
          exact:
            table && !MEANS
              ? withTable(table, () =>
                  squad(w, c).reduce(
                    (sum, p) => sum + Number(marketWageAt(c.country, w.year, c.tier, p)),
                    0,
                  ),
                )
              : undefined,
        },
      ]),
    );
    while (w.year === season) advanceDays(w, SEASON_END_DAY + 1 - currentDay(w), undefined, false);
    for (const c of clubs) {
      const book = c.books?.seasons.find((s) => s.year === season);
      if (!book) continue;
      const p = priced.get(c.id)!;
      rows.push({
        seed,
        year: season,
        code: c.country,
        id: c.id,
        tier: p.tier,
        strength: p.strength,
        project: p.project,
        income: Number(book.income),
        wages: Number(book.wages),
        costs: Number(book.costs),
        repriced: p.repriced,
        ordinary: p.ordinary,
        points: p.points,
        scarcity: p.scarcity,
        top: p.top,
        base: p.base,
        stars: MEANS ? [] : p.stars,
        ...(p.exact !== undefined ? { exact: p.exact } : {}),
        ...(p.generated !== undefined ? { generated: p.generated } : {}),
      });
      // Lived at the table, the book's own wage bill is the reading (`wagesAt` = base).
      if (MEANS) rows[rows.length - 1]!.base = Number(book.wages);
    }
    console.error(
      `${seed} ${season}/${(season + 1) % 100}: ${clubs.length} clubs at ${((performance.now() - t0) / 1000).toFixed(0)} s`,
    );
  }
  const extra: Extra = {
    seed,
    means: MEANS,
    ...(CUPS ? { cups: true } : {}),
    ...(PLACEBO ? { placebo: PLACEBO } : {}),
    ...(SQUADS ? { squads: SQUADS } : {}),
    ...(table ? { table } : {}),
    champions: w.history.flatMap((h) =>
      h.champions.map((ch) => ({ year: h.year, code: ch.country, club: ch.club })),
    ),
    sold,
    ...(OBSERVE_CUPS ? { competitions } : {}),
    seasons: w.history.length,
    seconds: (performance.now() - t0) / 1000,
  };
  console.error(`${seed}: ${extra.seasons} seasons from ${first} in ${extra.seconds.toFixed(0)} s`);
  return { rows, extra };
}

/** A star's wage at spread s on CLUB-48 r53's W80 (his own potential) or, `t693`, on T693's. */
function starAt(star: Star, s: number, t693 = false) {
  const full = star[0],
    w80 = t693 ? (star[2] ?? star[1]) : star[1];
  return s === 1 ? full : w80 * (full / w80) ** s;
}
/** The wage bill of a row at spread s: W of the ordinary players and W80 × (W / W80)^s of each star. */
const wagesAt = (row: Row, s: number, t693 = false) =>
  row.base + row.stars.reduce((sum, star) => sum + starAt(star, s, t693), 0);

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '-');
const keyOf = (r: Row) => `${r.seed}|${r.year}|${r.code}`;

/** Cases: one seed, season and country, its three strongest top-flight clubs and every club. */
function cases(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  return [...groups.values()].map((group) => {
    const flight = group.filter((r) => r.tier === 0).sort((a, b) => b.strength - a.strength);
    return { seed: group[0]!.seed, year: group[0]!.year, code: group[0]!.code, flight, group };
  });
}
type Case = ReturnType<typeof cases>[number];
function verdict(c: Case, spreadOf: (r: Row) => number, t693 = false) {
  const ratio = (r: Row) => wagesAt(r, spreadOf(r), t693) / r.income;
  const strongest = median(c.flight.slice(0, 3).map(ratio));
  const over = c.group.filter((r) => !r.project && ratio(r) > BAND.every);
  return { strongest, over, ok: strongest <= BAND.strongest && !over.length };
}

function booksReport(rows: Row[]) {
  console.log('\n### Books at the released curve (s = 1): wage bill / revenue\n');
  console.log(
    "Wage line: the books' wage bill, the squad's alone (staff pay sits in operating expenses, →ECON-30); repriced = the squad priced the day before the close. Ordinary = every player at OVR 80 at most; the star terms are each star's wage above his OVR-80 wage. Shares of revenue.\n",
  );
  console.log(
    '| seed | season | country | club | str | income (m) | wages / revenue | repriced = book | ordinary | + points above 80 | + scarcity | + top-flight terms | stars |',
  );
  console.log('|---|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|');
  for (const c of cases(rows)) {
    const show = [...c.flight.slice(0, 3)];
    const mid = c.flight[c.flight.length >> 1];
    if (mid && !show.includes(mid)) show.push(mid);
    for (const [i, r] of show.entries())
      console.log(
        `| ${r.seed.slice(-1)} | ${r.year}/${(r.year + 1) % 100} | ${r.code} | ${i < 3 ? `#${i + 1}` : 'median'} ${r.id} | ${r.strength} | ${(r.income / 1e6).toFixed(1)} | ${pct(r.wages / r.income)} | ${r.repriced === r.wages ? 'yes' : `no (${pct(r.repriced / r.income)})`} | ${pct(r.ordinary / r.income)} | ${pct(r.points / r.income)} | ${pct(r.scarcity / r.income)} | ${pct(r.top / r.income)} | ${r.stars.length} |`,
      );
  }
}

/** The largest s (steps of 0.01) at which a case meets CLUB-48's band; -1 if none, 0 meeting at 0. */
function leastCompression(c: Case, t693 = false) {
  for (let k = 100; k >= 0; k--) if (verdict(c, () => k / 100, t693).ok) return k / 100;
  return -1;
}

function fitReport(rows: Row[], table?: Table) {
  console.log(
    "\n### Least compression per case (CLUB-48: median of the three strongest ≤ 70%, no club without a project above 100%), beside T693's W80\n",
  );
  console.log(
    "W80: CLUB-48 r53's (his own age and potential); T693's priced him with his potential lowered alike. At s = 1 both are the released curve.\n",
  );
  console.log(
    "| seed | season | country | at s = 1: strongest median / clubs over | at s = 0 | largest s meeting the band | T693's W80: at s = 0 | T693's W80: largest s |",
  );
  console.log('|---|---|---|---|---|---:|---|---:|');
  const best = new Map<string, [number[], number[]]>();
  const fmt = (s: number) => (s < 0 ? 'none' : s.toFixed(2));
  for (const c of cases(rows)) {
    const one = verdict(c, () => 1),
      zero = verdict(c, () => 0),
      zeroT693 = verdict(c, () => 0, true),
      s = leastCompression(c),
      sT693 = leastCompression(c, true);
    const own = table?.own[c.code];
    const ownNote = own && c.year <= own.through ? ` (own anchor s = ${own.spread})` : '';
    console.log(
      `| ${c.seed.slice(-1)} | ${c.year}/${(c.year + 1) % 100} | ${c.code}${ownNote} | ${pct(one.strongest)} / ${one.over.length} | ${pct(zero.strongest)} / ${zero.over.length}${zero.over.length ? ` (${zero.over.map((r) => `${r.id} str ${r.strength} ${pct(wagesAt(r, 0) / r.income)}`).join(', ')})` : ''} | ${fmt(s)} | ${pct(zeroT693.strongest)} / ${zeroT693.over.length} | ${fmt(sT693)} |`,
    );
    if (own && c.year <= own.through) continue;
    const [now, then] = best.get(String(c.year)) ?? [[], []];
    best.set(String(c.year), [
      [...now, s],
      [...then, sT693],
    ]);
  }
  const least = (values: number[]) =>
    Math.min(...values) < 0 ? 'none meets the band' : Math.min(...values).toFixed(2);
  console.log("\n| season | shared s: least over the cases (own anchors left out) | T693's W80 |");
  console.log('|---|---:|---:|');
  for (const [year, [now, then]] of best)
    console.log(`| ${year} | ${least(now)} | ${least(then)} |`);
}

/**
 * What CLUB-48 r53's W80 changes at a table's s, against T693's: the wage bill's change over a
 * case's clubs and the share of it paid to stars under 24 (the only players whose promise counts).
 */
function changeOf(c: Case, s: number) {
  let all = 0,
    young = 0,
    stars = 0,
    youngStars = 0,
    largest = 0;
  for (const r of c.group)
    for (const star of r.stars) {
      const now = starAt(star, s),
        then = starAt(star, s, true);
      all += now - then;
      stars++;
      if (star[3] !== undefined && star[3] < YOUNG) {
        young += now - then;
        youngStars++;
      }
      largest = Math.max(largest, now / then - 1);
    }
  return { all, young, stars, youngStars, largest };
}

function tableReport(rows: Row[], table: Table, label: string) {
  console.log(`\n### ${label}: the table ${JSON.stringify(table)}\n`);
  console.log(
    "W80: CLUB-48 r53's (his own age and potential). T693's reading: the same books with his potential lowered alike. Change: the case's wage bill on r53's W80 less T693's, all clubs, and the share of it paid to stars under 24; largest: the largest rise of one star's wage.\n",
  );
  console.log(
    "| seed | season | country | s | strongest three: wage / revenue | median | clubs without a project above revenue | verdict | T693's reading: median / clubs above revenue / verdict | change: wage bill, under-24 share (young stars / stars), largest | exact = formula |",
  );
  console.log('|---|---|---|---:|---|---:|---|---|---|---|---|');
  let pass = 0,
    passT693 = 0,
    all = 0;
  const moved: string[] = [];
  for (const c of cases(rows)) {
    const s = withTable(table, () => starPaySpread(c.code, c.year));
    const v = verdict(c, () => s),
      then = verdict(c, () => s, true),
      change = changeOf(c, s);
    all++;
    if (v.ok) pass++;
    if (then.ok) passT693++;
    if (v.ok !== then.ok)
      moved.push(
        `${c.seed.slice(-1)} ${c.year} ${c.code}: ${then.ok ? 'ok' : 'OUT'} → ${v.ok ? 'ok' : 'OUT'}`,
      );
    const bill = c.group.reduce((sum, r) => sum + wagesAt(r, s, true), 0);
    const changeCell = change.all
      ? `${change.all > 0 ? '+' : ''}${pct(change.all / bill)}, ${pct(change.young / change.all)} (${change.youngStars} / ${change.stars}), ${pct(change.largest)}`
      : `none (${change.youngStars} / ${change.stars})`;
    const exact = c.group.every((r) => r.exact === undefined)
      ? '-'
      : c.group.every(
            (r) => r.exact === undefined || Math.abs(r.exact - wagesAt(r, s)) <= r.stars.length + 1,
          )
        ? 'yes'
        : 'no';
    console.log(
      `| ${c.seed.slice(-1)} | ${c.year}/${(c.year + 1) % 100} | ${c.code} | ${s.toFixed(2)} | ${c.flight
        .slice(0, 3)
        .map((r) => `${r.strength}: ${pct(wagesAt(r, s) / r.income)}`)
        .join(
          ', ',
        )} | ${pct(v.strongest)} | ${v.over.length ? v.over.map((r) => `${r.id} (${r.tier + 1}부, str ${r.strength}) ${pct(wagesAt(r, s) / r.income)}`).join(', ') : 'none'} | ${v.ok ? 'ok' : 'OUT'} | ${pct(then.strongest)} / ${then.over.length} / ${then.ok ? 'ok' : 'OUT'} | ${changeCell} | ${exact} |`,
    );
  }
  console.log(
    `\n${pass} of ${all} cases meet CLUB-48's band (T693's W80 on the same books: ${passT693}).`,
  );
  console.log(
    moved.length ? `Verdicts moved: ${moved.join('; ')}.` : 'No verdict moved from T693’s reading.',
  );
}

/**
 * T696: the books of worlds lived with a table and the means level (`--means` rows). Per case the
 * strongest-three median of the books' own wage bill / revenue and every club without a project
 * above its revenue; the gap between a book's wage bill and its generated squad's at the same
 * strength; and, from `--extra`, where the means level bound.
 */
function livedReport(rows: Row[], extras: Extra[]) {
  console.log(
    "\n### Books lived with the table and the means level: the books' own wage bill / revenue\n",
  );
  console.log(
    "Worlds lived from 1930 with the candidate table in force and LEAGUE-10's means level on (measurement overrides). Wage line: the books' wage bill, the squad's alone (→ECON-30). Gap: the book's wage bill / its generated squad's at the same strength (median, min–max over the case's clubs).\n",
  );
  console.log(
    '| seed | season | country | strongest three: str wage / revenue | median | clubs without a project above revenue | verdict | gap: median (min–max) |',
  );
  console.log('|---|---|---|---|---:|---|---|---|');
  let pass = 0,
    all = 0,
    within = 0;
  const failures: string[] = [];
  const overText = (over: Row[]) =>
    over
      .map((r) => `${r.id} (${r.tier + 1}부, str ${r.strength}) ${pct(r.wages / r.income)}`)
      .join(', ');
  for (const c of cases(rows)) {
    const v = verdict(c, () => 1);
    all++;
    if (!v.over.length) within++;
    if (v.ok) pass++;
    else
      failures.push(
        `${c.seed.slice(-1)} ${c.year} ${c.code}: median ${pct(v.strongest)}${v.over.length ? `, ${overText(v.over)}` : ''}`,
      );
    const gaps = c.group
      .filter((r) => r.generated)
      .map((r) => r.wages / r.generated!)
      .sort((a, b) => a - b);
    const strongest = c.flight
      .slice(0, 3)
      .map((r) => `${r.strength}: ${pct(r.wages / r.income)}`)
      .join(', ');
    const gap = gaps.length
      ? `${median(gaps).toFixed(3)} (${gaps[0]!.toFixed(3)}–${gaps.at(-1)!.toFixed(3)})`
      : '-';
    console.log(
      `| ${c.seed.slice(-1)} | ${c.year}/${(c.year + 1) % 100} | ${c.code} | ${strongest} | ${pct(v.strongest)} | ${v.over.length ? overText(v.over) : 'none'} | ${v.ok ? 'ok' : 'OUT'} | ${gap} |`,
    );
  }
  console.log(
    `\n${pass} of ${all} cases meet CLUB-48's band on the lived books (the strongest-three median and no club without a project above its revenue); ${within} of ${all} hold no club without a project above its revenue (the held-out gate).`,
  );
  if (failures.length) console.log(`Failures: ${failures.join('; ')}.`);
  if (!extras.length) return;
  console.log(
    '\n### Where the means level bound: club-seasons sold down / strength points sold, per country and decade\n',
  );
  const decades = [
    ...new Set(extras.flatMap((e) => e.sold.map((s) => s.year - (s.year % 10)))),
  ].sort((a, b) => a - b);
  const codes = [...new Set(extras.flatMap((e) => e.sold.map((s) => s.code)))].sort();
  console.log(`| country | ${decades.map((d) => `${d}s`).join(' | ')} | top flight, all decades |`);
  console.log(`|---|${decades.map(() => '---:|').join('')}---:|`);
  const cell = (list: Extra['sold']) =>
    list.length ? `${list.length} / ${list.reduce((sum, s) => sum + s.from - s.to, 0)}` : '-';
  for (const code of codes) {
    const all = extras.flatMap((e) => e.sold.filter((s) => s.code === code));
    const decadeCells = decades.map((d) => cell(all.filter((s) => s.year - (s.year % 10) === d)));
    console.log(
      `| ${code} | ${decadeCells.join(' | ')} | ${cell(all.filter((s) => s.tier === 0))} |`,
    );
  }
  console.log(
    `\nCells: club-seasons sold down / strength points sold, summed over ${extras.length} worlds (${extras.map((e) => e.seed).join(', ')}); the tier is the division after the close.`,
  );
}

type Band = Record<'different' | 'most', [number, number]>;
/**
 * CLUB-48 r57's reference, LEAGUE-10 r17: the real leagues 1980/81–2009/10 on their official
 * champions lists (titles not awarded left out: Italy 2004/05, France 1992/93) — 4–9 different
 * champions per country, the most titles of one club 7–17; `REAL_CHAMPIONS` is LEAGUE-10's
 * per-country table, whose extremes are the band's ends.
 */
const CHAMPION_BAND: Band = { different: [4, 9], most: [7, 17] };
const REAL_CHAMPIONS: Record<string, { different: number; most: number; club: string }> = {
  ENG: { different: 8, most: 11, club: 'Manchester United' },
  ESP: { different: 7, most: 11, club: 'Real Madrid, Barcelona' },
  ITA: { different: 8, most: 9, club: 'Juventus' },
  GER: { different: 7, most: 16, club: 'Bayern München' },
  FRA: { different: 9, most: 7, club: 'Lyon' },
  NED: { different: 5, most: 14, club: 'PSV' },
  POR: { different: 4, most: 17, club: 'Porto' },
  BEL: { different: 7, most: 14, club: 'Anderlecht' },
};
/** LEAGUE-10's 261011 measurement of the model's own spread, T696's and T697's band: a second, labelled reading. */
const BAND_261011: Band = { different: [5, 9], most: [8, 15] };
{
  const real = Object.values(REAL_CHAMPIONS);
  const ends = (key: 'different' | 'most') => [
    Math.min(...real.map((r) => r[key])),
    Math.max(...real.map((r) => r[key])),
  ];
  for (const key of ['different', 'most'] as const)
    if (ends(key).join() !== CHAMPION_BAND[key].join())
      throw new Error(`the band's ${key} ends are not the real leagues' extremes`);
}
const realOf = (code: string) => {
  const r = REAL_CHAMPIONS[code];
  return r ? `${r.different} / ${r.most}` : '-';
};
const outside = (value: number, [low, high]: [number, number]) =>
  Math.max(0, low - value, value - high);
/** Points outside a band: the different champions and the most titles, each by how far it sits outside. */
const pointsOutside = (x: { different: number; most: number }, band: Band) =>
  outside(x.different, band.different) + outside(x.most, band.most);
function championsOf(extra: Extra, code: string, from: number, to: number) {
  const titles = new Map<string, number>();
  for (const ch of extra.champions)
    if (ch.code === code && ch.year >= from && ch.year <= to)
      titles.set(ch.club, (titles.get(ch.club) ?? 0) + 1);
  return {
    seasons: [...titles.values()].reduce((a, b) => a + b, 0),
    different: titles.size,
    most: Math.max(0, ...titles.values()),
  };
}
const codesOf = (extras: Extra[]) =>
  [...new Set(extras.flatMap((e) => e.champions.map((ch) => ch.code)))].sort();
/** Per country, the points outside `band` summed over the extras (one world per seed). */
function pooledOutside(extras: Extra[], band: Band, from: number, to: number) {
  const pooled = new Map<string, number>();
  for (const e of extras)
    for (const code of codesOf([e])) {
      const c = championsOf(e, code, from, to);
      if (c.seasons) pooled.set(code, (pooled.get(code) ?? 0) + pointsOutside(c, band));
    }
  return pooled;
}
/**
 * The share of the country-seasons from..to whose champion differs from the released world's on
 * the same seed: how far a set's history has diverged (context for the allowance, not a rule).
 */
function divergence(released: Extra[], extras: Extra[], from: number, to: number) {
  let differ = 0,
    all = 0;
  for (const e of extras) {
    const rel = released.find((r) => r.seed === e.seed);
    if (!rel) continue;
    const key = (ch: Extra['champions'][number]) => `${ch.year}:${ch.code}`;
    const theirs = new Map(rel.champions.map((ch) => [key(ch), ch.club]));
    for (const ch of e.champions)
      if (ch.year >= from && ch.year <= to && theirs.has(key(ch))) {
        all++;
        if (theirs.get(key(ch)) !== ch.club) differ++;
      }
  }
  return { differ, all, share: all ? differ / all : 0 };
}
const percent = (x: number) => `${(100 * x).toFixed(1)}%`;
const seedsOf = (extras: Extra[]) => [...new Set(extras.map((e) => e.seed))].sort();

/**
 * History's noise (CLUB-48 r57): placebo sets of the released world on the same seeds, each with
 * 1930/31's results drawn afresh. Per set and country the points outside the real spread pooled
 * over the seeds against the released worlds; the allowance is the largest excess over released in
 * any country of any complete set, at least 0. Returns the allowance and how many sets are complete.
 */
function placeboReport(released: Extra[], placebos: Extra[], from: number, to: number) {
  const band = CHAMPION_BAND,
    seeds = seedsOf(released);
  const sets = new Map<string, Extra[]>();
  for (const e of placebos) {
    if (!e.placebo) throw new Error(`${e.seed}: not a placebo world (no salt in its extra)`);
    if (e.means || e.cups || e.table)
      throw new Error(`${e.placebo}: a placebo lives the released world`);
    sets.set(e.placebo, [...(sets.get(e.placebo) ?? []), e]);
  }
  const order = [...sets.keys()].sort(
    (a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')) || a.localeCompare(b),
  );
  const complete = order.filter((salt) => seedsOf(sets.get(salt)!).join() === seeds.join());
  const rel = pooledOutside(released, band, from, to),
    codes = codesOf(released);
  console.log(
    `\n### History's noise: ${complete.length} placebo sets × seeds ${seeds.join(', ')}, champions ${from}–${to}\n`,
  );
  console.log(
    `Each set: the released world (s = 1, no means level, no competition money in the books) lived again from 1930 on the same seeds with 1930/31's results drawn with the set's salt (\`RESULTS_LUCK\`); clubs, rules and every later draw unchanged. Cells: points outside the real spread (different ${band.different.join('–')}, most ${band.most.join('–')}) summed over the seeds, then (excess over released). Diverged: the share of the country-seasons ${from}–${to} whose champion differs from released.\n`,
  );
  console.log(`| set | ${codes.join(' | ')} | largest excess | diverged |`);
  console.log(`|---|${codes.map(() => '---:|').join('')}---:|---:|`);
  console.log(
    `| real (different / most) | ${codes.map(realOf).join(' | ')} | - | - |\n| released | ${codes.map((c) => rel.get(c) ?? 0).join(' | ')} | - | - |`,
  );
  let allowance = 0;
  const where: string[] = [];
  for (const salt of order) {
    const extras = sets.get(salt)!,
      done = complete.includes(salt);
    const own = pooledOutside(extras, band, from, to);
    const excess = codes.map((c) => (own.get(c) ?? 0) - (rel.get(c) ?? 0));
    const largest = Math.max(...excess);
    if (done && largest > allowance) allowance = largest;
    if (done && largest > 0)
      where.push(`${salt} ${codes.filter((_, i) => excess[i] === largest).join('/')} +${largest}`);
    const d = divergence(released, extras, from, to);
    console.log(
      `| ${salt}${done ? '' : ` (incomplete: ${seedsOf(extras).length} of ${seeds.length} seeds)`} | ${codes.map((c, i) => `${own.get(c) ?? 0} (${excess[i]! >= 0 ? '+' : ''}${excess[i]})`).join(' | ')} | ${largest} | ${percent(d.share)} |`,
    );
  }
  const shares = complete.map((salt) => divergence(released, sets.get(salt)!, from, to).share);
  console.log(
    `\n**Allowance: ${allowance}** point${allowance === 1 ? '' : 's'} (the largest excess over released in any country of any of the ${complete.length} complete sets, at least 0)${where.length ? `; sets ending further out than released: ${where.join(', ')}` : '; no set ends further out than released in any country'}.`,
  );
  if (shares.length)
    console.log(
      `Diverged champions per set: ${percent(Math.min(...shares))}–${percent(Math.max(...shares))} (mean ${percent(shares.reduce((a, b) => a + b, 0) / shares.length)}).`,
    );
  return { allowance, complete: complete.length };
}

/**
 * CLUB-48 r57's champions part on a candidate: per country, pooled over the seeds, within the real
 * spread or no further outside it than released + the allowance. The per-seed table and the
 * 261011 band's reading stay beside it as diagnosis.
 */
function championsReport(
  released: Extra[],
  candidate: Extra[],
  from: number,
  to: number,
  allowance?: number,
) {
  const band = CHAMPION_BAND,
    codes = codesOf(candidate);
  console.log(
    `\n### Champions ${from}–${to} per country and seed: different top-flight champions / the most titles of one club (diagnosis)\n`,
  );
  console.log(
    `Real: LEAGUE-10 r17's real leagues (band ${band.different.join('–')} and ${band.most.join('–')}); 261011: the model's own band (${BAND_261011.different.join('–')} and ${BAND_261011.most.join('–')}). Points: outside the real band; old: outside the 261011 band.\n`,
  );
  console.log('| seed | country | real | released | candidate | points r → c | old r → c |');
  console.log('|---|---|---|---|---|---|---|');
  for (const cand of candidate) {
    const rel = released.find((e) => e.seed === cand.seed);
    for (const code of codesOf([cand])) {
      const c = championsOf(cand, code, from, to),
        r = rel && championsOf(rel, code, from, to);
      if (!c.seasons) continue;
      console.log(
        `| ${cand.seed.slice(-1)} | ${code} | ${realOf(code)} | ${r ? `${r.different} / ${r.most}` : '-'} | ${c.different} / ${c.most} | ${r ? pointsOutside(r, band) : '-'} → ${pointsOutside(c, band)} | ${r ? pointsOutside(r, BAND_261011) : '-'} → ${pointsOutside(c, BAND_261011)} |`,
      );
    }
  }
  const pairs = candidate.filter((c) => released.some((r) => r.seed === c.seed));
  const relSeeds = released.filter((r) => pairs.some((c) => c.seed === r.seed));
  const rel = pooledOutside(relSeeds, band, from, to),
    cand = pooledOutside(pairs, band, from, to);
  const relOld = pooledOutside(relSeeds, BAND_261011, from, to),
    candOld = pooledOutside(pairs, BAND_261011, from, to);
  const a = allowance ?? 0;
  console.log(
    `\n### The champions part per country, pooled over seeds ${seedsOf(pairs).join(', ')}: points outside the real spread\n`,
  );
  console.log(
    `${allowance === undefined ? 'No allowance given: the bar is released (allowance 0).' : `Allowance ${a} (history's noise, \`noise.md\`).`} A country passes when the candidate's points are 0 or at most released + allowance. Old: T696's and T697's reading on the 261011 band (no further out than released).\n`,
  );
  console.log(
    '| country | real | released | candidate | released + allowance | verdict | old: released → candidate |',
  );
  console.log('|---|---|---:|---:|---:|---|---|');
  const failing: string[] = [],
    oldFailing: string[] = [];
  for (const code of codes) {
    const r = rel.get(code) ?? 0,
      c = cand.get(code) ?? 0,
      ok = c === 0 || c <= r + a;
    const ro = relOld.get(code) ?? 0,
      co = candOld.get(code) ?? 0,
      oldOk = co === 0 || co <= ro;
    if (!ok) failing.push(code);
    if (!oldOk) oldFailing.push(code);
    console.log(
      `| ${code} | ${realOf(code)} | ${r} | ${c} | ${r + a} | ${ok ? 'ok' : 'FAIL'} | ${ro} → ${co} ${oldOk ? 'ok' : 'worse'} |`,
    );
  }
  const d = divergence(released, candidate, from, to);
  console.log(
    `\n**Champions part: ${failing.length ? `fails in ${failing.join(', ')}` : 'passes in every country'}** (old reading: ${oldFailing.length ? `worse in ${oldFailing.join(', ')}` : 'no country worse'}). Diverged champions against released: ${percent(d.share)} of ${d.all} country-seasons.`,
  );
  const cost = (list: Extra[]) =>
    list.map((e) => `${e.seed} ${(e.seconds / e.seasons).toFixed(2)} s`).join(', ');
  console.log(
    `\nSeconds per lived season — released: ${cost(released)}; candidate: ${cost(candidate)}.`,
  );
  return { failing, oldFailing };
}
/**
 * T697's screen, on worlds lived with the table and the means level and competition money
 * observed, not in force (`--observe-cups`): per country and decade the share of competition money
 * in the three strongest top-flight clubs' income, split into prizes with bonuses and home gates;
 * and every top-flight hold with the level its book would have kept with that season's money in
 * it. Goes on only if at least a quarter of the top-flight holds in GER and in POR are released.
 */
function screenReport(extras: Extra[]) {
  console.log(
    `\n### Competition money in the three strongest top-flight clubs' income, per country and decade\n`,
  );
  console.log(
    `Worlds: ${extras.map((e) => e.seed).join(', ')} lived with the table and the means level, competition money observed, not in force. Per season the three strongest top-flight clubs at the close; cell: money / (income + money), mean over seasons and worlds — total (prizes with result bonuses + home gates).\n`,
  );
  const rows = extras.flatMap((e) => (e.competitions ?? []).map((r) => ({ ...r, seed: e.seed })));
  const decades = [...new Set(rows.map((r) => r.year - (r.year % 10)))].sort((a, b) => a - b);
  const codes = [...new Set(rows.map((r) => r.code))].sort();
  console.log(`| country | ${decades.map((d) => `${d}s`).join(' | ')} |`);
  console.log(`|---|${decades.map(() => '---|').join('')}`);
  const share = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
  for (const code of codes) {
    const cells = decades.map((decade) => {
      const seasons = new Map<string, typeof rows>();
      for (const r of rows)
        if (r.code === code && r.year - (r.year % 10) === decade) {
          const key = `${r.seed}:${r.year}`;
          seasons.set(key, [...(seasons.get(key) ?? []), r]);
        }
      if (!seasons.size) return '-';
      let total = 0,
        prizes = 0,
        gates = 0;
      for (const list of seasons.values()) {
        const three = [...list].sort((a, b) => b.strength - a.strength).slice(0, 3);
        const money = three.reduce((s, r) => s + r.prizes + r.bonuses + r.gates, 0),
          income = three.reduce((s, r) => s + r.income, 0) + money;
        total += money / income;
        prizes += three.reduce((s, r) => s + r.prizes + r.bonuses, 0) / income;
        gates += three.reduce((s, r) => s + r.gates, 0) / income;
      }
      const k = seasons.size;
      return `${share(total, k)} (${share(prizes, k)} + ${share(gates, k)})`;
    });
    console.log(`| ${code} | ${cells.join(' | ')} |`);
  }
  console.log(
    '\n### Holds the season’s competition money would release (one-step counterfactual)\n',
  );
  console.log(
    '| country | top-flight holds | released | share released | points sold | points not sold | every division: holds / released |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---|');
  const holds = extras.flatMap((e) => e.sold.filter((s) => s.withMoney !== undefined));
  const verdicts: string[] = [];
  let go = true;
  for (const code of [...new Set(holds.map((s) => s.code))].sort()) {
    const all = holds.filter((s) => s.code === code),
      top = all.filter((s) => s.book === 0);
    const released = (list: typeof all) => list.filter((s) => s.withMoney! >= s.from).length;
    const sold = top.reduce((s, h) => s + h.from - h.to, 0),
      kept = top.reduce((s, h) => s + Math.min(h.withMoney!, h.from) - h.to, 0);
    const r = released(top);
    console.log(
      `| ${code} | ${top.length} | ${r} | ${top.length ? share(r, top.length) : '-'} | ${sold} | ${kept} | ${all.length} / ${released(all)} |`,
    );
    if (code === 'GER' || code === 'POR') {
      const pass = top.length > 0 && r * 4 >= top.length;
      verdicts.push(`${code} ${r} of ${top.length} (${pass ? 'go' : 'below a quarter'})`);
      if (!pass) go = false;
    }
  }
  const missing = extras.reduce(
    (s, e) => s + e.sold.filter((h) => h.withMoney === undefined).length,
    0,
  );
  console.log(
    `\nScreen: ${verdicts.join('; ')} → ${go ? 'go on' : 'stop: the screen is below its threshold'}${missing ? ` (${missing} holds without an observed book)` : ''}.`,
  );
}

/**
 * T803: who keeps winning each league, on archived extras' champions lists: per country and world
 * the longest run of consecutive titles, the runs of `RUNS.length` or more and the most titles of
 * one club in any `RUNS.span` seasons (`scripts/lib/title-runs.ts`), in each of `RUNS.windows`.
 */
const RUNS = {
  windows: [
    [1955, 2009],
    [1980, 2009],
  ] as [number, number][],
  length: 5,
  span: 10,
};
const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
/**
 * What a world lived: the released rules, a placebo set of them, or a candidate's switches; a world
 * lived with `--setting` names its squad spread too (T808).
 */
const kindOf = (e: Extra) =>
  (e.placebo
    ? 'placebo'
    : [e.table && 'table', e.means && 'means', e.cups && 'cups'].filter(Boolean).join('+') ||
      'released') + (e.squads ? ` (${e.squads} squads)` : '');
function countryRuns(e: Extra, code: string, [from, to]: [number, number]) {
  const list = within(
    e.champions.filter((ch) => ch.code === code).map((ch) => ({ year: ch.year, who: ch.club })),
    from,
    to,
  );
  return {
    seasons: list.length,
    longest: longestRuns(list),
    runs: runsOfAtLeast(list, RUNS.length),
    most: mostInWindow(list, RUNS.span).titles,
  };
}
/** The inputs' names below the folder they all share, so each names the archive it came from. */
function inputNames(paths: string[]) {
  const folders = paths.map((path) => path.split('/').slice(0, -1));
  let shared = 0;
  while (
    folders.every((folder) => shared < folder.length && folder[shared] === folders[0]![shared])
  )
    shared++;
  return paths.map((path) => path.split('/').slice(shared).join('/'));
}

/**
 * The runs read: a pooled table per kind of world and country (every distinct world counted once:
 * an archive can hold one world twice, lived to different years), then one table per country with
 * every world. Returns the pooled part and the whole report.
 */
function championsRunsReport(paths: string[]) {
  const names = inputNames(paths);
  const worlds = paths.flatMap((path, i) =>
    (JSON.parse(readFileSync(path, 'utf8')) as Extra[]).map((extra) => ({
      input: names[i]!,
      extra,
    })),
  );
  const first = Math.min(...RUNS.windows.map(([from]) => from)),
    last = Math.max(...RUNS.windows.map(([, to]) => to));
  const codes = codesOf(worlds.map((w) => w.extra));
  const windows = RUNS.windows.map(([from, to]) => `${seasonLabel(from)}–${seasonLabel(to)}`);
  const head: string[] = [
    `## League title runs per country (T803)`,
    '',
    `Inputs: ${paths.length} files, ${worlds.length} worlds — ${names.join(', ')}.`,
    '',
    `Each world's top-flight champions (\`champions\` of its extra), per country, in ${windows.join(' and ')}. Longest: the longest run of consecutive titles of one club, with its seasons (every run of that length); ${RUNS.length}+: the runs of ${RUNS.length} or more titles; ${RUNS.span}: the most titles of one club in any ${RUNS.span} consecutive seasons. A list holds the seasons played only, so a gap season breaks no run.`,
    '',
  ];
  const pooled: string[] = [
    `### Pooled per kind of world and country`,
    '',
    `Kind: released (s = 1, no means level, no competition money), placebo (released with 1930/31's results drawn afresh, T698), or a candidate's switches (table, means, cups). Worlds: distinct worlds of that kind (a seed whose champions ${seasonLabel(first)}–${seasonLabel(last)} are read twice counts once). Cells: median (min–max) of the longest run; worlds with a run of ${RUNS.length}+ / its mean count; median (max) of the most in ${RUNS.span}.`,
    '',
    `| kind | country | worlds | ${windows.map((w) => `${w} longest | ${RUNS.length}+ | ${RUNS.span}`).join(' | ')} |`,
    `|---|---|---:|${windows.map(() => '---|---|---|').join('')}`,
  ];
  const kinds = [...new Set(worlds.map((w) => kindOf(w.extra)))];
  for (const kind of kinds) {
    const distinct = new Map<string, Extra>();
    for (const { extra } of worlds)
      if (kindOf(extra) === kind) {
        const read = extra.champions.filter((ch) => ch.year >= first && ch.year <= last);
        distinct.set(`${extra.seed}|${JSON.stringify(read)}`, extra);
      }
    const extras = [...distinct.values()];
    for (const code of codes) {
      const cells = RUNS.windows.map((window) => {
        const reads = extras.map((e) => countryRuns(e, code, window));
        const longest = reads.map((r) => r.longest.titles),
          most = reads.map((r) => r.most);
        const withRun = reads.filter((r) => r.runs > 0).length;
        const mean = reads.reduce((s, r) => s + r.runs, 0) / Math.max(1, reads.length);
        return `${median(longest)} (${Math.min(...longest)}–${Math.max(...longest)}) | ${withRun} / ${mean.toFixed(2)} | ${median(most)} (${Math.max(...most)})`;
      });
      pooled.push(`| ${kind} | ${code} | ${extras.length} | ${cells.join(' | ')} |`);
    }
  }
  pooled.push(
    '',
    'Real (recalled, not read against the lists): the longest league runs to 2009/10 in the eight playable leagues — Lyon 7 (2001/02–2007/08), Real Madrid 5 (twice), Porto 5, Anderlecht 5; later Bayern 11, Juventus 9.',
    '',
  );
  const detail: string[] = [];
  for (const code of codes) {
    detail.push(
      `### ${code} per world`,
      '',
      `| input | seed | kind | ${windows.map((w) => `${w} longest | ${RUNS.length}+ | ${RUNS.span}`).join(' | ')} |`,
      `|---|---|---|${windows.map(() => '---|---:|---:|').join('')}`,
    );
    for (const { input, extra } of worlds) {
      const cells = RUNS.windows.map((window) => {
        const r = countryRuns(extra, code, window);
        const short = r.seasons < window[1] - window[0] + 1 ? ` [${r.seasons} seasons]` : '';
        const seasons = r.longest.runs
          .map((run) => `${seasonLabel(run.from)}–${seasonLabel(run.to)}`)
          .join('; ');
        return `${r.longest.titles} (${seasons})${short} | ${r.runs} | ${r.most}`;
      });
      detail.push(
        `| ${input} | ${extra.placebo ? `${extra.placebo}/` : ''}${extra.seed} | ${kindOf(extra)} | ${cells.join(' | ')} |`,
      );
    }
    detail.push('');
  }
  return { pooled, report: [...head, ...pooled, ...detail] };
}

/** Every value after `--name` up to the next option, each split on commas (a shell glob or a list). */
function values(name: string) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return [];
  const end = args.findIndex((arg, i) => i > index && arg.startsWith('--'));
  return args
    .slice(index + 1, end < 0 ? undefined : end)
    .flatMap((value) => value.split(','))
    .filter(Boolean);
}

const readExtras = (paths: string) =>
  paths
    .split(',')
    .filter(Boolean)
    .flatMap((path) => JSON.parse(readFileSync(path, 'utf8')) as Extra[]);

const spreadFile = option('spread', '');
const table = spreadFile ? readTable(spreadFile) : undefined;
const input = option('in', '');
if (input) {
  const rows = input.split(',').flatMap((path) => JSON.parse(readFileSync(path, 'utf8')) as Row[]);
  if (args.includes('--books')) booksReport(rows);
  if (args.includes('--fit')) fitReport(rows, table);
  if (args.includes('--lived')) livedReport(rows, readExtras(option('extra', '')));
  else if (table) tableReport(rows, table, option('label', 'Candidate'));
} else if (values('champions-runs').length) {
  const { pooled, report } = championsRunsReport(values('champions-runs'));
  const out = option('out', '');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, report.join('\n'));
    console.log(pooled.join('\n'));
    console.error(`written to ${out}`);
  } else console.log(report.join('\n'));
} else if (option('screen', '')) {
  screenReport(readExtras(option('screen', '')));
} else if (option('champions-placebo', '') || option('champions-candidate', '')) {
  const from = Number(option('from', '1980')),
    to = Number(option('to', '2009'));
  const released = readExtras(option('champions-released', ''));
  // T808: `--allowance N` reads a candidate on a recorded allowance (T698's `noise.md`) when the
  // placebo sets are not lived again on this tree.
  let allowance: number | undefined = option('allowance', '')
    ? Number(option('allowance', ''))
    : undefined;
  if (option('champions-placebo', '')) {
    const noise = placeboReport(released, readExtras(option('champions-placebo', '')), from, to);
    const sets = Number(option('sets', '19'));
    if (noise.complete >= sets) allowance = noise.allowance;
    else
      console.log(
        `\nOnly ${noise.complete} of ${sets} placebo sets are complete: the allowance is partial and no candidate is read.`,
      );
  }
  if (
    option('champions-candidate', '') &&
    (allowance !== undefined || !option('champions-placebo', ''))
  )
    championsReport(released, readExtras(option('champions-candidate', '')), from, to, allowance);
} else {
  const years = list('years', '1950,1970,1990,2010').map(Number),
    codes = list('countries', 'ENG,ESP,FRA,GER');
  const runs = list('seeds', 'owner-balance-0').map((seed) =>
    live(seed, years, codes, table, Number(option('until', '0'))),
  );
  const rows = runs.flatMap((run) => run.rows),
    out = option('out', 'era-wage-spread.json');
  writeFileSync(out, JSON.stringify(rows));
  writeFileSync(
    out.replace(/\.json$/, '') + '.extra.json',
    JSON.stringify(runs.map((run) => run.extra)),
  );
  console.error(`${rows.length} rows`);
}
