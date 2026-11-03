/**
 * Owner balance harness (LEAGUE-13, ECON-29, OWNER-3/5/8/12, ECON-37/38; spec/ssot/LEAGUE.md).
 *
 * Plays LEAGUE-13's reference careers: a world lived from 1930 to its 1950/51 season by the day
 * loop (`generateHistory`, →WORLD-13), then a 1950 takeover in each country of the club at the
 * middle price of the tier's reach there (→OWNER-3; the dearer of the two middle clubs for an even
 * count, among those the tier's fortune pays for), 기본 방향, every business responsibility
 * delegated, and the season played round by round to its close until 2009/10 or the career's end
 * (→OWNER-16). The reference moves no owner money: stake 0%, no injection, dividend 0%. Careers
 * with five traits run beside, and `--policies` adds owners who inject and take dividends at fixed
 * simple policies. It prints LEAGUE-13's columns per tier, ECON-29's rows on the 중견 사업가 careers,
 * how the careers end (club bankruptcy, owner bankruptcy, 퇴진), and where the start's fortunes,
 * living costs, 팬 민심 and club prices land. Money is compared in 1901 price units of each season.
 *
 *   pnpm exec tsx scripts/owner-balance.ts            six tiers × ENG ESP FRA GER × 5 seeds, no traits
 *   options: --tiers oil,midsize   --countries ENG,FRA   --seeds N   --first-seed N
 *            --until YEAR (the last season played; 2009)   --traits none,five
 *            --policies none,dividend,patron,mixed   --build (ECON-29's facility rule)
 *            --out careers.json (keep the careers)   --in a.json,b.json (report kept careers only)
 *            --log (one line a season on stderr)
 *
 * Policies: none, the reference; dividend, the 배당 dial at 50%; patron, a quarter of the fortune
 * above zero put in on each season's first day (within FFP); mixed, a tenth put in and the dial at
 * 50%. The business stake stays 0% in every policy.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { CountryCode, World } from '../packages/contracts/src/types';
import type { DividendShare, OwnerTrait, WealthTier } from '../packages/contracts/src/owner';
import { careerEnded } from '../packages/contracts/src/owner';
import { country, footballIndex } from '../packages/catalogs/src/index';
import { generateHistory } from '../packages/engine/src/history';
import { takeOver } from '../packages/engine/src/takeover';
import {
  divisionDistribution,
  pricedClubs,
  reachOf,
  tierAnchor,
  tierFortune,
} from '../packages/engine/src/club-value';
import { pays } from '../packages/engine/src/listing';
import { bookIncomeLines } from '../packages/engine/src/books';
import { readGateDetail } from '../packages/engine/src/settlement';
import { ffpRoom, livingCost, ownerCommand } from '../packages/engine/src/owner';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import {
  advanceRound,
  CASH_WARNING_ROUNDS,
  closeSeason,
  debit,
  FACILITY_PARTS,
  facilityInvestmentPreview,
  INCOME_KINDS,
  isIncomeKind,
  operatingCosts,
  partCostUnits,
  partTop,
  quote,
  startFacilityWork,
} from '../packages/engine/src/index';
import {
  FAN_MOOD,
  OWNER_BUSINESS,
  OWNER_LIVING,
  OWNER_TIERS,
} from '../packages/engine/src/owner-config';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const TIERS = option('tiers', 'oil,chaebol,industrial,midsize,local,selfmade').split(
  ',',
) as WealthTier[];
const COUNTRY_CODES = option('countries', 'ENG,ESP,FRA,GER').split(',') as CountryCode[];
const SEEDS = Number(option('seeds', '5'));
const FIRST_SEED = Number(option('first-seed', '0'));
const UNTIL = Number(option('until', '2009'));
const TRAIT_SETS = option('traits', 'none').split(',');
const POLICIES = option('policies', 'none').split(',') as Policy[];
const BUILD = args.includes('--build');
const LOG = args.includes('--log');
/** --moods: 팬 민심 after every round with the drivers that moved it, on stderr. */
const MOODS = args.includes('--moods');
/**
 * --purse-apart: the owner pays no living costs while the career plays, so a reference career that
 * moves no owner money measures the club for its whole length; with stake 0% and nothing moved the
 * fortune only pays living costs, so the season the owner would go bankrupt at any living-cost rate
 * is read from each season's living costs against the fortune left (`living` below). Policies that
 * move money pay their living costs as the game does.
 */
const PURSE_APART = args.includes('--purse-apart');
/** The living-cost rates the owner's bankruptcy season is read at (→OWNER-8), the SSOT's first. */
const LIVING_RATES = [OWNER_LIVING.rate, 0.005, 0.0025, 0.001, 0.0005];
const SSOT_LIVING = OWNER_LIVING.rate;
/** Sets the living-cost rate the engine reads (a measurement override, never a game setting). */
const setLiving = (rate: number) => ((OWNER_LIVING as { rate: number }).rate = rate);
const TAKEOVER_YEAR = 1950;
/** ECON-29's career averages: the first fifty seasons. */
const CAREER = 50;

/**
 * The five traits beside the reference: the ones that act on a delegated career that moves no
 * owner money (strength, wages and fees, staff candidates, sponsors, operating expenses); 성공한
 * 사업가 needs a stake, 팬들의 친구 only softens 팬 민심 and 원석 감별사 acts on the academy alone.
 */
const FIVE: OwnerTrait[] = ['talisman', 'negotiator', 'networker', 'marketer', 'politician'];

type Policy = 'none' | 'dividend' | 'patron' | 'mixed';
const POLICY: Record<Policy, { inject: number; dividend: DividendShare }> = {
  none: { inject: 0, dividend: 0 },
  dividend: { inject: 0, dividend: 50 },
  patron: { inject: 0.25, dividend: 0 },
  mixed: { inject: 0.1, dividend: 50 },
};

// ---- Bands -----------------------------------------------------------------------------------
const TIER_BANDS: Record<WealthTier, string> = {
  oil: 'most careers win, median first title within 10 seasons; 35% or less after; none bankrupt',
  chaebol: 'about half win; 30% or less after; none bankrupt',
  industrial: 'about a third win; 25% or less after; none bankrupt',
  midsize: '1 in 5 or fewer win; the top flight in most careers; 1 in 20 or fewer bankrupt',
  local: 'the top flight in about half the careers; 1 in 10 or fewer bankrupt',
  selfmade: 'the top flight in 1 in 4 careers or fewer; 1 in 5 or fewer bankrupt',
};
const BANDS = {
  wages: [0.45, 0.7],
  operating: [-0.05, 0.1],
  top2000s: { competition: [0.4, 0.55], commercial: [0.25, 0.4], matchday: [0.15, 0.25] },
  matchday1950s: 0.6,
  ladderSeasons: 25,
} as const;

// ---- Careers ---------------------------------------------------------------------------------
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
  if (kind === 'owner-injection') return 'owner';
  return 'other';
}
for (const kind of INCOME_KINDS)
  if (sourceOf(kind) === 'other') throw new Error(`income kind ${kind} has no source`);

interface Season {
  year: number;
  /** Division from the top flight (0); `lowest` marks the country's lowest professional one. */
  tier: number;
  lowest: boolean;
  rank: number;
  /** Price units of the season. */
  sources: Record<Source, number>;
  /** The season's expense without the dividend, which is owner money (→OWNER-11). */
  expense: number;
  wages: number;
  facilitySpend: number;
  real: number;
  cash: number;
  fortune: number;
  living: number;
  dividend: number;
  fanMood: number;
  /** The lowest 팬 민심 after a settled league round, and how many rounds it sat below the floor. */
  moodLow: number;
  belowFloor: number;
  /**
   * With the purse apart: the season's living costs at the SSOT's rate as a share of the fortune
   * left after the price (both in the season's money); summed, the owner is bankrupt past 1.
   */
  lifeShare?: number;
}
interface BookLines {
  distribution: number;
  gate: number;
  commercial: number;
}
interface Career {
  code: CountryCode;
  tier: WealthTier;
  traits: string;
  policy: Policy;
  build: boolean;
  seed: string;
  club: string;
  /** The takeover in 1950 price units: the anchor, the fortune and the price, and the club's last income. */
  start: {
    division: number;
    place: number;
    reach: number;
    anchor: number;
    fortune: number;
    price: number;
    lastIncome: number;
    debt: number;
    cash: number;
    distribution: number;
    /** The tier whose band the club came from (its own unless the country holds none there). */
    band?: WealthTier;
    /** The band's median was dearer than the fortune: the dearest club below it was taken. */
    substitute?: boolean;
    /** The books' last closed season: wages and operating expenses, units of that season. */
    lastWages?: number;
    lastCosts?: number;
    /** The book's income lines for the takeover season before it (units; merit at the opening order). */
    bookBefore?: BookLines;
  };
  /**
   * ECON-36's check, the first owned season (units): the owned club's income lines and the lines a
   * book would settle for the club as it stands at that close (→ECON-36).
   */
  first?: {
    league: number;
    cups: number;
    leagueGate: number;
    cupGate: number;
    commercial: number;
    other: number;
    book: BookLines;
  };
  seasons: Season[];
  /** How the career ended before 2009/10, and in which season. */
  end?: { cause: 'club' | 'owner' | 'fans'; year: number };
}

/** Minor units of one 1901 price unit in this country and year. */
const unitOf = (code: string, year: number) => Number(quote(code, year, 1_000_000)) / 1_000_000;
const units = (code: string, year: number, amount: string | bigint) =>
  Number(amount) / unitOf(code, year);

const worlds = new Map<string, string>();
/** --world-dir DIR: keep each seed's 1950 world there as JSON, so parallel jobs live it once. */
const WORLD_DIR = option('world-dir', '');
/** The seed's world on 1 August 1950, lived from 1930, as JSON so each career starts from a copy. */
function worldAt(seed: string): World {
  let json = worlds.get(seed);
  const file = WORLD_DIR && `${WORLD_DIR}/${seed}-${TAKEOVER_YEAR}.json`;
  if (!json && file && existsSync(file)) json = readFileSync(file, 'utf8');
  if (!json) {
    const t = performance.now();
    json = JSON.stringify(generateHistory(seed, TAKEOVER_YEAR));
    console.error(
      `${seed}: world to ${TAKEOVER_YEAR} in ${((performance.now() - t) / 1000).toFixed(0)} s`,
    );
    if (file) {
      mkdirSync(WORLD_DIR, { recursive: true });
      writeFileSync(`${file}.part`, json);
      renameSync(`${file}.part`, file);
    }
  }
  worlds.set(seed, json);
  return JSON.parse(json) as World;
}

const TIER_ORDER = Object.keys(OWNER_TIERS) as WealthTier[];
/**
 * LEAGUE-13's reference club: the median-priced club of the tier's price band in this country (the
 * dearer of the two middle ones); when the band holds no club of the country, the nearest band that
 * does, the cheaper of two equally near. A median the fortune cannot pay gives way to the dearest
 * club of the band it pays for (`substitute`).
 */
function pickClub(w: World, tier: WealthTier, code: CountryCode) {
  const priced = pricedClubs(w),
    fortune = tierFortune(w, tier, priced),
    own = TIER_ORDER.indexOf(tier);
  const nearest = [...TIER_ORDER.keys()].sort(
    (a, b) => Math.abs(a - own) - Math.abs(b - own) || b - a,
  );
  for (const index of nearest) {
    const band = TIER_ORDER[index]!;
    const clubs = reachOf(w, band, priced)
      .filter((entry) => entry.club.country === code)
      .reverse();
    if (!clubs.length) continue;
    const median = clubs[clubs.length >> 1]!;
    const entry = pays(w, median, fortune)
      ? median
      : clubs.filter((e) => pays(w, e, fortune) && clubs.indexOf(e) < clubs.indexOf(median)).at(-1);
    if (!entry) continue;
    return {
      entry,
      band,
      substitute: entry !== median,
      reach: clubs.length,
      places: clubs.map((e) => e.club.id),
      anchor: tierAnchor(w, tier, priced),
      fortune,
    };
  }
  return undefined;
}

function delegateAll(w: World) {
  w.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
}
/** ECON-29's facility rule: the cheapest next work while cash after it covers 13 rounds. */
function buyFacilities(w: World) {
  for (;;) {
    const preview = FACILITY_PARTS.map((part) => facilityInvestmentPreview(w, part))
      .filter((p) => p.eligible)
      .sort((a, b) => a.next!.units - b.next!.units)[0];
    if (!preview || !preview.affordable || preview.runwayRounds < CASH_WARNING_ROUNDS) return;
    startFacilityWork(w, preview.part, (fee) => debit(w, fee));
  }
}

function playCareer(
  code: CountryCode,
  tier: WealthTier,
  traits: string,
  policy: Policy,
  seed: string,
): Career | undefined {
  const w = worldAt(seed);
  const pick = pickClub(w, tier, code);
  if (!pick) return undefined;
  const club = pick.entry.club,
    books = club.books,
    last = books?.seasons.find((s) => s.year < w.year);
  const division = club.tier,
    places = pick.places;
  const linesIn = (lines: ReturnType<typeof bookIncomeLines>, year: number): BookLines => ({
    distribution: units(code, year, lines.distribution),
    gate: units(code, year, lines.gate),
    commercial: units(code, year, lines.commercial),
  });
  const bookBefore = linesIn(bookIncomeLines(w, club), TAKEOVER_YEAR);
  takeOver(w, club.id, { tier, traits: traits === 'five' ? FIVE : [] });
  delegateAll(w);
  const apart = PURSE_APART && policy === 'none';
  setLiving(apart ? 0 : SSOT_LIVING);
  const rules = POLICY[policy];
  if (rules.dividend) ownerCommand(w, { type: 'owner-dividend', share: rules.dividend });
  const takeover = w.owner!.takeover;
  const career: Career = {
    code,
    tier,
    traits,
    policy,
    build: BUILD,
    seed,
    club: club.id,
    start: {
      division,
      place: places.indexOf(club.id) + 1,
      reach: pick.reach,
      anchor: units('ENG', TAKEOVER_YEAR, pick.anchor),
      fortune: units(code, TAKEOVER_YEAR, takeover.fortune),
      price: units(code, TAKEOVER_YEAR, takeover.price),
      lastIncome: last ? units(code, last.year, last.income) : NaN,
      debt: units(code, TAKEOVER_YEAR, takeover.debt),
      cash: units(code, TAKEOVER_YEAR, w.cash),
      distribution: units(code, TAKEOVER_YEAR, divisionDistribution(code, TAKEOVER_YEAR, division)),
      band: pick.band,
      substitute: pick.substitute,
      lastWages: last ? units(code, last.year, last.wages) : NaN,
      lastCosts: last ? units(code, last.year, last.costs) : NaN,
      bookBefore,
    },
    seasons: [],
  };
  const depth = country(code).groups.length;
  while (w.year <= UNTIL && !careerEnded(w)) {
    const year = w.year,
      unit = unitOf(code, year),
      firstEvent = w.events.length;
    const owner = w.owner!;
    if (rules.inject && BigInt(owner.fortune) > 0n) {
      let amount = BigInt(Math.floor(Number(owner.fortune) * rules.inject));
      const room = ffpRoom(w);
      if (room !== undefined && amount > BigInt(room)) amount = BigInt(room);
      if (amount > 0n) ownerCommand(w, { type: 'owner-inject', amount: amount.toString() });
    }
    let wages = 0,
      moodLow = owner.fanMood,
      belowFloor = 0;
    while (w.round < 46 && !careerEnded(w)) {
      if (BUILD) buyFacilities(w);
      const cost = operatingCosts(w, w.round + 1).payments;
      wages += Number(cost.playerWages) + Number(cost.managerWage) + Number(cost.staffWages ?? '0');
      advanceRound(w, undefined, false);
      moodLow = Math.min(moodLow, w.owner!.fanMood);
      if (w.owner!.fanMood < FAN_MOOD.floor) belowFloor++;
      if (MOODS)
        console.error(
          `  ${year} round ${w.round} 팬 민심 ${w.owner!.fanMood.toFixed(1)} · ${w.events
            .slice(firstEvent)
            .filter((e) => e.kind === 'fan-mood' && e.round === w.round)
            .map((e) => `${e.title} ${e.detail}`)
            .join(' · ')}`,
        );
    }
    if (careerEnded(w)) break;
    let lifeShare: number | undefined;
    if (apart) {
      setLiving(SSOT_LIVING);
      const living = Number(livingCost(w, year)) * (OWNER_BUSINESS.dates.length + 1);
      setLiving(0);
      lifeShare = living / Number(w.owner!.fortune);
    }
    const firstSeason = !career.seasons.length;
    const leagueMatches = firstSeason
      ? new Set(w.fixtures.filter((f) => f.kind === 'league').map((f) => f.id))
      : undefined;
    const bookAtClose = firstSeason
      ? linesIn(
          bookIncomeLines(
            w,
            w.clubs.find((c) => c.id === club.id)!,
          ),
          year,
        )
      : undefined;
    closeSeason(w);
    w.revision++;
    const archive = w.history.at(-1)!,
      record = w.owner!.seasonRecords.find((r) => r.year === year);
    const sources: Record<Source, number> = {
      competition: 0,
      matchday: 0,
      commercial: 0,
      sales: 0,
      owner: 0,
      other: 0,
    };
    let facilitySpend = 0,
      dividend = 0;
    for (const event of w.events.slice(firstEvent)) {
      if (event.year !== year || !event.amount) continue;
      const amount = Number(event.amount) / unit;
      if (isIncomeKind(event.kind)) sources[sourceOf(event.kind)] += amount;
      if (event.kind === 'facility') facilitySpend += amount;
      if (event.kind === 'owner-dividend') dividend += amount;
    }
    if (leagueMatches && bookAtClose) {
      const lines = { league: 0, cups: 0, leagueGate: 0, cupGate: 0, commercial: 0, other: 0 };
      for (const event of w.events.slice(firstEvent)) {
        if (event.year !== year || !event.amount || !isIncomeKind(event.kind)) continue;
        const amount = Number(event.amount) / unit,
          source = sourceOf(event.kind);
        if (event.kind === 'gate') {
          const match = readGateDetail(event.detail)?.matchId;
          lines[match && leagueMatches.has(match) ? 'leagueGate' : 'cupGate'] += amount;
        } else if (['league-share', 'league-merit', 'parachute'].includes(event.kind))
          lines.league += amount;
        else if (source === 'competition') lines.cups += amount;
        else if (source === 'commercial') lines.commercial += amount;
        else if (source === 'other') lines.other += amount;
      }
      career.first = { ...lines, book: bookAtClose };
    }
    const season: Season = {
      year,
      tier: archive.tier,
      lowest: archive.tier === depth - 1,
      rank: archive.rank,
      sources,
      expense: Number(archive.expense) / unit - dividend,
      wages: wages / unit,
      facilitySpend,
      real: footballIndex(code, year).real,
      cash: Number(archive.cash) / unit,
      fortune: record ? Number(record.fortune) / unit : NaN,
      living: record ? Number(record.living) / unit : NaN,
      dividend,
      fanMood: record?.fanMood ?? w.owner!.fanMood,
      moodLow,
      belowFloor,
      ...(lifeShare !== undefined ? { lifeShare } : {}),
    };
    career.seasons.push(season);
    if (LOG)
      console.error(
        `  ${year} ${season.tier + 1}부 ${season.rank} · cash ${Math.round(season.cash)} · fortune ${Math.round(season.fortune)} · mood ${season.fanMood.toFixed(0)}`,
      );
  }
  if (careerEnded(w)) {
    const cause = w.bankrupt ? 'club' : (w.ended as 'club' | 'owner' | 'fans');
    career.end = { cause, year: w.bankrupt?.year ?? w.year };
  }
  return career;
}

// ---- Measures --------------------------------------------------------------------------------
const turnover = (s: Season) =>
  s.sources.competition + s.sources.matchday + s.sources.commercial + s.sources.other;
const net = (s: Season) => turnover(s) + s.sources.sales - s.expense;
const operating = (s: Season) => net(s) - s.sources.sales;
const sum = (seasons: Season[], f: (s: Season) => number) =>
  seasons.reduce((total, s) => total + f(s), 0);
const share = (seasons: Season[], f: (s: Season) => number, g: (s: Season) => number) => {
  const whole = sum(seasons, g);
  return whole ? sum(seasons, f) / whole : NaN;
};
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const median = (values: number[]) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const pct = (value: number) => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-');
const num = (value: number, digits = 0) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
    : '-';
const within = (value: number, [low, high]: readonly [number, number]) =>
  Number.isFinite(value) ? (value >= low && value <= high ? 'ok' : 'OUT') : '-';
const isTitle = (s: Season) => s.tier === 0 && s.rank === 1;
const LADDER = FACILITY_PARTS.flatMap((part) =>
  Array.from({ length: partTop(part) }, (_, i) => partCostUnits(part, i + 1)),
).reduce((a, b) => a + b, 0);
const SEASONS_TO_PLAY = UNTIL - TAKEOVER_YEAR + 1;

function groupsOf(careers: Career[]) {
  const groups = new Map<string, Career[]>();
  for (const c of careers) {
    const key = `${c.tier}|${c.traits}|${c.policy}|${c.build ? 'build' : 'none'}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const order = Object.keys(TIER_BANDS);
  return [...groups].sort(
    ([a], [b]) =>
      order.indexOf(a.split('|')[0]!) - order.indexOf(b.split('|')[0]!) || (a < b ? -1 : 1),
  );
}

function balanceReport(careers: Career[]) {
  console.log('\n### LEAGUE-13 — reference careers by wealth tier\n');
  console.log(
    '| tier | traits | policy | careers | first top-flight title | first title: median / fastest season | titles after the first | top flight reached | top-flight seasons (avg) | club bankrupt | owner bankrupt | 퇴진 | seasons played (avg) | band |',
  );
  console.log('|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const [key, group] of groupsOf(careers)) {
    const [tier, traits, policy, build] = key.split('|') as [WealthTier, string, string, string];
    const firsts: number[] = [];
    let after = 0,
      afterTitles = 0,
      top = 0,
      reached = 0;
    for (const c of group) {
      const first = c.seasons.findIndex(isTitle);
      if (first >= 0) {
        firsts.push(first + 1);
        const later = c.seasons.slice(first + 1);
        after += later.length;
        afterTitles += later.filter(isTitle).length;
      }
      const flight = c.seasons.filter((s) => s.tier === 0).length;
      top += flight;
      if (flight) reached++;
    }
    const ends = (cause: string) => group.filter((c) => c.end?.cause === cause);
    const endCell = (cause: string) => {
      const list = ends(cause);
      return list.length
        ? `${list.length} (median ${median(list.map((c) => c.end!.year - TAKEOVER_YEAR + 1))}th season)`
        : '0';
    };
    console.log(
      `| ${tier} | ${traits} | ${policy}${build === 'build' ? ' +build' : ''} | ${group.length} | ${firsts.length} (${pct(firsts.length / group.length)}) | ${firsts.length ? `${median(firsts)} / ${Math.min(...firsts)}` : '-'} | ${after ? `${pct(afterTitles / after)} (${afterTitles}/${after})` : '-'} | ${reached} (${pct(reached / group.length)}) | ${(top / group.length).toFixed(1)} | ${endCell('club')} | ${endCell('owner')} | ${endCell('fans')} | ${average(group.map((c) => c.seasons.length)).toFixed(1)} of ${SEASONS_TO_PLAY} | ${TIER_BANDS[tier]} |`,
    );
  }
}

/**
 * The owner's bankruptcy at each living-cost rate (→OWNER-8/14), read on the reference careers
 * played with the purse apart: the first close at which the summed living costs pass the fortune
 * left after the price; a career that ended before it is counted as it ended.
 */
function livingReport(careers: Career[]) {
  const apart = careers.filter((c) => c.seasons.some((s) => s.lifeShare !== undefined));
  if (!apart.length) return;
  console.log(
    '\n### Owner bankruptcy by living-cost rate a settlement (reference careers, read from the fortune left; ' +
      `${SSOT_LIVING * 100}% is OWNER-8's)\n`,
  );
  console.log(
    `| tier | traits | careers | ${LIVING_RATES.map((r) => `${r * 100}%`).join(' | ')} |`,
  );
  console.log(`|---|---|---:|${LIVING_RATES.map(() => '---|').join('')}`);
  for (const [key, group] of groupsOf(apart)) {
    const [tier, traits] = key.split('|');
    const cells = LIVING_RATES.map((rate) => {
      const seasons = group.flatMap((c) => {
        let total = 0;
        for (const [i, s] of c.seasons.entries()) {
          total += ((s.lifeShare ?? 0) * rate) / SSOT_LIVING;
          if (total > 1) return [i + 1];
        }
        return [];
      });
      return seasons.length
        ? `${seasons.length} bankrupt, median season ${median(seasons)}`
        : 'none';
    });
    console.log(`| ${tier} | ${traits} | ${group.length} | ${cells.join(' | ')} |`);
  }
}

function startReport(careers: Career[]) {
  console.log(
    "\n### The start — 1950 price units of the bought club's country (anchor in English units), medians\n",
  );
  console.log(
    "| tier | clubs bought | division bought (1 = top) | clubs in the country's reach | anchor | starting fortune | price | fortune left | price / books' last income | first-season turnover / books' last income | debt taken over | cash taken over | living costs a season at the start | seasons of living costs the fortune left pays (no growth) |",
  );
  console.log('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const tier of Object.keys(TIER_BANDS) as WealthTier[]) {
    // One row per club bought: the same start under every policy and trait set.
    const clubs = new Map<string, Career>();
    for (const c of careers.filter((c) => c.tier === tier)) {
      const key = `${c.seed}|${c.club}`,
        kept = clubs.get(key);
      if (!kept || (!kept.seasons.length && c.seasons.length)) clubs.set(key, c);
    }
    const group = [...clubs.values()];
    if (!group.length) continue;
    const played = group.filter((c) => c.seasons.length);
    const firstTurnover = played.map((c) => turnover(c.seasons[0]!) / c.start.lastIncome);
    const m = (f: (c: Career) => number) => median(group.map(f));
    const divisions = new Map<number, number>();
    for (const c of group)
      divisions.set(c.start.division + 1, (divisions.get(c.start.division + 1) ?? 0) + 1);
    const living = (c: Career) => c.start.fortune * SSOT_LIVING * (OWNER_BUSINESS.dates.length + 1);
    console.log(
      `| ${tier} | ${group.length} | ${[...divisions]
        .sort((a, b) => a[0] - b[0])
        .map(([d, n]) => `${d}부 ×${n}`)
        .join(
          ', ',
        )} | ${num(m((c) => c.start.reach))} | ${num(m((c) => c.start.anchor))} | ${num(m((c) => c.start.fortune))} | ${num(m((c) => c.start.price))} | ${num(m((c) => c.start.fortune - c.start.price))} | ${num(
        m((c) => c.start.price / c.start.lastIncome),
        2,
      )} | ${num(median(firstTurnover), 2)} (${firstTurnover.length}) | ${num(m((c) => c.start.debt))} | ${num(m((c) => c.start.cash))} | ${num(m(living))} | ${num(
        m((c) => (c.start.fortune - c.start.price) / living(c)),
        1,
      )} |`,
    );
  }
}

function moodReport(careers: Career[]) {
  console.log('\n### 팬 민심 (OWNER-12/13) by tier, traits and policy\n');
  console.log(
    '| tier | traits | policy | seasons | mood at the close: median (p10–p90) | lowest after a round (median career) | rounds below the floor a season | owner fortune at the last close (median, units) | living costs paid a season (median) |',
  );
  console.log('|---|---|---|---:|---|---:|---:|---:|---:|');
  for (const [key, group] of groupsOf(careers)) {
    const [tier, traits, policy] = key.split('|');
    const seasons = group.flatMap((c) => c.seasons);
    if (!seasons.length) continue;
    const moods = seasons.map((s) => s.fanMood).sort((a, b) => a - b);
    const lows = group
      .filter((c) => c.seasons.length)
      .map((c) => Math.min(...c.seasons.map((s) => s.moodLow)));
    console.log(
      `| ${tier} | ${traits} | ${policy} | ${seasons.length} | ${num(median(moods), 1)} (${num(moods[Math.floor(moods.length * 0.1)]!, 1)}–${num(moods[Math.floor(moods.length * 0.9)]!, 1)}) | ${num(median(lows), 1)} | ${(sum(seasons, (s) => s.belowFloor) / seasons.length).toFixed(2)} | ${num(median(group.filter((c) => c.seasons.length).map((c) => c.seasons.at(-1)!.fortune)))} | ${num(median(seasons.map((s) => s.living)))} |`,
    );
  }
}

function econReport(careers: Career[]) {
  const group = careers.filter(
    (c) => c.tier === 'midsize' && c.traits === 'none' && c.policy === 'none',
  );
  if (!group.length) return;
  for (const build of [true, false]) {
    const cs = group.filter((c) => c.build === build);
    if (!cs.length) continue;
    const first = cs.flatMap((c) => c.seasons.slice(0, CAREER));
    const top2000s = cs.flatMap((c) =>
      c.seasons.filter((s) => s.tier === 0 && s.year >= 2000 && s.year < 2010),
    );
    const fifties = cs.flatMap((c) => c.seasons.filter((s) => s.year < 1960));
    const top = cs.flatMap((c) => c.seasons.filter((s) => s.tier === 0));
    const cell = (value: number, n: number, band: readonly [number, number]) =>
      n ? `${pct(value)} (${n}) ${within(value, band)}` : '-';
    console.log(
      `\n### ECON-29 — 중견 사업가 reference careers, ${build ? "with ECON-29's facility rule" : 'building nothing (as a career plays)'} (${cs.length} careers)\n`,
    );
    console.log('| target | band | measured (seasons) |');
    console.log('|---|---|---|');
    console.log(
      `| wage bill / revenue, first 50 seasons | 45–70% | ${cell(
        share(first, (s) => s.wages, turnover),
        first.length,
        BANDS.wages,
      )} |`,
    );
    console.log(
      `| operating result / revenue before player trading | −5% to +10% | ${cell(share(first, operating, turnover), first.length, BANDS.operating)} |`,
    );
    console.log(
      `| beside: before construction | - | ${pct(share(first, (s) => operating(s) + s.facilitySpend, turnover))} |`,
    );
    console.log(
      `| beside: player sales / revenue | - | ${pct(share(first, (s) => s.sources.sales, turnover))} |`,
    );
    console.log(`| beside: net result with sales | - | ${pct(share(first, net, turnover))} |`);
    for (const key of ['competition', 'commercial', 'matchday'] as const)
      console.log(
        `| top flight 2000s ${key} / turnover | ${BANDS.top2000s[key].map((v) => Math.round(v * 100)).join('–')}% | ${cell(
          share(top2000s, (s) => s.sources[key], turnover),
          top2000s.length,
          BANDS.top2000s[key],
        )} |`,
      );
    console.log(
      `| 1950s matchday / turnover | 60%+ | ${cell(
        share(fifties, (s) => s.sources.matchday, turnover),
        fifties.length,
        [BANDS.matchday1950s, 1],
      )} |`,
    );
    const perSeason = top.length
      ? sum(top, (s) => (net(s) + s.facilitySpend) / s.real) / top.length
      : NaN;
    console.log(
      `| facility ladder (${num(LADDER)} units) in seasons of top-flight net before construction | 25+ | ${top.length ? `${(perSeason > 0 ? LADDER / perSeason : Infinity).toFixed(1)} (${top.length}) ${perSeason > 0 && LADDER / perSeason >= BANDS.ladderSeasons ? 'ok' : 'OUT'}` : '-'} |`,
    );
    const ended = cs.filter((c) => c.end);
    console.log(
      `| careers that go bankrupt (club) | none | ${ended.filter((c) => c.end!.cause === 'club').length} of ${cs.length}; owner ${ended.filter((c) => c.end!.cause === 'owner').length}, 퇴진 ${ended.filter((c) => c.end!.cause === 'fans').length} |`,
    );
  }
}

/**
 * ECON-36's check: the owned club's first-season income (turnover without sales or owner money)
 * against its books' last season income, within ±25%; beside it each line against the line a book
 * settles for the club as it stands at that close, and the book's lines at the takeover against
 * those at the close (what the takeover itself changed), and the first season's wages against the
 * books' last.
 */
function econ36Report(careers: Career[]) {
  const rows = careers.filter((c) => c.first && Number.isFinite(c.start.lastIncome));
  if (!rows.length) return;
  const r = (a: number, b: number) => (b > 0 ? num(a / b, 2) : '-');
  console.log(
    '\n### ECON-36 — first owned season against the books (income in units of each season; ratios owned / book)\n',
  );
  console.log(
    "| tier | country | seed | band | division | books' last income | first-season income | ratio | ±25% | league distribution | league gate | commercial | cups (share of income) | book at the takeover → close: gate, commercial | wages / books' last wages |",
  );
  console.log('|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---:|');
  const ratios = new Map<WealthTier, number[]>();
  for (const c of rows) {
    const f = c.first!,
      s = c.seasons[0]!,
      income = turnover(s),
      ratio = income / c.start.lastIncome,
      before = c.start.bookBefore;
    ratios.set(c.tier, [...(ratios.get(c.tier) ?? []), ratio]);
    console.log(
      `| ${c.tier} | ${c.code} | ${c.seed.slice(-1)} | ${c.start.band ?? c.tier}${c.start.substitute ? '*' : ''} | ${c.start.division + 1} | ${num(c.start.lastIncome)} | ${num(income)} | ${num(ratio, 2)} | ${Math.abs(ratio - 1) <= 0.25 ? 'ok' : 'OUT'} | ${r(f.league, f.book.distribution)} | ${r(f.leagueGate, f.book.gate)} | ${r(f.commercial, f.book.commercial)} | ${pct((f.cups + f.cupGate) / income)} | ${before ? `${r(f.book.gate, before.gate)}, ${r(f.book.commercial, before.commercial)}` : '-'} | ${r(s.wages, c.start.lastWages ?? NaN)} |`,
    );
  }
  console.log('\n| tier | careers | ratio median (min–max) | within ±25% |');
  console.log('|---|---:|---|---:|');
  for (const [tier, list] of ratios)
    console.log(
      `| ${tier} | ${list.length} | ${num(median(list), 2)} (${num(Math.min(...list), 2)}–${num(Math.max(...list), 2)}) | ${list.filter((x) => Math.abs(x - 1) <= 0.25).length} |`,
    );
}

function careerList(careers: Career[]) {
  console.log('\n### Careers\n');
  console.log(
    '| tier | traits | policy | country | seed | club | seasons | divisions (seasons) | titles | end |',
  );
  console.log('|---|---|---|---|---|---|---:|---|---:|---|');
  for (const c of careers) {
    const divisions = new Map<number, number>();
    for (const s of c.seasons) divisions.set(s.tier + 1, (divisions.get(s.tier + 1) ?? 0) + 1);
    console.log(
      `| ${c.tier} | ${c.traits} | ${c.policy}${c.build ? ' +build' : ''} | ${c.code} | ${c.seed} | ${c.club} | ${c.seasons.length} | ${[
        ...divisions,
      ]
        .sort((a, b) => a[0] - b[0])
        .map(([d, n]) => `${d}부 ${n}`)
        .join(
          ', ',
        )} | ${c.seasons.filter(isTitle).length} | ${c.end ? `${c.end.cause} ${c.end.year}` : '-'} |`,
    );
  }
}

/**
 * --reach: the clubs each tier reaches in 1950 by country (→OWNER-3), with their books (→ECON-36):
 * how many carry debt, and the median debt and price against last season's income.
 */
function reachReport(seed: string) {
  const w = worldAt(seed),
    priced = pricedClubs(w);
  console.log(`\n### Reach and books in ${TAKEOVER_YEAR}, seed ${seed}\n`);
  console.log(
    "| tier | country | clubs in reach | affordable | in debt | debt / last income (median of those in debt) | debt above a season's income | price / last income (median) |",
  );
  console.log('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const tier of TIERS) {
    const fortune = tierFortune(w, tier, priced);
    for (const code of COUNTRY_CODES) {
      const reach = reachOf(w, tier, priced).filter((e) => e.club.country === code);
      const income = (e: (typeof reach)[number]) =>
        Number(e.club.books?.seasons.find((s) => s.year < w.year)?.income ?? NaN);
      const indebted = reach.filter((e) => BigInt(e.club.books?.debt ?? '0') > 0n);
      const ratio = indebted.map((e) => Number(e.club.books!.debt) / income(e));
      console.log(
        `| ${tier} | ${code} | ${reach.length} | ${reach.filter((e) => pays(w, e, fortune)).length} | ${indebted.length} | ${num(median(ratio), 2)} | ${ratio.filter((r) => r > 1).length} | ${num(median(reach.map((e) => Number(e.price) / income(e))), 2)} |`,
      );
    }
  }
}

const started = performance.now();
const careers: Career[] = [];
if (args.includes('--reach')) {
  for (let i = FIRST_SEED; i < FIRST_SEED + SEEDS; i++) reachReport(`owner-balance-${i}`);
  process.exit(0);
}
/** --prepare: only live the seeds' worlds into --world-dir. */
if (args.includes('--prepare')) {
  for (let i = FIRST_SEED; i < FIRST_SEED + SEEDS; i++) worldAt(`owner-balance-${i}`);
  process.exit(0);
}
const saved = option('in', '');
if (saved)
  for (const path of saved.split(','))
    for (const file of statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.json'))
          .sort()
          .map((name) => `${path}/${name}`)
      : [path])
      careers.push(...(JSON.parse(readFileSync(file, 'utf8')) as Career[]));
else
  for (let i = FIRST_SEED; i < FIRST_SEED + SEEDS; i++)
    for (const tier of TIERS)
      for (const code of COUNTRY_CODES)
        for (const traits of TRAIT_SETS)
          for (const policy of POLICIES) {
            const t = performance.now();
            const career = playCareer(code, tier, traits, policy, `owner-balance-${i}`);
            if (!career) {
              console.error(`${tier} ${code} seed ${i}: no club in the tier's reach there`);
              continue;
            }
            careers.push(career);
            console.error(
              `${tier} ${code} ${traits} ${policy} seed ${i}: ${career.club}, ${career.seasons.length} seasons${career.end ? `, ended ${career.end.cause} ${career.end.year}` : ''} in ${((performance.now() - t) / 1000).toFixed(0)} s`,
            );
            const out = option('out', '');
            if (out) writeFileSync(out, JSON.stringify(careers));
          }
console.log(
  `# Owner balance — ${careers.length} careers from a ${TAKEOVER_YEAR} takeover to ${UNTIL}/${(UNTIL + 1) % 100}, every responsibility delegated, 기본 방향 (OWNER_TIERS ${Object.values(
    OWNER_TIERS,
  )
    .map((t) => t.multiple)
    .join(
      '/',
    )}, living ${SSOT_LIVING * 100}% a settlement${PURSE_APART ? ', reference purse apart' : ''})`,
);
balanceReport(careers);
livingReport(careers);
startReport(careers);
moodReport(careers);
econReport(careers);
econ36Report(careers);
careerList(careers);
console.log(`\n_${((performance.now() - started) / 1000).toFixed(0)} s_`);
