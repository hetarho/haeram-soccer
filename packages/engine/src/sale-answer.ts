import { distressSaleFee, forcedSales } from './distress';
import { marketValueAt } from './market-prices';
/**
 * The selling club's answer to a bid (매각 판단, →CLUB-52): one model for every bid a club
 * receives, ours to a club nobody owns and another club's to us while sales are delegated. A bid at
 * or above the asking fee is accepted; below it the seller holds out for a reservation, the asking
 * fee times a share that its factors and one seeded spread set. Each factor is one registry entry,
 * so a later one (prestige, club history) is one more line and no caller changes.
 *
 * The model itself is pure: `saleAnswer` takes the context and a uniform draw, which the caller
 * reads from `random(\`${w.seed}:sale:${bidId}\`)` (→ARCH-5). `saleContext` reads one from a world.
 */
import type { SourceMessageId } from '../../contracts/src/messages';
import type { Club, Player, TransferStance, World } from '../../contracts/src/types';
import { currencyChange, npcWageBill, npcWageLimit } from './books';
import { CLUB_TAKEOVER } from './owner-config';
import { SAFETY_ROUNDS } from './delegation-info';
import { EXPENSE_CONFIG, operatingCosts, operatingExpensesAt } from './finance';
import { fixedCostRunway } from './investment';
import { activePlayers, overall } from './player-state';
import { compareIds, scaleBy } from './primitives';
import { seasonsLeft, staffMember } from './staff-info';
import { SALE_FACTOR_VALUES, SALE_SHARE } from './transfer-policy';
import { transferWindow } from './transfer-window';
import { seasonAfter } from './wartime';
import { isProspect, playerValue, saleBar, transferStance } from './transfers';
import { clubById, ownStarters, startingSquad, stature, tierLevel } from './world';
import { clubPlayer, worldMarketOffer } from './world-market';

/** One factor's line: what it adds and the message, with its named parameters, that names it. */
export interface FactorLine {
  /** The registry entry that wrote it. */
  factor: string;
  /** Added to the reservation share (sale) or to the log-odds (terms). */
  delta: number;
  message: SourceMessageId;
  params: Readonly<Record<string, string | number>>;
}
/** A registry entry: a small read of the context, a line when it moves the answer. */
export interface AnswerFactor<C> {
  id: string;
  read(context: C): FactorLine | undefined;
}

/** His place in the seller's XI: one of its three best starters, another starter or outside. */
export type SalePlace = 'core' | 'starter' | 'outside';
/** Everything the selling club's answer reads, in plain values (→CLUB-52). */
export interface SaleContext {
  /** The bid, in minor units of the money the asking fee is in. */
  fee: string;
  /** The asking fee A. */
  asking: string;
  /** The seller is our club. */
  ownSeller: boolean;
  /** Our asking bar, including the separate delegated floor adjustment. */
  saleBar?: { percent: number; reduction: number };
  /** Player value for forced sales; our normal reservation also reads its 80% floor. */
  value?: string;
  /** ECON-24 forced acceptance, separate from T971's reservation factors. */
  forcedSales?: boolean;
  place: SalePlace;
  /** The seller’s stable LEAGUE-10 stature, independent of current strength or reputation. */
  stature: number;
  /** Seasons left on his contract, this one included: 1 is its final season. */
  contractSeasons: number;
  age: number;
  /** A prospect (aged 22 or under, potential 8+ above ability); counts at a club nobody owns. */
  prospect: boolean;
  /** The seller's cash crisis or fixed-cost runway under 4 rounds (→ECON-41), with that runway. */
  cashCrisis: boolean;
  runway: number;
  /** The seller's actual distress stage, whoever owns it. */
  distress?: 1 | 2 | 3;
  /** A club nobody owns selling down its wage bill (→WORLD-17). */
  sellingDown: boolean;
  /** Our player's stance (→CLUB-22) and his unhappiness (→CLUB-27); open at other clubs. */
  stance: TransferStance;
  transferRequest: boolean;
  unhappy: boolean;
  /** Our 단장 when the bid is ours (→STAFF-20); `vacant` when the post is empty. */
  director?:
    { vacant: true } | { vacant: false; name: string; ability: number; negotiator: boolean };
  /** Days left in the open window, the deadline day 0; absent outside a window. */
  windowDaysLeft?: number;
  /** The bid's season: before 1995 the contract rows count half, for every seller (→CLUB-52). */
  year?: number;
  /** A seller nobody owns reads two more rows, whoever bids; absent when our club sells. */
  npc?: NpcSaleRows;
}
/** The rows a club nobody owns reads as the seller, ours or another club's bid alike (→CLUB-52). */
export interface NpcSaleRows {
  /** It was relegated at the last close and he is one of its starters. */
  relegatedStarter: boolean;
  /** He rates 5 or more above its division's level (→WORLD-15) and the buyer plays higher. */
  aboveDivision: boolean;
}

const V = SALE_FACTOR_VALUES;
const line = (
  factor: string,
  delta: number,
  message: SourceMessageId,
  params: Record<string, string | number> = {},
): FactorLine => ({ factor, delta, message, params });

/** CLUB-52's starting registry; the answer only sums it. */
export const SALE_FACTORS: readonly AnswerFactor<SaleContext>[] = [
  {
    id: 'place',
    read: (c) =>
      c.place === 'core'
        ? line('place', V.place.core, 'market.sale.place.core')
        : c.place === 'starter'
          ? line('place', V.place.starter, 'market.sale.place.starter')
          : line('place', V.place.outside, 'market.sale.place.outside'),
  },
  {
    id: 'contract',
    read: (c) => {
      // Before 1995 a move out of contract still carried a fee, so the rows count half.
      const era = c.year !== undefined && c.year < V.contractFullFrom ? V.contractEarlyShare : 1;
      return c.contractSeasons <= 1
        ? line('contract', V.contract.final * era, 'copy.transfers.53f9e38caf')
        : c.contractSeasons === 2
          ? line('contract', V.contract.next * era, 'market.sale.contract.next')
          : undefined;
    },
  },
  {
    id: 'age',
    read: (c) =>
      c.age >= V.oldAge
        ? line('age', V.age.old, 'market.sale.age', { age: c.age })
        : c.age >= V.veteranAge
          ? line('age', V.age.veteran, 'market.sale.age', { age: c.age })
          : undefined,
  },
  {
    id: 'prospect',
    read: (c) =>
      c.prospect && !c.ownSeller ? line('prospect', V.prospect, 'market.sale.prospect') : undefined,
  },
  {
    id: 'cash',
    read: (c) =>
      c.cashCrisis
        ? line('cash', V.cashCrisis, 'market.sale.cash', { rounds: c.runway })
        : undefined,
  },
  {
    id: 'distress',
    read: (c) =>
      c.distress
        ? line(
            'distress',
            c.distress >= 2 ? V.distress.forced : V.distress.warning,
            c.distress >= 2 ? 'market.sale.distress.forced' : 'market.sale.distress.warning',
          )
        : undefined,
  },
  {
    id: 'sellDown',
    read: (c) =>
      c.sellingDown && !c.ownSeller
        ? line('sellDown', V.sellingDown, 'market.sale.sellDown')
        : undefined,
  },
  {
    id: 'relegated',
    read: (c) =>
      c.npc?.relegatedStarter
        ? line('relegated', V.relegatedStarter, 'market.sale.relegated')
        : undefined,
  },
  {
    id: 'aboveDivision',
    read: (c) =>
      c.npc?.aboveDivision
        ? line('aboveDivision', V.aboveDivision, 'market.sale.aboveDivision')
        : undefined,
  },
  {
    id: 'stance',
    read: (c) =>
      !c.ownSeller
        ? undefined
        : c.stance === 'listed'
          ? line('stance', V.listed, 'market.sale.listed')
          : c.transferRequest
            ? line('stance', V.requestOrUnhappy, 'market.sale.request')
            : c.unhappy
              ? line('stance', V.requestOrUnhappy, 'market.sale.unhappy')
              : undefined,
  },
  {
    id: 'director',
    read: (c) => {
      const d = c.director;
      if (!d) return undefined;
      if (d.vacant) return line('director', V.vacant, 'market.sale.director.vacant');
      const delta =
        -(d.ability - V.directorNeutral) / V.directorScale + (d.negotiator ? V.negotiator : 0);
      if (delta === 0) return undefined;
      return d.negotiator
        ? line('director', delta, 'market.sale.director.negotiator', {
            name: d.name,
            ability: d.ability,
          })
        : line('director', delta, 'market.sale.director', { name: d.name, ability: d.ability });
    },
  },
  {
    id: 'deadline',
    read: (c) =>
      c.windowDaysLeft !== undefined && c.windowDaysLeft < V.deadlineDays
        ? line('deadline', V.deadline, 'market.sale.deadline', { days: c.windowDaysLeft })
        : undefined,
  },
  {
    id: 'stature',
    read: (c) => {
      const sizes = CLUB_TAKEOVER.facilities.stature;
      return c.stature >= sizes.giant.from
        ? line('stature', V.stature.giant, 'market.sale.stature.giant')
        : c.stature >= sizes.big.from
          ? line('stature', V.stature.big, 'market.sale.stature.big')
          : c.stature <= sizes.small.to
            ? line('stature', V.stature.small, 'market.sale.stature.small')
            : undefined;
    },
  },
];

/** The factors' lines and the share they set before the spread. */
export function saleShare(
  context: SaleContext,
  factors: readonly AnswerFactor<SaleContext>[] = SALE_FACTORS,
) {
  const lines = factors.flatMap((f) => {
    const read = f.read(context);
    return read ? [read] : [];
  });
  return { base: lines.reduce<number>((sum, l) => sum + l.delta, SALE_SHARE.base), lines };
}

/** Shares are carried in parts per billion so fees stay exact integers. */
const PPB = 1_000_000_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const shareOf = (base: number, draw: number) =>
  Math.min(SALE_SHARE.max, Math.max(SALE_SHARE.min, base + (2 * draw - 1) * SALE_SHARE.spread));
/** Our floor: 80% of value, rounded up; zero at other clubs. */
function ownFloor(context: SaleContext) {
  if (!context.ownSeller || !context.value) return 0n;
  return ceilDiv(BigInt(context.value) * BigInt(Math.round(SALE_SHARE.ownFloor * 100)), 100n);
}

/** How far below R a bid still draws a counter: 0.25 of the asking fee, in whole minor units. */
const counterReach = (asking: bigint) =>
  (asking * BigInt(Math.round(SALE_SHARE.counterReach * 100))) / 100n;

export type SaleAnswerKind = 'accept' | 'counter' | 'refuse';
export interface SaleAnswer {
  kind: SaleAnswerKind;
  /** Forced acceptance under ECON-24 rather than the normal reservation. */
  forced?: true;
  /** The counter's fee, R: never below the bid, never above the asking fee. */
  counter?: string;
  /** The reservation R and the share it was read at, the spread included. */
  reservation: string;
  share: number;
  /** The seeded spread the draw set, ±0.08; a factor never changes it. */
  spread: number;
  lines: FactorLine[];
}

/**
 * The seller's answer to `context.fee` for a uniform `draw` in [0, 1): accepted at or above the
 * asking fee or the reservation R, a counter at R for a bid at least R − 0.25 × A, else refused.
 */
export function saleAnswer(
  context: SaleContext,
  draw: number,
  factors: readonly AnswerFactor<SaleContext>[] = SALE_FACTORS,
): SaleAnswer {
  const { base, lines } = saleShare(context, factors),
    share = shareOf(base, draw),
    spread = (2 * draw - 1) * SALE_SHARE.spread,
    asking = BigInt(context.asking),
    fee = BigInt(context.fee);
  let reservation = ceilDiv(asking * BigInt(Math.round(share * Number(PPB))), PPB);
  const floor = ownFloor(context);
  if (reservation < floor) reservation = floor;
  if (reservation > asking) reservation = asking;
  const answer = { reservation: reservation.toString(), share, spread, lines };
  if (
    context.forcedSales &&
    context.value !== undefined &&
    fee >= distressSaleFee(BigInt(context.value))
  )
    return {
      kind: 'accept',
      ...answer,
      forced: true,
      reservation: distressSaleFee(BigInt(context.value)).toString(),
    };
  if (fee >= asking || fee >= reservation) return { kind: 'accept', ...answer };
  if (fee >= reservation - counterReach(asking))
    return { kind: 'counter', counter: reservation.toString(), ...answer };
  return { kind: 'refuse', ...answer };
}

/**
 * The exact chances, under the uniform draw, that the seller accepts `context.fee` and that it
 * counters, for the bid view (→CLUB-14). They read the same factors as `saleAnswer`.
 */
export function saleOutlook(
  context: SaleContext,
  factors: readonly AnswerFactor<SaleContext>[] = SALE_FACTORS,
) {
  const { base, lines } = saleShare(context, factors),
    asking = BigInt(context.asking),
    fee = BigInt(context.fee),
    floor = ownFloor(context),
    s = SALE_SHARE.spread;
  // P(R ≤ x) over the draw, read on the integers `saleAnswer` uses: R = max(floor, ⌈A × p / 10⁹⌉)
  // within A, p = round(share × 10⁹), so R ≤ x exactly when p ≤ ⌊x × 10⁹ / A⌋, that is when the
  // share, base plus the uniform spread clamped to 0.5–1, falls below that bound plus a half.
  const reservedAtMost = (x: bigint) => {
    if (x >= asking) return 1;
    if (floor > x) return 0;
    const bound = (Number((x * PPB) / asking) + 0.5) / Number(PPB);
    if (bound > SALE_SHARE.max) return 1;
    if (bound <= SALE_SHARE.min) return 0;
    return Math.min(1, Math.max(0, (bound - base + s) / (2 * s)));
  };
  if (
    context.forcedSales &&
    context.value !== undefined &&
    fee >= distressSaleFee(BigInt(context.value))
  )
    return { accept: 1, counter: 0, lines };
  const accept = reservedAtMost(fee);
  return { accept, counter: reservedAtMost(fee + counterReach(asking)) - accept, lines };
}

/** The bid a world context is read for: the player, the club selling him and the fee offered. */
export interface SaleBid {
  playerId: string;
  sellerId: string;
  fee: string;
  /** The asking fee the bidder faces; read from the market when absent at another club. */
  asking?: string;
}

/** The seller's XI and whether the player is one of its three best starters, a starter or outside. */
function placeIn(xi: readonly Player[], id: string): SalePlace {
  if (!xi.some((p) => p.id === id)) return 'outside';
  const core = [...xi]
    .sort((a, b) => overall(b) - overall(a) || compareIds(a.id, b.id))
    .slice(0, 3);
  return core.some((p) => p.id === id) ? 'core' : 'starter';
}

/**
 * A club nobody owns in a cash crisis (→ECON-41): its cash less debt, with this season's fees
 * received and paid, below zero or short of 4 rounds of this season's fixed costs — its players'
 * wages and its operating expenses (→ECON-30), all in this season's money. A close carries the books into the next season's money before the year turns.
 */
function npcCash(w: World, club: Club) {
  const books = club.books;
  if (!books) return { cashCrisis: false, runway: 999 };
  const last = books.seasons[0],
    liveYear = last?.year === w.year ? seasonAfter(w.year) : w.year,
    toNow = currencyChange(club.country, liveYear, w.year),
    live = (amount: string) => (toNow ? toNow(amount) : amount);
  // This season's fees settle into cash at the close; until then they sit beside it (→ECON-36).
  const balance =
    BigInt(live(books.cash)) -
    BigInt(live(books.debt)) +
    BigInt(live(books.transfersReceived ?? '0')) -
    BigInt(live(books.transfersPaid ?? '0'));
  if (balance < 0n) return { cashCrisis: true, runway: 0 };
  const runway = fixedCostRunway(
    balance.toString(),
    (npcWageBill(w, club) + npcOperatingExpenses(w, club)).toString(),
  );
  return { cashCrisis: runway < SAFETY_ROUNDS, runway };
}
/**
 * This season's operating expenses of a club nobody owns, as its books charge them (→ECON-30): the
 * division amount, or a share of last season's turnover in this season's money when larger, the
 * division amount after a relegation or with no closed season, as `books.ts` reads them.
 */
function npcOperatingExpenses(w: World, club: Club) {
  const floor = BigInt(operatingExpensesAt(club.country, w.year, club.tier)),
    last = club.books?.seasons[0];
  if (!last) return floor;
  const index = w.clubs.indexOf(club),
    tierBefore = w.history
      .find((h) => h.year === last.year)
      ?.standings.find((row) => row[0] === index)?.[1];
  if (tierBefore === undefined || tierBefore < club.tier) return floor;
  const toNow = currencyChange(club.country, last.year, w.year),
    turnover = toNow ? toNow(last.income) : last.income,
    share = BigInt(scaleBy(turnover, EXPENSE_CONFIG.share, 10000n));
  return share > floor ? share : floor;
}

/** Our 단장 as a bid's buyer reads him (→STAFF-20); absent staff in older saves are neutral. */
function buyingDirector(w: World): SaleContext['director'] {
  if (!w.staff) return { vacant: false, name: '', ability: 50, negotiator: false };
  const member = staffMember(w, 'director');
  return member
    ? {
        vacant: false,
        name: member.name,
        ability: member.ability,
        negotiator: member.trait === 'negotiator',
      }
    : { vacant: true };
}

/**
 * The context of a bid from the world as it stands: his place in the seller's XI, contract, age and
 * promise, the seller's money and stance, our 단장 when the bid is ours, and the window's days left.
 * Undefined when the seller or the player is not found.
 */
export function saleContext(w: World, bid: SaleBid): SaleContext | undefined {
  const seller = clubById(w, bid.sellerId);
  if (!seller) return undefined;
  const ownSeller = seller.id === w.playerClub;
  const player = ownSeller
    ? activePlayers(w).find((p) => p.id === bid.playerId)
    : clubPlayer(w, seller, bid.playerId);
  if (!player) return undefined;
  const window = transferWindow(w),
    prospect = isProspect(w, player),
    common = {
      fee: bid.fee,
      forcedSales: forcedSales(ownSeller ? w.distress : seller.books?.distress),
      distress: (ownSeller ? w.distress : seller.books?.distress)?.stage,
      stature: stature(w.seed, seller.id),
      place: placeIn(ownSeller ? ownStarters(w) : startingSquad(w, seller), player.id),
      contractSeasons: seasonsLeft(w, player.until),
      age: w.year - player.born,
      prospect,
      year: w.year,
      ...(window.open ? { windowDaysLeft: window.daysLeft } : {}),
    };
  if (ownSeller) {
    const value = playerValue(w, player),
      bar = saleBar(w, player),
      runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
    return {
      ...common,
      asking: bid.asking ?? ((BigInt(value) * BigInt(bar.percent)) / 100n).toString(),
      ownSeller,
      saleBar: bar,
      value,
      cashCrisis: runway < SAFETY_ROUNDS,
      runway,
      sellingDown: false,
      stance: transferStance(player),
      transferRequest: !!player.transferRequest,
      unhappy: !!player.unhappy,
    };
  }
  const asking =
    bid.asking ??
    worldMarketOffer(w, { world: w.id, kind: 'club', clubId: seller.id, playerId: player.id })?.fee;
  if (asking === undefined) return undefined;
  const limit = npcWageLimit(w, seller);
  return {
    ...common,
    asking,
    value: marketValueAt(seller.country, w.year, seller.tier, player),
    ownSeller,
    ...npcCash(w, seller),
    sellingDown: limit !== undefined && npcWageBill(w, seller) > limit,
    stance: 'open',
    transferRequest: false,
    unhappy: false,
    director: buyingDirector(w),
    // Our bid meets the seller's own circumstances as another club's would.
    npc: npcSellerRows(w, seller, player, common.place, clubById(w, w.playerClub)?.tier),
  };
}

/** A bid between clubs nobody owns (→WORLD-16): the seller, the buyer, the player and the fees. */
export interface NpcSaleBid {
  seller: Club;
  buyer: Club;
  player: Player;
  fee: string;
  asking: string;
  /** The seller is selling down its wage bill (→WORLD-17), as the settlement reads it. */
  sellingDown: boolean;
}

/** The tier a club played in at the last close, from that season's archived standings. */
function tierAtLastClose(w: World, club: Club) {
  const index = w.clubs.indexOf(club);
  return w.history.at(-1)?.standings.find((row) => row[0] === index)?.[1];
}
/**
 * The seller's own rows (→CLUB-52), whoever bids: relegated at the last close with him among its
 * starters, and he rates 5 or more above its division's level (→WORLD-15) with the buyer, of
 * `buyerTier`, playing higher.
 */
function npcSellerRows(
  w: World,
  seller: Club,
  player: Player,
  place: SalePlace,
  buyerTier: number | undefined,
): NpcSaleRows {
  const before = tierAtLastClose(w, seller);
  return {
    relegatedStarter: before !== undefined && before < seller.tier && place !== 'outside',
    aboveDivision:
      buyerTier !== undefined &&
      buyerTier < seller.tier &&
      overall(player) >= tierLevel(seller.tier) + V.aboveDivisionPoints,
  };
}

/**
 * A club nobody owns answering another one (→CLUB-52, WORLD-16): his place in its XI, his contract
 * (this season counted, 1 its final), age and promise, its money and sell-down, the two NPC rows
 * and the window's days left. No 단장 sits on either side.
 */
export function npcSaleContext(w: World, bid: NpcSaleBid): SaleContext {
  const { seller, buyer, player } = bid,
    window = transferWindow(w),
    place = placeIn(startingSquad(w, seller), player.id);
  return {
    fee: bid.fee,
    forcedSales: forcedSales(seller.books?.distress),
    distress: seller.books?.distress?.stage,
    value: marketValueAt(seller.country, w.year, seller.tier, player),
    asking: bid.asking,
    ownSeller: false,
    stature: stature(w.seed, seller.id),
    place,
    contractSeasons: Math.max(1, player.until - w.year + 1),
    age: w.year - player.born,
    prospect: isProspect(w, player),
    ...npcCash(w, seller),
    sellingDown: bid.sellingDown,
    stance: 'open',
    transferRequest: false,
    unhappy: false,
    year: w.year,
    ...(window.open ? { windowDaysLeft: window.daysLeft } : {}),
    npc: npcSellerRows(w, seller, player, place, buyer.tier),
  };
}
