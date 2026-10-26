import { divisionLevel } from '../packages/engine/src/reputation';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
/**
 * Economy calibration harness (ECON-29, ECON-9, CLUB-25; spec/ssot/ECON.md).
 *
 * Plays whole careers of ECON-29's reference club from the 1950 founding: every delegation on —
 * the staff run training, the academy, sponsors and every staff post, the 단장's among them, and
 * the 단장 contract talks, the manager post, sales and signings from the shortlist and the
 * manager's requests (→STAFF-20, →CLUB-33) — no owner capital, and the stadium grown a level whenever the cash after the build still
 * covers 13 rounds of fixed costs, operating expenses included. A run that never builds is kept
 * for comparison. It prints the measured economy next to the real-football bands of ECON-29: wage
 * bill and net result against income, the income mix of the 1950s and of a top flight in the
 * 2000s, how many seasons of a top-flight club's net result the facility ladder costs, the
 * attendance of ECON-9 by division on seasons that are at least the club's third straight one in
 * that division (ECON-29), the wage ratios of CLUB-25 and how much the contracts' promotion and
 * relegation clauses (CLUB-29) moved the squad's wages at each promotion and relegation.
 *
 *   pnpm exec tsx scripts/calibrate-economy.ts            ENG ESP FRA GER × default and 트레이딩
 *                                                          머신 × reference club and no building,
 *                                                          60 seasons each (several minutes)
 *   pnpm exec tsx scripts/calibrate-economy.ts --quick    ENG only, default build, reference club
 *   options: --seasons N, --countries ENG,FRA, --builds default,trading, --modes greedy,none,
 *            --levels easy,normal,hard,extreme (difficulty levels, →LEAGUE-13; normal by default),
 *            --seeds N (careers per setting), --first-seed N (the first seed's number), --log
 *            (per season), --out careers.json (keep the careers), --in a.json,b.json (report
 *            kept careers only)
 *
 * Careers run 60 seasons by default: the first 50 make the career averages, and seasons 51–60
 * (2000–2009) are the only top-flight 2000s a 1950 founding reaches. Money is compared in 1901 price
 * units, each season's amounts divided by what one unit cost that year.
 */
import type { Club, CountryCode, DifficultyLevel, World } from '../packages/contracts/src/types';
import {
  activePlayers,
  advanceRound,
  CASH_WARNING_ROUNDS,
  catchment,
  CATCHMENT_CONFIG,
  clubOf,
  closeSeason,
  createWorld,
  facilityInvestmentPreview,
  fanFollowing,
  gateProjection,
  INCOME_KINDS,
  isIncomeKind,
  marketWageUnits,
  FACILITY_PARTS,
  partCostUnits,
  partTop,
  STADIUM_STEPS,
  operate,
  operatingCosts,
  ownLeagueClubs,
  quote,
  rating,
  readGateDetail,
  MARKET_CONFIG,
} from '../packages/engine/src/index';
import { country, footballIndex } from '../packages/catalogs/src/index';
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
/** The first career seed's number, so careers can be split across processes. */
const FIRST_SEED = Number(option('first-seed', '0'));
const LOG = args.includes('--log');
const BUILDS = option('builds', quick ? 'default' : 'default,trading').split(',');
/** greedy: ECON-29's reference club, growing its stadium; none: never building, for comparison. */
const FACILITY_MODES = option('modes', quick ? 'greedy' : 'greedy,none')
  .split(',')
  .map((mode) => mode === 'greedy');
/** Difficulty levels the careers start at (→WEB-3, LEAGUE-13). */
const LEVELS = option('levels', 'normal').split(',') as DifficultyLevel[];

// ---- Targets ---------------------------------------------------------------------------------
const BANDS = {
  wages: [0.45, 0.7],
  operating: [-0.05, 0.1],
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
  if (kind.startsWith('sponsor:') || kind === 'campaign-result' || kind === 'tour')
    return 'commercial';
  if (kind === 'transfer-out' || kind === 'free-transfer-compensation') return 'sales';
  if (kind === 'support') return 'owner';
  return 'other';
}
/** Ends the run with exit code 1: a measure that cannot be read would skew its band unnoticed. */
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
// Every engine income kind has its source; only the friendly's takings count as other turnover.
// Any other `sponsor:` kind is commercial, so the table's kinds are all there is to check.
for (const kind of INCOME_KINDS)
  if (sourceOf(kind) === 'other' && kind !== 'care:friendly')
    fail(`income kind ${kind} has no source in sourceOf`);

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
  /** The football index's real multiple that season, the units the facility ladder is in. */
  real: number;
  /**
   * ECON-9's measure: the average league crowd, England-equivalent, of the clubs established in
   * each division that season, from the top flight down, the amateur league last.
   */
  established: number[];
  facilitySpend: number;
  attendance: number[];
  /** Facility steps built, the stadium's, training ground's and academy's together (0–18). */
  facilities: number;
  fans: number;
  catchment: number;
  /** Own XI rating against the league's average club. */
  gap: number;
  cash: number;
  /**
   * The close after this season moved the club (CLUB-29): the squad's wages before the clauses and
   * after them, the players whose contracts went on and how many of them carried that clause.
   */
  move?: {
    kind: 'promotion' | 'relegation';
    before: number;
    after: number;
    players: number;
    carrying: number;
  };
}
interface Career {
  code: CountryCode;
  build: string;
  greedy: boolean;
  seed: string;
  /** The difficulty level it started at; careers kept before levels were normal. */
  level?: DifficultyLevel;
  seasons: Season[];
  bankrupt?: number;
}

/** Minor units of one 1901 price unit in this country and year. */
const unitOf = (code: string, year: number) => Number(quote(code, year, 1_000_000)) / 1_000_000;

/** All seven business responsibilities delegated for the unchanged ECON-29 reference. */
function delegateAll(w: World) {
  w.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
}
/**
 * The reference club's facilities (ECON-29): the cheapest next work of the three parts whenever
 * the cash after it still covers 13 rounds of the fixed costs after it, operating expenses and the
 * new part's upkeep included (→ECON-32).
 */
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

/** The common standing-based division reputation level (LEAGUE-14). */
const usualReputation = divisionLevel;
/**
 * ECON-9's measure for one division: the clubs of the country now in it, each at the division's
 * usual reputation with the following that reputation commands, at the founding ticket price,
 * average form, an even opponent and a ground that holds them (→ECON-9); the mean of the gate's
 * low–high range, England-equivalent through the town factor.
 */
function establishedCrowd(w: World, tier: number) {
  const code = clubOf(w).country,
    depth = country(code).groups.length,
    reputation = usualReputation(tier, depth);
  const clubs = w.clubs.filter(
    (c) =>
      c.country === code && c.id !== w.playerClub && c.tier === tier && !c.id.startsWith('euro:'),
  );
  if (!clubs.length) return NaN;
  const crowds = clubs.map((club) => {
    const established: Club = { ...club, reputation, fans: fanFollowing(reputation) };
    const draft: World = {
      ...w,
      playerClub: club.id,
      clubs: w.clubs.map((c) => (c.id === club.id ? established : c)),
      ownMatches: [],
      campaigns: [],
      policy: undefined,
      build: undefined,
      ticket: 0.05,
      stadium: STADIUM_STEPS.length - 1,
      facilityWorks: undefined,
    };
    const gate = gateProjection(draft);
    return (gate.attendanceLow + gate.attendanceHigh) / 2;
  });
  return average(crowds) / (CATCHMENT_CONFIG.city[code] ?? 1);
}
function playCareer(
  code: CountryCode,
  build: string,
  greedy: boolean,
  seed: string,
  level: DifficultyLevel,
): Career {
  const w = createWorld({
    country: code,
    name: 'Calibration Town',
    color: '#335577',
    seed,
    level,
    // A preset is founded as the club's whole direction (→ECON-22, →WEB-15).
    ...(build !== 'default' ? { preset: build } : {}),
  });
  delegateAll(w);
  const career: Career = { code, build, greedy, seed, level, seasons: [] };
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
    // The squad as the close finds it, to read what the clauses do to its wages (CLUB-29).
    const before = new Map(
      activePlayers(w).map((p) => [p.id, { wage: Number(p.wage), clauses: p.clauses }]),
    );
    const oldTier = own.tier;
    const established = Array.from({ length: depth + 1 }, (_, tier) => establishedCrowd(w, tier));
    closeSeason(w);
    w.revision++;
    let move: Season['move'];
    if (clubOf(w).tier !== oldTier) {
      const kind = clubOf(w).tier < oldTier ? 'promotion' : 'relegation';
      move = { kind, before: 0, after: 0, players: 0, carrying: 0 };
      for (const p of activePlayers(w)) {
        const was = before.get(p.id);
        if (!was || p.loanUntil) continue;
        const percent = was.clauses?.[kind] ?? 0;
        move.before += was.wage / unit;
        move.after += (was.wage * (100 + percent)) / 100 / unit;
        move.players++;
        if (percent) move.carrying++;
      }
    }
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
      if (isIncomeKind(event.kind)) sources[sourceOf(event.kind)] += amount;
      if (event.kind === 'facility') facilitySpend += amount;
      if (event.kind === 'gate') {
        const gate = readGateDetail(event.detail);
        if (!gate)
          fail(
            `gate event ${event.year} round ${event.round}: unreadable detail "${event.detail}"`,
          );
        if (leagueIds.has(gate.matchId)) attendance.push(gate.attendance);
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
      real: footballIndex(code, year).real,
      established,
      facilitySpend,
      attendance,
      facilities: w.stadium + w.trainingGround + w.academyFacility,
      fans: archive.fans,
      catchment: catchment(w, own),
      gap: Math.round(gap * 10) / 10,
      cash: Number(archive.cash) / unit,
      ...(move ? { move } : {}),
    });
  }
  return career;
}

// ---- Measures --------------------------------------------------------------------------------
// ECON-29's bands are real football's ratios, which read against revenue: competition money,
// matchday and commercial income, without player trading or owner capital — the income the
// delegated wage check counts (CLUB-26). The net result counts player sales too.
const turnover = (s: Season) =>
  s.sources.competition + s.sources.matchday + s.sources.commercial + s.sources.other;
const income = turnover;
const net = (s: Season) => turnover(s) + s.sources.sales - s.expense;
/** ECON-29's operating result: the net result before player trading, construction included. */
const operating = (s: Season) => net(s) - s.sources.sales;
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
/** How many straight seasons, this one included, the club has played in this season's division. */
function streaks(seasons: Season[]) {
  return seasons.map((s, i) => {
    let n = 1;
    while (i - n >= 0 && seasons[i - n].tier === s.tier && seasons[i - n].amateur === s.amateur)
      n++;
    return n;
  });
}
/** ECON-29 measures attendance on clubs in at least their third straight season in a division. */
const ESTABLISHED = 3;
/** Every facility part from its start to its top, in football-index units (ECON-32). */
const LADDER = FACILITY_PARTS.flatMap((part) =>
  Array.from({ length: partTop(part) }, (_, i) => partCostUnits(part, i + 1)),
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

// ---- Competitive balance (LEAGUE-13) -------------------------------------------------------------
const LEVEL_BANDS: Record<DifficultyLevel, string> = {
  easy: 'most careers win; median first title 35–50 seasons, fastest ≈25; 20–35% after; none bankrupt',
  normal: 'about a third win; 20% or less after; none bankrupt',
  hard: '1 in 5 or fewer win; 1 in 20 or fewer bankrupt',
  extreme: 'half or fewer reach the top flight; 1 in 5 or fewer bankrupt',
};
const median = (values: number[]) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
/**
 * Per level (→LEAGUE-13): careers with a top-flight title, seasons to the first (median, fastest),
 * the share of top-flight titles in the seasons after the first, top-flight seasons, careers that
 * reached the top flight, and bankruptcies.
 */
function balanceReport(careers: Career[]) {
  console.log('\n### Competitive balance by level (LEAGUE-13)\n');
  console.log(
    '| level | careers | with a title | first title: median / fastest (season) | titles after the first | top-flight seasons (avg) | reached the top flight | bankrupt | band |',
  );
  console.log('|---|---:|---:|---|---:|---:|---:|---:|---|');
  for (const level of ['easy', 'normal', 'hard', 'extreme'] as DifficultyLevel[]) {
    const group = careers.filter((c) => (c.level ?? 'normal') === level && c.greedy);
    if (!group.length) continue;
    const firsts: number[] = [];
    let after = 0,
      afterTitles = 0,
      top = 0,
      reached = 0;
    for (const c of group) {
      const first = c.seasons.findIndex((s) => s.tier === 0 && !s.amateur && s.rank === 1);
      if (first >= 0) {
        firsts.push(first + 1);
        const later = c.seasons.slice(first + 1);
        after += later.length;
        afterTitles += later.filter((s) => s.tier === 0 && !s.amateur && s.rank === 1).length;
      }
      const flight = c.seasons.filter((s) => s.tier === 0 && !s.amateur).length;
      top += flight;
      if (flight) reached++;
    }
    const bankrupt = group.filter((c) => c.bankrupt !== undefined).length;
    console.log(
      `| ${level} | ${group.length} | ${firsts.length} (${pct(firsts.length / group.length)}) | ${firsts.length ? `${median(firsts)} / ${Math.min(...firsts)}` : '-'} | ${after ? pct(afterTitles / after) : '-'} | ${(top / group.length).toFixed(1)} | ${reached} | ${bankrupt} | ${LEVEL_BANDS[level]} |`,
    );
  }
}

function report(careers: Career[]) {
  balanceReport(careers);
  console.log('\n### Careers\n');
  console.log(
    '| country | build | facilities | seasons | bankrupt | divisions (seasons) | wage bill / revenue | operating result / revenue | facilities reached |',
  );
  console.log('|---|---|---|---:|---|---|---:|---:|---:|');
  for (const c of careers) {
    const first = c.seasons.slice(0, CAREER);
    const divisions = new Map<string, number>();
    for (const s of first)
      divisions.set(divisionName(s), (divisions.get(divisionName(s)) ?? 0) + 1);
    console.log(
      `| ${c.code} | ${c.build} | ${c.greedy ? 'grown' : 'none'} | ${c.seasons.length} | ${c.bankrupt ?? '-'} | ${[...divisions].map(([d, n]) => `${d} ${n}`).join(', ')} | ${pct(share(first, (s) => s.wages, income))} | ${pct(share(first, operating, income))} | ${c.seasons.at(-1)?.facilities ?? 0} |`,
    );
  }

  // Each target is measured on the reference club, which grows its stadium, and apart on careers
  // that never build, for comparison.
  const modes = [true, false].map((greedy) => careers.filter((c) => c.greedy === greedy));
  const cell = (value: number, seasons: number, band: readonly [number, number], text = pct) =>
    seasons ? `${text(value)} (${seasons}) ${within(value, band)}` : '-';
  const targets: [string, string, (cs: Career[]) => string][] = [
    [
      'wage bill / revenue, first 50 seasons',
      '45–70%',
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
      'beside the bands: player sales / revenue, first 50 seasons',
      '-',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(
          share(s, (x) => x.sources.sales, income),
          s.length,
          [0, Infinity],
        );
      },
    ],
    [
      'operating result / revenue before player trading, first 50 seasons',
      '−5% to +10%',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(share(s, operating, income), s.length, BANDS.operating);
      },
    ],
    [
      // The reference club spends any cash above 13 rounds of fixed costs on its stadium, so its
      // operating result is near break-even partly by construction; this is the result before it.
      'beside the bands: operating result before player trading and facility spending, first 50 seasons',
      '-',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(
          share(s, (x) => operating(x) + x.facilitySpend, income),
          s.length,
          [-Infinity, Infinity],
        );
      },
    ],
    [
      'beside the bands: net result / revenue with player trading, first 50 seasons',
      '-',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.slice(0, CAREER));
        return cell(share(s, net, income), s.length, [-Infinity, Infinity]);
      },
    ],
    [
      'careers that go bankrupt',
      'none',
      (cs) => {
        const bankrupt = cs.filter((c) => c.bankrupt).length;
        return `${bankrupt} of ${cs.length} ${bankrupt ? 'OUT' : 'ok'}`;
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
      `facility ladder (${units(LADDER)} football units) in seasons of top-flight net result before facility spending`,
      '25+',
      (cs) => {
        const s = cs.flatMap((c) => c.seasons.filter((x) => x.tier === 0 && !x.amateur));
        const perSeason = sum(s, (x) => (net(x) + x.facilitySpend) / x.real) / s.length;
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

  console.log(
    `\n### ECON-9 league attendance by division (season averages, England-equivalent; ECON-9's band is judged on clubs established in their division, the reference club's own crowds beside)\n`,
  );
  console.log(
    `| division | band | established clubs (p10–p90) | reference club, ${ESTABLISHED}rd+ straight season (p10–p90) | reference club, every season |`,
  );
  console.log('|---|---|---|---|---|');
  const rows: [string, (s: Season) => boolean, (depth: number) => number][] = [
    ['top flight', (s) => !s.amateur && s.tier === 0, () => 0],
    ['second tier', (s) => !s.amateur && s.tier === 1, () => 1],
    ['third tier', (s) => !s.amateur && s.tier === 2, () => 2],
    ['amateur league', (s) => s.amateur, (depth) => depth],
  ];
  /** Each season's average gate, of the seasons that pass `filter`, at least `streak` straight. */
  const gates = (cs: Career[], filter: (s: Season) => boolean, streak: number) =>
    cs
      .flatMap((c) => {
        const runs = streaks(c.seasons);
        return c.seasons.filter((s, i) => runs[i] >= streak);
      })
      .filter((s) => filter(s) && s.attendance.length)
      .map((s) => average(s.attendance))
      .sort((a, b) => a - b);
  const spread = (values: number[]) =>
    values.length
      ? ` (${units(values[Math.floor(values.length * 0.1)])}–${units(values[Math.floor(values.length * 0.9)])})`
      : '';
  for (const [label, filter, tierOf] of rows) {
    const band = ATTENDANCE.find(([name]) => name === label)!,
      range: [number, number] = [band[1], band[2]];
    const clubs = modes[0]
        .flatMap((c) =>
          c.seasons.map((s) => s.established?.[tierOf(country(c.code).groups.length)] ?? NaN),
        )
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b),
      established = gates(modes[0], filter, ESTABLISHED),
      every = gates(modes[0], filter, 1);
    console.log(
      `| ${label} | ${units(band[1])}–${units(band[2])} | ${cell(average(clubs), clubs.length, range, units)}${spread(clubs)} | ${cell(average(established), established.length, range, units)}${spread(established)} | ${cell(average(every), every.length, range, units)}${spread(every)} |`,
    );
  }

  console.log(
    '\n### CLUB-29 clauses at each promotion and relegation (reference clubs and no building)\n',
  );
  console.log(
    '| move | closes | squad wages change (p10–p90) | contracts carrying the clause | wage bill / income, season before → season after |',
  );
  console.log('|---|---:|---|---:|---|');
  for (const kind of ['promotion', 'relegation'] as const) {
    const moves = careers.flatMap((c) =>
      c.seasons.flatMap((s, i) =>
        s.move?.kind === kind && s.move.before > 0
          ? [{ move: s.move, season: s, next: c.seasons[i + 1] }]
          : [],
      ),
    );
    if (!moves.length) {
      console.log(`| ${kind} | 0 | - | - | - |`);
      continue;
    }
    const changes = moves.map(({ move }) => move.after / move.before - 1).sort((a, b) => a - b),
      carrying =
        moves.reduce((total, { move }) => total + move.carrying, 0) /
        moves.reduce((total, { move }) => total + move.players, 0),
      before = moves.map(({ season }) => season),
      after = moves.flatMap(({ next }) => (next ? [next] : []));
    const signed = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`;
    console.log(
      `| ${kind} | ${moves.length} | ${signed(average(changes))} (${signed(changes[Math.floor(changes.length * 0.1)])} to ${signed(changes[Math.floor(changes.length * 0.9)])}) | ${pct(carrying)} | ${pct(share(before, (s) => s.wages, income))} → ${pct(share(after, (s) => s.wages, income))} |`,
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
  for (const level of LEVELS)
    for (const code of COUNTRY_CODES)
      for (const build of BUILDS)
        for (const greedy of FACILITY_MODES)
          for (let i = FIRST_SEED; i < FIRST_SEED + SEEDS; i++) {
            const t = performance.now();
            const career = playCareer(code, build, greedy, `economy-${code}-${i}`, level);
            careers.push(career);
            console.error(
              `${level} ${code} ${build} ${greedy ? 'reference' : 'no building'} seed ${i}: ${career.seasons.length} seasons in ${((performance.now() - t) / 1000).toFixed(0)} s`,
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
