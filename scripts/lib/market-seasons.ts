/**
 * Pure parts of the market-season harness (scripts/market-seasons.ts): argument parsing, the
 * season aggregation over observed moves and facts, tunable overrides and the merge of runs. No
 * engine import, so each part is testable on synthetic moves. Output is machine data (JSON).
 */
import { message } from '../../packages/contracts/src/messages';

const USAGE =
  'market-seasons.ts --start fresh:<year>|lived:<year>|file:<path> [--burn-in N] [--seasons N] [--seeds 0..7] [--lucks K] [--jobs N] [--config file.json] --out file.json | --merge a.json b.json --out file.json';
export const usageError = (detail?: string) =>
  new Error(message('naturalFootball.usage', { command: detail ? `${USAGE} (${detail})` : USAGE }));

/** A fresh world makes no moves in its first season (measured 261118), so it needs a burn-in. */
export const FRESH_MIN_BURN_IN = 2;

export type StartSpec =
  | { kind: 'fresh'; year: number }
  | { kind: 'lived'; year: number }
  | { kind: 'file'; path: string };

/** `fresh:<year>`, `lived:<year>` or `file:<path>`; a fresh start refuses a burn-in under 2. */
export function parseStart(text: string, burnIn: number): StartSpec {
  const at = text.indexOf(':');
  const kind = at < 0 ? text : text.slice(0, at);
  const rest = at < 0 ? '' : text.slice(at + 1);
  if (kind === 'file') {
    if (!rest) throw usageError('file:<path>');
    return { kind, path: rest };
  }
  const year = Number(rest);
  if ((kind !== 'fresh' && kind !== 'lived') || !Number.isInteger(year) || year < 1930)
    throw usageError(`start ${text}`);
  if (kind === 'fresh' && burnIn < FRESH_MIN_BURN_IN)
    throw usageError(`fresh start needs --burn-in ${FRESH_MIN_BURN_IN} or more`);
  return { kind, year };
}

/** `0..7`, `3`, `0,2,5` or a mix: the seed numbers, in order, without repeats. */
export function parseSeeds(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    const single = /^\d+$/.test(part);
    if (!range && !single) throw usageError(`seeds ${text}`);
    const [from, to] = range ? [Number(range[1]), Number(range[2])] : [Number(part), Number(part)];
    if (to < from) throw usageError(`seeds ${text}`);
    for (let n = from; n <= to; n++) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** The seed string a seed number names. */
export const seedName = (prefix: string, n: number) => `${prefix}${n}`;

/** A luck index's results salt: luck 0 is the released draw, the others redraw each season's results. */
export const luckSalt = (luck: number) => (luck === 0 ? '' : `market-luck-${luck}`);

export interface RunJob {
  seed: string;
  luck: number;
}

/** Every (seed, luck) pair, seeds outermost. */
export function runJobs(seeds: readonly string[], lucks: number): RunJob[] {
  return seeds.flatMap((seed) => Array.from({ length: lucks }, (_, luck) => ({ seed, luck })));
}

/** Round-robin partition of jobs over `jobs` child processes (empty parts dropped). */
export function partition<T>(items: readonly T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, parts) }, () => []);
  items.forEach((item, index) => out[index % out.length]!.push(item));
  return out.filter((part) => part.length);
}

/** A deep copy of the data in a tunable object; functions (derived helpers) are not tunable and are left out. */
export function plainClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => plainClone(v)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => typeof v !== 'function')
        .map(([k, v]) => [k, plainClone(v)]),
    ) as T;
  return value;
}

/**
 * Deep-merges `config` into the named tunable objects (a setting no object holds throws, so an
 * override cannot silently miss) and returns what was applied, for echoing in the output.
 */
export function applyTunables(
  registry: Readonly<Record<string, object>>,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const merge = (target: Record<string, unknown>, patch: Record<string, unknown>, path: string) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in target)) throw usageError(`config names a missing setting: ${path}${key}`);
      const current = target[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        current &&
        typeof current === 'object'
      )
        merge(
          current as Record<string, unknown>,
          value as Record<string, unknown>,
          `${path}${key}.`,
        );
      else target[key] = value;
    }
  };
  for (const [name, patch] of Object.entries(config)) {
    const target = registry[name];
    if (!target) throw usageError(`config names an unknown tunable: ${name}`);
    merge(target as Record<string, unknown>, patch as Record<string, unknown>, `${name}.`);
  }
  return config;
}

// ---------------------------------------------------------------------------------------------
// Moves and reasons

export type MoveKind = 'paid' | 'free' | 'loan' | 'loan-return';
export type MarketWindow = 'summer' | 'winter' | 'close' | 'refresh';
export const MOVE_KINDS: readonly MoveKind[] = ['paid', 'free', 'loan', 'loan-return'];
export const MARKET_WINDOWS: readonly MarketWindow[] = ['summer', 'winter', 'close', 'refresh'];

export interface ClubRef {
  id: string;
  country: string;
  tier: number;
}

/** Why a move happened: the engine's own reason when it reports one, else inferred from facts. */
export interface MoveReason {
  /** The reason the observer was given (T945 onward). */
  given?: string;
  /** Inferred from the seller's and buyer's facts; label as inferred wherever it is read. */
  seller?: string;
  buyer?: string;
}

export interface MoveFact {
  kind: MoveKind;
  window: MarketWindow;
  /** The seller, the lender, or the club a free agent left; undefined when it is unknown. */
  from?: ClubRef;
  to: ClubRef;
  playerId: string;
  reason?: MoveReason;
}

/** The season-day boundaries of a season's windows (engine's `transferWindowDays`). */
export interface WindowDays {
  summerClose: number;
  winterOpen: number;
  winterClose: number;
  /** The first day of the close: a move on or after it is the close's. */
  closeFrom: number;
}

export function windowOf(day: number, d: WindowDays): MarketWindow {
  if (day >= d.closeFrom) return 'close';
  if (day <= d.summerClose) return 'summer';
  if (day >= d.winterOpen && day <= d.winterClose) return 'winter';
  return 'refresh';
}

/** What `inferReason` reads: facts about the seller and the buyer at the moment of a move. */
export interface ReasonFacts {
  kind: MoveKind;
  /** The seller's wage bill is above its funded limit. */
  sellerOverLimit: boolean;
  /** The player's contract ends this season. */
  expiring: boolean;
  /** Players of his line who rate at least the blocked margin above him number the line minimum. */
  blocked: boolean;
  /** The seller holds more than its standing size. */
  surplus: boolean;
  /** The buyer holds fewer than the line minimum of his line. */
  buyerShortLine: boolean;
  /** The buyer holds fewer than its standing size. */
  buyerBelowSize: boolean;
}

/** Reasons inferred from facts with exported engine reads only (labelled inferred in the output). */
export function inferReason(f: ReasonFacts): MoveReason {
  if (f.kind === 'loan-return') return { seller: 'loan-return', buyer: 'loan-return' };
  if (f.kind === 'free') return { buyer: f.buyerShortLine ? 'short-line' : 'refill' };
  const seller = f.sellerOverLimit
    ? 'sell-down'
    : f.expiring
      ? 'expiring'
      : f.blocked
        ? 'blocked'
        : f.surplus
          ? 'surplus'
          : 'listed';
  const buyer = f.buyerShortLine ? 'short-line' : f.buyerBelowSize ? 'refill' : 'upgrade';
  return { seller, buyer };
}

// ---------------------------------------------------------------------------------------------
// Season aggregation

export interface Dist {
  p50: number;
  p90: number;
  max: number;
  /** The share of clubs with none. */
  none: number;
}

/** Nearest-rank percentile of a sorted list. */
export function percentile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

export function distribution(values: readonly number[]): Dist {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted.at(-1) ?? 0,
    none: sorted.length ? sorted.filter((v) => v === 0).length / sorted.length : 0,
  };
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const bump = (map: Record<string, number>, key: string, by = 1) => {
  map[key] = (map[key] ?? 0) + by;
};

/** A club as the season opens: its division, stored strength and academy level. */
export interface StartClub extends ClubRef {
  strength: number;
  academy: number;
}
/** A club's season book once the season has closed, in pounds, with the division it played in. */
export interface EndBook {
  id: string;
  country: string;
  tier: number;
  wages: number;
  income: number;
  cash: number;
  /** Its division the next season (promotion and relegation applied). */
  nextTier: number;
}

export interface SeasonInput {
  year: number;
  clubs: StartClub[];
  moves: MoveFact[];
  /** Season-start XI by club. */
  xiStart: Record<string, string[]>;
  /** Season-start XI players no longer with their club just before the close. */
  xiLost: { club: string; player: string }[];
  /** Each lower-division club's three best players at the season's start: player → club. */
  topThree: Record<string, string>;
  contracts: { releases: number; renewals: number; expiring: number };
  retirements: number;
  /** Players new to the world's squads at the close (youth), by the tier of the club they joined. */
  intake: { tier: number; potential: number }[];
  books: EndBook[];
}

const tierKey = (tier: number) => `tier${tier}`;

export function seasonStats(input: SeasonInput) {
  const club = new Map(input.clubs.map((c) => [c.id, c]));
  const tiers = [...new Set(input.clubs.map((c) => c.tier))].sort((a, b) => a - b);
  const moves = { paid: 0, free: 0, loan: 0, loanReturn: 0 };
  const byWindow: Record<string, Record<string, number>> = {};
  const reasons: {
    given: Record<string, number>;
    seller: Record<string, number>;
    buyer: Record<string, number>;
  } = { given: {}, seller: {}, buyer: {} };
  const paidIn = new Map<string, number>(),
    paidOut = new Map<string, number>(),
    allIn = new Map<string, number>(),
    allOut = new Map<string, number>();
  const flow: Record<string, Record<string, number>> = {};
  const loanFlow: Record<string, Record<string, number>> = {};
  const crossCountry = { paid: 0, loan: 0 };
  const add = (map: Map<string, number>, id: string | undefined) => {
    if (id) map.set(id, (map.get(id) ?? 0) + 1);
  };
  for (const m of input.moves) {
    if (m.kind === 'loan-return') moves.loanReturn++;
    else moves[m.kind]++;
    bump((byWindow[m.window] ??= {}), m.kind);
    if (m.reason?.given) bump(reasons.given, m.reason.given);
    if (m.reason?.seller) bump(reasons.seller, m.reason.seller);
    if (m.reason?.buyer) bump(reasons.buyer, m.reason.buyer);
    if (m.kind === 'loan-return') continue;
    add(allIn, m.to.id);
    add(allOut, m.from?.id);
    if (m.kind === 'paid') {
      add(paidIn, m.to.id);
      add(paidOut, m.from?.id);
    }
    if ((m.kind === 'paid' || m.kind === 'loan') && m.from) {
      if (m.from.country !== m.to.country) crossCountry[m.kind]++;
      else {
        const matrix = m.kind === 'paid' ? flow : loanFlow;
        bump((matrix[m.to.country] ??= {}), `${m.from.tier}>${m.to.tier}`);
      }
    }
  }

  const perClub = Object.fromEntries(
    tiers.map((tier) => {
      const ids = input.clubs.filter((c) => c.tier === tier).map((c) => c.id);
      const read = (map: Map<string, number>) => distribution(ids.map((id) => map.get(id) ?? 0));
      return [
        tierKey(tier),
        {
          clubs: ids.length,
          paidIn: read(paidIn),
          paidOut: read(paidOut),
          allIn: read(allIn),
          allOut: read(allOut),
        },
      ];
    }),
  );

  const paidOutOf = new Set(
    input.moves
      .filter((m) => m.kind === 'paid' && m.from)
      .map((m) => `${m.from!.id}|${m.playerId}`),
  );
  const xi = Object.fromEntries(
    tiers.map((tier) => {
      const ids = new Set(input.clubs.filter((c) => c.tier === tier).map((c) => c.id));
      const lost = input.xiLost.filter((l) => ids.has(l.club));
      const byFee = lost.filter((l) => paidOutOf.has(`${l.club}|${l.player}`));
      const n = ids.size || 1;
      return [
        tierKey(tier),
        {
          clubs: ids.size,
          lost: lost.length,
          lostByFee: byFee.length,
          lostPerClub: lost.length / n,
          lostByFeePerClub: byFee.length / n,
        },
      ];
    }),
  );

  const movedUp = new Set<string>();
  for (const m of input.moves) {
    const home = input.topThree[m.playerId];
    if (
      (m.kind === 'paid' || m.kind === 'loan') &&
      home &&
      m.from?.id === home &&
      m.to.tier < m.from.tier
    )
      movedUp.add(m.playerId);
  }
  const trackedBy = new Map<number, { tracked: number; movedUp: number }>();
  for (const [player, home] of Object.entries(input.topThree)) {
    const tier = club.get(home)?.tier;
    if (tier === undefined) continue;
    const row = trackedBy.get(tier) ?? { tracked: 0, movedUp: 0 };
    row.tracked++;
    if (movedUp.has(player)) row.movedUp++;
    trackedBy.set(tier, row);
  }
  const tracked = [...trackedBy.values()].reduce((n, r) => n + r.tracked, 0);
  const topThreeUp = {
    tracked,
    movedUp: movedUp.size,
    share: tracked ? movedUp.size / tracked : 0,
    byTier: Object.fromEntries(
      [...trackedBy].map(([tier, r]) => [
        tierKey(tier),
        { ...r, share: r.tracked ? r.movedUp / r.tracked : 0 },
      ]),
    ),
  };

  const intakeTiers = [...new Set(input.intake.map((i) => i.tier))].sort((a, b) => a - b);
  const youth = Object.fromEntries(
    intakeTiers.map((tier) => {
      const rows = input.intake.filter((i) => i.tier === tier);
      return [
        tierKey(tier),
        { count: rows.length, meanPotential: mean(rows.map((r) => r.potential)) },
      ];
    }),
  );

  const tierRows = Object.fromEntries(
    tiers.map((tier) => {
      const clubs = input.clubs.filter((c) => c.tier === tier);
      const books = input.books.filter((b) => b.tier === tier);
      return [
        tierKey(tier),
        {
          clubs: clubs.length,
          strengthMean: mean(clubs.map((c) => c.strength)),
          strengthMax: clubs.length ? Math.max(...clubs.map((c) => c.strength)) : 0,
          academyMean: mean(clubs.map((c) => c.academy)),
          books: {
            clubs: books.length,
            wages: books.reduce((n, b) => n + b.wages, 0),
            income: books.reduce((n, b) => n + b.income, 0),
            cash: books.reduce((n, b) => n + b.cash, 0),
          },
        },
      ];
    }),
  );

  return {
    year: input.year,
    moves,
    byWindow,
    reasons,
    perClub,
    xi,
    flow,
    loanFlow,
    crossCountry,
    topThreeUp,
    contracts: { ...input.contracts },
    retirements: input.retirements,
    youth,
    tiers: tierRows,
    promoted: input.books.filter((b) => b.nextTier < b.tier).length,
    relegated: input.books.filter((b) => b.nextTier > b.tier).length,
  };
}
export type SeasonStats = ReturnType<typeof seasonStats>;

// ---------------------------------------------------------------------------------------------
// Merge

/** Every numeric leaf of a JSON value by dotted path. */
export function flattenNumbers(value: unknown, prefix = '', out: Record<string, number> = {}) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out[prefix] = value;
  } else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value))
      flattenNumbers(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

export interface Spread {
  n: number;
  mean: number;
  /** Sample standard deviation; 0 for one run. */
  sd: number;
  min: number;
  max: number;
}

export function spread(values: readonly number[]): Spread {
  const n = values.length;
  const m = mean(values);
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)) : 0;
  return { n, mean: m, sd, min: n ? Math.min(...values) : 0, max: n ? Math.max(...values) : 0 };
}

/**
 * Mean and spread of every numeric measure per season position over the runs' season lists. A
 * measure a run lacks (a flow cell nobody made) counts as 0 in it.
 */
export function mergeSeasons(runs: readonly (readonly object[])[]) {
  const length = Math.max(0, ...runs.map((r) => r.length));
  return Array.from({ length }, (_, index) => {
    const seasons = runs.flatMap((r) => (r[index] ? [flattenNumbers(r[index])] : []));
    const paths = [...new Set(seasons.flatMap((s) => Object.keys(s)))].sort();
    return {
      index,
      runs: seasons.length,
      measures: Object.fromEntries(
        paths.map((path) => [path, spread(seasons.map((s) => s[path] ?? 0))]),
      ),
    };
  });
}

export interface RunResult {
  seed: string;
  luck: number;
  start: string;
  /** Seasons lived before the measured ones; reported apart. */
  burnIn: SeasonStats[];
  seasons: SeasonStats[];
}

/** Merges whole runs: burn-in and measured seasons each by position. */
export function mergeRuns(
  runs: readonly { burnIn: readonly object[]; seasons: readonly object[] }[],
) {
  return {
    runs: runs.length,
    burnIn: mergeSeasons(runs.map((r) => r.burnIn)),
    seasons: mergeSeasons(runs.map((r) => r.seasons)),
  };
}
