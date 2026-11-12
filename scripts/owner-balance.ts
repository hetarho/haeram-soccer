/**
 * Owner balance harness (LEAGUE-13, ECON-29, OWNER-3/5/8/12, ECON-37/38; spec/ssot/LEAGUE.md).
 *
 * Plays LEAGUE-13's reference careers (r13): a world lived from 1930 to its 1950/51 season by the
 * day loop (`generateHistory`, →WORLD-13), then a 1950 takeover in each country of the median-priced
 * club of the tier's price band there (→OWNER-3; the dearer of the two middle clubs for an even
 * count; the nearest band holding a club of that country when its own holds none), 기본 방향, every
 * business responsibility delegated, and the season played round by round to its close until
 * 2009/10 or the career's end (→OWNER-16). The reference moves no owner money: stake 0%, no
 * injection, dividend 0%; its bankrupt column counts the club's bankruptcy (→ECON-24), and the
 * owner's fortune is measured beside it on a 50% dividend run (`--policies dividend`). Careers with
 * five traits run beside, and `--policies` adds owners who inject and take dividends at fixed simple
 * policies. It prints LEAGUE-13's columns per tier, ECON-29's rows on the 중견 사업가 careers,
 * ECON-36's check of the first owned season against the books, how the careers end (club
 * bankruptcy, owner bankruptcy, 퇴진), and where the start's fortunes, living costs, 팬 민심 and club
 * prices land. Money is compared in 1901 price units of each season.
 *
 *   pnpm exec tsx scripts/owner-balance.ts            six tiers × ENG ESP FRA GER × 5 seeds, no traits
 *   options: --tiers oil,midsize   --countries ENG,FRA   --seeds N   --first-seed N
 *            --until YEAR (the last season played; 2009)   --traits none,five
 *            --policies none,dividend,dividend25,patron,mixed,business   --build (ECON-29's facility rule)
 *            --purse-apart   --world-dir DIR (keep each seed's 1950 world)   --prepare (only that)
 *            --out careers.json (keep the careers)   --in a.json,dir (report kept careers only;
 *            --measured-rate R and --note TEXT say what they were played on)   --reach   --moods
 *            --log (one line a season on stderr)   --spread FILE (CLUB-48's table, a measurement override)
 *            --growth (T700: the sources of the rise below the top flight, read-only, kept per season)
 *            --sources (with --in: only the growth sources report)
 *            --compare a.json,dir (with --in: the season rows that differ from those careers)
 *            --ability-fit (T712: CLUB-25 r61's ability-fit wage, a measurement override)
 *
 * Policies: none, the reference; dividend, the 배당 dial at 50% (dividend25 at 25%); patron, a
 * quarter of the fortune above zero put in on each season's first day (within FFP); mixed, a tenth
 * put in and the dial at 50%; business, the stake and the dial at 50% (T735). The stake stays 0%
 * in every other policy.
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
import { pathToFileURL } from 'node:url';
import { observeSettlementPayroll } from './lib/settlement-payroll';
import { toolMessage } from './lib/tool-messages';
import type { CountryCode, Player, World } from '../packages/contracts/src/types';
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
import { BOOK_COMPETITIONS, bookIncomeLines } from '../packages/engine/src/books';
import { readGateDetail } from '../packages/engine/src/settlement';
import { ffpRoom, ownerCommand, seasonLivingCost } from '../packages/engine/src/owner';
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
import { FAN_MOOD, OWNER_LIVING, OWNER_TIERS } from '../packages/engine/src/owner-config';
import {
  ABILITY_FIT,
  marketWageAt,
  STAR_SPREAD_CONFIG,
} from '../packages/engine/src/market-prices';
import { levelOf, MEANS_LEVEL, meansLevel } from '../packages/engine/src/dynamics';
import { divisionFor } from '../packages/engine/src/contracts';
import { ownStarters, rating, tierLevel } from '../packages/engine/src/world';
import {
  fatigueLoad,
  formationOf,
  overall,
  ownMultiplier,
  slotOvr,
} from '../packages/engine/src/player-state';
import { transferOffers } from '../packages/engine/src/scout-search';
import { delegatePlan } from '../packages/engine/src/delegation';
import { recentRevenue, wageBill } from '../packages/engine/src/finance';
import { SEASON_ROUNDS } from '../packages/engine/src/calendar';

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
/**
 * The season living-cost rates the owner's bankruptcy season is read at (→OWNER-8), the SSOT's
 * first; four times the per-settlement rates T686 read at four settlements a season.
 */
const LIVING_RATES = [...new Set([OWNER_LIVING.season, 0.01, 0.006, 0.004, 0.002])];
const SSOT_LIVING = OWNER_LIVING.season;
/** --measured-rate: the season living-cost rate kept careers were played at (`--in`). */
const MEASURED_LIVING = Number(option('measured-rate', String(SSOT_LIVING)));
/** Sets the living-cost rate the engine reads (a measurement override, never a game setting). */
const setLiving = (rate: number) => ((OWNER_LIVING as { season: number }).season = rate);
/**
 * --spread FILE: the era's star pay spread table the careers and their worlds price with
 * (→CLUB-48; { shared: [[year, s], ...], own: { CODE: { through, spread } } }), a measurement
 * override of `STAR_SPREAD_CONFIG`, never a game setting; keep its worlds in their own --world-dir.
 */
const SPREAD = option('spread', '');
if (SPREAD) {
  const table = JSON.parse(readFileSync(SPREAD, 'utf8')) as typeof STAR_SPREAD_CONFIG;
  STAR_SPREAD_CONFIG.shared = table.shared;
  STAR_SPREAD_CONFIG.own = table.own;
}
/**
 * --means: LEAGUE-10's means level on in the careers and their worlds (→T696), a measurement
 * override of `MEANS_LEVEL`, never a game setting; it enters only with a `--spread` table, as
 * CLUB-48 admits it, so its worlds too belong in their own --world-dir.
 */
const MEANS = args.includes('--means');
if (MEANS) {
  if (!SPREAD) throw new Error('--means enters only with CLUB-48 table: give it with --spread');
  MEANS_LEVEL.inForce = true;
}
/**
 * --cups: the books count their clubs' cup and continental money (→ECON-36, T697), a measurement
 * override of `BOOK_COMPETITIONS`, never a game setting; its worlds belong in their own
 * --world-dir.
 */
const CUPS = args.includes('--cups');
if (CUPS) BOOK_COMPETITIONS.inForce = true;
/**
 * --ability-fit: CLUB-25 r61's ability-fit wage in the careers and their worlds (→T712), a
 * measurement override of `ABILITY_FIT`, never a game setting; its worlds belong in their own
 * --world-dir.
 */
const FIT = args.includes('--ability-fit');
if (FIT) ABILITY_FIT.inForce = true;
/**
 * --growth (T700): where a delegated club's rise below the top flight comes from, read at each
 * close of a season it played below the top flight, without a random draw or a world change: its
 * rating against its league's clubs nobody owns, its XI by origin and price (`divisionFor`), each
 * XI player's wage beside his ability-fit market wage, the squad's bills, the 단장's discounted
 * signings replayed on 재정 기조's checks at the ability-fit wage, the abilities the scout's list
 * offered, and the means level's hold on the league at the summer change (`MEANS_LEVEL.observe`).
 */
const GROWTH = args.includes('--growth');
/** --sources: with --in, print only the growth sources report (T700's growth.md). */
const SOURCES = args.includes('--sources');
/** --compare FILE: with --in, list every season row field that differs from FILE's careers. */
const COMPARE = option('compare', '');
const TAKEOVER_YEAR = 1950;
/** ECON-29's career averages: the first fifty seasons. */
const CAREER = 50;

/**
 * The five traits beside the reference: the ones that act on a delegated career that moves no
 * owner money (strength, wages and fees, staff candidates, sponsors, operating expenses); 성공한
 * 사업가 needs a stake, 팬들의 친구 only softens 팬 민심 and 원석 감별사 acts on the academy alone.
 */
const FIVE: OwnerTrait[] = ['talisman', 'negotiator', 'networker', 'marketer', 'politician'];

type Policy = 'none' | 'dividend' | 'dividend25' | 'patron' | 'mixed' | 'business';
const POLICY: Record<Policy, { inject: number; dividend: DividendShare; stake?: number }> = {
  none: { inject: 0, dividend: 0 },
  dividend: { inject: 0, dividend: 50 },
  dividend25: { inject: 0, dividend: 25 },
  patron: { inject: 0.25, dividend: 0 },
  mixed: { inject: 0.1, dividend: 50 },
  business: { inject: 0, dividend: 50, stake: 50 },
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
  /** Exact installments; absent in legacy reports whose wages were sampled before each round. */
  wageAccounting?: WageAccounting;
  sampledWages?: number;
  sampledPlayerWages?: number;
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
  /** --growth: the season's sources of the rise, when it was played below the top flight. */
  growth?: Growth;
}
/**
 * Where an XI player came from, read as he arrived: in the squad at the takeover; an academy
 * graduate (promoted, called up or a generated youngster at the close: `graduate`); signed for a
 * fee (an `in` transfer fact); signed free by the 단장 (no fact, since a free move keeps none
 * (→HIST-20), but a completed staff bid at fee 0); a free agent arriving at the close (`pool`, the
 * top-up from the free agents, →CLUB-3); on loan (counted apart); else `other`.
 */
type Origin = 'takeover' | 'academy' | 'free' | 'pool' | 'fee' | 'loan' | 'other';
const ORIGINS: Origin[] = ['takeover', 'academy', 'free', 'pool', 'fee', 'loan', 'other'];
interface GrowthPlayer {
  origin: Origin;
  ovr: number;
  /** `divisionFor(code, ovr)`: the division his ability suits, fractional (0 = the top flight). */
  suits: number;
  /** His slot value in the XI as `rating` reads it (multiplier and fatigue load counted). */
  contribution: number;
  /** His wage paid and his ability-fit market wage, units a year. */
  paid: number;
  fit: number;
}
interface GrowthSigning {
  day: number;
  fee: number;
  ovr: number;
  suits: number;
  paid: number;
  fit: number;
  /** 재정 기조's checks replayed at the ability-fit wage, and at his paid wage beside. */
  refusedFit: string | false;
  refusedPaid: string | false;
}
interface Growth {
  rating: number;
  npcMedian: number;
  npcBest: number;
  npcClubs: number;
  /** `tierLevel(tier)`: the division's typical strength. */
  level: number;
  xi: GrowthPlayer[];
  squad: number;
  /** The squad's annual wages at the close, paid and ability-fit, and the season's paid player wages. */
  squadPaid: number;
  squadFit: number;
  playerWagesPaid: number;
  signings: GrowthSigning[];
  /** The scout's list as drawn this season, each player once: [OVR, free agent]. */
  offered: [number, 0 | 1][];
  /**
   * The summer change before this season, on the league it plays: clubs nobody owns, those whose
   * means level is below their level, those cut to it, and the league's median strength lost.
   */
  hold?: { clubs: number; limited: number; cut: number; shift: number };
}
interface BookLines {
  distribution: number;
  gate: number;
  commercial: number;
}
export interface Career {
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
  /** An ended season is not closed or included in the completed-season bands. */
  partialPayroll?: ReturnType<typeof seasonPayroll>;
  /** How the career ended before 2009/10, and in which season. */
  end?: { cause: 'club' | 'owner' | 'fans'; year: number };
}

type PayrollRead = ReturnType<ReturnType<typeof observeSettlementPayroll>['read']>;
interface WageAccounting extends PayrollRead {
  version: 'settled-payroll-v1';
  year: number;
  currency: string;
  priceUnit: number;
  completeSeason: boolean;
}

/** Keep the exact minor-unit receipts beside converted values and the former samples. */
export function seasonPayroll(
  settled: PayrollRead,
  year: number,
  currency: string,
  priceUnit: number,
  sampledWages: number,
  sampledPlayerWages: number,
) {
  return {
    wages: Number(settled.payroll) / priceUnit,
    sampledWages: sampledWages / priceUnit,
    sampledPlayerWages: sampledPlayerWages / priceUnit,
    wageAccounting: {
      ...settled,
      version: 'settled-payroll-v1' as const,
      year,
      currency,
      priceUnit,
      completeSeason:
        settled.firstRound === 1 &&
        settled.lastRound === SEASON_ROUNDS &&
        settled.count === SEASON_ROUNDS,
    },
  };
}

/** --in never upgrades an unmarked historical observation into an exact payment. */
export function payrollAccounting(seasons: readonly Pick<Season, 'wageAccounting'>[]) {
  const exact = seasons.filter((s) => s.wageAccounting?.version === 'settled-payroll-v1').length;
  return toolMessage('tool.payroll.accountingSummary', { exact, legacy: seasons.length - exact });
}

/** NPC book wages contain players only; legacy total payroll is not a comparable numerator. */
export function bookPlayerPayroll(season: Pick<Season, 'wageAccounting' | 'growth'>) {
  const exact = season.wageAccounting;
  if (exact?.version === 'settled-payroll-v1')
    return {
      amount: Number(exact.playerWages) / exact.priceUnit,
      label: toolMessage('tool.payroll.exactPlayers'),
    };
  if (season.growth)
    return {
      amount: season.growth.playerWagesPaid,
      label: toolMessage('tool.payroll.sampledPlayers'),
    };
  return { amount: undefined, label: toolMessage('tool.payroll.legacyScopeMismatch') };
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

// ---- Growth sources (--growth, T700): read-only ------------------------------------------------
const ownClub = (w: World) => w.clubs.find((c) => c.id === w.playerClub)!;
/**
 * Each arrival's origin, noted when he is first seen in the squad (after a round or a close): the
 * facts recorded since the last look, then the completed staff bids (pruned later, so read now).
 */
function arrivalTracker(w: World) {
  const present = new Set(w.players.filter((p) => p.status === 'active').map((p) => p.id)),
    takeover = new Set(present),
    joined = new Map<string, Origin>();
  let factsSeen = w.transfers?.facts.length ?? 0;
  return {
    look(close: boolean) {
      const facts = (w.transfers?.facts ?? []).slice(factsSeen),
        now = w.players.filter((p) => p.status === 'active'),
        arrived: { p: Player; origin: Origin; fee: bigint }[] = [];
      for (const p of now) {
        if (present.has(p.id)) continue;
        const fact = [...facts].reverse().find((f) => f.direction === 'in' && f.player === p.id);
        const free = (w.bids ?? []).some(
          (b) =>
            b.direction === 'out' &&
            b.playerId === p.id &&
            b.status === 'completed' &&
            b.fee === '0',
        );
        joined.set(
          p.id,
          fact
            ? fact.loan
              ? 'loan'
              : 'fee'
            : p.loanUntil !== undefined
              ? 'loan'
              : free
                ? 'free'
                : p.graduate
                  ? 'academy'
                  : close
                    ? 'pool'
                    : 'other',
        );
        arrived.push({ p, origin: joined.get(p.id)!, fee: BigInt(fact?.fee ?? '0') });
      }
      present.clear();
      for (const p of now) present.add(p.id);
      factsSeen = w.transfers?.facts.length ?? 0;
      return arrived;
    },
    origin(p: Player): Origin {
      if (p.loanUntil !== undefined) return 'loan';
      return joined.get(p.id) ?? (takeover.has(p.id) ? 'takeover' : 'other');
    },
  };
}
/** His ability-fit market wage: priced in the division his ability suits, never a cheaper one. */
function fitWage(w: World, p: Player, tier: number) {
  const ovr = overall(p),
    suits = divisionFor(ownClub(w).country, ovr);
  return {
    ovr,
    suits,
    wage: BigInt(marketWageAt(ownClub(w).country, w.year, Math.min(tier, suits), p, ovr)),
  };
}
/**
 * The 단장's plan's checks on a signing (`signingVerdict`'s arithmetic) replayed at the first
 * round boundary after it, with his fee added back to the cash and `wage` in place of his paid one;
 * the season's cash projection is not replayed. The reason refused, or false.
 */
function replaySigning(w: World, p: Player, fee: bigint, wage: bigint): string | false {
  const plan = delegatePlan(w, 'recruitment'),
    stance = plan.stance,
    paid = BigInt(p.wage);
  const perRound = (BigInt(operatingCosts(w).annual) - paid + wage) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(stance.runway),
    spare = BigInt(w.cash) + fee - runway;
  if (spare < fee) return 'runway';
  if (fee > BigInt(plan.left) + fee) return 'budget';
  const bill = BigInt(wageBill(w)) - paid + wage,
    revenue = BigInt(recentRevenue(w));
  if (bill * 100n > revenue * BigInt(Math.round(stance.wageShare * 100))) return 'wage bill';
  return false;
}
/** The owner's league's clubs nobody owns (its division and group). */
const leagueRivals = (w: World) => {
  const own = ownClub(w);
  return w.clubs.filter(
    (c) =>
      c.id !== own.id && c.country === own.country && c.tier === own.tier && c.group === own.group,
  );
};
/** The means level's hold at the summer change just played, on the league the club plays next. */
function holdOf(w: World, cuts: ReadonlyMap<string, number>) {
  const rivals = leagueRivals(w);
  const limited = rivals.filter((c) => {
    if (c.project !== undefined) return false;
    const held = meansLevel(w, c, c.tier);
    return held !== undefined && held < levelOf(w, c);
  }).length;
  const after = rivals.map((c) => c.strength),
    before = rivals.map((c) => c.strength + (cuts.get(c.id) ?? 0));
  return {
    clubs: rivals.length,
    limited,
    cut: rivals.filter((c) => cuts.has(c.id)).length,
    shift: median(before) - median(after),
  };
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
  if (rules.stake) ownerCommand(w, { type: 'owner-stake', percent: rules.stake });
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
  const arrivals = arrivalTracker(w);
  let hold: Growth['hold'];
  const cuts = new Map<string, number>();
  if (GROWTH) MEANS_LEVEL.observe = (c, from, to) => cuts.set(c.id, from - to);
  const payroll = observeSettlementPayroll(w);
  try {
    while (w.year <= UNTIL && !careerEnded(w)) {
      const year = w.year,
        unit = unitOf(code, year),
        currency = w.currency,
        firstRound = w.round + 1,
        firstEvent = w.events.length;
      const owner = w.owner!;
      if (rules.inject && BigInt(owner.fortune) > 0n) {
        let amount = BigInt(Math.floor(Number(owner.fortune) * rules.inject));
        const room = ffpRoom(w);
        if (room !== undefined && amount > BigInt(room)) amount = BigInt(room);
        if (amount > 0n) ownerCommand(w, { type: 'owner-inject', amount: amount.toString() });
      }
      let sampledWages = 0,
        sampledPlayerWages = 0,
        moodLow = owner.fanMood,
        belowFloor = 0;
      const signings: GrowthSigning[] = [],
        offered = new Map<string, [number, 0 | 1]>(),
        draws = new Set<string>();
      while (w.round < 46 && !careerEnded(w)) {
        if (BUILD) buyFacilities(w);
        const cost = operatingCosts(w, w.round + 1).payments;
        sampledWages +=
          Number(cost.playerWages) + Number(cost.managerWage) + Number(cost.staffWages ?? '0');
        sampledPlayerWages += Number(cost.playerWages);
        advanceRound(w, undefined, false);
        const arrived = GROWTH ? arrivals.look(false) : [];
        if (GROWTH && ownClub(w).tier > 0) {
          for (const { p, origin, fee } of arrived) {
            if (origin !== 'free' && origin !== 'fee') continue;
            const tier = ownClub(w).tier,
              fit = fitWage(w, p, tier);
            if (fit.suits >= tier) continue;
            signings.push({
              day: w.calendar?.day ?? 0,
              fee: Number(fee) / unit,
              ovr: fit.ovr,
              suits: fit.suits,
              paid: Number(p.wage) / unit,
              fit: Number(fit.wage) / unit,
              refusedFit: replaySigning(w, p, fee, fit.wage),
              refusedPaid: replaySigning(w, p, fee, BigInt(p.wage)),
            });
          }
          const list = w.shortlist;
          if (list && !draws.has(`${list.year}:${list.day}`)) {
            draws.add(`${list.year}:${list.day}`);
            const offers = new Map(transferOffers(w).map((o) => [o.player.id, o]));
            for (const entry of list.entries) {
              const o = offers.get(entry.playerId);
              if (o && !offered.has(entry.playerId))
                offered.set(entry.playerId, [overall(o.player), o.freeAgent ? 1 : 0]);
            }
          }
        }
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
      // Read before closeSeason changes the year, round or currency. Even an ended partial
      // season retains its receipts, without closing it or adding it to the reference bands.
      const measuredPayroll = seasonPayroll(
        payroll.read(year, currency, firstRound, w.round),
        year,
        currency,
        unit,
        sampledWages,
        sampledPlayerWages,
      );
      if (careerEnded(w)) {
        career.partialPayroll = measuredPayroll;
        break;
      }
      let lifeShare: number | undefined;
      if (apart) {
        setLiving(SSOT_LIVING);
        const living = Number(seasonLivingCost(w, year));
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
      let growth: Growth | undefined;
      if (GROWTH && ownClub(w).tier > 0) {
        const own = ownClub(w),
          tier = own.tier,
          slots = formationOf(w.tactic);
        const xi = ownStarters(w).map((p, i): GrowthPlayer => {
          const fit = fitWage(w, p, tier);
          return {
            origin: arrivals.origin(p),
            ovr: fit.ovr,
            suits: fit.suits,
            contribution: slotOvr(p, slots[i]!, ownMultiplier(p)) - fatigueLoad(p.fatigue) / 6,
            paid: Number(p.wage) / unit,
            fit: Number(fit.wage) / unit,
          };
        });
        const squadNow = w.players.filter((p) => p.status === 'active');
        const rivals = leagueRivals(w).map((c) => rating(w, c));
        growth = {
          rating: rating(w, own),
          npcMedian: median(rivals),
          npcBest: Math.max(...rivals),
          npcClubs: rivals.length,
          level: tierLevel(tier),
          xi,
          squad: squadNow.length,
          squadPaid: squadNow.reduce((s, p) => s + Number(p.wage), 0) / unit,
          squadFit: squadNow.reduce((s, p) => s + Number(fitWage(w, p, tier).wage), 0) / unit,
          playerWagesPaid: Number(measuredPayroll.wageAccounting.playerWages) / unit,
          signings,
          offered: [...offered.values()],
          ...(hold ? { hold } : {}),
        };
      }
      cuts.clear();
      closeSeason(w);
      if (GROWTH) arrivals.look(true);
      hold = GROWTH && ownClub(w).tier > 0 ? holdOf(w, cuts) : undefined;
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
        ...measuredPayroll,
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
        ...(growth ? { growth } : {}),
      };
      career.seasons.push(season);
      if (LOG)
        console.error(
          `  ${year} ${season.tier + 1}부 ${season.rank} · cash ${Math.round(season.cash)} · fortune ${Math.round(season.fortune)} · mood ${season.fanMood.toFixed(0)}`,
        );
    }
  } finally {
    payroll.stop();
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
 * How the clubs grow (ECON-29, ECON-30, LEAGUE-13): per tier, the division bought, the careers that
 * reach the top flight, the season they first play there (1 = the takeover season), and the
 * operating result before player trading and the wage bill against revenue over the seasons played.
 */
function growthReport(careers: Career[]) {
  console.log('\n### Growth — top-flight reach and operating result by tier\n');
  console.log(
    toolMessage('tool.payroll.accountingLine', {
      summary: payrollAccounting(careers.flatMap((c) => c.seasons)),
    }),
  );
  console.log(
    '| tier | traits | policy | careers | division bought (median) | started in the top flight | reached it from below | first top-flight season (median / range, of those from below) | operating result / revenue | wage bill / revenue | player sales / revenue |',
  );
  console.log('|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const [key, group] of groupsOf(careers)) {
    const [tier, traits, policy] = key.split('|');
    const started = group.filter((c) => c.start.division === 0).length;
    const firsts = group
      .filter((c) => c.start.division > 0)
      .map((c) => c.seasons.findIndex((s) => s.tier === 0))
      .filter((i) => i >= 0)
      .map((i) => i + 1);
    const seasons = group.flatMap((c) => c.seasons);
    console.log(
      `| ${tier} | ${traits} | ${policy} | ${group.length} | ${median(group.map((c) => c.start.division + 1))} | ${started} | ${firsts.length} of ${group.length - started} | ${firsts.length ? `${median(firsts)} / ${Math.min(...firsts)}–${Math.max(...firsts)}` : '-'} | ${pct(share(seasons, operating, turnover))} | ${pct(share(seasons, (s) => s.wages, turnover))} | ${pct(share(seasons, (s) => s.sources.sales, turnover))} |`,
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
      `${SSOT_LIVING * 100}% is OWNER-8's; played at ${MEASURED_LIVING * 100}%)\n`,
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
          total += ((s.lifeShare ?? 0) * rate) / MEASURED_LIVING;
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
    const living = (c: Career) => c.start.fortune * MEASURED_LIVING;
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

export function econReport(careers: Career[]) {
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
      `| ${toolMessage('tool.payroll.modeledRatio')} | 45–70% | ${cell(
        share(first, (s) => s.wages, turnover),
        first.length,
        BANDS.wages,
      )}; ${payrollAccounting(first)} |`,
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
export function econ36Report(careers: Career[]) {
  const rows = careers.filter((c) => c.first && Number.isFinite(c.start.lastIncome));
  if (!rows.length) return;
  const r = (a: number, b: number) => (b > 0 ? num(a / b, 2) : '-');
  console.log(
    '\n### ECON-36 — first owned season against the books (income in units of each season; ratios owned / book)\n',
  );
  console.log(
    `| tier | country | seed | band | division | books' last income | first-season income | ratio | ±25% | league distribution | league gate | commercial | cups (share of income) | book at the takeover → close: gate, commercial | ${toolMessage('tool.payroll.npcComparison')} |`,
  );
  console.log('|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---:|');
  const ratios = new Map<WealthTier, number[]>();
  for (const c of rows) {
    const f = c.first!,
      s = c.seasons[0]!,
      income = turnover(s),
      ratio = income / c.start.lastIncome,
      before = c.start.bookBefore,
      playerPayroll = bookPlayerPayroll(s);
    ratios.set(c.tier, [...(ratios.get(c.tier) ?? []), ratio]);
    console.log(
      `| ${c.tier} | ${c.code} | ${c.seed.slice(-1)} | ${c.start.band ?? c.tier}${c.start.substitute ? '*' : ''} | ${c.start.division + 1} | ${num(c.start.lastIncome)} | ${num(income)} | ${num(ratio, 2)} | ${Math.abs(ratio - 1) <= 0.25 ? 'ok' : 'OUT'} | ${r(f.league, f.book.distribution)} | ${r(f.leagueGate, f.book.gate)} | ${r(f.commercial, f.book.commercial)} | ${pct((f.cups + f.cupGate) / income)} | ${before ? `${r(f.book.gate, before.gate)}, ${r(f.book.commercial, before.commercial)}` : '-'} | ${playerPayroll.amount === undefined ? '-' : r(playerPayroll.amount, c.start.lastWages ?? NaN)} (${playerPayroll.label}) |`,
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

// ---- Growth sources report (--in … --sources, T700) -------------------------------------------
const careerKey = (c: Career) => `${c.tier} ${c.code} ${c.seed.slice(-1)}`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! : NaN;
};
const discounted = (p: { suits: number }, tier: number) => p.suits < tier;
/** The XI's rating points above the league's NPC median, attributed by origin and price (`key`). */
function attribute(s: Season, key: (p: GrowthPlayer) => string) {
  const g = s.growth!,
    excess = g.rating - g.npcMedian,
    shares = new Map<string, number>();
  if (excess <= 0) return { excess: 0, shares };
  const above = g.xi.map((p) => Math.max(0, p.contribution - g.level)),
    whole = above.reduce((a, b) => a + b, 0);
  if (!whole) return { excess, shares };
  g.xi.forEach((p, i) =>
    shares.set(key(p), (shares.get(key(p)) ?? 0) + (excess * above[i]!) / whole),
  );
  return { excess, shares };
}
const priceClass = (s: Season) => (p: GrowthPlayer) =>
  p.origin === 'free' || p.origin === 'fee' || p.origin === 'pool'
    ? `${p.origin}|${discounted(p, s.tier) ? 'discounted' : 'priced'}`
    : p.origin;
const CLASSES: [string, string][] = [
  ['takeover', 'in the squad at the takeover'],
  ['academy', 'academy (graduate mark)'],
  ['free|discounted', 'signed free by the 단장, discounted'],
  ['fee|discounted', 'signed for a fee, discounted'],
  ['pool|discounted', 'a free agent at the close, discounted'],
  ['free|priced', "signed free by the 단장, at his ability's price"],
  ['fee|priced', "signed for a fee, at his ability's price"],
  ['pool|priced', "a free agent at the close, at his ability's price"],
  ['other', 'other'],
  ['loan', 'on loan (apart)'],
];
const DISCOUNTED_SIGNINGS = ['free|discounted', 'fee|discounted', 'pool|discounted'];
const PRICED_SIGNINGS = ['free|priced', 'fee|priced', 'pool|priced'];
function pooledShares(seasons: Season[]) {
  let excess = 0;
  const points = new Map<string, number>();
  for (const s of seasons) {
    const a = attribute(s, priceClass(s));
    excess += a.excess;
    for (const [k, v] of a.shares) points.set(k, (points.get(k) ?? 0) + v);
  }
  const share = (k: string) => (excess ? (points.get(k) ?? 0) / excess : NaN);
  return {
    excess,
    points,
    share,
    total: (keys: string[]) => keys.reduce((a, k) => a + share(k), 0),
  };
}
/** The means level's hold measured as the league median it took, capped at the XI's excess. */
function holdShare(seasons: Season[]) {
  let excess = 0,
    held = 0;
  for (const s of seasons) {
    const g = s.growth!,
      e = g.rating - g.npcMedian;
    if (e <= 0 || !g.hold) continue;
    excess += e;
    held += Math.min(e, Math.max(0, g.hold.shift));
  }
  return excess ? held / excess : NaN;
}
function sourcesReport(careers: Career[]) {
  const grown = careers.filter((c) => c.seasons.some((s) => s.growth));
  const tiers = (Object.keys(TIER_BANDS) as WealthTier[]).filter((t) =>
    grown.some((c) => c.tier === t),
  );
  const below = (t: WealthTier) =>
    grown.filter((c) => c.tier === t).flatMap((c) => c.seasons.filter((s) => s.growth));
  console.log(
    `# T700 — where a delegated club's rise below the top flight comes from (${grown.length} careers)\n`,
  );
  console.log(
    toolMessage('tool.payroll.accountingLine', {
      summary: payrollAccounting(grown.flatMap((c) => c.seasons)),
    }),
  );
  console.log(
    "Read at each close of a season the owner's club played below the top flight (`--growth`, read-only). " +
      "Rating: `rating` (world.ts) of the club and of its league's clubs nobody owns (its division and group). " +
      "Points above the median: the XI's rating less the league's NPC median, attributed to each XI player " +
      'pro rata to his slot value (as `rating` reads it: level × adaptation, less the fatigue load) above ' +
      "the division's typical strength (`tierLevel`), players below it carrying none. Discounted: " +
      "`divisionFor(code, OVR)` above the club's division (a lower index). Ability-fit wage: `marketWageAt` " +
      "at min(club division, `divisionFor`), the era's spread as in force. Origin: the latest `in` transfer " +
      'fact after the takeover (fee 0 = free; a loan apart), else in the squad at the takeover, else the ' +
      "graduate mark (academy promotions, call-ups and the close's generated youngsters), else other.\n",
  );
  console.log('## Rating against the league\n');
  console.log(
    '| tier | careers | seasons below the top flight | XI rating − NPC median: median (p10–p90) | − NPC best: median | seasons above the median |',
  );
  console.log('|---|---:|---:|---|---:|---:|');
  for (const t of tiers) {
    const seasons = below(t),
      gaps = seasons.map((s) => s.growth!.rating - s.growth!.npcMedian);
    console.log(
      `| ${t} | ${grown.filter((c) => c.tier === t).length} | ${seasons.length} | ${num(median(gaps), 1)} (${num(quantile(gaps, 0.1), 1)}–${num(quantile(gaps, 0.9), 1)}) | ${num(median(seasons.map((s) => s.growth!.rating - s.growth!.npcBest)), 1)} | ${gaps.filter((g) => g > 0).length} |`,
    );
  }
  console.log(
    "\n## Who carries the XI's points above the league's NPC median (pooled over the seasons below the top flight)\n",
  );
  console.log(
    `| tier | points above the median (seasons) | ${CLASSES.map(([, label]) => label).join(' | ')} | discounted signings together |`,
  );
  console.log(`|---|---:|${CLASSES.map(() => '---:|').join('')}---:|`);
  const row = (label: string, seasons: Season[]) => {
    const pool = pooledShares(seasons);
    console.log(
      `| ${label} | ${num(pool.excess, 1)} (${seasons.filter((s) => s.growth!.rating > s.growth!.npcMedian).length}) | ${CLASSES.map(([k]) => pct(pool.share(k))).join(' | ')} | ${pct(pool.total(DISCOUNTED_SIGNINGS))} |`,
    );
  };
  for (const t of tiers) row(t, below(t));
  const screened = [...below('local'), ...below('selfmade')];
  row('지역 유지 + 자수성가 (the screen)', screened);
  console.log('\n## The XI by origin and price (median season)\n');
  console.log(
    `| tier | discounted share of the XI | ${ORIGINS.map((o) => o).join(' | ')} | discounted XI players: paid / ability-fit wage (median) |`,
  );
  console.log(`|---|---:|${ORIGINS.map(() => '---:|').join('')}---:|`);
  for (const t of tiers) {
    const seasons = below(t);
    const xiShare = (f: (p: GrowthPlayer, s: Season) => boolean) =>
      median(seasons.map((s) => s.growth!.xi.filter((p) => f(p, s)).length / s.growth!.xi.length));
    const ratios = seasons.flatMap((s) =>
      s.growth!.xi.filter((p) => discounted(p, s.tier) && p.fit > 0).map((p) => p.paid / p.fit),
    );
    console.log(
      `| ${t} | ${pct(xiShare((p, s) => discounted(p, s.tier)))} | ${ORIGINS.map((o) => pct(xiShare((p) => p.origin === o))).join(' | ')} | ${num(median(ratios), 2)} (${ratios.length}) |`,
    );
  }
  console.log('\n## Wage bill over revenue (seasons below the top flight)\n');
  console.log(
    "| tier | paid: median / p90 | ability-fit priced: median / p90 | squad's annual wages at the close / the season's paid player wages: median (min–max) |",
  );
  console.log('|---|---|---|---|');
  for (const t of tiers) {
    const seasons = below(t).filter((s) => turnover(s) > 0);
    const paid = seasons.map((s) => s.growth!.squadPaid / turnover(s)),
      fit = seasons.map((s) => s.growth!.squadFit / turnover(s)),
      close = below(t).map((s) => s.growth!.squadPaid / s.growth!.playerWagesPaid);
    console.log(
      `| ${t} | ${pct(median(paid))} / ${pct(quantile(paid, 0.9))} | ${pct(median(fit))} / ${pct(quantile(fit, 0.9))} | ${num(median(close), 2)} (${num(Math.min(...close), 2)}–${num(Math.max(...close), 2)}) |`,
    );
  }
  console.log(
    "\n## The 단장's discounted signings on 재정 기조 표준's checks at the ability-fit wage\n\n" +
      'Replayed at the first round boundary after each signing (the state after that round, his fee added ' +
      "back to the cash and the ability-fit wage in place of his paid one; the season's cash projection not " +
      "replayed); the same replay at his paid wage is printed beside as the replay's own error.\n",
  );
  console.log(
    '| tier | discounted signings (free / fee) | OVR (median) / division his ability suits (median) | paid / ability-fit wage (median) | refused at the ability-fit wage | by reason | refused at his paid wage (replay error) |',
  );
  console.log('|---|---:|---|---:|---:|---|---:|');
  for (const t of tiers) {
    const signed = below(t).flatMap((s) => s.growth!.signings);
    const reasons = new Map<string, number>();
    for (const x of signed)
      if (x.refusedFit) reasons.set(x.refusedFit, (reasons.get(x.refusedFit) ?? 0) + 1);
    console.log(
      `| ${t} | ${signed.length} (${signed.filter((x) => !x.fee).length} / ${signed.filter((x) => x.fee).length}) | ${num(median(signed.map((x) => x.ovr)))} / ${num(median(signed.map((x) => x.suits)), 2)} | ${num(median(signed.filter((x) => x.fit > 0).map((x) => x.paid / x.fit)), 2)} | ${signed.filter((x) => x.refusedFit).length} | ${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ') || '-'} | ${signed.filter((x) => x.refusedPaid).length} |`,
    );
  }
  console.log(
    "\n## Who the scout's list offered (each player once a season, as drawn; `divisionFor` against the club's division)\n",
  );
  console.log(
    "| tier | players offered a season (median) | OVR: median (p10–p90) | division's typical strength (median) | above it | suiting a higher division | free agents |",
  );
  console.log('|---|---:|---|---:|---:|---:|---:|');
  for (const t of grown.length ? tiers : []) {
    const seasons = below(t);
    const all = seasons.flatMap((s) =>
      s.growth!.offered.map(([ovr, free]) => ({
        ovr,
        free,
        level: s.growth!.level,
        suits: divisionFor(grown.find((c) => c.seasons.includes(s))!.code, ovr),
        tier: s.tier,
      })),
    );
    const ovrs = all.map((x) => x.ovr);
    console.log(
      `| ${t} | ${num(median(seasons.map((s) => s.growth!.offered.length)))} | ${num(median(ovrs))} (${num(quantile(ovrs, 0.1))}–${num(quantile(ovrs, 0.9))}) | ${num(median(seasons.map((s) => s.growth!.level)), 1)} | ${pct(all.filter((x) => x.ovr > x.level).length / all.length)} | ${pct(all.filter((x) => x.suits < x.tier).length / all.length)} | ${pct(all.filter((x) => x.free).length / all.length)} |`,
    );
  }
  console.log(
    "\n## The means level's hold on the league at the summer change (clubs nobody owns of the league the club plays next)\n",
  );
  console.log(
    "| tier | summers read | means level below its level (share of the league's clubs) | cut to it that summer | league median strength taken: median (max) | the hold against the XI's excess (pooled, capped) |",
  );
  console.log('|---|---:|---:|---:|---|---:|');
  for (const t of tiers) {
    const holds = below(t).flatMap((s) => (s.growth!.hold ? [s.growth!.hold] : []));
    const clubs = holds.reduce((a, h) => a + h.clubs, 0);
    const limited = holds.reduce((a, h) => a + h.limited, 0),
      cut = holds.reduce((a, h) => a + h.cut, 0);
    console.log(
      `| ${t} | ${holds.length} | ${pct(limited / clubs)} | ${pct(cut / clubs)} | ${num(median(holds.map((h) => h.shift)), 1)} (${num(Math.max(...holds.map((h) => h.shift)), 1)}) | ${pct(holdShare(below(t)))} |`,
    );
  }
  console.log("\n## Top-flight reach against LEAGUE-13's band\n");
  console.log(
    '| tier | careers | reached the top flight | first top-flight season (median) | band |',
  );
  console.log('|---|---:|---:|---:|---|');
  for (const t of tiers) {
    const group = careers.filter((c) => c.tier === t),
      firsts = group
        .map((c) => c.seasons.findIndex((s) => s.tier === 0))
        .filter((i) => i >= 0)
        .map((i) => i + 1);
    console.log(
      `| ${t} | ${group.length} | ${firsts.length} (${pct(firsts.length / group.length)}) | ${num(median(firsts))} | ${TIER_BANDS[t]} |`,
    );
  }
  // The screen (T700): pooled over 지역 유지 and 자수성가 축구팬's seasons below the top flight.
  const pool = pooledShares(screened),
    disc = pool.total(DISCOUNTED_SIGNINGS),
    sources: [string, number][] = [
      ["the takeover squad's growth", pool.share('takeover')],
      ['academy', pool.share('academy')],
      ["signings at their ability's price", pool.total(PRICED_SIGNINGS)],
      ['the league held below its level by the means level', holdShare(screened)],
    ];
  const most = [...sources].sort((a, b) => b[1] - a[1])[0]!;
  console.log('\n## Screen verdict\n');
  console.log(
    disc >= 0.5
      ? `**go** for the ability-fit wage price: discounted signings carry ${pct(disc)} of the XI's points above the league's NPC median (pooled over 지역 유지 and 자수성가 축구팬's ${screened.length} seasons below the top flight; at least half needed).`
      : `**no go** for the ability-fit wage price: discounted signings carry ${pct(disc)} of the XI's points above the league's NPC median (pooled over 지역 유지 and 자수성가 축구팬's ${screened.length} seasons below the top flight; half needed). The source carrying the most: **${most[0]}** (${pct(most[1])}); beside it ${sources
          .filter((s) => s !== most)
          .map(([n, v]) => `${n} ${pct(v)}`)
          .join(', ')}.`,
  );
}

/** Kept careers (`--out`) from comma-separated JSON files and directories of them. */
function keptCareers(paths: string): Career[] {
  return paths.split(',').flatMap((path) =>
    (statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.json'))
          .sort()
          .map((name) => `${path}/${name}`)
      : [path]
    ).flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as Career[]),
  );
}
/** --compare FILE: every season row field (the growth record aside) differing from FILE's careers. */
function compareReport(careers: Career[], file: string) {
  const reference = keptCareers(file);
  const key = (c: Career) => `${c.tier}|${c.code}|${c.seed}|${c.traits}|${c.policy}`;
  const refs = new Map(reference.map((c) => [key(c), c]));
  const show = (v: unknown) =>
    typeof v === 'number' ? num(v, 2) : (JSON.stringify(v)?.slice(0, 80) ?? '-');
  const details: string[] = [];
  console.log(`# Season rows against ${file}\n`);
  console.log(
    '| career | club (reference → this) | takeover facts differing | seasons compared | rows differing | first differing season | fields differing |',
  );
  console.log('|---|---|---|---:|---:|---|---|');
  for (const c of careers) {
    const r = refs.get(key(c));
    if (!r) continue;
    let compared = 0,
      differing = 0,
      first = '';
    const fields = new Set<string>();
    for (let i = 0; i < Math.max(r.seasons.length, c.seasons.length); i++) {
      const a = r.seasons[i] as unknown as Record<string, unknown> | undefined,
        b = c.seasons[i] as unknown as Record<string, unknown> | undefined;
      if (!a || !b) {
        fields.add('season missing');
        continue;
      }
      compared++;
      let differs = false;
      for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (f === 'growth' || JSON.stringify(a[f]) === JSON.stringify(b[f])) continue;
        differs = true;
        fields.add(f);
        details.push(
          `| ${careerKey(c)} | ${String(b.year)} | ${f} | ${show(a[f])} | ${show(b[f])} |`,
        );
      }
      if (differs) {
        differing++;
        first ||= String(b.year);
      }
    }
    console.log(
      `| ${careerKey(c)} | ${r.club === c.club ? c.club : `${r.club} → ${c.club}`} | ${
        (Object.keys(c.start) as (keyof Career['start'])[])
          .filter((f) => JSON.stringify(r.start[f]) !== JSON.stringify(c.start[f]))
          .map((f) => `${f} ${show(r.start[f])} → ${show(c.start[f])}`)
          .join(', ') || '-'
      } | ${compared} | ${differing} | ${first || '-'} | ${[...fields].join(', ') || '-'} |`,
    );
  }
  console.log(
    `\n${details.length} differing fields${details.length > 300 ? ', the first 300' : ''}:\n`,
  );
  console.log('| career | season | field | reference | this |');
  console.log('|---|---|---|---|---|');
  for (const line of details.slice(0, 300)) console.log(line);
}

function main() {
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
  if (saved) careers.push(...keptCareers(saved));
  else if (SOURCES || COMPARE)
    throw new Error('--sources and --compare report kept careers: give --in');
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
  if (COMPARE) {
    compareReport(careers, COMPARE);
    process.exit(0);
  }
  if (SOURCES) {
    sourcesReport(careers);
    process.exit(0);
  }
  console.log(
    `# Owner balance — ${careers.length} careers from a ${TAKEOVER_YEAR} takeover to ${UNTIL}/${(UNTIL + 1) % 100}, every responsibility delegated, 기본 방향 (OWNER_TIERS ${Object.values(
      OWNER_TIERS,
    )
      .map((t) => t.multiple)
      .join(
        '/',
      )}, living ${SSOT_LIVING * 100}% a season${PURSE_APART ? ', reference purse apart' : ''}, star pay spread ${JSON.stringify(STAR_SPREAD_CONFIG)}${SPREAD ? ' (--spread)' : ''}${MEANS_LEVEL.inForce ? `, LEAGUE-10's means level on${MEANS ? ' (--means)' : ''}` : ''}${BOOK_COMPETITIONS.inForce ? `, competition money in the books${CUPS ? ' (--cups)' : ''}` : ''}${ABILITY_FIT.inForce ? `, CLUB-25's ability-fit wage on${FIT ? ' (--ability-fit)' : ''}` : ''})`,
  );
  /** --note: what the kept careers were played on, when it is not the tree's settings (`--in`). */
  if (option('note', '')) console.log(`\n${option('note', '')}`);
  balanceReport(careers);
  growthReport(careers);
  livingReport(careers);
  startReport(careers);
  moodReport(careers);
  econReport(careers);
  econ36Report(careers);
  careerList(careers);
  console.log(`\n_${((performance.now() - started) / 1000).toFixed(0)} s_`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
