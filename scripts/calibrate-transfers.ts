/**
 * Transfer-fee calibration harness (CLUB-25, ECON-26, ECON-29, HIST-20; spec/ssot/CLUB.md).
 *
 * Plays ECON-29's reference careers (every delegation on, no owner capital, the cheapest next
 * facility work whenever 13 rounds of fixed costs stay covered) and reads, era by era, what the
 * transfer market charges against real English football:
 *  - the market: every top-flight squad's transfer values at each summer — the dearest player (the
 *    era's record fee), the ten dearest and the median player;
 *  - the fees our club actually paid and received (HIST-20's facts), by the division it played in;
 *  - the club's turnover (competition, matchday and commercial income) while in the top flight, the
 *    money those fees are weighed against.
 * Money is nominal pounds of the season (the reader compares with each era's real fees).
 *
 *   pnpm exec tsx scripts/calibrate-transfers.ts                 4 ENG careers, 1950–2029
 *   options: --seeds N, --first-seed N, --seasons N, --countries ENG,ESP, --levels normal,
 *            --out careers.json (keep the careers), --in a.json,b.json (report kept careers only)
 */
import type { CountryCode, DifficultyLevel, World } from '../packages/contracts/src/types';
import { currency, country } from '../packages/catalogs/src/index';
import {
  advanceRound,
  CASH_WARNING_ROUNDS,
  clubOf,
  closeSeason,
  createWorld,
  defaultSettings,
  FACILITY_PARTS,
  facilityInvestmentPreview,
  isIncomeKind,
  MARKET_CONFIG,
  marketValueAt,
  operate,
  overall,
  RESPONSIBILITY_KEYS,
  squad,
} from '../packages/engine/src/index';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const SEASONS = Number(option('seasons', '80'));
const SEEDS = Number(option('seeds', '4'));
const FIRST_SEED = Number(option('first-seed', '0'));
const COUNTRIES = option('countries', 'ENG').split(',') as CountryCode[];
const LEVELS = option('levels', 'normal').split(',') as DifficultyLevel[];
/** Keep every top-flight player of every summer in --out, to refit values without replaying. */
const DUMP = args.includes('--dump-players');
// Candidate constants for a run: --premium-span 10, --premium 1950:0.6,1980:1.9,2025:4.3
if (option('premium-span', '')) MARKET_CONFIG.premiumSpan = Number(option('premium-span', ''));
if (option('premium', ''))
  MARKET_CONFIG.premium = option('premium', '')
    .split(',')
    .map((pair) => pair.split(':').map(Number) as [number, number]);

/**
 * Real English football by era, in nominal pounds (sources in spec/ssot/CLUB.md CLUB-25): the
 * British record fee standing at the era's end, and the average Premier League fee (Transfer
 * Price Index, free transfers excluded) where one is published.
 */
const REAL: Record<string, { record: number; average?: number }> = {
  '1950s': { record: 65_000 },
  '1960s': { record: 165_000 },
  '1970s': { record: 1_469_000 },
  '1980s': { record: 4_250_000 },
  '1990s': { record: 22_500_000, average: 594_000 },
  '2000s': { record: 80_000_000, average: 2_400_000 },
  '2010s': { record: 105_000_000, average: 5_600_000 },
  '2020s': { record: 125_000_000, average: 24_000_000 },
};

/** British record fees as they were set: [year, pounds] (Progression of the British record). */
const RECORDS: [number, number][] = [
  [1950, 30_000],
  [1951, 34_500],
  [1955, 35_000],
  [1957, 65_000],
  [1961, 99_999],
  [1962, 115_000],
  [1968, 150_000],
  [1969, 165_000],
  [1970, 200_000],
  [1971, 220_000],
  [1972, 225_000],
  [1974, 350_000],
  [1977, 500_000],
  [1979, 1_469_000],
  [1981, 1_500_000],
  [1986, 2_300_000],
  [1987, 3_200_000],
  [1989, 4_250_000],
  [1991, 5_500_000],
  [1995, 8_500_000],
  [1996, 15_000_000],
  [1999, 22_500_000],
  [2001, 28_100_000],
  [2002, 29_100_000],
  [2006, 30_800_000],
  [2008, 32_500_000],
  [2009, 80_000_000],
  [2013, 85_300_000],
  [2016, 89_000_000],
  [2018, 105_000_000],
  [2023, 106_800_000],
  [2025, 125_000_000],
];
const standingRecord = (year: number) =>
  RECORDS.filter(([y]) => y <= year).at(-1)?.[1] ?? RECORDS[0][1];
/**
 * Years compared with the real market: every half-decade, with the Premier League's average fee
 * (Transfer Price Index, free transfers excluded) where one is published.
 */
const ANCHOR_YEARS: [number, number | undefined][] = [
  [1952, undefined],
  [1957, undefined],
  [1962, undefined],
  [1967, undefined],
  [1972, undefined],
  [1977, undefined],
  [1982, undefined],
  [1987, undefined],
  [1993, 594_000],
  [1997, undefined],
  [2003, 2_400_000],
  [2008, undefined],
  [2013, 5_600_000],
  [2018, undefined],
  [2025, 24_000_000],
];

interface Fact {
  year: number;
  direction: 'in' | 'out';
  loan: boolean;
  fee: number;
  /** Our division when the fee was paid (0 = top flight). */
  tier: number;
  ovr: number;
  age: number;
}
interface Season {
  year: number;
  tier: number;
  /** Competition, matchday and commercial income of the season, pounds. */
  turnover: number;
  /** Top-flight market: dearest, mean of the ten dearest, median and mean player, pounds. */
  market: { max: number; top10: number; median: number; mean: number; best: number };
  /** Every top-flight player this summer as [ability, age, potential] triples, flattened. */
  players?: number[];
}
interface Career {
  code: CountryCode;
  seed: string;
  level: DifficultyLevel;
  seasons: Season[];
  facts: Fact[];
  bankrupt?: number;
}

const pounds = (code: string, year: number, minor: string | number) =>
  Number(minor) / currency(code, year).units;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function delegateAll(w: World) {
  w.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
}
function buyFacilities(w: World) {
  for (;;) {
    const options = FACILITY_PARTS.map((part) => facilityInvestmentPreview(w, part))
      .filter((preview) => preview.eligible)
      .sort((a, b) => a.next!.units - b.next!.units);
    const preview = options[0];
    if (!preview || !preview.affordable || preview.runwayRounds < CASH_WARNING_ROUNDS) return;
    operate(w, { type: 'facility', part: preview.part });
  }
}
/** The top flight's transfer values this summer, in pounds, and its players for refits. */
function topFlightMarket(w: World): Pick<Season, 'market' | 'players'> {
  const code = clubOf(w).country;
  const values: number[] = [],
    best: number[] = [],
    players: number[] = [];
  for (const club of w.clubs) {
    if (club.country !== code || club.tier !== 0 || club.id.startsWith('euro:')) continue;
    for (const p of squad(w, club)) {
      values.push(pounds(code, w.year, marketValueAt(code, w.year, 0, p)));
      best.push(overall(p));
      players.push(overall(p), w.year - p.born, p.potential);
    }
  }
  values.sort((a, b) => b - a);
  return {
    market: {
      max: values[0] ?? NaN,
      top10: mean(values.slice(0, 10)),
      median: median(values),
      mean: mean(values),
      best: Math.max(...best),
    },
    ...(DUMP ? { players } : {}),
  };
}

function playCareer(code: CountryCode, seed: string, level: DifficultyLevel): Career {
  const w = createWorld({ country: code, name: 'Calibration Town', color: '#335577', seed, level });
  delegateAll(w);
  const career: Career = { code, seed, level, seasons: [], facts: [] };
  let factsSeen = 0;
  for (let n = 0; n < SEASONS && !w.bankrupt; n++) {
    const year = w.year,
      tier = clubOf(w).tier,
      summer = topFlightMarket(w),
      firstEvent = w.events.length;
    while (w.round < 46 && !w.bankrupt) {
      buyFacilities(w);
      advanceRound(w, undefined, false);
    }
    if (w.bankrupt) {
      career.bankrupt = year;
      break;
    }
    let turnover = 0;
    for (const event of w.events.slice(firstEvent)) {
      if (event.year !== year || !event.amount || !isIncomeKind(event.kind)) continue;
      if (['transfer-out', 'free-transfer-compensation', 'support'].includes(event.kind)) continue;
      turnover += pounds(code, year, event.amount);
    }
    // Facts are written as moves complete; the summer window after the close belongs to the next
    // season's year, so read them by their own year below.
    const facts = w.transfers?.facts ?? [];
    for (; factsSeen < facts.length; factsSeen++) {
      const f = facts[factsSeen];
      const person = w.players.find((p) => p.id === f.player);
      career.facts.push({
        year: f.year,
        direction: f.direction,
        loan: f.loan,
        fee: pounds(code, f.year, f.fee),
        tier: clubOf(w).tier,
        ovr: person ? overall(person) : NaN,
        age: person ? f.year - person.born : NaN,
      });
    }
    career.seasons.push({ year, tier, turnover, ...summer });
    if (year % 10 === 9) console.error(`${code}/${seed}: ${year} closed, division ${tier}`);
    closeSeason(w);
    w.revision++;
  }
  return career;
}

const decade = (year: number) => `${Math.floor(year / 10) * 10}s`;
const money = (n: number) =>
  !Number.isFinite(n)
    ? '-'
    : n >= 1e6
      ? `£${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}m`
      : n >= 1e3
        ? `£${Math.round(n / 1e3)}k`
        : `£${Math.round(n)}`;

function report(careers: Career[]) {
  const decades = [...new Set(careers.flatMap((c) => c.seasons.map((s) => decade(s.year))))];
  console.log(
    `\n${careers.length} careers (${careers.map((c) => `${c.code}/${c.seed}${c.bankrupt ? ` bankrupt ${c.bankrupt}` : ''}`).join(', ')})`,
  );
  console.log(
    '\nTop-flight market each summer (decade means) against the real British record and average fee',
  );
  console.log(
    'decade | best OVR | dearest | ten dearest | median | mean | real record | real avg | dearest/record',
  );
  for (const d of decades) {
    const s = careers.flatMap((c) => c.seasons.filter((x) => decade(x.year) === d));
    const real = REAL[d];
    const dearest = Math.max(...s.map((x) => x.market.max));
    console.log(
      [
        d,
        mean(s.map((x) => x.market.best)).toFixed(1),
        money(dearest),
        money(mean(s.map((x) => x.market.top10))),
        money(mean(s.map((x) => x.market.median))),
        money(mean(s.map((x) => x.market.mean))),
        money(real?.record ?? NaN),
        money(real?.average ?? NaN),
        real ? (dearest / real.record).toFixed(2) : '-',
      ].join(' | '),
    );
  }
  console.log(
    '\nCLUB-46 bands at the years real figures exist (summers within 2 years, career means)',
  );
  console.log(
    'year | dearest | mean | record standing | real avg | dearest/record (0.5–1.0) | mean/avg (0.6–1.4)',
  );
  let missed = 0;
  for (const [year, avg] of ANCHOR_YEARS) {
    const s = careers.flatMap((c) => c.seasons.filter((x) => Math.abs(x.year - year) <= 2));
    if (!s.length) continue;
    const dearest = mean(s.map((x) => x.market.max)),
      average = mean(s.map((x) => x.market.mean)),
      record = standingRecord(year),
      r = dearest / record,
      a = avg ? average / avg : NaN;
    const inBand = r >= 0.5 && r <= 1 && (!avg || (a >= 0.6 && a <= 1.4));
    if (!inBand) missed++;
    console.log(
      [
        year,
        money(dearest),
        money(average),
        money(record),
        money(avg ?? NaN),
        r.toFixed(2),
        avg ? a.toFixed(2) : '-',
        inBand ? '' : '✗',
      ].join(' | '),
    );
  }
  console.log(`${missed} of ${ANCHOR_YEARS.length} years outside their bands`);
  console.log('\nOur fees (permanent moves) by decade and our division at the time');
  console.log('decade | division | buys n | buy mean | buy max | sales n | sale mean | sale max');
  for (const d of decades)
    for (const tier of [0, 1, 2, 3, 4]) {
      const f = careers.flatMap((c) =>
        c.facts.filter((x) => !x.loan && decade(x.year) === d && Math.min(x.tier, 4) === tier),
      );
      if (!f.length) continue;
      const buys = f.filter((x) => x.direction === 'in').map((x) => x.fee),
        sales = f.filter((x) => x.direction === 'out').map((x) => x.fee);
      console.log(
        [
          d,
          tier === 4 ? 'amateur' : tier,
          buys.length,
          money(mean(buys)),
          money(Math.max(...buys)),
          sales.length,
          money(mean(sales)),
          money(Math.max(...sales)),
        ].join(' | '),
      );
    }
  console.log('\nFees against turnover, every division (decade sums)');
  console.log('decade | turnover | sales | sales/turnover | buys | buys/turnover');
  for (const d of decades) {
    const turnover = careers
      .flatMap((c) => c.seasons.filter((x) => decade(x.year) === d))
      .reduce((sum, x) => sum + x.turnover, 0);
    const facts = careers.flatMap((c) => c.facts.filter((x) => decade(x.year) === d));
    const sum = (direction: 'in' | 'out') =>
      facts.filter((x) => x.direction === direction).reduce((total, x) => total + x.fee, 0);
    console.log(
      [
        d,
        money(turnover),
        money(sum('out')),
        `${((100 * sum('out')) / turnover).toFixed(1)}%`,
        money(sum('in')),
        `${((100 * sum('in')) / turnover).toFixed(1)}%`,
      ].join(' | '),
    );
  }
  console.log('\nTop-flight seasons: our turnover against the market (decade means)');
  console.log('decade | seasons | turnover | dearest/turnover | median/turnover');
  for (const d of decades) {
    const s = careers.flatMap((c) => c.seasons.filter((x) => decade(x.year) === d && x.tier === 0));
    if (!s.length) continue;
    const t = mean(s.map((x) => x.turnover));
    console.log(
      [
        d,
        s.length,
        money(t),
        (mean(s.map((x) => x.market.max)) / t).toFixed(2),
        (mean(s.map((x) => x.market.median)) / t).toFixed(3),
      ].join(' | '),
    );
  }
}

const input = option('in', '');
const careers: Career[] = [];
if (input) {
  for (const file of input.split(','))
    careers.push(...(JSON.parse(readFileSync(file, 'utf8')) as Career[]));
} else {
  for (const code of COUNTRIES) {
    country(code);
    for (const level of LEVELS)
      for (let s = FIRST_SEED; s < FIRST_SEED + SEEDS; s++) {
        const started = Date.now();
        careers.push(playCareer(code, `transfers-${code}-${s}`, level));
        console.error(
          `${code} ${level} seed ${s}: ${careers.at(-1)!.seasons.length} seasons in ${Math.round((Date.now() - started) / 1000)} s`,
        );
      }
  }
  const out = option('out', '');
  if (out) writeFileSync(out, JSON.stringify(careers));
}
report(careers);
