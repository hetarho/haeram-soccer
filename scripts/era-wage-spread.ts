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
 * (measurement overrides of `STAR_SPREAD_CONFIG` and `MEANS_LEVEL`, never game settings), so each
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
 * the level its book would have kept with that season's money in it (`meansLevel`'s own search),
 * in `<out>.extra.json`; `--screen` reads those extras.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --spread table.json --means \
 *     --observe-cups --out screen.json                                     T697's screen world
 *   pnpm exec tsx scripts/era-wage-spread.ts --screen a.extra.json,b.extra.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Club, World } from '../packages/contracts/src/types';
import { historyWorld } from '../packages/engine/src/history';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay, SEASON_END_DAY } from '../packages/engine/src/calendar';
import { squad } from '../packages/engine/src/world';
import { overall } from '../packages/engine/src/player-state';
import { footballQuote } from '../packages/engine/src/quotes';
import { BOOK_COMPETITIONS, keepsBooks } from '../packages/engine/src/books';
import { MEANS_LEVEL, meansLevel, squadCostAt } from '../packages/engine/src/dynamics';
import {
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
  // Each book's competition money and division at the close, for the summer's counterfactual.
  const money = new Map<string, { year: number; tier: number; total: bigint }>();
  if (CUPS) BOOK_COMPETITIONS.inForce = true;
  if (OBSERVE_CUPS)
    BOOK_COMPETITIONS.observe = (c, m, released) => {
      money.set(c.id, { year: w.year, tier: c.tier, total: m.total });
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
  if (MEANS) {
    if (!table) throw new Error('--means lives a candidate: give its table with --spread');
    STAR_SPREAD_CONFIG.shared = table.shared;
    STAR_SPREAD_CONFIG.own = table.own;
    MEANS_LEVEL.inForce = true;
    MEANS_LEVEL.observe = (c, from, to) => {
      const entry = { year: w.year, code: c.country, id: c.id, tier: c.tier, from, to };
      const m = OBSERVE_CUPS ? money.get(c.id) : undefined;
      if (m && m.year === w.year) {
        // The same search the means level makes, with the season's competition money in the book.
        const withMoney = meansLevel(w, c, m.tier, from, undefined, CUPS ? 0n : m.total)!;
        sold.push({ ...entry, book: m.tier, money: Number(m.total), withMoney });
      } else sold.push(entry);
    };
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
      generated: Number(squadCostAt(w, c, c.strength, c.tier, w.year)),
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
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

/** LEAGUE-10's measured spread: 5–9 different champions in 30 seasons, the most titles of one club 8–15. */
const CHAMPION_BAND: Record<'different' | 'most', [number, number]> = {
  different: [5, 9],
  most: [8, 15],
};
const outside = (value: number, [low, high]: [number, number]) =>
  Math.max(0, low - value, value - high);
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
function championsReport(released: Extra[], candidate: Extra[], from: number, to: number) {
  const band = CHAMPION_BAND;
  console.log(
    `\n### Champions ${from}–${to} per country: different top-flight champions / the most titles of one club (LEAGUE-10: ${band.different.join('–')} and ${band.most.join('–')})\n`,
  );
  console.log(
    'Released: worlds at the released curve (s = 1, no means level). Candidate: the table and the means level lived together. Verdict: within the band, or no further outside it than the released world on the same seed.\n',
  );
  console.log('| seed | country | seasons | released | candidate | verdict |');
  console.log('|---|---|---:|---|---|---|');
  let pass = 0,
    all = 0;
  const failures: string[] = [];
  for (const cand of candidate) {
    const rel = released.find((e) => e.seed === cand.seed);
    const codes = [...new Set(cand.champions.map((ch) => ch.code))].sort();
    for (const code of codes) {
      const c = championsOf(cand, code, from, to),
        r = rel && championsOf(rel, code, from, to);
      if (!c.seasons) continue;
      const away = (x: { different: number; most: number }) => [
        outside(x.different, band.different),
        outside(x.most, band.most),
      ];
      const cOut = away(c),
        rOut = r ? away(r) : [Infinity, Infinity];
      const ok = cOut.every((d, i) => d === 0 || d <= rOut[i]!);
      all++;
      if (ok) pass++;
      else failures.push(`${cand.seed.slice(-1)} ${code}`);
      console.log(
        `| ${cand.seed.slice(-1)} | ${code} | ${c.seasons} | ${r ? `${r.different} / ${r.most}` : '-'} | ${c.different} / ${c.most} | ${ok ? 'ok' : 'OUT'} |`,
      );
    }
  }
  console.log(
    `\n${pass} of ${all} country-seeds pass${failures.length ? `; failing: ${failures.join(', ')}` : ''}.`,
  );
  // Per country over its seeds: the points outside the band (different + most), summed.
  const pooled = new Map<string, [number, number, number]>();
  for (const cand of candidate) {
    const rel = released.find((e) => e.seed === cand.seed);
    if (!rel) continue;
    for (const code of new Set(cand.champions.map((ch) => ch.code))) {
      const c = championsOf(cand, code, from, to),
        r = championsOf(rel, code, from, to);
      if (!c.seasons) continue;
      const away = (x: typeof c) =>
        outside(x.different, band.different) + outside(x.most, band.most);
      const [seeds, rSum, cSum] = pooled.get(code) ?? [0, 0, 0];
      pooled.set(code, [seeds + 1, rSum + away(r), cSum + away(c)]);
    }
  }
  console.log(
    '\nPer country over its seeds: points outside the band (different + most), summed; worse = the candidate further out than released.\n',
  );
  console.log('| country | seeds | released | candidate | verdict |');
  console.log('|---|---:|---:|---:|---|');
  for (const [code, [seeds, r, c]] of [...pooled].sort())
    console.log(`| ${code} | ${seeds} | ${r} | ${c} | ${c === 0 || c <= r ? 'ok' : 'worse'} |`);
  const cost = (list: Extra[]) =>
    list.map((e) => `${e.seed} ${(e.seconds / e.seasons).toFixed(2)} s`).join(', ');
  console.log(
    `\nSeconds per lived season — released: ${cost(released)}; candidate: ${cost(candidate)}.`,
  );
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
    'Each club the means level sold down, with the level its book would have kept had that season’s competition money been in it (`meansLevel`, the same search). Released: that level at least the strength before the sale. Points not sold: min(that level, before) − the level sold to. Top flight: the division the book was earned in; pooled over the worlds.\n',
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
} else if (option('screen', '')) {
  screenReport(readExtras(option('screen', '')));
} else if (option('champions-candidate', '')) {
  championsReport(
    readExtras(option('champions-released', '')),
    readExtras(option('champions-candidate', '')),
    Number(option('from', '1980')),
    Number(option('to', '2009')),
  );
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
