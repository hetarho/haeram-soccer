/**
 * Economy calibration harness (ECON-29, ECON-9, CLUB-25; docs/FINANCES.md).
 *
 * Plays whole careers of ECON-29's reference club from the 1950 founding: every delegation on —
 * the staff run training, the academy, sales, sponsors, coaches, contract talks and the manager
 * post — no owner capital, and the stadium grown a level whenever the cash after the build still
 * covers 13 rounds of fixed costs, operating expenses included. A run that never builds is kept
 * for comparison. It prints the measured economy next to the real-football bands of ECON-29: wage
 * bill and net result against income, the income mix of the 1950s and of a top flight in the
 * 2000s, how many seasons of a top-flight club's net result the facility ladder costs, the
 * attendance of ECON-9 by division and the wage ratios of CLUB-25.
 *
 *   pnpm exec tsx scripts/calibrate-economy.ts            ENG ESP FRA GER × default and 트레이딩
 *                                                          머신 × reference club and no building,
 *                                                          60 seasons each (several minutes)
 *   pnpm exec tsx scripts/calibrate-economy.ts --quick    ENG only, default build, reference club
 *   options: --seasons N, --countries ENG,FRA, --builds default,trading, --modes greedy,none,
 *            --seeds N (careers per setting), --log (per season), --out careers.json (keep the
 *            careers), --in a.json,b.json (report kept careers only)
 *
 * Careers run 60 seasons by default: the first 50 make the career averages, and seasons 51–60
 * (2000–2009) are the only top-flight 2000s a 1950 founding reaches. Money is compared in 1901 price
 * units, each season's amounts divided by what one unit cost that year.
 */
import type { CountryCode, World } from '../packages/contracts/src/types';
import {
  advanceRound,
  BUILD_PRESETS,
  CASH_WARNING_ROUNDS,
  catchment,
  clubOf,
  closeSeason,
  createWorld,
  facilityCostUnits,
  facilityInvestmentPreview,
  marketWageUnits,
  MAX_FACILITIES,
  operate,
  operatingCosts,
  ownLeagueClubs,
  quote,
  rating,
  MARKET_CONFIG,
} from '../packages/engine/src/index';
import { country } from '../packages/catalogs/src/index';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const quick = args.includes('--quick');
const SEASONS = Number(option('seasons', '60'));
/** Seasons whose averages make the career figures: the first fifty (ECON-29). */
const CAREER = 50;
const COUNTRY_CODES = option('countries', quick ? 'ENG' : 'ENG,ESP,FRA,GER').split(
  ',',
) as CountryCode[];
const SEEDS = Number(option('seeds', '1'));
const LOG = args.includes('--log');
const BUILDS = option('builds', quick ? 'default' : 'default,trading').split(',');
/** greedy: ECON-29's reference club, growing its stadium; none: never building, for comparison. */
const FACILITY_MODES = option('modes', quick ? 'greedy' : 'greedy,none')
  .split(',')
  .map((mode) => mode === 'greedy');

// ---- Targets ---------------------------------------------------------------------------------
const BANDS = {
  wages: [0.5, 0.7],
  net: [-0.05, 0.1],
  top2000s: { competition: [0.4, 0.55], commercial: [0.25, 0.4], matchday: [0.15, 0.25] },
  matchday1950s: 0.6,
  ladderSeasons: 25,
} as const;
/** ECON-9 average league attendance (ENG) by division, the amateur league last. */
const ATTENDANCE: [string, number, number][] = [
  ['top flight', 20000, 45000],
  ['second tier', 8000, 20000],
  ['third tier', 4000, 10000],
  ['amateur league', 300, 2000],
];

// ---- Ledger ----------------------------------------------------------------------------------
type Source = 'competition' | 'matchday' | 'commercial' | 'sales' | 'owner' | 'other';
function sourceOf(kind: string): Source {
  if (
    [
      'league-share',
      'league-merit',
      'parachute',
      'cup-prize',
      'cup-honor',
      'europe-prize',
      'europe-honor',
      'match-bonus',
    ].includes(kind)
  )
    return 'competition';
  if (kind === 'gate') return 'matchday';
  if (kind.startsWith('sponsor:') || kind === 'campaign-result') return 'commercial';
  if (kind === 'transfer-out' || kind === 'free-transfer-compensation') return 'sales';
  if (kind === 'support') return 'owner';
  return 'other';
}
const INCOME_KINDS = new Set([
  'league-share',
  'league-merit',
  'parachute',
  'cup-prize',
  'cup-honor',
  'europe-prize',
  'europe-honor',
  'match-bonus',
  'gate',
  'campaign-result',
  'transfer-out',
  'free-transfer-compensation',
  'support',
  'care:friendly',
]);
const isIncome = (kind: string) => INCOME_KINDS.has(kind) || kind.startsWith('sponsor:');

interface Season {
  year: number;
  /** Division from the top flight (0); the amateur league is the country's depth. */
  tier: number;
  amateur: boolean;
  rank: number;
  clubs: number;
  /** Price units of the season. */
  sources: Record<Source, number>;
  expense: number;
  wages: number;
  playerWages: number;
  /** Operating expenses (ECON-30). */
  opex: number;
  facilitySpend: number;
  attendance: number[];
  facilities: number;
  fans: number;
  catchment: number;
  /** Own XI rating against the league's average club. */
  gap: number;
  cash: number;
}
interface Career {
  code: CountryCode;
  build: string;
  greedy: boolean;
  seed: string;
  seasons: Season[];
  bankrupt?: number;
}

/** Minor units of one 1901 price unit in this country and year. */
const unitOf = (code: string, year: number) => Number(quote(code, year, 1_000_000)) / 1_000_000;

/** Every delegation on: the owner leaves the club to the staff (ECON-29). */
function delegateAll(w: World) {
  w.delegation = {
    training: true,
    academy: true,
    transfers: true,
    business: true,
    staff: true,
    contracts: true,
    manager: true,
  };
}
/**
 * The reference club's stadium (ECON-29): a level whenever the cash after it still covers 13 rounds
 * of the fixed costs after it, operating expenses and the new level's upkeep included.
 */
function buyFacilities(w: World) {
  while (w.facilities < MAX_FACILITIES) {
    const preview = facilityInvestmentPreview(w);
    if (!preview.affordable || preview.runwayRounds < CASH_WARNING_ROUNDS) return;
    operate(w, { type: 'facility' });
  }
}

function playCareer(code: CountryCode, build: string, greedy: boolean, seed: string): Career {
  const w = createWorld({
    country: code,
    name: 'Calibration Town',
    color: '#335577',
    seed,
    difficulty: 1,
  });
  delegateAll(w);
  if (build !== 'default')
    operate(w, { type: 'build', build: BUILD_PRESETS.find((p) => p.id === build)!.build });
  const career: Career = { code, build, greedy, seed, seasons: [] };
  const depth = country(code).groups.length;
  for (let n = 0; n < SEASONS && !w.bankrupt; n++) {
    const year = w.year,
      unit = unitOf(code, year),
      own = clubOf(w);
    let wages = 0,
      playerWages = 0,
      opex = 0;
    const firstEvent = w.events.length;
    while (w.round < 46 && !w.bankrupt) {
      if (greedy) buyFacilities(w);
      const cost = operatingCosts(w, w.round + 1).payments;
      playerWages += Number(cost.playerWages);
      opex += Number(cost.expenses);
      wages += Number(cost.playerWages) + Number(cost.managerWage) + Number(cost.staffWages ?? '0');
      advanceRound(w, undefined, false);
    }
    if (w.bankrupt) {
      career.bankrupt = year;
      break;
    }
    const league = ownLeagueClubs(w).filter((c) => c.id !== own.id);
    const leagueRating = league.reduce((sum, c) => sum + rating(w, c), 0) / league.length;
    const gap = rating(w, own) - leagueRating;
    closeSeason(w);
    w.revision++;
    const archive = w.history.at(-1)!;
    const sources: Record<Source, number> = {
      competition: 0,
      matchday: 0,
      commercial: 0,
      sales: 0,
      owner: 0,
      other: 0,
    };
    let facilitySpend = 0;
    const attendance: number[] = [];
    const leagueIds = new Set(
      w.ownMatches
        .filter((m) => m.year === year && ['league', 'lower'].includes(m.kind))
        .map((m) => m.id),
    );
    for (const event of w.events.slice(firstEvent)) {
      if (event.year !== year || !event.amount) continue;
      const amount = Number(event.amount) / unit;
      if (isIncome(event.kind)) sources[sourceOf(event.kind)] += amount;
      if (event.kind === 'facility') facilitySpend += amount;
      if (event.kind === 'gate') {
        const match = event.detail.match(/관중 (\d+)명/),
          id = event.detail.split(' · ').at(-1)!;
        if (match && leagueIds.has(id)) attendance.push(Number(match[1]));
      }
    }
    career.seasons.push({
      year,
      tier: archive.tier,
      amateur: archive.tier >= depth,
      rank: archive.rank,
      clubs: league.length + 1,
      sources,
      expense: Number(archive.expense) / unit,
      wages: wages / unit,
      playerWages: playerWages / unit,
      opex: opex / unit,
      facilitySpend,
      attendance,
      facilities: w.facilities,
      fans: archive.fans,
      catchment: catchment(w, own),
      gap: Math.round(gap * 10) / 10,
      cash: Number(archive.cash) / unit,
    });
  }
  return career;
}

// ---- Measures --------------------------------------------------------------------------------
const turnover = (s: Season) =>
  s.sources.competition + s.sources.matchday + s.sources.commercial + s.sources.other;
const income = (s: Season) => turnover(s) + s.sources.sales;
const net = (s: Season) => income(s) - s.expense;
const sum = (seasons: Season[], f: (s: Season) => number) =>
  seasons.reduce((total, s) => total + f(s), 0);
const share = (seasons: Season[], f: (s: Season) => number, g: (s: Season) => number) => {
  const whole = sum(seasons, g);
  return whole ? sum(seasons, f) / whole : NaN;
};
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const pct = (value: number) => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-');
const units = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '-';
const within = (value: number, [low, high]: readonly [number, number]) =>
  Number.isFinite(value) ? (value >= low && value <= high ? 'ok' : 'OUT') : '-';
const divisionName = (s: Season) => (s.amateur ? 'amateur' : `${s.tier + 1}부`);
/** The full ladder from level 1 to the top, in price units (ECON-12). */
const LADDER = Array.from({ length: MAX_FACILITIES - 1 }, (_, i) =>
  facilityCostUnits(i + 2),
).reduce((a, b) => a + b, 0);

function printLog(c: Career) {
  console.log(
    `\n#### ${c.code} · ${c.build} · ${c.greedy ? 'reference club' : 'no building'} · ${c.seed}\n`,
  );
  console.log(
    '| year | div | rank | XI gap | fans | catchment | gate avg | fac | turnover | comp | matchday | comm | sales | wages | opex | expense | net | cash |',
  );
  console.log(
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const s of c.seasons) {
    const t = turnover(s);
    const gateAvg = average(s.attendance);
    console.log(
      `| ${s.year} | ${divisionName(s)} | ${s.rank}/${s.clubs} | ${s.gap} | ${units(s.fans)} | ${units(s.catchment)} | ${units(gateAvg)} | ${s.facilities} | ${units(t)} | ${pct(s.sources.competition / t)} | ${pct(s.sources.matchday / t)} | ${pct(s.sources.commercial / t)} | ${units(s.sources.sales)} | ${pct(s.wages / income(s))} | ${pct(s.opex / income(s))} | ${units(s.expense)} | ${pct(net(s) / income(s))} | ${units(s.cash)} |`,
    );
  }
}

function report(careers: Career[]) {
  console.log('\n### Careers\n');
  console.log(
    '| country | build | facilities | seasons | bankrupt | divisions (seasons) | wage bill / income | net / income | facilities reached |',
  );
  console.log('|---|---|---|---:|---|---|---:|---:|---:|');
  for (const c of careers) {
    const first = c.seasons.slice(0, CAREER);
    const divisions = new Map<string, number>();
    for (const s of first)
      divisions.set(divisionName(s), (divisions.get(divisionName(s)) ?? 0) + 1);
    console.log(
      `| ${c.code} | ${c.build} | ${c.greedy ? 'grown' : 'none'} | ${c.seasons.length} | ${c.bankrupt ?? '-'} | ${[...divisions].map(([d, n]) => `${d} ${n}`).join(', ')} | ${pct(share(first, (s) => s.wages, income))} | ${pct(share(first, net, income))} | ${c.seasons.at(-1)?.facilities ?? 0} |`,
    );
  }

  // Each target is measured on the reference club, which grows its stadium, and apart on careers
  // that never build, for comparison.
  const modes = [true, false].map((greedy) => careers.filter((c) => c.greedy === greedy));
  const cell = (value: number, seasons: number, band: readonly [number, number], text = pct) =>
    seasons ? `${text(value)} (${seasons}) ${within(value, band)}` : '-';
  const targets: [string, string, (cs: Career[]) => string][] = [
    [
      'wage bill / income, first 50 seasons',
      '50–70%',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(
          share(s, (x) => x.wages, income),
          s.length,
          BANDS.wages,
        );
      },
    ],
    [
      'net result / income, first 50 seasons',
      '−5% to +10%',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(share(s, net, income), s.length, BANDS.net);
      },
    ],
    ...(['competition', 'commercial', 'matchday'] as const).map(
      (key): [string, string, (cs: Career[]) => string] => [
        `top flight 2000s ${key} / turnover`,
        `${BANDS.top2000s[key].map((v) => Math.round(v * 100)).join('–')}%`,
        (cs) => {
          const s = cs.flatMap((c) =>
            c.seasons.filter((x) => x.tier === 0 && !x.amateur && x.year >= 2000 && x.year < 2010),
          );
          return cell(
            share(s, (x) => x.sources[key], turnover),
            s.length,
            BANDS.top2000s[key],
          );
        },
      ],
    ),
    [
      '1950s matchday / turnover',
      '60%+',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.filter((x) => x.year < 1960));
        return cell(
          share(s, (x) => x.sources.matchday, turnover),
          s.length,
          [BANDS.matchday1950s, 1],
        );
      },
    ],
    [
      `facility ladder (${units(LADDER)} units) in seasons of top-flight net result before facility spending`,
      '25+',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.filter((x) => x.tier === 0 && !x.amateur));
        const perSeason = sum(s, (x) => net(x) + x.facilitySpend) / s.length;
        // A club that does not earn its costs never pays for the ladder.
        return cell(
          perSeason > 0 ? LADDER / perSeason : Infinity,
          s.length,
          [BANDS.ladderSeasons, Infinity],
          (v) => `${v.toFixed(1)} (net ${units(perSeason)})`,
        );
      },
    ],
  ];
  console.log('\n### ECON-29 — measured (seasons) and whether the band holds\n');
  console.log('| target | band | reference club (stadium grown) | no building (comparison) |');
  console.log('|---|---|---|---|');
  for (const [label, band, measure] of targets)
    console.log(`| ${label} | ${band} | ${measure(modes[0])} | ${measure(modes[1])} |`);

  console.log('\n### ECON-9 own league home attendance by division (season averages)\n');
  console.log('| division | band | reference club (p10–p90) | no building (comparison) |');
  console.log('|---|---|---|---|');
  const rows: [string, (s: Season) => boolean][] = [
    ['top flight', (s) => !s.amateur && s.tier === 0],
    ['second tier', (s) => !s.amateur && s.tier === 1],
    ['third tier', (s) => !s.amateur && s.tier === 2],
    ['amateur league', (s) => s.amateur],
  ];
  for (const [label, filter] of rows) {
    const band = ATTENDANCE.find(([name]) => name === label)!;
    const [greedy, plain] = modes.map((cs) =>
      cs
        .flatMap((c) => c.seasons)
        .filter((s) => filter(s) && s.attendance.length)
        .map((s) => average(s.attendance))
        .sort((a, b) => a - b),
    );
    const spread = (values: number[]) =>
      `${units(values[Math.floor(values.length * 0.1)])}–${units(values[Math.floor(values.length * 0.9)])}`;
    console.log(
      `| ${label} | ${units(band[1])}–${units(band[2])} | ${cell(average(greedy), greedy.length, [band[1], band[2]], units)}${greedy.length ? ` (${spread(greedy)})` : ''} | ${cell(average(plain), plain.length, [band[1], band[2]], units)} |`,
    );
  }

  console.log(
    '\n### By decade (reference clubs; shares of turnover, which leaves out player sales)\n',
  );
  console.log(
    '| decade | seasons | top flight | facilities | competition | matchday | commercial | wage bill / income | operating expenses / income | other costs / income | net / income |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const seasons = (modes[0].length ? modes[0] : careers).flatMap((c) => c.seasons);
  for (let decade = 1950; decade <= Math.max(...seasons.map((s) => s.year)); decade += 10) {
    const rows = seasons.filter((s) => s.year >= decade && s.year < decade + 10);
    if (!rows.length) continue;
    console.log(
      `| ${decade}s | ${rows.length} | ${rows.filter((s) => !s.amateur && s.tier === 0).length} | ${(sum(rows, (s) => s.facilities) / rows.length).toFixed(1)} | ${pct(share(rows, (s) => s.sources.competition, turnover))} | ${pct(share(rows, (s) => s.sources.matchday, turnover))} | ${pct(share(rows, (s) => s.sources.commercial, turnover))} | ${pct(share(rows, (s) => s.wages, income))} | ${pct(share(rows, (s) => s.opex, income))} | ${pct(share(rows, (s) => s.expense - s.wages - s.opex - s.facilitySpend, income))} | ${pct(share(rows, net, income))} |`,
    );
  }

  console.log('\n### CLUB-25 market wages (prime age 26, potential = ability)\n');
  const wage = (division: number, ability: number) =>
    marketWageUnits(division, ability, 26, ability);
  console.log(`- top flight: 80 earns ${(wage(0, 80) / wage(0, 60)).toFixed(2)}× 60 (band 6–10×)`);
  console.log(
    `- second tier: a squad of the same ability earns ${pct(wage(1, 70) / wage(0, 70))} of the top flight's (band 35–50%)`,
  );
  console.log(
    `- pivot: a top-flight player rated ${MARKET_CONFIG.pivot} earns ${units(wage(0, MARKET_CONFIG.pivot))} units at index 1`,
  );
  const byDivision = new Map<string, Season[]>();
  for (const s of (modes[0].length ? modes[0] : careers).flatMap((c) => c.seasons.slice(0, CAREER)))
    byDivision.set(divisionName(s), [...(byDivision.get(divisionName(s)) ?? []), s]);
  console.log('\nFirst 50 seasons of the reference clubs by division:');
  console.log(
    '\n| division | seasons | XI gap to league | wage bill / income | player wages / turnover | operating expenses / income | turnover (units) | net / income |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [division, seasons] of [...byDivision].sort()) {
    console.log(
      `| ${division} | ${seasons.length} | ${(sum(seasons, (s) => s.gap) / seasons.length).toFixed(1)} | ${pct(share(seasons, (s) => s.wages, income))} | ${pct(share(seasons, (s) => s.playerWages, turnover))} | ${pct(share(seasons, (s) => s.opex, income))} | ${units(sum(seasons, turnover) / seasons.length)} | ${pct(share(seasons, net, income))} |`,
    );
  }
}

const started = performance.now();
const careers: Career[] = [];
const saved = option('in', '');
if (saved)
  for (const file of saved.split(','))
    careers.push(...(JSON.parse(readFileSync(file, 'utf8')) as Career[]));
else
  for (const code of COUNTRY_CODES)
    for (const build of BUILDS)
      for (const greedy of FACILITY_MODES)
        for (let i = 0; i < SEEDS; i++) {
          const t = performance.now();
          const career = playCareer(code, build, greedy, `economy-${code}-${i}`);
          careers.push(career);
          console.error(
            `${code} ${build} ${greedy ? 'reference' : 'no building'} seed ${i}: ${career.seasons.length} seasons in ${((performance.now() - t) / 1000).toFixed(0)} s`,
          );
          if (LOG) printLog(career);
        }
const out = option('out', '');
if (out) writeFileSync(out, JSON.stringify(careers));
console.log(
  `# Economy calibration — ${careers.length} careers of ${SEASONS} seasons from the 1950 founding, every delegation on`,
);
report(careers);
console.log(`\n_${((performance.now() - started) / 1000).toFixed(0)} s_`);
