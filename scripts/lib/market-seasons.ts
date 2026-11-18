/**
 * Pure parts of the market-season harness (scripts/market-seasons.ts): argument parsing, the
 * season aggregation over observed moves and facts, tunable overrides and the merge of runs. No
 * engine import, so each part is testable on synthetic moves. Output is machine data (JSON).
 */
import { toolMessage } from './tool-messages';

const USAGE =
  'market-seasons.ts --start fresh:<year>|lived:<year>|file:<path> [--burn-in N] [--seasons N] [--seeds 0..7] [--lucks K] [--jobs N] [--config file.json] --out file.json | --merge a.json b.json --out file.json';
/** A usage error: what was wrong, as a message, or the usage line itself. */
export const usageError = (detail?: string) =>
  new Error(detail ?? toolMessage('naturalFootball.usage', { command: USAGE }));

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
    if (!rest) throw usageError(toolMessage('marketSeasons.badStart', { start: text }));
    return { kind, path: rest };
  }
  const year = Number(rest);
  if ((kind !== 'fresh' && kind !== 'lived') || !Number.isInteger(year) || year < 1930)
    throw usageError(toolMessage('marketSeasons.badStart', { start: text }));
  if (kind === 'fresh' && burnIn < FRESH_MIN_BURN_IN)
    throw usageError(toolMessage('marketSeasons.freshBurnIn', { minimum: FRESH_MIN_BURN_IN }));
  return { kind, year };
}

/** `0..7`, `3`, `0,2,5` or a mix: the seed numbers, in order, without repeats. */
export function parseSeeds(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    const single = /^\d+$/.test(part);
    if (!range && !single) throw usageError(toolMessage('marketSeasons.badSeeds', { seeds: text }));
    const [from, to] = range ? [Number(range[1]), Number(range[2])] : [Number(part), Number(part)];
    if (to < from) throw usageError(toolMessage('marketSeasons.badSeeds', { seeds: text }));
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

/**
 * Jobs grouped by seed, the groups dealt round-robin over `parts` child processes (empty parts
 * dropped): every luck of one seed runs in one process, so a lived start is built once per seed.
 */
export function partitionBySeed(jobs: readonly RunJob[], parts: number): RunJob[][] {
  const seeds = [...new Set(jobs.map((j) => j.seed))];
  return partition(seeds, parts).map((group) => jobs.filter((j) => group.includes(j.seed)));
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
      if (!(key in target))
        throw usageError(toolMessage('marketSeasons.missingSetting', { setting: `${path}${key}` }));
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
    if (!target) throw usageError(toolMessage('marketSeasons.unknownTunable', { tunable: name }));
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
  costs: number;
  transfersReceived?: number;
  transfersPaid?: number;
  cash: number;
  debt: number;
  /** Final position within its own league group, captured before promotion/relegation. */
  rank?: number;
  groupSize?: number;
  /** Its division the next season (promotion and relegation applied). */
  nextTier: number;
}

/** Optional measurement hooks use facts only; missing hooks never imply zero events. */
export interface BidFact {
  from: ClubRef;
  to: ClubRef;
  playerId: string;
  outcome: 'seller-refused' | 'player-refused' | 'completed' | 'buyer-refused';
}
export type RenewalKind = 'offered' | 'accepted' | 'refused' | 'releasedUnoffered';
export interface RenewalFact {
  club: string;
  kind: RenewalKind;
}
export interface DistressFact {
  club: string;
  /** Entry, not continued occupancy of a stage. */
  stage?: 1 | 2 | 3;
  pointsDeducted?: number;
}
export interface AgeingFact {
  /** Age at the annual close, matching the engine's annual development read. */
  age: number;
  change: number;
}

export function tableThird(rank: number, size: number): 'top' | 'middle' | 'bottom' {
  return rank / size <= 1 / 3 ? 'top' : rank / size <= 2 / 3 ? 'middle' : 'bottom';
}

/** Ordinary median (the middle pair's mean for even samples), not nearest-rank p50. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Ratios are per club, then median; an undefined/zero denominator is an absent read. */
export function bookStats(books: readonly EndBook[]) {
  const ratios = (read: (b: EndBook) => number | undefined, denominator: (b: EndBook) => number) =>
    books.flatMap((b) => {
      const numerator = read(b),
        divisor = denominator(b);
      return numerator !== undefined && divisor > 0 ? [numerator / divisor] : [];
    });
  const income = (b: EndBook) => b.income;
  const fixedCosts = (b: EndBook) => b.wages + b.costs;
  const reads = {
    wagesToIncome: ratios((b) => b.wages, income),
    costsToIncome: ratios((b) => b.costs, income),
    operatingResultToIncome: ratios((b) => b.income - b.wages - b.costs, income),
    feesReceivedToIncome: ratios((b) => b.transfersReceived, income),
    netFeesToIncome: ratios(
      (b) =>
        b.transfersReceived === undefined || b.transfersPaid === undefined
          ? undefined
          : b.transfersReceived - b.transfersPaid,
      income,
    ),
    cashToIncome: ratios((b) => b.cash, income),
    debtToFixedCosts: ratios((b) => b.debt, fixedCosts),
  };
  return {
    clubs: books.length,
    median: Object.fromEntries(Object.entries(reads).map(([key, values]) => [key, median(values)])),
    samples: Object.fromEntries(Object.entries(reads).map(([key, values]) => [key, values.length])),
    operatingLossShare: books.length
      ? books.filter((b) => b.income - b.wages - b.costs < 0).length / books.length
      : null,
  };
}

export interface SeasonInput {
  year: number;
  transferValues?: {
    players: number;
    dearest: number;
    mean: number;
    record: number;
    dearestToRecord: number;
    publishedMean?: number;
    meanToPublishedFee?: number;
  };
  clubs: StartClub[];
  moves: MoveFact[];
  /** Season-start XI by club. */
  xiStart: Record<string, string[]>;
  /** Season-start XI players no longer with their club just before the close. */
  xiLost: { club: string; player: string }[];
  /** Each lower-division club's three best players at the season's start: player → club. */
  topThree: Record<string, string>;
  /** The three best players in each lower division when the season opens. */
  divisionTopThree: Record<string, string>;
  contracts: { releases: number; renewals: number; expiring: number };
  retirements: number;
  /** Players new to the world's squads at the close (youth), by the tier of the club they joined. */
  intake: { tier: number; potential: number }[];
  books: EndBook[];
  /** Undefined means the engine has no corresponding observer. */
  bids?: BidFact[];
  renewalAnswers?: RenewalFact[];
  distress?: DistressFact[];
  ageing?: AgeingFact[];
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

  const upwardMoves = input.moves.filter((m) => {
    const home = input.topThree[m.playerId];
    return (
      (m.kind === 'paid' || m.kind === 'loan') &&
      !!home &&
      m.from?.id === home &&
      m.to.tier < m.from.tier
    );
  });
  const movedUp = new Set(upwardMoves.map((m) => m.playerId));
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

  const countries = [...new Set(input.clubs.map((c) => c.country))].sort();
  const books = Object.fromEntries(
    countries.map((country) => {
      const rows = input.books.filter((b) => b.country === country);
      return [
        country,
        {
          byTier: Object.fromEntries(
            tiers
              .filter((tier) => input.clubs.some((c) => c.country === country && c.tier === tier))
              .map((tier) => [tierKey(tier), bookStats(rows.filter((b) => b.tier === tier))]),
          ),
          topFlightThirds: Object.fromEntries(
            (['top', 'middle', 'bottom'] as const).map((third) => [
              third,
              bookStats(
                rows.filter(
                  (b) =>
                    b.tier === 0 &&
                    b.rank !== undefined &&
                    b.groupSize !== undefined &&
                    tableThird(b.rank, b.groupSize) === third,
                ),
              ),
            ]),
          ),
        },
      ];
    }),
  );
  const upwardFunnel = Object.fromEntries(
    countries.map((country) => [
      country,
      Object.fromEntries(
        tiers
          .filter(
            (tier) => tier > 0 && input.clubs.some((c) => c.country === country && c.tier === tier),
          )
          .map((tier) => {
            const homes = new Set(
              input.clubs.filter((c) => c.country === country && c.tier === tier).map((c) => c.id),
            );
            const tracked = Object.values(input.divisionTopThree).filter((home) =>
              homes.has(home),
            ).length;
            const bids = input.bids?.filter(
              (b) =>
                homes.has(b.from.id) &&
                input.divisionTopThree[b.playerId] === b.from.id &&
                b.to.tier < b.from.tier,
            );
            const completed = upwardMoves.filter(
              (m) => input.divisionTopThree[m.playerId] === m.from!.id && homes.has(m.from!.id),
            );
            return [
              tierKey(tier),
              {
                tracked,
                status: bids ? 'observed' : 'absent',
                bids: bids?.length ?? null,
                sellerRefused: bids
                  ? bids.filter((b) => b.outcome === 'seller-refused').length
                  : null,
                playerRefused: bids
                  ? bids.filter((b) => b.outcome === 'player-refused').length
                  : null,
                buyerRefused: bids
                  ? bids.filter((b) => b.outcome === 'buyer-refused').length
                  : null,
                completed: completed.length,
                shareMovedUp: tracked
                  ? new Set(completed.map((m) => m.playerId)).size / tracked
                  : null,
              },
            ];
          }),
      ),
    ]),
  );
  const renewalAnswers = input.renewalAnswers;
  const renewals = {
    status: renewalAnswers ? 'observed' : 'absent',
    ...Object.fromEntries(
      (['offered', 'accepted', 'refused', 'releasedUnoffered'] as const).map((kind) => [
        kind,
        renewalAnswers
          ? renewalAnswers.filter((r) => club.has(r.club) && r.kind === kind).length
          : null,
      ]),
    ),
  };
  const distress = {
    status: input.distress ? 'observed' : 'absent',
    byCountry: Object.fromEntries(
      countries.map((country) => {
        const facts = input.distress?.filter((f) => club.get(f.club)?.country === country);
        return [
          country,
          {
            entries: Object.fromEntries(
              [1, 2, 3].map((stage) => [
                `stage${stage}`,
                facts
                  ? new Set(facts.filter((f) => f.stage === stage).map((f) => f.club)).size
                  : null,
              ]),
            ),
            pointsDeducted: facts
              ? facts.reduce((sum, f) => sum + (f.pointsDeducted ?? 0), 0)
              : null,
          },
        ];
      }),
    ),
  };
  const ageing = Object.fromEntries(
    Array.from({ length: 15 }, (_, index) => {
      const age = index + 24;
      const players = (input.ageing ?? []).filter((p) => p.age === age);
      return [
        age,
        {
          players: players.length,
          declinedShare: players.length
            ? players.filter((p) => p.change < 0).length / players.length
            : null,
          meanOvrChange: players.length ? mean(players.map((p) => p.change)) : null,
        },
      ];
    }),
  );

  return {
    year: input.year,
    ...(input.transferValues ? { transferValues: input.transferValues } : {}),
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
    books,
    upwardFunnel,
    renewals,
    ageing,
    distress,
    promoted: input.books.filter((b) => b.nextTier < b.tier).length,
    relegated: input.books.filter((b) => b.nextTier > b.tier).length,
  };
}
export type SeasonStats = ReturnType<typeof seasonStats>;

// ---------------------------------------------------------------------------------------------
// Merge

/** Every numeric leaf of a JSON value by dotted path. */
export function flattenNumbers(value: unknown, prefix = '', out: Record<string, number> = {}) {
  for (const [key, measure] of Object.entries(flattenMeasures(value, prefix)))
    if (typeof measure === 'number') out[key] = measure;
  return out;
}

/** Nulls distinguish an absent observation from an observed zero in new calibration reads. */
function flattenMeasures(value: unknown, prefix = '', out: Record<string, number | null> = {}) {
  if (value === null || (typeof value === 'number' && Number.isFinite(value))) out[prefix] = value;
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value))
      flattenMeasures(child, prefix ? `${prefix}.${key}` : key, out);
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
 * Mean and spread of every numeric measure per season position over the runs' season lists.
 * Sparse legacy flow cells count as zero. Nullable calibration reads and reads absent from old
 * output versions contribute no sample, preserving the difference between absent and zero.
 */
export function mergeSeasons(runs: readonly (readonly object[])[]) {
  const length = Math.max(0, ...runs.map((r) => r.length));
  return Array.from({ length }, (_, index) => {
    const seasons = runs.flatMap((r) => (r[index] ? [flattenMeasures(r[index])] : []));
    const paths = [...new Set(seasons.flatMap((s) => Object.keys(s)))].sort();
    return {
      index,
      runs: seasons.length,
      measures: Object.fromEntries(
        paths.map((path) => {
          const nullable = /^(books|upwardFunnel|renewals|ageing|distress)\./.test(path);
          const values = seasons.flatMap((s) => {
            const value = s[path];
            return typeof value === 'number' ? [value] : value === null || nullable ? [] : [0];
          });
          return [
            path,
            values.length ? spread(values) : { n: 0, mean: null, sd: null, min: null, max: null },
          ];
        }),
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
