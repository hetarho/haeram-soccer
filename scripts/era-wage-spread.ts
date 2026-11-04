/**
 * The era's star pay spread on the strongest clubs' books (CLUB-48, CLUB-25, ECON-36; T693).
 *
 * Lives ownerless worlds from 1930 (→WORLD-13) and, at each chosen season's close, reads every
 * book-keeping club's season book (→ECON-36): its income, its wage bill (the squad's alone; staff
 * pay sits in operating expenses, →ECON-30) and the same squad priced player by player the day
 * before the close, split into its ordinary part (each player priced at OVR 80 at most) and each
 * star term (the points above 80, the scarcity premium, the top-flight terms from 85). Each star
 * keeps his wage W and his OVR-80 wage W80, so any spread s prices him at W80 × (W / W80)^s
 * (→CLUB-48) without living the world again: a club's income, squad and strength do not depend
 * on wages before a takeover; only its books' cash and debt would differ once history replays on
 * another spread.
 *
 *   pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
 *     --countries ENG,ESP,FRA,GER --out rows.json
 *   pnpm exec tsx scripts/era-wage-spread.ts --in a.json,b.json --fit         the least compression
 *   pnpm exec tsx scripts/era-wage-spread.ts --in a.json --spread table.json  a table on kept rows
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
  marketWageAt,
  marketWageUnits,
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
  /** Each star (OVR above 80): [W, W80]. */
  stars: [number, number][];
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
  const from = MARKET_CONFIG.star.from;
  let base = 0,
    ordinary = 0,
    points = 0,
    scarcity = 0,
    top = 0;
  const stars: [number, number][] = [];
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
    const w80Units = marketWageUnits(club.tier, from, age, p.potential - (ovr - from)),
      pointsUnits = w80Units * MARKET_CONFIG.perPoint ** (ovr - from),
      w80 = q(w80Units);
    ordinary += w80;
    points += q(pointsUnits) - w80;
    scarcity += q(pointsUnits * starWagePremium(ovr)) - q(pointsUnits);
    top += full - q(pointsUnits * starWagePremium(ovr));
    stars.push([full, w80]);
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

/** The wage bill of a row at spread s: W of the ordinary players and W80 × (W / W80)^s of each star. */
const wagesAt = (row: Row, s: number) =>
  row.base +
  row.stars.reduce((sum, [full, w80]) => sum + (s === 1 ? full : w80 * (full / w80) ** s), 0);

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
function verdict(c: Case, spreadOf: (r: Row) => number) {
  const ratio = (r: Row) => wagesAt(r, spreadOf(r)) / r.income;
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
function leastCompression(c: Case) {
  for (let k = 100; k >= 0; k--) if (verdict(c, () => k / 100).ok) return k / 100;
  return -1;
}

function fitReport(rows: Row[], table?: Table) {
  console.log(
    '\n### Least compression per case (CLUB-48: median of the three strongest ≤ 70%, no club without a project above 100%)\n',
  );
  console.log(
    '| seed | season | country | at s = 1: strongest median / clubs over | at s = 0 | largest s meeting the band |',
  );
  console.log('|---|---|---|---|---|---:|');
  const best = new Map<string, number[]>();
  for (const c of cases(rows)) {
    const one = verdict(c, () => 1),
      zero = verdict(c, () => 0),
      s = leastCompression(c);
    const own = table?.own[c.code];
    const ownNote = own && c.year <= own.through ? ` (own anchor s = ${own.spread})` : '';
    console.log(
      `| ${c.seed.slice(-1)} | ${c.year}/${(c.year + 1) % 100} | ${c.code}${ownNote} | ${pct(one.strongest)} / ${one.over.length} | ${pct(zero.strongest)} / ${zero.over.length}${zero.over.length ? ` (${zero.over.map((r) => `${r.id} str ${r.strength} ${pct(wagesAt(r, 0) / r.income)}`).join(', ')})` : ''} | ${s < 0 ? 'none' : s.toFixed(2)} |`,
    );
    if (own && c.year <= own.through) continue;
    best.set(String(c.year), [...(best.get(String(c.year)) ?? []), s]);
  }
  console.log('\n| season | shared s: least over the cases (own anchors left out) |');
  console.log('|---|---:|');
  for (const [year, values] of best)
    console.log(
      `| ${year} | ${Math.min(...values) < 0 ? 'none meets the band' : Math.min(...values).toFixed(2)} |`,
    );
}

function tableReport(rows: Row[], table: Table, label: string) {
  console.log(`\n### ${label}: the table ${JSON.stringify(table)}\n`);
  console.log(
    '| seed | season | country | s | strongest three: wage / revenue | median | clubs without a project above revenue | verdict | exact = formula |',
  );
  console.log('|---|---|---|---:|---|---:|---|---|---|');
  let pass = 0,
    all = 0;
  for (const c of cases(rows)) {
    const s = withTable(table, () => starPaySpread(c.code, c.year));
    const v = verdict(c, () => s);
    all++;
    if (v.ok) pass++;
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
        )} | ${pct(v.strongest)} | ${v.over.length ? v.over.map((r) => `${r.id} (${r.tier + 1}부, str ${r.strength}) ${pct(wagesAt(r, s) / r.income)}`).join(', ') : 'none'} | ${v.ok ? 'ok' : 'OUT'} | ${exact} |`,
    );
  }
  console.log(`\n${pass} of ${all} cases meet CLUB-48's band.`);
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
