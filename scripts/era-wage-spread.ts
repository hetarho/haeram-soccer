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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Club, World } from '../packages/contracts/src/types';
import { historyWorld } from '../packages/engine/src/history';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay, SEASON_END_DAY } from '../packages/engine/src/calendar';
import { squad } from '../packages/engine/src/world';
import { overall } from '../packages/engine/src/player-state';
import { footballQuote } from '../packages/engine/src/quotes';
import { keepsBooks } from '../packages/engine/src/books';
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
}

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

function live(seed: string, years: number[], codes: string[], table?: Table): Row[] {
  const w = historyWorld(seed),
    rows: Row[] = [],
    last = Math.max(...years);
  const t0 = performance.now();
  while (w.year <= last) {
    const season = w.year;
    if (!years.includes(season)) {
      while (w.year === season)
        advanceDays(w, SEASON_END_DAY + 1 - currentDay(w), undefined, false);
      continue;
    }
    advanceDays(w, SEASON_END_DAY - currentDay(w), undefined, false);
    const clubs = w.clubs.filter((c) => codes.includes(c.country) && keepsBooks(w, c));
    const priced = new Map(
      clubs.map((c) => [
        c.id,
        {
          ...priceSquad(w, c),
          strength: c.strength,
          tier: c.tier,
          project: (c.project ?? 0) > 0,
          exact: table
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
        stars: p.stars,
        ...(p.exact !== undefined ? { exact: p.exact } : {}),
      });
    }
    console.error(
      `${seed} ${season}/${(season + 1) % 100}: ${clubs.length} clubs at ${((performance.now() - t0) / 1000).toFixed(0)} s`,
    );
  }
  return rows;
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

const spreadFile = option('spread', '');
const table = spreadFile ? readTable(spreadFile) : undefined;
const input = option('in', '');
if (input) {
  const rows = input.split(',').flatMap((path) => JSON.parse(readFileSync(path, 'utf8')) as Row[]);
  if (args.includes('--books')) booksReport(rows);
  if (args.includes('--fit')) fitReport(rows, table);
  if (table) tableReport(rows, table, option('label', 'Candidate'));
} else {
  const years = list('years', '1950,1970,1990,2010').map(Number),
    codes = list('countries', 'ENG,ESP,FRA,GER');
  const rows = list('seeds', 'owner-balance-0').flatMap((seed) => live(seed, years, codes, table));
  writeFileSync(option('out', 'era-wage-spread.json'), JSON.stringify(rows));
  console.error(`${rows.length} rows`);
}
