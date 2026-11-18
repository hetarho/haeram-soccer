import { distressSalePlan, forcedSales } from './distress';
import { npcDebt, npcFixedCosts } from './books';
import { message as sourceMessage } from '../../contracts/src/messages';
import { addEvent } from './events';
import { playerRecord } from './player-records';
/** Settled, need-led business between persisted clubs (→WORLD-11/16/17). */
import type { Club, Line, Player, PlayerMove, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { fromPounds, inPounds } from './club-value';
import {
  currencyChange,
  npcCanPay,
  npcWageBill,
  npcWageBudget,
  npcWageLimit,
  recordNpcTransferFee,
} from './books';
import { npcContractTerm } from './free-agents';
import { MARKET_CONFIG, marketValueAt, marketWageAt } from './market-prices';
import { movePerson, restoreLoanStint } from './npc-continuity';
import { CLUB_LEVELS, moveSquadPlayer } from './persisted-squads';
import { TRAINING_GROUND } from './facility-model';
import { clubManager } from './managerMarket';
import { departmentMultiplier } from './staff';
import { expectedOvr, type ExpectedDevelopmentLevels } from './training';
import { formationOf, slotOvr } from './player-state';
import { ageingCurve, FORMATIONS, LINE_MINIMUM, lineOf, mainOvr, type Slot } from './player';
import { compareIds, random, ratio } from './primitives';
import { clubRegistration, registrationExempt } from './registration';
import { SQUAD_MINIMUM } from './squad-size';
import {
  clubById,
  clubPlayers,
  joinClub,
  clubStyle,
  NPC_SQUAD,
  refillPlace,
  startingSquad,
  stature,
} from './world';
import { npcSaleContext, saleAnswer } from './sale-answer';
import { npcTermsContext, termsAnswer } from './personal-terms';
import { npcMarketCaps, SALE_FACTOR_VALUES } from './transfer-policy';
import { transferWindowDays } from './transfer-window';

/**
 * The pull market's constants (→WORLD-16), starting values tuned by measurement (T950): settlement
 * days as fractions of each window, the upgrade and blocked margins, the loan age, the squad floor a
 * sale keeps and the age a regular's wage is read at; then how buyers pick and bid.
 */
export const NPC_MARKET = {
  days: [0, 0.5, 1],
  upgrade: 4,
  blocked: 4,
  loanAge: 23,
  minimum: 18,
  termAge: 27,
  /** A young target is valued for the higher of current gain and this mean-path horizon. */
  prospectAge: 23,
  prospectSeasons: 2,
  /** Targets a buyer bids for per need on one settlement day, by slot gain. */
  targetsPerNeed: 2,
  /** A bid's share of the asking fee, drawn per bid within this range. */
  bidShare: { min: 0.5, max: 1 },
  /** A buyer whose funded envelope holds this many times the fee bids the asking fee itself. */
  richMultiple: 3,
  /** The chance a top-flight buyer also searches the other countries' top flights that day. */
  abroad: 0.15,
  /** How far a player's rating at a slot can stand above his main OVR, bounding the search. */
  searchSlack: 6,
  /** Affordable targets a need keeps per targetsPerNeed, so a bid failing on its drawn fee has a next. */
  searchSpare: 2,
  /**
   * The value rule's share of a slot target's score (→WORLD-16): 0 ranks by slot gain alone, 1 by
   * slot gain for what he would cost against what a regular's share of the budget buys.
   */
  valueWeight: 0.5,
  /** Seasons of his wage a target's cost counts, beside the fee. */
  valueYears: 3,
  /** The seasons a club's cash above debt is spread over in its season wage budget. */
  cashRunway: 3,
};

export function npcMarketDays(year: number) {
  const d = transferWindowDays(year);
  return [
    [d.summerOpen, d.summerClose],
    [d.winterOpen, d.winterClose],
  ].map(([open, close]) =>
    NPC_MARKET.days.map((part) => open! + Math.round((close! - open!) * part)),
  );
}

type Need = { line: Line; slot?: Slot; best: number; rank: number };
/** Why a club offers a player before anyone asks (→WORLD-16); a listed player comes first on ties. */
type ListingReason = 'forced-sale' | 'sell-down' | 'surplus' | 'blocked' | 'final-season';
type Listing = {
  club: Club;
  player: Player;
  loan: boolean;
  reason: ListingReason;
};
const lines = Object.keys(LINE_MINIMUM) as Line[];
const compareMoney = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);
type ClubFacts = {
  registration: ReturnType<typeof clubRegistration>;
  limit: bigint | undefined;
  bill: bigint;
};
type Settlement = {
  clubs: Map<string, ClubFacts>;
  returns: Map<string, number>;
  ratings: SettlementRatings;
};

/** Each formation slot object's place in a rating row, by identity; main OVR takes the last place. */
const SLOT_PLACES = new Map<Slot, number>();
for (const formation of Object.values(FORMATIONS))
  for (const slot of formation.slots)
    if (!SLOT_PLACES.has(slot)) SLOT_PLACES.set(slot, SLOT_PLACES.size);
const MAIN_PLACE = SLOT_PLACES.size,
  ROW = MAIN_PLACE + 1;

/**
 * One atomic settlement's ratings; none outlive it. Each player has a row of one place per formation
 * slot object and one for main OVR (NaN until read); a slot outside the formations keeps a map.
 */
export class SettlementRatings {
  private rows = new Map<Player, number>();
  private values: Float64Array;
  private used = 0;
  private others = new Map<Player, Map<Slot, number>>();
  private lastSlot: Slot | undefined;
  private lastPlace = MAIN_PLACE;

  constructor(players = 64) {
    this.values = new Float64Array(ROW * Math.max(1, players)).fill(NaN);
  }

  /** A missing slot means main-position OVR. */
  of(p: Player, slot?: Slot): number {
    let place = MAIN_PLACE;
    if (slot) {
      if (slot === this.lastSlot) place = this.lastPlace;
      else {
        const known = SLOT_PLACES.get(slot);
        if (known === undefined) return this.other(p, slot);
        this.lastSlot = slot;
        this.lastPlace = place = known;
      }
    }
    let row = this.rows.get(p);
    if (row === undefined) {
      if (this.used === this.values.length) {
        const values = new Float64Array(this.values.length * 2).fill(NaN);
        values.set(this.values);
        this.values = values;
      }
      this.rows.set(p, (row = this.used));
      this.used += ROW;
    }
    const cached = this.values[row + place]!;
    // NaN marks an unread place; a NaN rating is simply read again.
    if (cached === cached) return cached;
    const value = slot ? slotOvr(p, slot) : mainOvr(p);
    this.values[row + place] = value;
    return value;
  }

  /** A moved player's ratings are read afresh. */
  forget(p: Player) {
    this.rows.delete(p);
    this.others.delete(p);
  }

  private other(p: Player, slot: Slot) {
    let scores = this.others.get(p);
    const cached = scores?.get(slot);
    if (cached !== undefined) return cached;
    const value = slotOvr(p, slot);
    if (!scores) this.others.set(p, (scores = new Map()));
    scores.set(slot, value);
    return value;
  }
}

/** A missing slot means main-position OVR. No ratings outlive this atomic settlement. */
const rating = (p: Player, settlement?: Settlement, slot?: Slot) =>
  settlement ? settlement.ratings.of(p, slot) : slot ? slotOvr(p, slot) : mainOvr(p);

function clubFacts(w: World, club: Club, settlement?: Settlement): ClubFacts {
  const cached = settlement?.clubs.get(club.id);
  if (cached) return cached;
  const facts = {
    registration: clubRegistration(club, w.year, w.squads?.[club.id] ?? []),
    limit: npcWageLimit(w, club),
    bill: npcWageBill(w, club),
  };
  settlement?.clubs.set(club.id, facts);
  return facts;
}

function reservedReturns(w: World, club: string, settlement?: Settlement) {
  if (settlement) return settlement.returns.get(club) ?? 0;
  let count = 0;
  for (const record of Object.values(w.playerRecords ?? {}))
    if (record.loan?.club === club) count++;
  return count;
}
const convertFee = (w: World, from: Club, to: Club, fee: string) =>
  fromPounds(to.country, w.year, inPounds(from.country, w.year, fee));

/**
 * The level an ordinary place can carry, on the same wage curve as an actual signing: a regular's
 * share of the season wage budget (→WORLD-16), not the whole funded envelope, so cash a club could
 * spend once does not read as a squad of internationals it could pay every season.
 */
export function affordableLevel(w: World, c: Club, players: Player[]) {
  const budget = npcWageBudget(w, c, NPC_MARKET.cashRunway);
  if (budget === undefined || !players.length) return c.strength;
  return levelWithin(w, c, players[0]!, budget / BigInt(NPC_SQUAD.size));
}
/**
 * A slot target's score by the value rule (→WORLD-16): his slot gain, blended by
 * `NPC_MARKET.valueWeight` with that gain for what he would cost (the asking fee and
 * `valueYears` of his wage) against `reference`, what a regular's share of the buyer's season wage
 * budget buys over those years. A target costing exactly the reference scores his gain.
 */
export function npcValueScore(gain: number, cost: bigint, reference: bigint) {
  const weight = NPC_MARKET.valueWeight;
  if (weight <= 0 || cost <= 0n || reference <= 0n) return gain;
  return gain * (1 - weight + (weight * Number(reference)) / Number(cost));
}
/** The highest level a regular's market wage at the club fits within `budget`. */
function levelWithin(w: World, c: Club, sample: Player, budget: bigint) {
  return levelAtAge(w, c, sample, budget, NPC_MARKET.termAge);
}
/** The ages a player's market wage is lowest at (→CLUB-25: less before 21 and after 30). */
const CHEAPEST_AGES = [14, 41];
/**
 * The highest OVR any player's market wage at the club, at his cheapest age and with no promise,
 * fits within `budget`: nobody rated above it is affordable, whatever his age.
 */
function ceilingWithin(w: World, c: Club, sample: Player, budget: bigint) {
  return Math.max(...CHEAPEST_AGES.map((age) => levelAtAge(w, c, sample, budget, age)));
}
function levelAtAge(w: World, c: Club, sample: Player, budget: bigint, age: number) {
  let low = 15,
    high = 99;
  const regular = { ...sample, born: w.year - age, potential: 0 };
  if (BigInt(marketWageAt(c.country, w.year, c.tier, regular, low)) > budget) return low - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (BigInt(marketWageAt(c.country, w.year, c.tier, regular, mid)) <= budget) low = mid;
    else high = mid - 1;
  }
  return low;
}

function needs(w: World, c: Club, settlement?: Settlement): Need[] {
  const players = w.squads?.[c.id] ?? [];
  const result: Need[] = [];
  for (const line of lines) {
    const count = players.filter((p) => lineOf(p.position) === line).length;
    if (count < LINE_MINIMUM[line])
      result.push({ line, best: -1, rank: count - LINE_MINIMUM[line] });
  }
  if (players.length < NPC_SQUAD.size) {
    const line = lineOf(refillPlace(clubStyle(c), players));
    if (!result.some((n) => n.line === line)) result.push({ line, best: -1, rank: 0 });
  }
  const level = affordableLevel(w, c, players);
  for (const slot of formationOf(clubStyle(c))) {
    const best = Math.max(0, ...players.map((p) => rating(p, settlement, slot)));
    if (best <= level - NPC_MARKET.upgrade)
      result.push({ line: lineOf(slot.position), slot, best, rank: 1 + best - level });
  }
  // Missing lines first, then the weakest slot relative to the affordable level.
  return result.sort((a, b) => Number(!!a.slot) - Number(!!b.slot) || a.rank - b.rank);
}

const fills = (p: Player, need: Need, settlement?: Settlement) =>
  lineOf(p.position) === need.line &&
  (!need.slot || rating(p, settlement, need.slot) >= need.best + NPC_MARKET.upgrade);

/** One conservative departure gate, also used for the highest-paid sell-down. */
export function npcCanSell(w: World, c: Club, p: Player) {
  const players = w.squads?.[c.id] ?? [];
  const line = lineOf(p.position);
  return (
    !p.loanUntil &&
    p.retiring === undefined &&
    players.length > Math.max(SQUAD_MINIMUM, NPC_MARKET.minimum) &&
    players.filter((q) => lineOf(q.position) === line).length > LINE_MINIMUM[line]
  );
}

function canRegister(w: World, c: Club, p: Player, loan: boolean, settlement?: Settlement) {
  const state = settlement
    ? clubFacts(w, c, settlement).registration
    : clubRegistration(c, w.year, w.squads?.[c.id] ?? []);
  const returning = reservedReturns(w, c.id, settlement);
  const incoming = {
    ...p,
    graduate: undefined,
    joined: w.year,
    loanUntil: loan ? w.year + 1 : undefined,
  };
  return (
    state.total + returning < state.ceiling &&
    (registrationExempt(state.rule, w.year, incoming) || state.counted + returning < state.allowed)
  );
}

/** Shared by the NPC market and incoming offers for our players; quotes use the real seller. */
export function npcOffer(
  w: World,
  buyer: Club,
  p: Player,
  seller: Club,
  fee: string,
  loan = false,
  wanted = needs(w, buyer),
  settlement?: Settlement,
) {
  if (
    forcedSales(buyer.books?.distress) ||
    !/^\d{1,80}$/.test(fee) ||
    buyer.id === w.playerClub ||
    buyer.representative ||
    !buyer.books ||
    !w.squads?.[buyer.id] ||
    buyer.id === seller.id ||
    !wanted.some((n) => fills(p, n, settlement)) ||
    !canRegister(w, buyer, p, loan, settlement)
  )
    return undefined;
  const facts = clubFacts(w, buyer, settlement);
  if (facts.limit !== undefined && facts.bill > facts.limit) return undefined;
  const wage = marketWageAt(buyer.country, w.year, buyer.tier, p);
  const paid = convertFee(w, seller, buyer, fee);
  if (!npcCanPay(w, buyer, wage, undefined, w.year, facts, paid)) return undefined;
  return { club: buyer, wage, paid, pounds: BigInt(inPounds(buyer.country, w.year, wage)) };
}

/**
 * Buyer facts on which `npcOffer` refuses every bid, each before its wage-decision observer: no
 * books, a full registration ceiling or a wage bill over the limit. Only a settled move changes them.
 */
function refusesEveryBid(w: World, buyer: Club, settlement: Settlement) {
  if (!buyer.books || forcedSales(buyer.books.distress)) return true;
  const { registration, limit, bill } = clubFacts(w, buyer, settlement);
  return (
    registration.total + reservedReturns(w, buyer.id, settlement) >= registration.ceiling ||
    (limit !== undefined && bill > limit)
  );
}

/**
 * Why a move happened (→WORLD-16), reported to measurement only and never stored: a pull bid for an
 * unlisted player, one for a listed player under its listing's reason (`listed-down` when a lower
 * division's club pays a fee for a higher division's listed player), a loan, a loan's return, a
 * free agent's signing, or another club's accepted offer for our player.
 */
export type MoveReason =
  'pull' | ListingReason | 'listed-down' | 'loan' | 'loan-return' | 'free-signing' | 'offer';
/** Observation only for measurement; no observer changes settlement inputs or stores the reason. */
export const PLAYER_MOVE_FLOW: {
  observe?: (w: World, id: string, move: PlayerMove, reason: MoveReason) => void;
} = {};

type BidRefusal = 'seller-refused' | 'player-refused' | 'buyer-refused';
type BidClub = Pick<Club, 'id' | 'country' | 'tier'>;

/** A counted bid's outcome. Candidate previews and unsubmitted offers do not emit. */
export const NPC_BID_FLOW: {
  observe?: (bid: {
    from: BidClub;
    to: BidClub;
    playerId: string;
    outcome: BidRefusal | 'completed';
  }) => void;
} = {};

let pendingReason: MoveReason | undefined;
/** Runs `act` with `reason` given to every move it records without one of its own. */
export function withMoveReason<T>(reason: MoveReason, act: () => T): T {
  const before = pendingReason;
  pendingReason = reason;
  try {
    return act();
  } finally {
    pendingReason = before;
  }
}
/** A move's reason when its caller names none: read from the move and his loan. */
function readReason(w: World, id: string, move: PlayerMove): MoveReason {
  if (move.loan) return 'loan';
  if (w.playerRecords?.[id]?.loan?.club === move.to) return 'loan-return';
  return move.fee === '0' ? 'free-signing' : 'offer';
}
export function recordPlayerMove(w: World, id: string, move: PlayerMove, reason?: MoveReason) {
  if (PLAYER_MOVE_FLOW.observe)
    PLAYER_MOVE_FLOW.observe(w, id, move, reason ?? pendingReason ?? readReason(w, id, move));
  const record = playerRecord(w, id);
  if (record.loan?.club === move.to && !move.loan) delete record.loan;
  record.moves.push(move);
  return record;
}

/** A settled sale: the seller, the player, whether it is a loan, and why it happened. */
type Sale = { club: Club; player: Player; loan: boolean; reason: MoveReason };
function settleMove(
  w: World,
  sale: Sale,
  offer: NonNullable<ReturnType<typeof npcOffer>>,
  fee: string,
) {
  const { player: p, club: seller, loan } = sale;
  const record = recordPlayerMove(
    w,
    p.id,
    {
      year: w.year,
      day: currentDay(w),
      from: seller.id,
      to: offer.club.id,
      fee,
      ...(loan ? { loan: true } : {}),
    },
    sale.reason,
  );
  if (loan) {
    record.loan = {
      club: seller.id,
      until: w.year + 1,
      wage: p.wage,
      contractUntil: p.until,
      year: w.year,
    };
    if (p.graduate) record.loan.graduate = true;
    if (p.joined !== undefined) record.loan.joined = p.joined;
    p.loanUntil = w.year + 1;
  } else {
    p.until = w.year + npcContractTerm(w.year - p.born) - 1;
  }
  p.wage = offer.wage;
  joinClub(p, seller.country === offer.club.country ? 'domestic' : 'abroad', w.year);
  delete p.clauses;
  recordNpcTransferFee(w, seller, fee, true);
  recordNpcTransferFee(w, offer.club, offer.paid, false);
  if (w.people?.[p.id]) {
    movePerson(w, p, offer.club.id, false, p.loanUntil, seller.id);
    const job = w.people[p.id]!.employment.find((j) => j.role === 'player' && !j.to);
    if (job) job.contractUntil = { year: p.loanUntil ?? p.until, day: 365 };
  } else moveSquadPlayer(w, p, offer.club.id, seller.id);
}

/** The close returns the single live player before either side renews contracts. */
export function returnNpcLoans(w: World) {
  const held = new Map<string, { club: Club; player: Player }>();
  for (const c of w.clubs) {
    const players =
      c.id === w.playerClub
        ? w.players.filter((p) => p.status === 'active')
        : (w.squads?.[c.id] ?? []);
    for (const player of players) held.set(player.id, { club: c, player });
  }
  for (const [id, record] of Object.entries(w.playerRecords ?? {})) {
    const loan = record.loan;
    if (!loan || loan.until > w.year + 1) continue;
    const current = held.get(id),
      borrower = current?.club;
    const parent = clubById(w, loan.club);
    const p = current?.player;
    if (p && parent) {
      recordPlayerMove(
        w,
        id,
        { year: w.year, day: currentDay(w), from: borrower!.id, to: parent.id, fee: '0' },
        'loan-return',
      );
      delete p.loanUntil;
      p.wage = currencyChange(parent.country, loan.year, w.year)?.(loan.wage) ?? loan.wage;
      p.until = loan.contractUntil;
      // The borrower keeps its own history; only the returning copy resumes the parent's stint.
      const returning = borrower?.id === w.playerClub ? structuredClone(p) : p;
      restoreLoanStint(w, returning, parent.id, loan);
      if (w.people?.[id]) {
        movePerson(w, returning, parent.id, borrower?.id === w.playerClub, undefined, borrower?.id);
        delete w.people[id]!.loan;
      } else moveSquadPlayer(w, returning, parent.id, borrower?.id);
      if (borrower!.id === w.playerClub)
        addEvent(
          w,
          'loan-return',
          sourceMessage('copy.careers.a1549f3110', { p0: p.name }),
          sourceMessage('copy.season.f3d7a85a92'),
        );
    }
    delete record.loan;
  }
}

/** A sell-down candidate's facts, in the seller's money (→WORLD-16). */
export interface SellDownRow {
  id: string;
  value: bigint;
  wage: bigint;
  age: number;
  finalSeason: boolean;
}
/**
 * Whom a club over its funded envelope can best spare first (→WORLD-16): the lowest value for his
 * wage, then aged 30 or over, then in his final contract season, then the highest-paid.
 */
export function compareSellDown(a: SellDownRow, b: SellDownRow) {
  // Value per wage ascending, compared exactly; an unpaid player costs nothing to keep and goes last.
  if (a.wage === 0n || b.wage === 0n) {
    if (a.wage !== b.wage) return a.wage === 0n ? 1 : -1;
  } else {
    const left = a.value * b.wage,
      right = b.value * a.wage;
    if (left !== right) return left < right ? -1 : 1;
  }
  const veteran = SALE_FACTOR_VALUES.veteranAge;
  return (
    Number(b.age >= veteran) - Number(a.age >= veteran) ||
    Number(b.finalSeason) - Number(a.finalSeason) ||
    compareMoney(a.wage, b.wage) ||
    compareIds(a.id, b.id)
  );
}

/** Players a club offers before anyone asks, by id: its sell-down, surplus, blocked and expiring. */
function listings(w: World, clubs: Club[], settlement: Settlement) {
  const listed = new Map<string, Listing>();
  for (const c of clubs) {
    const players = w.squads![c.id]!;
    const { limit, bill: wages } = clubFacts(w, c, settlement);
    let bill = wages;
    const sellDown = limit !== undefined && bill > limit;
    const row = (p: Player): SellDownRow => ({
      id: p.id,
      value: BigInt(marketValueAt(c.country, w.year, c.tier, p)),
      wage: BigInt(p.wage),
      age: w.year - p.born,
      finalSeason: p.until <= w.year,
    });
    const forced = forcedSales(c.books?.distress)
      ? distressSalePlan(
          players,
          npcDebt(w, c),
          npcFixedCosts(w, c),
          (p) => row(p).value,
          (remaining, p) =>
            npcCanSell(w, c, p) &&
            remaining.length > Math.max(SQUAD_MINIMUM, NPC_MARKET.minimum) &&
            remaining.filter((q) => lineOf(q.position) === lineOf(p.position)).length >
              LINE_MINIMUM[lineOf(p.position)],
        )
      : [];
    const forcedIds = new Set(forced.map((p) => p.id));
    const ordered = sellDown
      ? players
          .map((p) => ({ p, row: row(p) }))
          .sort((a, b) => compareSellDown(a.row, b.row))
          .map(({ p }) => p)
      : [...players].sort(
          (a, b) => rating(a, settlement) - rating(b, settlement) || compareIds(a.id, b.id),
        );
    const ranked = forced.length
      ? [...forced, ...ordered.filter((p) => !forcedIds.has(p.id))]
      : ordered;
    const remaining = [...players];
    let surplus = Math.max(0, players.length - NPC_SQUAD.size);
    for (const p of ranked) {
      if (!npcCanSell(w, c, p)) continue;
      const line = lineOf(p.position);
      if (
        sellDown &&
        (remaining.length <= Math.max(SQUAD_MINIMUM, NPC_MARKET.minimum) ||
          remaining.filter((q) => lineOf(q.position) === line).length <= LINE_MINIMUM[line])
      )
        continue;
      const blocked =
        players.filter(
          (q) =>
            lineOf(q.position) === line &&
            rating(q, settlement) >= rating(p, settlement) + NPC_MARKET.blocked,
        ).length >= LINE_MINIMUM[line];
      if (
        !forcedIds.has(p.id) &&
        (sellDown ? bill <= limit! : !(surplus > 0 || blocked || p.until <= w.year))
      )
        continue;
      listed.set(p.id, {
        club: c,
        player: p,
        loan:
          !forcedIds.has(p.id) &&
          !sellDown &&
          (blocked || surplus > 0) &&
          w.year - p.born <= NPC_MARKET.loanAge,
        reason: forcedIds.has(p.id)
          ? 'forced-sale'
          : sellDown
            ? 'sell-down'
            : blocked
              ? 'blocked'
              : surplus > 0
                ? 'surplus'
                : 'final-season',
      });
      if (sellDown || forcedIds.has(p.id)) {
        remaining.splice(remaining.indexOf(p), 1);
        bill -= BigInt(p.wage);
      } else if (surplus > 0) surplus--;
    }
  }
  return listed;
}

/** A player one division and line of the market holds, read once per settlement. */
type Candidate = { player: Player; club: Club; ovr: number; age: number; potential: number };
const indexKey = (country: string, tier: number, line: Line) => `${country}:${tier}:${line}`;
/** The first candidate rated at most `top` in a list sorted from the ablest down. */
function firstAtMost(list: readonly Candidate[], top: number) {
  let low = 0,
    high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (list[mid]!.ovr > top) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Moves recorded in a window's settlement days that the market made: no loan returns, no free signings. */
function windowMoves(w: World, days: readonly number[]) {
  const buys = new Map<string, number>(),
    sales = new Map<string, number>();
  const first = days[0]!,
    last = days.at(-1)!;
  for (const record of Object.values(w.playerRecords ?? {}))
    for (const move of record.moves)
      if (
        move.year === w.year &&
        move.day >= first &&
        move.day <= last &&
        (move.loan || move.fee !== '0')
      ) {
        buys.set(move.to, (buys.get(move.to) ?? 0) + 1);
        sales.set(move.from, (sales.get(move.from) ?? 0) + 1);
      }
  return { buys, sales };
}

/** A window's bids spread over its settlement days, so the days together keep its cap. */
export function bidsOnDay(bids: number, at: number, days: number) {
  return Math.floor((bids * (at + 1)) / days) - Math.floor((bids * at) / days);
}
/** A bid's fee: the asking fee times the drawn share, at least one whole minor unit. */
export function npcBidFee(asking: string, rich: boolean, draw: number) {
  const ask = BigInt(asking);
  if (rich) return ask.toString();
  const { min, max } = NPC_MARKET.bidShare,
    share = BigInt(Math.round((min + (max - min) * draw) * 1000));
  const fee = (ask * share + 999n) / 1000n;
  return (fee < 1n ? 1n : fee > ask ? ask : fee).toString();
}

type Attempt = 'skipped' | 'bid' | 'moved';

/**
 * The pull market (→WORLD-16): on each settlement day every club nobody owns with a need and the
 * means, in stature order, bids for its best-fitting reachable targets, listed or not — its own
 * country's division and those below, the top flight also abroad on a seeded day — within the
 * era's caps for the window. The seller answers through CLUB-52 and the player through CLUB-53,
 * one seeded draw each keyed by the pair and window; reasons reach the move observer only. Every
 * buyer reads every target each settlement day, so a need opening later in the window still
 * reaches him; a pair asked again on a later day meets the same draws, and the re-bid counts
 * against the era's bids. A slot need's targets rank by the value rule (`npcValueScore`); a lower
 * division's club also reaches a higher division's listed players (surplus, blocked, final season,
 * aged 30 or over) for a fee; from a window's second settlement day a bidder skips a player whose
 * answers under this window's draws, read with today's factors, would refuse it, without spending a
 * bid, while the first day bids blind.
 */
export function npcMarket(w: World) {
  const day = currentDay(w);
  const windows = npcMarketDays(w.year),
    windowAt = windows.findIndex((dates) => dates.includes(day)),
    days = windows[windowAt];
  if (!days || (w.npcMarketAt?.year === w.year && w.npcMarketAt.day >= day)) return;
  // A pair's bid, the seller's answer and the player's are drawn once a window (→CLUB-52/53):
  // asked again on a later settlement day of the window, it meets the same draws.
  const windowName = windowAt === 0 ? 'summer' : 'winter';
  w.npcMarketAt = { year: w.year, day };
  const clubs = w.clubs.filter(
    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id],
  );
  const caps = npcMarketCaps(w.year);
  const dayAt = days.indexOf(day),
    later = dayAt > 0;
  const bidsToday = bidsOnDay(caps.bids, dayAt, days.length);
  if (bidsToday <= 0) return;
  const settlement: Settlement = {
    clubs: new Map(),
    returns: new Map(),
    ratings: new SettlementRatings(clubs.reduce((n, c) => n + w.squads![c.id]!.length, 0)),
  };
  for (const record of Object.values(w.playerRecords ?? {}))
    if (record.loan)
      settlement.returns.set(record.loan.club, (settlement.returns.get(record.loan.club) ?? 0) + 1);
  const { buys, sales } = windowMoves(w, days);
  const listed = listings(w, clubs, settlement);
  const ties = new Map<string, number>();
  const tieOf = (id: string) => {
    let tie = ties.get(id);
    if (tie === undefined)
      ties.set(id, (tie = random(`${w.seed}:npc-market:${w.year}:${day}:${id}`)()));
    return tie;
  };
  // The market by country, division and line, the ablest first: a need reads only its band.
  const index = new Map<string, Candidate[]>();
  const tiers = new Map<string, Set<number>>();
  for (const c of clubs) {
    (tiers.get(c.country) ?? tiers.set(c.country, new Set()).get(c.country)!).add(c.tier);
    for (const p of w.squads![c.id]!) {
      if (p.loanUntil || p.retiring !== undefined) continue;
      const key = indexKey(c.country, c.tier, lineOf(p.position));
      (index.get(key) ?? index.set(key, []).get(key)!).push({
        player: p,
        club: c,
        ovr: rating(p, settlement),
        age: w.year - p.born,
        potential: p.potential,
      });
    }
  }
  for (const list of index.values())
    list.sort((a, b) => b.ovr - a.ovr || compareIds(a.player.id, b.player.id));
  const statures = new Map(clubs.map((c) => [c.id, stature(w.seed, c.id)]));
  const statureOf = (c: Club) => statures.get(c.id)!;
  const buyers = [...clubs].sort((a, b) => statureOf(b) - statureOf(a) || compareIds(a.id, b.id));
  const wanted = new Map(clubs.map((c) => [c.id, needs(w, c, settlement)]));
  const levels = new Map<string, number>();
  /** The highest OVR any player's wage could fit the buyer's headroom at: the search's ceiling. */
  const levelOf = (c: Club) => {
    let level = levels.get(c.id);
    if (level === undefined) {
      const players = w.squads![c.id]!,
        { limit, bill } = clubFacts(w, c, settlement);
      level =
        limit === undefined || !players.length
          ? Infinity
          : limit > bill
            ? ceilingWithin(w, c, players[0]!, limit - bill)
            : -Infinity;
      levels.set(c.id, level);
    }
    return level;
  };
  /** The seller's asking fee (→CLUB-52's A): his value at its division, a loan's share of it. */
  const askingOf = (seller: Club, p: Player, loan: boolean) => {
    const value = marketValueAt(seller.country, w.year, seller.tier, p);
    return loan ? ratio(value, BigInt(Math.round(MARKET_CONFIG.loan * 1000)), 1000n) : value;
  };
  /** A target's price to the buyer, in its money: his wage at the club, the asking and least fees. */
  const priceOf = (buyer: Club, seller: Club, p: Player, loan: boolean) => {
    const asking = askingOf(seller, p, loan);
    return {
      wage: BigInt(marketWageAt(buyer.country, w.year, buyer.tier, p)),
      fee: BigInt(convertFee(w, seller, buyer, asking)),
      least: BigInt(convertFee(w, seller, buyer, npcBidFee(asking, false, 0))),
    };
  };
  /**
   * Whether the buyer's funded envelope holds his wage at the club and the lowest bid it could
   * make: read without the wage-decision observer, which only a bid reaches.
   */
  const affords = (buyer: Club, price: ReturnType<typeof priceOf>) => {
    const { limit, bill } = clubFacts(w, buyer, settlement);
    return limit === undefined || bill + price.wage + price.least <= limit;
  };
  const references = new Map<string, bigint>();
  /** What a regular's share of the buyer's season wage budget buys over the value rule's years. */
  const referenceOf = (c: Club) => {
    let reference = references.get(c.id);
    if (reference === undefined) {
      const budget = npcWageBudget(w, c, NPC_MARKET.cashRunway) ?? 0n;
      reference = (budget * BigInt(NPC_MARKET.valueYears)) / BigInt(NPC_SQUAD.size);
      references.set(c.id, reference);
    }
    return reference;
  };
  /**
   * A higher division's player comes down only when listed (→WORLD-16): on loan as listed, or for a
   * fee when surplus, blocked, in his final season or aged 30 or over.
   */
  const listedDown = (listing: Listing | undefined) =>
    !!listing &&
    (listing.loan ||
      listing.reason !== 'sell-down' ||
      w.year - listing.player.born >= SALE_FACTOR_VALUES.veteranAge);
  // The pairs asked today: a buyer asks for a player once a settlement day.
  const moved = new Set<string>(),
    tried = new Set<string>(),
    bids = new Map<string, number>();
  const bidsLeft = (c: Club) => bidsToday - (bids.get(c.id) ?? 0);
  const buysLeft = (c: Club) => caps.buys - (buys.get(c.id) ?? 0);
  const salesLeft = (c: Club) => caps.sales - (sales.get(c.id) ?? 0);

  const abroad = new Map<string, boolean>();
  /** A top-flight club looks abroad on a seeded day (→WORLD-16), drawn once a settlement. */
  const looksAbroad = (c: Club) => {
    let looks = abroad.get(c.id);
    if (looks === undefined)
      abroad.set(
        c.id,
        (looks =
          c.tier === 0 &&
          random(`${w.seed}:npc-abroad:${w.year}:${day}:${c.id}`)() < NPC_MARKET.abroad),
      );
    return looks;
  };
  /** Whether a seller's player is within a club's reach: as `reach` lists the divisions. */
  const reaches = (c: Club, seller: Club, listing: Listing | undefined) =>
    seller.country === c.country
      ? seller.tier >= c.tier || listedDown(listing)
      : seller.tier === 0 && looksAbroad(c);
  /**
   * The divisions a buyer reaches for a line: its own and those below, the top flight abroad too,
   * and the higher divisions for their listed players only.
   */
  const reach = (buyer: Club) => {
    const out: { country: string; tier: number; listedOnly: boolean }[] = [];
    for (const tier of [...(tiers.get(buyer.country) ?? [])].sort((a, b) => a - b))
      out.push({ country: buyer.country, tier, listedOnly: tier < buyer.tier });
    if (looksAbroad(buyer))
      for (const country of [...tiers.keys()].sort())
        if (country !== buyer.country && tiers.get(country)!.has(0))
          out.push({ country, tier: 0, listedOnly: false });
    return out;
  };
  // Mean projections are read only after a target passes the existing search and money bounds.
  // A player can fit several needs; neither his projection nor the buyer's levels are read twice.
  const development = new Map<string, Omit<ExpectedDevelopmentLevels, 'ageing'>>();
  const projections = new Map<string, Map<Player, number>>();
  const curves = new Map<Player, ReturnType<typeof ageingCurve>>();
  const projectedGain = (buyer: Club, cand: Candidate) => {
    if (cand.age > NPC_MARKET.prospectAge || cand.potential <= cand.ovr || !buyer.levels) return 0;
    let reads = projections.get(buyer.id);
    if (!reads) projections.set(buyer.id, (reads = new Map()));
    let future = reads.get(cand.player);
    if (future === undefined) {
      let levels = development.get(buyer.id);
      if (!levels) {
        levels = {
          year: w.year,
          youth: clubManager(w, buyer).youth,
          ground: TRAINING_GROUND[buyer.levels.ground]!.growth,
          coaching: departmentMultiplier(CLUB_LEVELS.coachingAbility[buyer.levels.coaching]!),
        };
        development.set(buyer.id, levels);
      }
      let curve = curves.get(cand.player);
      if (!curve) {
        curve = ageingCurve(w.seed, cand.player.id);
        curves.set(cand.player, curve);
      }
      future = expectedOvr(cand.player, NPC_MARKET.prospectSeasons, { ...levels, ageing: curve });
      reads.set(cand.player, future);
    }
    return Math.max(0, future - cand.ovr);
  };
  /**
   * A need's targets within reach and means; a listed player first only on a tie. A slot need ranks
   * them by the value rule (`npcValueScore`), a line need by OVR. Each division's list runs from the
   * ablest down, from the buyer's wage ceiling, and stops once no one left can rate at the slot
   * above the need's threshold (and, ranked by OVR, above the kept targets): a player's slot rating
   * stands at most `searchSlack` above his main OVR. Valued targets keep no such bound, since a
   * cheaper player below the kept ones can outscore them.
   */
  const targetsFor = (buyer: Club, need: Need) => {
    if (forcedSales(buyer.books?.distress)) return [];
    const threshold = need.slot ? need.best + NPC_MARKET.upgrade : -Infinity,
      slack = need.slot ? NPC_MARKET.searchSlack : 0,
      keep = NPC_MARKET.targetsPerNeed * NPC_MARKET.searchSpare,
      valued = !!need.slot && NPC_MARKET.valueWeight > 0;
    const found: { cand: Candidate; score: number; listed: boolean }[] = [];
    const scores: number[] = [];
    const bound = () =>
      valued
        ? threshold
        : Math.max(threshold, scores.length >= keep ? scores[keep - 1]! : -Infinity);
    for (const { country, tier, listedOnly } of reach(buyer)) {
      const list = index.get(indexKey(country, tier, need.line)) ?? [];
      for (let i = firstAtMost(list, levelOf(buyer)); i < list.length; i++) {
        const cand = list[i]!;
        if (cand.ovr + slack < bound()) break;
        if (cand.club === buyer || moved.has(cand.player.id)) continue;
        if (tried.has(`${buyer.id}|${cand.player.id}`)) continue;
        const listing = listed.get(cand.player.id),
          loan = listing?.loan ?? false;
        if (listedOnly && !listedDown(listing)) continue;
        // A player his club cannot sell now, or whom the buyer cannot pay for, never takes a
        // target's place.
        if (salesLeft(cand.club) <= 0 || !npcCanSell(w, cand.club, cand.player)) continue;
        const rated = need.slot ? rating(cand.player, settlement, need.slot) : cand.ovr;
        if (rated < bound()) continue;
        const price = priceOf(buyer, cand.club, cand.player, loan);
        if (!affords(buyer, price)) continue;
        const score = valued
          ? npcValueScore(
              rated - need.best + projectedGain(buyer, cand),
              price.fee + price.wage * BigInt(NPC_MARKET.valueYears),
              referenceOf(buyer),
            )
          : rated;
        found.push({ cand, score, listed: !!listing });
        if (valued) continue;
        const at = scores.findIndex((kept) => kept < score);
        scores.splice(at < 0 ? scores.length : at, 0, score);
      }
    }
    return found.sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.listed) - Number(a.listed) ||
        tieOf(a.cand.player.id) - tieOf(b.cand.player.id) ||
        compareIds(a.cand.player.id, b.cand.player.id),
    );
  };
  /** He would start for the club: he rates above its starter at a slot of his line. */
  const wouldStart = (c: Club, p: Player) => {
    const xi = startingSquad(w, c),
      slots = formationOf(clubStyle(c)),
      line = lineOf(p.position);
    return slots.some(
      (slot, i) =>
        lineOf(slot.position) === line &&
        (!xi[i] || rating(p, settlement, slot) > rating(xi[i]!, settlement, slot)),
    );
  };
  /** A bidder's bid and its offer: its fee, and whether its envelope holds the asking fee thrice. */
  const bidOf = (bidder: Club, p: Player, seller: Club, asking: string, loan: boolean) => {
    const { limit, bill } = clubFacts(w, bidder, settlement);
    const ask = BigInt(convertFee(w, seller, bidder, asking));
    const rich = limit === undefined || limit - bill >= ask * BigInt(NPC_MARKET.richMultiple);
    const fee = npcBidFee(
      asking,
      rich,
      random(`${w.seed}:npc-bid:${w.year}:${windowName}:${bidder.id}:${p.id}`)(),
    );
    const offer = npcOffer(w, bidder, p, seller, fee, loan, wanted.get(bidder.id), settlement);
    return offer ? { fee, offer } : undefined;
  };
  type Bid = NonNullable<ReturnType<typeof bidOf>>;
  /**
   * The seller's answer (→CLUB-52) and the player's (→CLUB-53) to a bid under this window's draws,
   * read with today's factors: the fee and offer it settles on, or the party that refuses.
   * A counter is checked against the bidder's envelope
   * before its offer, so a refused reading reaches no wage-decision observer.
   */
  const answered = (
    bidder: Club,
    p: Player,
    seller: Club,
    asking: string,
    loan: boolean,
    bid: Bid,
  ): Bid | BidRefusal => {
    const { limit, bill } = clubFacts(w, seller, settlement);
    const answer = saleAnswer(
      npcSaleContext(w, {
        seller,
        buyer: bidder,
        player: p,
        fee: bid.fee,
        asking,
        sellingDown: limit !== undefined && bill > limit,
      }),
      random(`${w.seed}:npc-sale:${w.year}:${windowName}:${bidder.id}:${p.id}`)(),
    );
    if (answer.kind === 'refuse') return 'seller-refused';
    let fee = bid.fee,
      offer = bid.offer;
    if (answer.kind === 'counter') {
      // A counter at R is taken when the buyer can pay it.
      if (later) {
        const facts = clubFacts(w, bidder, settlement),
          paid = BigInt(convertFee(w, seller, bidder, answer.counter!));
        if (facts.limit !== undefined && facts.bill + BigInt(offer.wage) + paid > facts.limit)
          return 'buyer-refused';
      }
      const countered = npcOffer(
        w,
        bidder,
        p,
        seller,
        answer.counter!,
        loan,
        wanted.get(bidder.id),
        settlement,
      );
      if (!countered) return 'buyer-refused';
      fee = answer.counter!;
      offer = countered;
    }
    const terms = termsAnswer(
      npcTermsContext(w, {
        buyer: bidder,
        seller,
        player: p,
        wage: offer.wage,
        wouldStart: wouldStart(bidder, p),
        startsNow: startingSquad(w, seller).includes(p),
      }),
      random(`${w.seed}:npc-terms:${w.year}:${windowName}:${bidder.id}:${p.id}`)(),
    );
    return terms.accept ? { fee, offer } : 'player-refused';
  };
  /**
   * One target: the bid (or an equal-stature rival's who pays him more), both answers, the move.
   * From the window's second settlement day a bidder whose answers would refuse it skips the
   * player without spending a bid; the first day bids blind.
   */
  const attempt = (buyer: Club, cand: Candidate): Attempt => {
    const { player: p, club: seller } = cand;
    if (moved.has(p.id) || salesLeft(seller) <= 0 || !npcCanSell(w, seller, p)) return 'skipped';
    const listing = listed.get(p.id),
      loan = listing?.loan ?? false;
    const asking = askingOf(seller, p, loan);
    const own = bidOf(buyer, p, seller, asking, loan);
    tried.add(`${buyer.id}|${p.id}`);
    if (!own) return 'skipped';
    let result = later ? answered(buyer, p, seller, asking, loan, own) : undefined;
    if (typeof result === 'string') return 'skipped';
    // A player two clubs want joins the one of higher stature, then the higher wage (→WORLD-16):
    // higher statures have had their turn, so only an equal-stature rival can outbid here.
    let bidder = buyer,
      bid = own;
    for (const rival of buyers) {
      if (statureOf(rival) !== statureOf(buyer) || rival === buyer || rival === seller) continue;
      if (bidsLeft(rival) <= 0 || buysLeft(rival) <= 0 || tried.has(`${rival.id}|${p.id}`))
        continue;
      if (!reaches(rival, seller, listing)) continue;
      const theirs = bidOf(rival, p, seller, asking, loan);
      if (
        theirs &&
        (compareMoney(theirs.offer.pounds, bid.offer.pounds) < 0 ||
          (theirs.offer.pounds === bid.offer.pounds && compareIds(rival.id, bidder.id) < 0))
      ) {
        if (later) {
          const theirResult = answered(rival, p, seller, asking, loan, theirs);
          if (typeof theirResult === 'string') continue;
          result = theirResult;
        }
        bidder = rival;
        bid = theirs;
      }
    }
    tried.add(`${bidder.id}|${p.id}`);
    bids.set(bidder.id, (bids.get(bidder.id) ?? 0) + 1);
    result ??= answered(bidder, p, seller, asking, loan, bid);
    NPC_BID_FLOW.observe?.({
      from: { id: seller.id, country: seller.country, tier: seller.tier },
      to: { id: bidder.id, country: bidder.country, tier: bidder.tier },
      playerId: p.id,
      outcome: typeof result === 'string' ? result : 'completed',
    });
    if (typeof result === 'string') return 'bid';
    const { fee, offer } = result;
    const down = seller.country === bidder.country && seller.tier < bidder.tier;
    settleMove(
      w,
      {
        club: seller,
        player: p,
        loan,
        reason: listing ? (loan ? 'loan' : down ? 'listed-down' : listing.reason) : 'pull',
      },
      offer,
      fee,
    );
    settlement.ratings.forget(p);
    settlement.clubs.delete(seller.id);
    settlement.clubs.delete(bidder.id);
    if (loan) settlement.returns.set(seller.id, (settlement.returns.get(seller.id) ?? 0) + 1);
    moved.add(p.id);
    buys.set(bidder.id, (buys.get(bidder.id) ?? 0) + 1);
    sales.set(seller.id, (sales.get(seller.id) ?? 0) + 1);
    for (const c of [seller, bidder]) {
      levels.delete(c.id);
      wanted.set(c.id, needs(w, c, settlement));
    }
    return bidder === buyer ? 'moved' : 'bid';
  };

  for (const buyer of buyers) {
    for (;;) {
      if (bidsLeft(buyer) <= 0 || buysLeft(buyer) <= 0) break;
      // Such a buyer would settle nothing; its offers are refused on its own facts.
      if (refusesEveryBid(w, buyer, settlement)) break;
      let settled = false;
      for (const need of wanted.get(buyer.id)!) {
        let picked = 0;
        for (const { cand } of targetsFor(buyer, need)) {
          if (picked >= NPC_MARKET.targetsPerNeed || bidsLeft(buyer) <= 0) break;
          const result = attempt(buyer, cand);
          if (result === 'skipped') continue;
          picked++;
          if (result === 'moved') {
            settled = true;
            break;
          }
        }
        if (settled || bidsLeft(buyer) <= 0) break;
      }
      if (!settled) break;
    }
  }
}

/** The summer's final safety net is generation through the same academy routine. */
export function npcNeedsRefill(w: World, c: Club) {
  const players = clubPlayers(w, c);
  return players.length < SQUAD_MINIMUM || !players.some((p) => p.position === 'GK');
}
