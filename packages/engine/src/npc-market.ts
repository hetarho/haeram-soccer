import { playerRecord } from './player-records';
/** Settled, need-led business between persisted clubs (→WORLD-11/16/17). */
import type { Club, Line, Player, PlayerMove, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { fromPounds, inPounds } from './club-value';
import {
  currencyChange,
  npcCanPay,
  npcWageBill,
  npcWageLimit,
  recordNpcTransferFee,
} from './books';
import { npcContractTerm } from './free-agents';
import { MARKET_CONFIG, marketValueAt, marketWageAt } from './market-prices';
import { movePerson } from './npc-continuity';
import { moveSquadPlayer } from './persisted-squads';
import { formationOf, slotOvr } from './player-state';
import { LINE_MINIMUM, lineOf, mainOvr, type Slot } from './player';
import { compareIds, random, ratio, scaleBy } from './primitives';
import { CLUB_BOOKS } from './owner-config';
import { clubRegistration, registrationExempt } from './registration';
import { SQUAD_MINIMUM } from './squad-size';
import { clubById, clubPlayers, clubStyle, NPC_SQUAD, refillPlace, stature } from './world';
import { transferWindowDays } from './transfer-window';

/** Initial calibration, measured and tuned in T866. Fractions name first/middle/last day. */
export const NPC_MARKET = {
  days: [0, 0.5, 1],
  upgrade: 4,
  blocked: 4,
  loanAge: 23,
  moves: 3,
  minimum: 18,
  termAge: 27,
} as const;

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
type Listing = { club: Club; player: Player; loan: boolean };
const lines = Object.keys(LINE_MINIMUM) as Line[];
const compareMoney = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);
const loanReservations = new WeakMap<
  World,
  { records: World['playerRecords']; clubs: Map<string, number> }
>();
function reservedReturns(w: World, club: string) {
  let index = loanReservations.get(w);
  if (!index || index.records !== w.playerRecords) {
    const clubs = new Map<string, number>();
    for (const record of Object.values(w.playerRecords ?? {}))
      if (record.loan) clubs.set(record.loan.club, (clubs.get(record.loan.club) ?? 0) + 1);
    index = { records: w.playerRecords, clubs };
    loanReservations.set(w, index);
  }
  return index.clubs.get(club) ?? 0;
}
const convertFee = (w: World, from: Club, to: Club, fee: string) =>
  fromPounds(to.country, w.year, inPounds(from.country, w.year, fee));

/** Fee commitments settle with the books; count them now so no two purchases spend the same cash. */
function canPayFee(w: World, c: Club, fee: string) {
  const b = c.books;
  if (!b) return false;
  const income = b.seasons[0]?.income ?? b.openingIncome ?? '0';
  const room =
    BigInt(b.cash) -
    BigInt(b.debt) +
    BigInt(b.transfersReceived ?? '0') -
    BigInt(b.transfersPaid ?? '0') +
    BigInt(scaleBy(income, CLUB_BOOKS.debtSeasons, 1000n));
  return BigInt(fee) <= room;
}

/** The level an ordinary place can carry, on the same wage curve as an actual signing. */
function affordableLevel(w: World, c: Club, players: Player[]) {
  const limit = npcWageLimit(w, c);
  if (limit === undefined || !players.length) return c.strength;
  const budget = limit / BigInt(NPC_SQUAD.size);
  let low = 15,
    high = 99;
  const regular = { ...players[0]!, born: w.year - NPC_MARKET.termAge, potential: 0 };
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (BigInt(marketWageAt(c.country, w.year, c.tier, regular, mid)) <= budget) low = mid;
    else high = mid - 1;
  }
  return low;
}

function needs(w: World, c: Club): Need[] {
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
    const best = Math.max(0, ...players.map((p) => slotOvr(p, slot)));
    if (best <= level - NPC_MARKET.upgrade)
      result.push({ line: lineOf(slot.position), slot, best, rank: 1 + best - level });
  }
  // Missing lines first, then the weakest slot relative to the affordable level.
  return result.sort((a, b) => Number(!!a.slot) - Number(!!b.slot) || a.rank - b.rank);
}

const fills = (p: Player, need: Need) =>
  lineOf(p.position) === need.line &&
  (!need.slot || slotOvr(p, need.slot) >= need.best + NPC_MARKET.upgrade);

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

function canRegister(w: World, c: Club, p: Player, loan: boolean) {
  const players = w.squads?.[c.id] ?? [];
  const state = clubRegistration(c, w.year, players);
  const returning = reservedReturns(w, c.id);
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
) {
  if (
    !/^\d{1,80}$/.test(fee) ||
    buyer.id === w.playerClub ||
    buyer.representative ||
    !w.squads?.[buyer.id] ||
    buyer.id === seller.id ||
    !wanted.some((n) => fills(p, n)) ||
    !canRegister(w, buyer, p, loan)
  )
    return undefined;
  const limit = npcWageLimit(w, buyer);
  if (limit !== undefined && npcWageBill(w, buyer) > limit) return undefined;
  const wage = marketWageAt(buyer.country, w.year, buyer.tier, p);
  const paid = convertFee(w, seller, buyer, fee);
  if (!npcCanPay(w, buyer, wage) || !canPayFee(w, buyer, paid)) return undefined;
  return { club: buyer, wage, paid, pounds: BigInt(inPounds(buyer.country, w.year, wage)) };
}

/** Observation only for the final lived-world gate; no observer changes settlement inputs. */
export const PLAYER_MOVE_FLOW: { observe?: (w: World, id: string, move: PlayerMove) => void } = {};
export function recordPlayerMove(w: World, id: string, move: PlayerMove) {
  loanReservations.delete(w);
  PLAYER_MOVE_FLOW.observe?.(w, id, move);
  const record = playerRecord(w, id);
  if (record.loan?.club === move.to && !move.loan) delete record.loan;
  record.moves.push(move);
  return record;
}

function settleMove(
  w: World,
  listing: Listing,
  offer: NonNullable<ReturnType<typeof npcOffer>>,
  fee: string,
) {
  const { player: p, club: seller, loan } = listing;
  const record = recordPlayerMove(w, p.id, {
    year: w.year,
    day: currentDay(w),
    from: seller.id,
    to: offer.club.id,
    fee,
    ...(loan ? { loan: true } : {}),
  });
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
  p.joined = w.year;
  delete p.graduate;
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
  loanReservations.delete(w);
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
      recordPlayerMove(w, id, {
        year: w.year,
        day: currentDay(w),
        from: borrower!.id,
        to: parent.id,
        fee: '0',
      });
      delete p.loanUntil;
      p.wage = currencyChange(parent.country, loan.year, w.year)?.(loan.wage) ?? loan.wage;
      p.until = loan.contractUntil;
      delete p.graduate;
      delete p.joined;
      if (loan.graduate) p.graduate = true;
      if (loan.joined !== undefined) p.joined = loan.joined;
      if (w.people?.[id]) {
        movePerson(w, p, parent.id, borrower?.id === w.playerClub, undefined, borrower?.id);
        delete w.people[id]!.loan;
      } else moveSquadPlayer(w, p, parent.id, borrower?.id);
    }
    delete record.loan;
  }
}

function listings(w: World, clubs: Club[]) {
  const listed: Listing[] = [];
  for (const c of clubs) {
    const players = w.squads![c.id]!;
    const limit = npcWageLimit(w, c);
    let bill = npcWageBill(w, c);
    const sellDown = limit !== undefined && bill > limit;
    const ranked = [...players].sort((a, b) =>
      sellDown
        ? compareMoney(BigInt(a.wage), BigInt(b.wage)) || compareIds(a.id, b.id)
        : mainOvr(a) - mainOvr(b) || compareIds(a.id, b.id),
    );
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
          (q) => lineOf(q.position) === line && mainOvr(q) >= mainOvr(p) + NPC_MARKET.blocked,
        ).length >= LINE_MINIMUM[line];
      if (sellDown ? bill <= limit! : !(surplus > 0 || blocked || p.until <= w.year)) continue;
      listed.push({
        club: c,
        player: p,
        loan: !sellDown && (blocked || surplus > 0) && w.year - p.born <= NPC_MARKET.loanAge,
      });
      if (sellDown) {
        remaining.splice(remaining.indexOf(p), 1);
        bill -= BigInt(p.wage);
      } else if (surplus > 0) surplus--;
    }
  }
  return listed;
}

/** Only three settlement days per window, with independent deterministic ordering and no read draws. */
export function npcMarket(w: World) {
  const day = currentDay(w);
  const days = npcMarketDays(w.year).find((dates) => dates.includes(day));
  if (!days || (w.npcMarketAt?.year === w.year && w.npcMarketAt.day >= day)) return;
  w.npcMarketAt = { year: w.year, day };
  const clubs = w.clubs.filter(
    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id],
  );
  const counts = new Map<string, number>();
  for (const record of Object.values(w.playerRecords ?? {}))
    for (const move of record.moves)
      if (move.year === w.year && move.day >= days[0]! && move.day <= days.at(-1)!)
        for (const id of [move.from, move.to]) counts.set(id, (counts.get(id) ?? 0) + 1);
  const listed = listings(w, clubs);
  const tie = new Map(
    listed.map(({ player }) => [
      player.id,
      random(`${w.seed}:npc-market:${w.year}:${day}:${player.id}`)(),
    ]),
  );
  const byLine = new Map(
    lines.map((line) => [line, listed.filter((l) => lineOf(l.player.position) === line)]),
  );
  const buyers = [...clubs].sort(
    (a, b) => stature(w.seed, b.id) - stature(w.seed, a.id) || compareIds(a.id, b.id),
  );
  const wanted = new Map(clubs.map((c) => [c.id, needs(w, c)]));
  const moved = new Set<string>();
  for (const buyer of buyers) {
    while ((counts.get(buyer.id) ?? 0) < NPC_MARKET.moves) {
      let completed = false;
      for (const need of wanted.get(buyer.id)!) {
        const pool = (byLine.get(need.line) ?? []).filter(
          (l) =>
            l.club !== buyer &&
            !moved.has(l.player.id) &&
            npcCanSell(w, l.club, l.player) &&
            fills(l.player, need),
        );
        pool.sort(
          (a, b) =>
            (need.slot
              ? slotOvr(b.player, need.slot) - slotOvr(a.player, need.slot)
              : mainOvr(b.player) - mainOvr(a.player)) ||
            tie.get(a.player.id)! - tie.get(b.player.id)! ||
            compareIds(a.player.id, b.player.id),
        );
        for (const listing of pool) {
          const limit = npcWageLimit(w, listing.club);
          const sellingDown = limit !== undefined && npcWageBill(w, listing.club) > limit;
          if (!sellingDown && (counts.get(listing.club.id) ?? 0) >= NPC_MARKET.moves) continue;
          const value = marketValueAt(
            listing.club.country,
            w.year,
            listing.club.tier,
            listing.player,
          );
          const fee = listing.loan
            ? ratio(value, BigInt(Math.round(MARKET_CONFIG.loan * 1000)), 1000n)
            : value;
          const ownOffer = npcOffer(
            w,
            buyer,
            listing.player,
            listing.club,
            fee,
            listing.loan,
            wanted.get(buyer.id),
          );
          if (!ownOffer) continue;
          // Equal-stature contenders compare their actual wages in one currency.
          const offers = buyers
            .filter(
              (c) =>
                (counts.get(c.id) ?? 0) < NPC_MARKET.moves &&
                stature(w.seed, c.id) >= stature(w.seed, buyer.id),
            )
            .flatMap((c) => {
              const offer =
                c === buyer
                  ? ownOffer
                  : npcOffer(
                      w,
                      c,
                      listing.player,
                      listing.club,
                      fee,
                      listing.loan,
                      wanted.get(c.id),
                    );
              return offer ? [offer] : [];
            });
          offers.sort(
            (a, b) =>
              stature(w.seed, b.club.id) - stature(w.seed, a.club.id) ||
              compareMoney(a.pounds, b.pounds) ||
              compareIds(a.club.id, b.club.id),
          );
          const winner = offers[0]!;
          settleMove(w, listing, winner, fee);
          moved.add(listing.player.id);
          for (const id of [listing.club.id, winner.club.id])
            counts.set(id, (counts.get(id) ?? 0) + 1);
          wanted.set(listing.club.id, needs(w, listing.club));
          wanted.set(winner.club.id, needs(w, winner.club));
          completed = true;
          break;
        }
        if (completed) break;
      }
      if (!completed) break;
    }
  }
}

/** The summer's final safety net is generation through the same academy routine. */
export function npcNeedsRefill(w: World, c: Club) {
  const players = clubPlayers(w, c);
  return players.length < SQUAD_MINIMUM || !players.some((p) => p.position === 'GK');
}
