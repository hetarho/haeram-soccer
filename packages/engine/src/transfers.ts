import { recordRenewalBid } from './renewal-bids';
import {
  DISTRESS,
  distressSalePlan,
  distressSaleFee,
  distressSigningReason,
  forcedSales,
} from './distress';
import { message as sourceMessage, type SourceMessageId } from '../../contracts/src/messages';
import { INCOMING_BID_CHANCE, SALE_BARS } from './transfer-policy';
import { clubPlayer, worldMarketOffer } from './world-market';
import { openNeed, windowCallUps } from './replacements';
import { bidCeiling, haggling } from './director-bidding';
import { graduateIds, registrationRoom } from './registration';
import { endPlayingCoachForDeparture, playingCoachDepartureCost } from './playing-coach';
import { movePerson } from './npc-continuity';
import { npcMarket, npcOffer, recordPlayerMove } from './npc-market';
import { closeNpcWindow } from './npc-careers';
import { recordNpcTransferFee } from './books';
import { npcContractTerm } from './free-agents';
import { stature } from './world';
import { fromPounds, inPounds } from './club-value';
import type {
  Club,
  Player,
  ScoutOffer,
  TransferBid,
  TransferStance,
  WageStep,
  World,
  WorldMarketTarget,
} from '../../contracts/src/types';
import {
  saleAnswer,
  saleContext,
  saleOutlook,
  SALE_FACTORS,
  type AnswerFactor,
  type FactorLine,
  type SaleAnswer,
  type SaleContext,
} from './sale-answer';
import { termsAnswer, termsChance, termsContext, WAGE_STEPS } from './personal-terms';
import { currency } from '../../catalogs/src/index';
import { currentDay, dayCountedFrom, seasonDayLabel } from './calendar';
import {
  assertTransferWindow,
  transferWindow,
  transferWindowDays,
  WINDOW_INFO,
} from './transfer-window';
import {
  clamp,
  compareIds,
  hash,
  integer,
  random,
  ratio,
  scaleBy,
  zeroMetrics,
} from './primitives';
import {
  activePlayers,
  clubOf,
  formationOf,
  overall,
  ownMultiplier,
  slotOvr,
} from './player-state';
import { addEvent } from './events';
import { recordTransfer } from './transfer-records';
import { fanMoodTransfer } from './fan-mood';
import { ownStarters } from './world';
import { ambitionAfterDecline, leaveContract, marketValue, signingClauses } from './contracts';
import { credit, debit } from './transactions';
import { locateOffer, transferOffers } from './scout-search';
import { applyDelegatePlans, delegatePlan, warnCashFloor } from './delegation';
import { SALE_FLOOR_REDUCTION } from './transfer-policy';
import { SAFETY_ROUNDS } from './delegation-info';
import { moneyLabel, operatingCosts } from './finance';
import { fixedCostRunway } from './investment';
import { managerStyleEffects } from './styles';
import { buildEffects, buildOf, cardOf } from './build';
import { pushInbox } from './inbox';
import { isDelegated } from './responsibilities';
import {
  judgeRequests,
  noteSigning,
  openShortlistWindow,
  signingVerdict,
  staffSignings,
} from './signings';

export {
  assertTransferWindow,
  transferWindow,
  transferWindowDays,
  WINDOW_INFO,
  type TransferWindowState,
} from './transfer-window';

const MAX_PENDING_INCOMING = 3;
const INCOMING_RESPONSE_DAYS = 5;
import { SQUAD_MINIMUM } from './squad-size';
/** Resolved bids kept for the record; open negotiations are never pruned. */
const CLOSED_BID_HISTORY = 60;
/**
 * What another club would consider fair for a player: his market value (→CLUB-25), steeply
 * more for ability and a young player's promise, less with age, by the division (ours unless
 * given) and the football index.
 */
export function playerValue(w: World, player: Player, division?: number): string {
  return marketValue(w, player, division);
}

const isOpen = (bid: TransferBid) => bid.status === 'pending' || bid.status === 'countered';
function bidId(prefix: string, w: World, day: number, playerId: string, extra = '') {
  const id = `${prefix}:${w.year}:${day}:${extra}${playerId}`;
  return id.length <= 100 ? id : `${prefix}:${w.year}:${day}:${extra}${hash(playerId)}`;
}
/** Another club offers at least one whole currency unit for a player, so no offer reads 0. */
function offerFee(w: World, fee: string) {
  const unit = BigInt(currency(clubOf(w).country, w.year).units);
  return BigInt(fee) < unit ? unit.toString() : fee;
}
function feeRatio(fee: string, asking: string) {
  const a = BigInt(asking);
  return a <= 0n ? 2 : Number((BigInt(fee) * 10000n) / a) / 10000;
}
/**
 * The selling club's factors for our bids (→CLUB-52): its registry, and the share −0.05 a
 * 데이터 헤드코치 manager takes off the reservation (CLUB-52's row, →STAFF-14), named in the
 * report like the 단장's ability (→STAFF-20). Read when a bid is answered, never at load.
 */
function bidFactors(w: World): readonly AnswerFactor<SaleContext>[] {
  const help = managerStyleEffects(w).bidAcceptance;
  if (!help) return SALE_FACTORS;
  return [
    ...SALE_FACTORS,
    {
      id: 'managerStyle',
      read: (c) =>
        c.ownSeller
          ? undefined
          : {
              factor: 'managerStyle',
              delta: -help,
              message: 'market.sale.managerStyle',
              params: {},
            },
    },
  ];
}
/** The club selling him: the one a bid names, else where the list found him (older saves). */
function sellerOf(bid: TransferBid, offer: MarketOffer | undefined) {
  return bid.club ?? (offer?.source.kind === 'club' ? offer.source.club : undefined);
}
/** The selling club's answer to an `out` bid from its own draw (→CLUB-52); undefined when gone. */
function clubAnswer(w: World, bid: TransferBid, offer: MarketOffer, asking: string) {
  const seller = sellerOf(bid, offer);
  const context =
    seller && saleContext(w, { playerId: bid.playerId, sellerId: seller, fee: bid.fee, asking });
  if (!context) return undefined;
  return saleAnswer(context, random(`${w.seed}:sale:${bid.id}`)(), bidFactors(w));
}
/** Our offer at a wage step of his demand, in whole minor units, as `termsContext` reads it. */
function stepWage(demand: string, step: number) {
  return ((BigInt(demand) * BigInt(Math.round(step * 10000))) / 10000n).toString();
}
/**
 * The player as the 단장's money checks must read him: on the wage the bid offers, the one he signs
 * on when he agrees (→CLUB-53), not his quoted demand, so a raised step cannot pass the plan and the
 * insolvency stop at 100% and then commit more (→ECON-33, →ECON-41).
 */
function atOfferedWage(bid: TransferBid, player: Player): Player {
  const step = bid.wage ?? 1;
  return step === 1 ? player : { ...player, wage: stepWage(player.wage, step) };
}
/**
 * A report's factors, one message per count so each factor stays its own localizable slot (→ARCH-32):
 * prose joined into one parameter would leave a translation unable to tell the factors apart.
 */
const RESERVATION_REPORT = [
  'market.answer.reservation.0',
  'market.answer.reservation.1',
  'market.answer.reservation.2',
  'market.answer.reservation.3',
  'market.answer.reservation.4',
  'market.answer.reservation.5',
  'market.answer.reservation.6',
  'market.answer.reservation.7',
  'market.answer.reservation.8',
  'market.answer.reservation.9',
  'market.answer.reservation.10',
  'market.answer.reservation.11',
] as const satisfies readonly SourceMessageId[];
const TERMS_REPORT = [
  'market.answer.terms.0',
  'market.answer.terms.1',
  'market.answer.terms.2',
  'market.answer.terms.3',
  'market.answer.terms.4',
  'market.answer.terms.5',
  'market.answer.terms.6',
  'market.answer.terms.7',
] as const satisfies readonly SourceMessageId[];
/**
 * The factor lines as a report's named slots f1, f2, …, every one of them (→CLUB-52/53): a name
 * a factor carries (the 단장's) runs at most `room` characters, so a long one shortens rather than
 * pushing a factor out of the report.
 */
function factorSlots(lines: readonly FactorLine[], slots: number, room: number) {
  return Object.fromEntries(
    lines.slice(0, slots).map((line, i) => {
      const name = line.params?.name;
      const params =
        typeof name === 'string' && name.length > room
          ? { ...line.params, name: clip(name, room) }
          : line.params;
      return [`f${i + 1}`, sourceMessage(line.message, params)];
    }),
  );
}
/**
 * The selling club's reservation and each factor that moved it, for its answer's report
 * (→CLUB-52); `reservation` is the money label of R, `room` the longest a factor's name runs.
 */
export function reservationReport(
  reservation: string,
  share: number,
  lines: readonly FactorLine[],
  room = Infinity,
) {
  const shown = Math.min(lines.length, RESERVATION_REPORT.length - 1);
  return sourceMessage(RESERVATION_REPORT[shown]!, {
    reservation,
    share: Math.round(share * 100),
    ...factorSlots(lines, shown, room),
  });
}
/** The player's chance of agreeing and each factor behind it, for his answer's report (→CLUB-53). */
export function termsReport(chance: number, lines: readonly FactorLine[], room = Infinity) {
  const shown = Math.min(lines.length, TERMS_REPORT.length - 1);
  return sourceMessage(TERMS_REPORT[shown]!, {
    chance: Math.round(chance * 100),
    ...factorSlots(lines, shown, room),
  });
}
/** The selling club's reservation and the factors behind it, for its answer's report. */
function saleReason(w: World, answer: SaleAnswer, room?: number) {
  if (answer.forced)
    return sourceMessage('finance.distress.forcedSaleShare', { percent: DISTRESS.saleShare * 100 });
  return reservationReport(moneyLabel(w, answer.reservation), answer.share, answer.lines, room);
}
/** An inbox item's longest title and detail (the save schema's bounds, →SAVE-5). */
const TITLE_MAX = 160,
  DETAIL_MAX = 1000;
/** How long a factor's name may run, longest first, while a report outgrows the inbox's bound. */
const NAME_ROOMS = [Infinity, 60, 30, 16, 8] as const;
/**
 * A report detail naming every factor of each answer within the inbox's bound (→CLUB-52/53, →SAVE-5):
 * `make` builds it with a factor's name at most `room` characters long, and a name shortens until
 * the report fits. Every factor sentence fits with room to spare, so the last clip only guards a
 * money check's own reason running long, which the report puts last.
 */
export function fittedDetail(make: (room: number) => string) {
  let detail = '';
  for (const room of NAME_ROOMS) {
    detail = make(room);
    if (detail.length <= DETAIL_MAX) return detail;
  }
  return clip(detail, DETAIL_MAX);
}
/** A title naming a player, his name clipped so the whole sentence fits the inbox's bound. */
export function namedTitle(id: SourceMessageId, name: string) {
  const room = TITLE_MAX - sourceMessage(id, { name: '' }).length;
  return sourceMessage(id, { name: clip(name, room) });
}
/**
 * The player's answer to our terms once his club agreed (→CLUB-53), from his own draw: our step of
 * the demand the bid was made for (→CLUB-14), the rest read from the world as it stands.
 */
function playerAnswer(w: World, bid: TransferBid, offer: MarketOffer) {
  const step = bid.wage ?? 1,
    context = termsContext(w, { playerId: bid.playerId, clubId: sellerOf(bid, offer), step });
  if (!context) return undefined;
  const demand = offer.player.wage,
    wage = stepWage(demand, step);
  return {
    ...termsAnswer({ ...context, demand, offer: wage }, random(`${w.seed}:terms:${bid.id}`)()),
    demand,
    wage,
  };
}
type MarketOffer = ScoutOffer;
/**
 * The player and terms a bid was made for, whatever the list shows meanwhile (→CLUB-14), found by
 * his id in the world: at the club the bid names, else wherever he is, else in the free-agent pool
 * (→CLUB-50). A bid without pinned terms (before 1.15.0) takes his current ones. Gone — a generated
 * candidate of an older save among them — the pinned record stays, no longer available.
 */
function marketOffer(w: World, bid: TransferBid): MarketOffer | undefined {
  const current = locateOffer(w, bid.playerId, bid.club);
  if (!bid.offer) return current;
  const { player, fee, loanFee } = bid.offer;
  return {
    // Pinned offers retain their terms, but registration reads our recorded academy origin.
    player: { ...player, graduate: graduateIds(w).has(player.id) ? true : undefined },
    fee,
    loanFee,
    freeAgent: false,
    available: !!current?.available,
    source: bid.club ? { kind: 'club', club: bid.club } : (current?.source ?? { kind: 'free' }),
    foreign: current?.foreign ?? false,
  };
}
function askingFee(offer: Pick<MarketOffer, 'fee' | 'loanFee'>, loan?: boolean) {
  return loan ? offer.loanFee : offer.fee;
}
function signingBlocker(w: World, offer: MarketOffer | undefined, fee: string, loan = false) {
  if (!offer?.available) return sourceMessage('copy.ops_squad.c94b14b4dc');
  const distress = distressSigningReason(w, offer.player, offer.freeAgent, loan);
  if (distress) return distress;
  const room = registrationRoom(w, {
    ...offer.player,
    joined: w.year,
    ...(loan ? { loanUntil: w.year + 1 } : {}),
  });
  if (room) return room;
  if (BigInt(w.cash) < BigInt(fee)) return sourceMessage('copy.playing_coach.8791d586e5');
  return undefined;
}
function completeSigning(
  w: World,
  bid: TransferBid,
  offer: MarketOffer,
  fee: string,
  wage = offer.player.wage,
) {
  // The bid keeps its record of him; the squad gets its own copy, on the wage he agreed to.
  const p = structuredClone(offer.player);
  p.graduate = graduateIds(w).has(p.id) ? true : undefined;
  p.wage = wage;
  const prior = w.players.findIndex((player) => player.id === p.id);
  if (prior >= 0) {
    // Inactive rows are not reset at rollover. Only restore minutes earned in this season;
    // the employment/transfer facts date the departure without inventing absent history.
    const sameSeason =
      w.people?.[p.id]?.employment.some(
        (job) => job.role === 'player' && job.club === w.playerClub && job.to?.year === w.year,
      ) ||
      w.transfers?.facts.some(
        (fact) => fact.player === p.id && fact.direction === 'out' && fact.year === w.year,
      );
    p.career = [...w.players[prior].career];
    p.season = sameSeason ? [...w.players[prior].season] : zeroMetrics();
  }
  debit(w, fee);
  // A loan keeps his club's contract, its clauses his club's; a transfer signs one with its own
  // clauses (→CLUB-29).
  if (bid.loan) {
    p.loanUntil = w.year + 1;
    delete p.clauses;
  } else p.clauses = signingClauses(w, p);
  if (prior >= 0) w.players[prior] = p;
  else w.players.push(p);
  if (bid.club) {
    const seller = w.clubs.find((c) => c.id === bid.club)!;
    const sellerFee = fromPounds(seller.country, w.year, inPounds(clubOf(w).country, w.year, fee));
    recordNpcTransferFee(w, seller, sellerFee, true);
    const record = recordPlayerMove(w, p.id, {
      year: w.year,
      day: currentDay(w),
      from: seller.id,
      to: w.playerClub,
      fee: sellerFee,
      ...(bid.loan ? { loan: true } : {}),
    });
    if (bid.loan) {
      record.loan = {
        club: seller.id,
        until: p.loanUntil!,
        wage: offer.player.wage,
        contractUntil: offer.player.until,
        year: w.year,
      };
      const parent = clubPlayer(w, seller, p.id);
      if (parent?.graduate) record.loan.graduate = true;
      if (parent?.joined !== undefined) record.loan.joined = parent.joined;
    }
  }
  noteSigning(w, p, bid.club);
  const fact = recordTransfer(w, {
    direction: 'in',
    loan: !!bid.loan,
    player: p,
    club: bid.club,
    fee,
  });
  if (fact) fanMoodTransfer(w, fact);
  addEvent(
    w,
    'transfer-in',
    `${p.name} ${bid.loan ? sourceMessage('team.loan') : sourceMessage('copy.areas.60be4d7b53')}`,
    sourceMessage('copy.transfers.244d316b53', {
      p0: p.position,
      p1: w.year - p.born,
      p2: moneyLabel(w, p.wage),
      p3: p.until,
    }),
    fee,
  );
  bid.status = 'completed';
  if (bid.staff) warnCashFloor(w);
}
function saleBlocker(w: World, p: Player | undefined) {
  if (!p || p.status !== 'active' || p.loanUntil) return sourceMessage('copy.transfers.b0b5964d37');
  const active = activePlayers(w);
  if (
    active.length <= SQUAD_MINIMUM ||
    (p.position === 'GK' && active.filter((x) => x.position === 'GK').length <= 1)
  )
    return sourceMessage('copy.transfers.6c697e8ad5');
  return undefined;
}
/** Our player leaves for the bidding club at `fee`: the bid's own, or the counter it took. */
function completeSale(w: World, bid: TransferBid, p: Player, fee = bid.fee) {
  const club = w.clubs.find((c) => c.id === bid.club);
  const offer = club && npcOffer(w, club, p, clubOf(w), fee);
  if (!offer) throw new Error(sourceMessage('copy.transfers.30aac47a5f'));
  const release = BigInt(playingCoachDepartureCost(w, p.id));
  if (release > 0n && BigInt(w.cash) + BigInt(fee) < release)
    throw new Error(sourceMessage('copy.transfers.4c1042837b'));
  const wasStarter = ownStarters(w).some((starter) => starter.id === p.id);
  credit(w, fee);
  endPlayingCoachForDeparture(w, p.id);
  p.status = 'sold';
  delete p.stance;
  delete p.distressListing;
  // His sale ends his talk, his unhappiness and his transfer request (→CLUB-27).
  leaveContract(w, p);
  const live = { ...p, wage: offer.wage, until: w.year + npcContractTerm(w.year - p.born) - 1 };
  delete live.renewalBids;
  live.joined = w.year;
  delete live.graduate;
  delete live.clauses;
  recordNpcTransferFee(w, club!, offer.paid, false);
  recordPlayerMove(w, p.id, {
    year: w.year,
    day: currentDay(w),
    from: w.playerClub,
    to: club!.id,
    fee,
  });
  movePerson(w, live, club?.id, true);
  if (wasStarter || activePlayers(w).length < 20) openNeed(w, p);
  const fact = recordTransfer(w, {
    direction: 'out',
    loan: false,
    player: p,
    club: bid.club,
    fee,
  });
  if (fact) fanMoodTransfer(w, fact);
  addEvent(
    w,
    'transfer-out',
    sourceMessage('copy.transfers.6873202f94', { p0: p.name }),
    sourceMessage('copy.transfers.64761434a6', {
      p0: club
        ? sourceMessage('copy.transfers.8ef007b0c0', { p0: club.name })
        : sourceMessage('copy.RecruitmentDesk.45b54f8961'),
    }),
    fee,
  );
  bid.status = 'completed';
}
function markRelatedRead(w: World, id: string) {
  if (w.inbox?.some((item) => item.ref === id && !item.read))
    w.inbox = w.inbox.map((item) => (item.ref === id ? { ...item, read: true } : item));
}
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Whether `step` is one of the wage steps our offers are made at (→CLUB-53). */
export function isWageStep(step: unknown): step is WageStep {
  return (WAGE_STEPS as readonly unknown[]).includes(step);
}
/**
 * Our offer for a market player at `fee`, with our wage offer a step of his demand (→CLUB-53,
 * the 100% step when absent); the selling club answers in two to four days.
 */
export function placeBid(
  w: World,
  candidate: number | WorldMarketTarget,
  fee: string,
  loan = false,
  staff?: TransferBid['staff'],
  wage?: WageStep,
): void {
  if (wage !== undefined && !isWageStep(wage))
    throw new Error(sourceMessage('market.bid.invalidWage'));
  const scouted = typeof candidate === 'number' ? transferOffers(w)[candidate] : undefined;
  const offer = typeof candidate === 'number' ? scouted : worldMarketOffer(w, candidate);
  if (!offer?.available) throw new Error(sourceMessage('copy.ops_squad.c94b14b4dc'));
  if (offer.freeAgent) throw new Error(sourceMessage('copy.transfers.79ea9f1dde'));
  const distress = distressSigningReason(w, offer.player, false, loan);
  if (distress) throw new Error(distress);
  // The selling club, whichever list named him: a bid concerns him there (→CLUB-14).
  const club =
    typeof candidate === 'number'
      ? scouted?.source.kind === 'club'
        ? scouted.source.club
        : undefined
      : candidate.kind === 'club'
        ? candidate.clubId
        : undefined;
  if (
    (w.bids || []).some((b) => b.direction === 'out' && b.playerId === offer.player.id && isOpen(b))
  )
    throw new Error(sourceMessage('copy.transfers.f49acd2668'));
  assertTransferWindow(w);
  const room = registrationRoom(w, {
    ...offer.player,
    joined: w.year,
    ...(loan ? { loanUntil: w.year + 1 } : {}),
  });
  if (room) throw new Error(room);
  if (typeof fee !== 'string' || !/^\d{1,80}$/.test(fee) || BigInt(fee) < 1n)
    throw new Error(sourceMessage('copy.transfers.ce43157e82'));
  if (BigInt(w.cash) < BigInt(fee)) throw new Error(sourceMessage('copy.playing_coach.8791d586e5'));
  // Earlier bids for him this season keep a renewed bid on the same day apart.
  const earlier = (w.bids || []).filter(
    (b) => b.direction === 'out' && b.playerId === offer.player.id && b.year === w.year,
  ).length;
  const day = currentDay(w),
    window = transferWindow(w, day),
    id = bidId('out', w, day, offer.player.id, `${earlier}:`),
    wait = integer(random(`${w.seed}:bid-due:${id}`), 2, 4);
  const bid: TransferBid = {
    id,
    direction: 'out',
    playerId: offer.player.id,
    fee,
    ...(loan ? { loan: true } : {}),
    offer: { player: structuredClone(offer.player), fee: offer.fee, loanFee: offer.loanFee },
    ...(club ? { club } : {}),
    year: w.year,
    day,
    due: Math.min(day + wait, window.until ?? day + wait),
    status: 'pending',
    ...(staff ? { staff } : {}),
    ...(wage !== undefined ? { wage } : {}),
  };
  w.bids = [...(w.bids || []), bid];
  const seller = club && w.clubs.find((c) => c.id === club);
  const livePlayer = seller && clubPlayer(w, seller, bid.playerId);
  if (seller && livePlayer) recordRenewalBid(w, livePlayer, seller, clubOf(w));
  if (bid.staff) warnCashFloor(w);
  addEvent(
    w,
    'transfer-bid',
    sourceMessage('copy.transfers.3417e50747', {
      p0: offer.player.name,
      p1: loan ? sourceMessage('team.loan') : sourceMessage('copy.areas.60be4d7b53'),
    }),
    sourceMessage('copy.transfers.6d1ab8f358', {
      p0: offer.player.position,
      p1: w.year - offer.player.born,
      p2: moneyLabel(w, fee),
      p3: moneyLabel(w, askingFee(offer, loan)),
      p4: seasonDayLabel(w.year, bid.due),
    }),
  );
  // On deadline day the selling club answers at once, so the owner can still reply to a counter.
  if (bid.due <= day) decideOutgoing(w, bid);
}
/** Owner answer to a selling club's counter offer or to another club's bid for our player. */
export function respondBid(w: World, id: string, accept: boolean): void {
  const bid = (w.bids || []).find((b) => b.id === id);
  if (!bid) throw new Error(sourceMessage('copy.transfers.8f83a6128d'));
  if (bid.staff) throw new Error(sourceMessage('copy.transfers.3151d1051d'));
  if (bid.direction === 'out' && bid.status === 'countered') {
    if (accept) {
      assertTransferWindow(w);
      const offer = marketOffer(w, bid),
        fee = bid.counterFee || bid.fee,
        blocker = signingBlocker(w, offer, fee, bid.loan);
      if (blocker) throw new Error(blocker);
      // The counter answered, the player answers the wage step the bid carried (→CLUB-53); his
      // refusal's report stays unread.
      markRelatedRead(w, id);
      closeDeal(w, bid, offer!, fee, true);
      return;
    } else bid.status = 'rejected';
  } else if (bid.direction === 'in' && bid.status === 'pending') {
    const p = w.players.find((x) => x.id === bid.playerId);
    if (accept) {
      assertTransferWindow(w);
      const blocker = saleBlocker(w, p);
      if (blocker) throw new Error(blocker);
      completeSale(w, bid, p!);
    } else {
      bid.status = 'rejected';
      resent(w, bid, p);
    }
  } else throw new Error(sourceMessage('copy.transfers.c5ab3adae5'));
  markRelatedRead(w, id);
}
/** The player's answer to one wage step (→CLUB-53): our offer, his chance and its factors. */
export interface TermsStepOutlook {
  step: WageStep;
  wage: string;
  chance: number;
  lines: FactorLine[];
}
export interface BidOutlook {
  /** The selling club's exact chance of accepting the fee (→CLUB-52); 0 when no bid can be made. */
  chance: number;
  /** Its exact chance of a counter at its reservation instead. */
  counter: number;
  asking: string;
  /** The factors that move its reservation, as the answer will read them. */
  lines: FactorLine[];
  /** The player's answer to each wage step of his demand (→CLUB-53), when he can be asked. */
  terms?: { demand: string; steps: TermsStepOutlook[] };
}
/**
 * The player's chance at every wage step (→CLUB-53), for the bid view and a free agent's signing;
 * `clubId` is his club, absent for a free agent.
 */
function termsOutlook(w: World, playerId: string, clubId?: string): BidOutlook['terms'] {
  const context = termsContext(w, { playerId, ...(clubId ? { clubId } : {}), step: 1 });
  if (!context) return undefined;
  return {
    demand: context.demand,
    steps: WAGE_STEPS.map((step) => {
      const wage = stepWage(context.demand, step),
        read = termsChance({ ...context, offer: wage });
      return { step, wage, chance: read.chance, lines: read.lines };
    }),
  };
}
/**
 * Read model for the bid form: the selling club's exact chances of accepting and of countering
 * under its seeded draw, and the player's chance at each wage step, with their factors. It reads
 * no randomness and changes nothing; it never guarantees an answer.
 */
export function bidOutlook(
  w: World,
  candidate: number | WorldMarketTarget,
  fee: string,
  loan = false,
): BidOutlook {
  const scouted = typeof candidate === 'number' ? transferOffers(w)[candidate] : undefined;
  const offer = typeof candidate === 'number' ? scouted : worldMarketOffer(w, candidate);
  const asking = offer ? askingFee(offer, loan) : '0';
  // The selling club, whichever list named him (→CLUB-14).
  const seller =
    typeof candidate === 'number'
      ? scouted?.source.kind === 'club'
        ? scouted.source.club
        : undefined
      : candidate.kind === 'club'
        ? candidate.clubId
        : undefined;
  const terms = offer?.available ? termsOutlook(w, offer.player.id, seller) : undefined;
  const none: BidOutlook = {
    chance: 0,
    counter: 0,
    asking,
    lines: [],
    ...(terms ? { terms } : {}),
  };
  if (
    !offer?.available ||
    offer.freeAgent ||
    !seller ||
    !/^\d{1,80}$/.test(fee) ||
    BigInt(fee) < 1n
  )
    return none;
  const context = saleContext(w, { playerId: offer.player.id, sellerId: seller, fee, asking });
  if (!context) return none;
  const read = saleOutlook(context, bidFactors(w));
  return { ...none, chance: read.accept, counter: read.counter, lines: read.lines };
}
export interface BidDetails {
  bid: TransferBid;
  /** Our player for incoming bids, the market candidate for outgoing ones. */
  player?: Player;
  /** The bidding club for incoming bids. */
  club?: Club;
  /** The selling club's asking fee for outgoing bids. */
  asking?: string;
  /** The owner can answer now (a counter offer or a pending incoming bid inside a window). */
  actionable: boolean;
  /** Human date of the answer (outgoing) or of the offer lapsing (incoming). */
  dueLabel: string;
}
/** Read model for showing bids: newest first, open negotiations before closed ones. */
export function bidBoard(w: World): BidDetails[] {
  const open = transferWindow(w).open;
  return (w.bids || [])
    .map((bid, index) => {
      const offer = bid.direction !== 'out' ? undefined : marketOffer(w, bid);
      const player =
        bid.direction === 'in' ? w.players.find((p) => p.id === bid.playerId) : offer?.player;
      return {
        index,
        details: {
          bid,
          player,
          club: bid.club ? w.clubs.find((c) => c.id === bid.club) : undefined,
          asking: offer ? askingFee(offer, bid.loan) : undefined,
          actionable:
            open &&
            ((bid.direction === 'out' &&
              bid.status === 'countered' &&
              !bid.staff &&
              !!offer?.available) ||
              (bid.direction === 'in' && bid.status === 'pending' && player?.status === 'active')),
          dueLabel: seasonDayLabel(bid.year, bid.due),
        },
      };
    })
    .sort(
      (a, b) => Number(isOpen(b.details.bid)) - Number(isOpen(a.details.bid)) || b.index - a.index,
    )
    .map((entry) => entry.details);
}

function announceWindows(w: World, day: number) {
  const d = transferWindowDays(w.year);
  const already = (kind: 'window-open' | 'window-close') =>
    (w.inbox || []).some((item) => item.kind === kind && item.year === w.year && item.day === day);
  const opening = day === d.summerOpen ? 'summer' : day === d.winterOpen ? 'winter' : undefined;
  if (opening && !already('window-open')) {
    pushInbox(w, {
      kind: 'window-open',
      title: sourceMessage('copy.transfers.2c21803a75', { p0: WINDOW_INFO[opening].name }),
      detail: sourceMessage('copy.transfers.8caca6c7a1', { p0: WINDOW_INFO[opening].deadline }),
      attention: true,
    });
    // Delegated people plan the window — the 단장 its signing budget and search — before the
    // chief scout lists candidates and the manager asks, ahead of the first day of business
    // (→CLUB-33).
    applyDelegatePlans(w, 'window');
    openShortlistWindow(w);
    if (isDelegated(w, 'sales')) staffStances(w);
  }
  // The day after a window closes the manager's requests at its opening are judged (→CLUB-33).
  if (day === d.summerClose + 1 || day === d.winterClose + 1) {
    judgeRequests(w);
    windowCallUps(w);
  }
  const closing = day === d.summerClose ? 'summer' : day === d.winterClose ? 'winter' : undefined;
  if (closing && !already('window-close'))
    pushInbox(w, {
      kind: 'window-close',
      title: sourceMessage('copy.transfers.2b65203518', { p0: WINDOW_INFO[closing].name }),
      detail: sourceMessage('copy.transfers.a92abd548c'),
      attention: false,
    });
}
function expire(w: World, bid: TransferBid, name: string, reason: string) {
  bid.status = 'expired';
  // The earlier request can no longer be answered, so it stops asking for attention.
  markRelatedRead(w, bid.id);
  pushInbox(w, {
    kind: 'staff-report',
    title: clip(
      sourceMessage('copy.transfers.917f415b42', {
        p0: name,
        p1:
          bid.direction === 'out'
            ? sourceMessage('copy.Rich.ba7bffee64')
            : sourceMessage('copy.transfers.46ec31ac83'),
      }),
      160,
    ),
    detail: reason,
    attention: false,
    ref: bid.id,
  });
}
/**
 * Once the selling club agrees at `fee`, the player answers our terms (→CLUB-53): agreeing, he signs
 * on the offered wage; refusing, he ends the bid with nothing paid, and the report names his
 * factors. Returns whether he signed.
 */
function closeDeal(
  w: World,
  bid: TransferBid,
  offer: MarketOffer,
  fee: string,
  attention: boolean,
  club?: SaleAnswer,
): boolean {
  const p = offer.player,
    terms = playerAnswer(w, bid, offer);
  if (!terms) {
    expire(w, bid, p.name, sourceMessage('copy.transfers.131637770d'));
    return false;
  }
  if (terms.accept) {
    completeSigning(w, bid, offer, fee, terms.wage);
    return true;
  }
  bid.status = 'rejected';
  bid.refusedBy = 'player';
  pushInbox(w, {
    kind: 'bid-response',
    title: namedTitle('market.answer.player.title', p.name),
    // An answer given at once names the club's reservation too (→CLUB-52); a counter's own
    // report already named it.
    detail: fittedDetail((room) =>
      club
        ? sourceMessage('market.answer.player.detail.club', {
            fee: moneyLabel(w, fee),
            reason: saleReason(w, club, room),
            wage: moneyLabel(w, terms.wage),
            percent: Math.round((bid.wage ?? 1) * 100),
            terms: termsReport(terms.chance, terms.lines, room),
          })
        : sourceMessage('market.answer.player.detail', {
            fee: moneyLabel(w, fee),
            wage: moneyLabel(w, terms.wage),
            percent: Math.round((bid.wage ?? 1) * 100),
            terms: termsReport(terms.chance, terms.lines, room),
          }),
    ),
    attention,
    ref: bid.id,
  });
  return false;
}
/**
 * The selling club answers our bid (→CLUB-18, →CLUB-52): accepted at or above its reservation,
 * countered at it within a quarter of the asking fee, else refused; an agreed bid then goes to the
 * player's terms (→CLUB-53). The report names the factors behind the answer.
 */
function decideOutgoing(w: World, bid: TransferBid) {
  const offer = marketOffer(w, bid);
  if (!offer?.available) {
    expire(
      w,
      bid,
      offer?.player.name || sourceMessage('copy.EventCenter.42bd764e17'),
      sourceMessage('copy.transfers.131637770d'),
    );
    return;
  }
  const p = offer.player,
    asking = askingFee(offer, bid.loan),
    move = bid.loan ? sourceMessage('team.loan') : sourceMessage('copy.areas.60be4d7b53'),
    answer = clubAnswer(w, bid, offer, asking);
  if (!answer) {
    expire(w, bid, p.name, sourceMessage('copy.transfers.131637770d'));
    return;
  }
  // The 단장's bids are his to follow up; their answers only report (→CLUB-33).
  const attention = !bid.staff;
  if (answer.kind === 'accept') {
    const financial = bid.staff
      ? signingVerdict(w, atOfferedWage(bid, p), bid.fee, undefined, bid.id, {
          freeAgent: offer.freeAgent,
          loan: bid.loan,
        })
      : undefined;
    const blocker =
      financial && !financial.ok ? financial.reason : signingBlocker(w, offer, bid.fee, bid.loan);
    if (blocker) {
      bid.status = 'rejected';
      pushInbox(w, {
        kind: 'bid-response',
        title: clip(sourceMessage('copy.transfers.138ea75077', { p0: p.name, p1: move }), 160),
        detail: fittedDetail((room) =>
          sourceMessage('market.answer.blocked', {
            fee: moneyLabel(w, bid.fee),
            reason: saleReason(w, answer, room),
            blocker,
          }),
        ),
        attention,
        ref: bid.id,
      });
      return;
    }
    if (!closeDeal(w, bid, offer, bid.fee, attention, answer)) return;
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(sourceMessage('copy.transfers.4bd8c1ff7d', { p0: p.name, p1: move }), 160),
      detail: fittedDetail((room) =>
        sourceMessage(bid.staff ? 'market.answer.accepted.staff' : 'market.answer.accepted', {
          position: p.position,
          age: w.year - p.born,
          fee: moneyLabel(w, bid.fee),
          reason: saleReason(w, answer, room),
        }),
      ),
      attention,
      ref: bid.id,
    });
  } else if (answer.kind === 'counter') {
    bid.status = 'countered';
    bid.counterFee = answer.counter!;
    if (bid.staff) {
      answerStaffCounter(w, bid, offer, asking, answer);
      return;
    }
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(
        sourceMessage('copy.transfers.b81ca1edd5', {
          p0: p.name,
          p1: moneyLabel(w, bid.counterFee),
        }),
        160,
      ),
      detail: fittedDetail((room) =>
        sourceMessage('market.answer.counter', {
          fee: moneyLabel(w, bid.fee),
          asking: moneyLabel(w, asking),
          reason: saleReason(w, answer, room),
        }),
      ),
      attention: true,
      ref: bid.id,
    });
  } else {
    bid.status = 'rejected';
    bid.refusedBy = 'club';
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(sourceMessage('copy.transfers.9f030caf7e', { p0: p.name, p1: move }), 160),
      detail: fittedDetail((room) =>
        sourceMessage(bid.staff ? 'market.answer.refused.staff' : 'market.answer.refused', {
          fee: moneyLabel(w, bid.fee),
          asking: moneyLabel(w, asking),
          reason: saleReason(w, answer, room),
        }),
      ),
      attention,
      ref: bid.id,
    });
  }
}
/**
 * The 단장 answers a counter to his own bid at once (→CLUB-41, →STAFF-20): he takes it while it
 * passes the money checks, else declines (a negotiator haggles on instead); a counter he takes
 * goes to the player's terms (→CLUB-53). The report says which and why.
 */
function answerStaffCounter(
  w: World,
  bid: TransferBid,
  offer: MarketOffer,
  asking: string,
  answer?: SaleAnswer,
) {
  const p = offer.player,
    fee = bid.counterFee!,
    verdict = signingVerdict(w, atOfferedWage(bid, p), fee, undefined, bid.id, {
      freeAgent: offer.freeAgent,
      loan: bid.loan,
    }),
    blocker = signingBlocker(w, offer, fee, bid.loan),
    belowCeiling = BigInt(bid.fee) < BigInt(ratio(asking, BigInt(bidCeiling(w)), 100n)),
    bargaining = haggling(w) && belowCeiling,
    accept = !bargaining && verdict.ok && !blocker,
    reason = bargaining
      ? sourceMessage('copy.transfers.c294c4e9ad')
      : accept
        ? verdict.reason
        : (blocker ?? verdict.reason);
  if (accept) {
    // His refusal reports itself; only a signing or a declined counter reports the counter.
    if (!closeDeal(w, bid, offer, fee, false, answer)) return;
  } else bid.status = bargaining || (verdict.ok && !blocker) ? 'rejected' : 'expired';
  pushInbox(w, {
    kind: 'bid-response',
    title: clip(
      sourceMessage('copy.transfers.8fed8750be', {
        p0: p.name,
        p1: moneyLabel(w, fee),
        p2: accept
          ? sourceMessage('copy.RecruitmentDesk.831defcf7a')
          : sourceMessage('copy.EventCenter.cc6314d04d'),
      }),
      160,
    ),
    detail: answer
      ? fittedDetail((room) =>
          sourceMessage('market.answer.staffCounter', {
            fee: moneyLabel(w, bid.fee),
            asking: moneyLabel(w, asking),
            percent: Math.round(feeRatio(bid.fee, asking) * 100),
            verdict: reason,
            reason: saleReason(w, answer, room),
          }),
        )
      : sourceMessage('copy.transfers.4a233f3fc1', {
          p0: moneyLabel(w, bid.fee),
          p1: moneyLabel(w, asking),
          p2: Math.round(feeRatio(bid.fee, asking) * 100),
          p3: reason,
        }),
    attention: false,
    ref: bid.id,
  });
}
function settleBids(w: World, open: boolean) {
  const code = clubOf(w).country;
  for (const bid of w.bids || []) {
    if (!isOpen(bid)) continue;
    const today = dayCountedFrom(w, bid.year);
    if (bid.year !== w.year && currency(code, bid.year).code !== w.currency) {
      expire(
        w,
        bid,
        sourceMessage('copy.NewsFeed.832934e8a8'),
        sourceMessage('copy.transfers.a2d7b03b15'),
      );
    } else if (bid.direction === 'out') {
      const signed = activePlayers(w).find((x) => x.id === bid.playerId);
      if (signed) expire(w, bid, signed.name, sourceMessage('copy.transfers.0a5b5b015e'));
      // A bid for a player the world no longer holds there lapses, nothing paid (→CLUB-50).
      else if (!locateOffer(w, bid.playerId, bid.club))
        expire(
          w,
          bid,
          bid.offer?.player.name || sourceMessage('copy.EventCenter.42bd764e17'),
          sourceMessage('copy.transfers.0c573da036'),
        );
      else if (!open)
        expire(
          w,
          bid,
          marketOffer(w, bid)?.player.name || sourceMessage('copy.EventCenter.42bd764e17'),
          sourceMessage('copy.transfers.f3f12a6e89'),
        );
      else if (bid.status === 'pending' && today >= bid.due) decideOutgoing(w, bid);
    } else {
      const p = w.players.find((x) => x.id === bid.playerId);
      if (!p || p.status !== 'active')
        expire(
          w,
          bid,
          p?.name || sourceMessage('team.column.player'),
          sourceMessage('copy.transfers.d4c1ccec41'),
        );
      else if (!open || today > bid.due) {
        expire(w, bid, p.name, sourceMessage('copy.transfers.d7b0bda06d'));
        // An offer left to lapse is declined as surely as one turned down (→CLUB-27).
        resent(w, bid, p);
      }
    }
  }
}
/** A young player with room to grow: our asking fee takes the prospect column (→CLUB-18). */
export const PROSPECT_AGE = 22;
export const PROSPECT_GROWTH = 8;
export function isProspect(w: World, p: Player) {
  return w.year - p.born <= PROSPECT_AGE && p.potential - overall(p) >= PROSPECT_GROWTH;
}
/**
 * The sale bar (→CLUB-18): the fee, as a percentage of value, our delegated 단장 asks for a player —
 * the 매각 기조 card's column, a prospect's for a prospect. It is the asking fee of the selling-club
 * answer (→CLUB-52), whose factors set how far below it he holds out.
 */
export function saleBar(w: World, p: Player) {
  const prospect = isProspect(w, p),
    bars = SALE_BARS[w.build?.market ?? 'standard'] ?? SALE_BARS.standard!;
  const plan =
    isDelegated(w, 'sales') && !w.distress?.stage && transferStance(p) === 'open'
      ? delegatePlan(w, 'sales')
      : undefined;
  const reduction = plan && BigInt(plan.projected) < BigInt(plan.floor) ? SALE_FLOOR_REDUCTION : 0;
  return { percent: bars[prospect ? 1 : 0] - reduction, prospect, reduction };
}
/**
 * The sale bar's base by the 매각 기조 card (→CLUB-18), of value and for a prospect: the club's
 * stance on selling sets the fee the 단장 asks.
 */
export { SALE_BARS } from './transfer-policy';
/**
 * A real vacancy and affordable terms within CLUB-18's strength band, from any country.
 * Contenders prefer stature, then the actual offered wage in comparable money (→WORLD-16).
 */
export function suitorFor(
  w: World,
  p: Player,
  r: () => number,
  fee = playerValue(w, p),
): Club | undefined {
  const ability = overall(p);
  const pool = w.clubs
    .filter(
      (c) =>
        c.id !== w.playerClub &&
        c.strength >= ability - 4 &&
        c.strength <= ability + 12 &&
        !(c.representative && !c.id.startsWith('euro:') && ability >= 45),
    )
    .flatMap((c) => {
      const offer = npcOffer(w, c, p, clubOf(w), fee);
      return offer ? [offer] : [];
    })
    .sort(
      (a, b) =>
        stature(w.seed, b.club.id) - stature(w.seed, a.club.id) ||
        (a.pounds > b.pounds ? -1 : a.pounds < b.pounds ? 1 : compareIds(a.club.id, b.club.id)),
    );
  if (!pool.length) return undefined;
  const first = pool[0]!;
  const tied = pool.filter(
    (offer) =>
      stature(w.seed, offer.club.id) === stature(w.seed, first.club.id) &&
      offer.pounds === first.pounds,
  );
  return tied[Math.floor(r() * tied.length)]!.club;
}
/**
 * Market stance (→CLUB-22): a listed player draws offers from real clubs while a window is open
 * and delegated staff take them; an open player sells only at the staff's sale bar (→CLUB-18); an
 * untouchable player turns down anything below UNTOUCHABLE_BAR, and a bigger offer goes to the
 * owner, or to the staff and manager when transfers are delegated.
 */
export const TRANSFER_STANCES: readonly TransferStance[] = ['listed', 'open', 'untouchable'];
export const STANCE_INFO: Record<TransferStance, { label: string; tag: string; event: string }> = {
  listed: {
    label: sourceMessage('copy.transfers.c1d56f4e34'),
    tag: sourceMessage('copy.transfers.69a5e25323'),
    event: sourceMessage('copy.transfers.6d575b9555'),
  },
  open: {
    label: sourceMessage('copy.transfers.5132ea553c'),
    tag: sourceMessage('copy.transfers.c67541427c'),
    event: sourceMessage('copy.transfers.e09c8b6b04'),
  },
  untouchable: {
    label: sourceMessage('copy.transfers.50625fe4db'),
    tag: sourceMessage('copy.transfers.dced6ad07b'),
    event: sourceMessage('copy.transfers.1a9d8d885e'),
  },
};
export function transferStance(p: Player): TransferStance {
  return p.stance ?? 'open';
}
/** Daily offer chance for a listed player of ordinary appeal, and the fee band as a share of value. */
export const LISTED_OFFER = { chance: 0.1, low: 0.85, high: 1.05 };
/** Offers for an untouchable player below this percentage of his value are refused unseen. */
export const UNTOUCHABLE_BAR = 150;
/** How much a player's profile draws buyers: good and young players attract more interest. */
export function listingAppeal(w: World, p: Player) {
  const age = w.year - p.born;
  return clamp(0.6 + (overall(p) - 35) / 60 + (age <= 23 ? 0.25 : age >= 31 ? -0.2 : 0), 0.35, 1.5);
}
/** Expected window days until the first offer for a listed player, for the stance sheet. */
export function expectedOfferDays(w: World, p: Player) {
  return Math.round(1 / (LISTED_OFFER.chance * listingAppeal(w, p)));
}
/** Forced sales run even when the owner retains sales decisions (→ECON-24). */
export function forceDistressSales(w: World) {
  if (!transferWindow(w).open) return;
  const commitments = (w.bids ?? [])
    .filter((b) => b.direction === 'out' && b.year === w.year && isOpen(b))
    .reduce(
      (sum, b) => sum + BigInt(b.status === 'countered' ? (b.counterFee ?? b.fee) : b.fee),
      0n,
    );
  const debt = commitments - BigInt(w.cash);
  const plan = forcedSales(w.distress)
    ? distressSalePlan(
        activePlayers(w),
        debt,
        BigInt(operatingCosts(w).annual),
        (p) => BigInt(playerValue(w, p)),
        (remaining, p) =>
          !p.loanUntil &&
          p.retiring === undefined &&
          remaining.length > SQUAD_MINIMUM &&
          (p.position !== 'GK' || remaining.filter((q) => q.position === 'GK').length > 1),
      )
    : [];
  const selected = new Set(plan.map((p) => p.id));
  for (const p of activePlayers(w)) {
    if (p.distressListing !== undefined && !selected.has(p.id)) {
      const previous = p.distressListing;
      delete p.distressListing;
      if (p.stance === 'listed') {
        if (previous === 'open') delete p.stance;
        else p.stance = previous;
      }
    }
  }
  for (const p of plan)
    if (p.stance !== 'listed') {
      const previous = transferStance(p);
      setTransferStance(w, p.id, 'listed');
      p.distressListing = previous;
    }
}
/**
 * At a window opening with transfers delegated (→CLUB-22), the staff set stances by the direction,
 * for players at 협상 가능 only: 셀링 클럽 lists non-starters aged 30+, 육성 목표 판매용 육성 lists
 * non-starters aged 21 or under, and 핵심 지키기 marks the three best starters 이적 불가. One staff
 * report names the changes; the owner may switch any of them back.
 */
export function staffStances(w: World) {
  const market = w.build?.market,
    sell = w.direction?.youthGoal === 'sell',
    starters = new Set(ownStarters(w).map((p) => p.id)),
    candidates = activePlayers(w).filter(
      (p) => transferStance(p) === 'open' && !p.loanUntil && p.retiring === undefined,
    ),
    age = (p: Player) => w.year - p.born,
    changes: [Player, TransferStance, string][] = [];
  for (const p of candidates) {
    if (starters.has(p.id)) continue;
    if (market === 'selling' && age(p) >= 30)
      changes.push([p, 'listed', sourceMessage('copy.transfers.e21edf1075')]);
    else if (sell && age(p) <= 21)
      changes.push([p, 'listed', sourceMessage('copy.transfers.29d7bc190f')]);
  }
  if (market === 'hold')
    for (const p of candidates
      .filter((one) => starters.has(one.id) && !one.transferRequest)
      .sort((a, b) => overall(b) - overall(a) || compareIds(a.id, b.id))
      .slice(0, 3))
      changes.push([p, 'untouchable', sourceMessage('copy.transfers.942b0ebd92')]);
  if (!changes.length) return;
  for (const [p, stance] of changes) setTransferStance(w, p.id, stance);
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.transfers.cb87fe79cd', { p0: changes.length }),
    detail: changes
      .map(([p, stance, why]) => `${p.name} ${STANCE_INFO[stance].label}(${why})`)
      .join(' · ')
      .slice(0, 400),
    attention: false,
  });
}
export function setTransferStance(w: World, id: string, stance: TransferStance) {
  const p = w.players.find((x) => x.id === id && x.status === 'active');
  if (!p || p.loanUntil) throw new Error(sourceMessage('copy.transfers.45a038282c'));
  if (!TRANSFER_STANCES.includes(stance))
    throw new Error(sourceMessage('copy.transfers.fbecae18f4'));
  if (p.retiring !== undefined) throw new Error(sourceMessage('copy.transfers.e8c146ef48'));
  if (p.transferRequest && stance === 'untouchable')
    throw new Error(sourceMessage('copy.transfers.2c9aecab5e'));
  delete p.distressListing;
  if (transferStance(p) === stance) return;
  if (stance === 'open') delete p.stance;
  else p.stance = stance;
  const value = playerValue(w, p);
  addEvent(
    w,
    'transfer-list',
    `${p.name} ${STANCE_INFO[stance].event}`,
    stance === 'listed'
      ? sourceMessage('copy.transfers.d0461ef468', { p0: moneyLabel(w, value) })
      : stance === 'untouchable'
        ? sourceMessage('copy.transfers.dd710b4f94', {
            p0: UNTOUCHABLE_BAR,
            p1: moneyLabel(w, ratio(value, BigInt(UNTOUCHABLE_BAR), 100n)),
          })
        : sourceMessage('copy.transfers.f18522d935', { p0: moneyLabel(w, value) }),
  );
}
/**
 * The fee, as a percentage of value, at which delegated staff and the manager let an untouchable
 * player go, by the build's market card; keeping the core sells at no price.
 */
export const UNTOUCHABLE_PRICE = { standard: 200, selling: 150, showcase: 175, hardball: 225 };
/**
 * The staff and manager's answer to a big offer for an untouchable player when transfers are
 * delegated: the market card sets the price, forced sales in financial distress
 * lower it by 25 points, a cash crisis sells, and the manager holds out 25 points longer for a starter
 * nobody can replace.
 */
export function untouchableVerdict(w: World, offered: number, essential: boolean) {
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual),
    market = w.build?.market,
    card = cardOf(buildOf(w), 'market').label;
  if (runway < SAFETY_ROUNDS)
    return { accept: true, reason: sourceMessage('copy.transfers.838216488c', { p0: runway }) };
  if (market === 'hold')
    return { accept: false, reason: sourceMessage('copy.transfers.57ffab38e3', { p0: card }) };
  const base = UNTOUCHABLE_PRICE[market ?? 'standard'],
    steps = [sourceMessage('copy.transfers.363d93e2b9', { p0: card, p1: base })];
  let bar = base;
  if (forcedSales(w.distress)) {
    bar -= 25;
    steps.push(sourceMessage('delegation.floor.forcedSale'));
  }
  if (essential) {
    bar += 25;
    steps.push(sourceMessage('copy.transfers.0b7e88dde9'));
  }
  const accept = offered >= bar;
  return {
    accept,
    reason: sourceMessage('copy.transfers.428e788cc5', {
      p0: offered,
      p1: bar,
      p2: steps.join(' · '),
      p3: accept
        ? sourceMessage('copy.transfers.5a5873f55e')
        : sourceMessage('copy.transfers.0554a8ecb9'),
    }),
  };
}
function listedOffers(w: World, day: number, until: number) {
  const pending = new Set(
    (w.bids || []).filter((b) => b.direction === 'in' && isOpen(b)).map((b) => b.playerId),
  );
  for (const p of activePlayers(w)) {
    if (p.stance !== 'listed' || pending.has(p.id) || saleBlocker(w, p)) continue;
    const r = random(`${w.seed}:listed:${p.id}:${w.year}:${day}`);
    if (r() >= LISTED_OFFER.chance * listingAppeal(w, p)) continue;
    const value = playerValue(w, p),
      share =
        (LISTED_OFFER.low + r() * (LISTED_OFFER.high - LISTED_OFFER.low)) * buildEffects(w).saleFee;
    const fee = offerFee(w, scaleBy(value, share, 1000n));
    const club = suitorFor(w, p, r, fee);
    if (!club) continue;
    const bid: TransferBid = {
      id: bidId('in', w, day, p.id, 'list:'),
      direction: 'in',
      playerId: p.id,
      club: club.id,
      fee,
      year: w.year,
      day,
      due: Math.min(day + INCOMING_RESPONSE_DAYS, until),
      status: 'pending',
    };
    w.bids = [...(w.bids || []), bid];
    recordRenewalBid(w, p, clubOf(w), club);
    const summary = sourceMessage('copy.transfers.0a9e8d6e85', {
      p0: p.position,
      p1: w.year - p.born,
      p2: overall(p),
      p3: moneyLabel(w, value),
    });
    if (isDelegated(w, 'sales') || forcedSales(w.distress)) {
      answerIncoming(w, bid, p, club, value, fee);
      continue;
    }
    pushInbox(w, {
      kind: 'incoming-bid',
      title: clip(
        sourceMessage('copy.transfers.a6c6b22996', {
          p0: club.name,
          p1: p.name,
          p2: moneyLabel(w, fee),
        }),
        160,
      ),
      detail: sourceMessage('copy.transfers.5a29c1b837', {
        p0: summary,
        p1: seasonDayLabel(w.year, bid.due),
      }),
      attention: true,
      ref: bid.id,
    });
  }
}
function incomingBid(w: World, day: number, until: number) {
  const pending = (w.bids || []).filter((b) => b.direction === 'in' && b.status === 'pending');
  if (pending.length >= MAX_PENDING_INCOMING) return;
  const r = random(`${w.seed}:incoming:${w.year}:${day}`);
  const build = buildEffects(w);
  if (r() >= INCOMING_BID_CHANCE * build.incomingBids) return;
  const wanted = new Set(pending.map((b) => b.playerId));
  const pool = activePlayers(w)
    .filter((p) => !p.loanUntil && p.stance !== 'listed' && !wanted.has(p.id) && !saleBlocker(w, p))
    .sort((a, b) => compareIds(a.id, b.id));
  if (!pool.length) return;
  const weights = pool.map(
    (p) => (Math.max(5, overall(p) - 30) + Math.max(0, p.potential - overall(p)) / 2) ** 2,
  );
  let target = r() * weights.reduce((sum, v) => sum + v, 0),
    player = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i];
    if (target < 0) {
      player = pool[i];
      break;
    }
  }
  const value = playerValue(w, player),
    fee = offerFee(w, ratio(value, BigInt(Math.round(integer(r, 90, 160) * build.saleFee)), 100n));
  const club = suitorFor(w, player, r, fee);
  if (!club) return;
  const bid: TransferBid = {
    id: bidId('in', w, day, player.id),
    direction: 'in',
    playerId: player.id,
    club: club.id,
    fee,
    year: w.year,
    day,
    due: Math.min(day + INCOMING_RESPONSE_DAYS, until),
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  recordRenewalBid(w, player!, clubOf(w), club);
  answerIncoming(w, bid, player, club, value, fee);
}

function answerIncoming(
  w: World,
  bid: TransferBid,
  player: Player,
  club: Club,
  value: string,
  fee: string,
) {
  if (
    !forcedSales(w.distress) &&
    isDelegated(w, 'sales') &&
    !isDelegated(w, 'staff') &&
    w.staff?.some((member) => member.person === player.id)
  ) {
    pushInbox(w, {
      kind: 'incoming-bid',
      title: sourceMessage('copy.stopping.8b601a30d9', { p0: player.name }),
      detail: sourceMessage('copy.transfers.2179e3980f'),
      attention: true,
      ref: bid.id,
    });
    return;
  }
  const age = w.year - player.born,
    offered = Number((BigInt(fee) * 100n) / BigInt(value)),
    untouchable = player.stance === 'untouchable',
    summary = sourceMessage('copy.transfers.0a9e8d6e85', {
      p0: player.position,
      p1: age,
      p2: overall(player),
      p3: moneyLabel(w, value),
    });
  const report: SaleReport = (
    accept,
    detail,
    who: string = isDelegated(w, 'sales')
      ? sourceMessage('copy.transfers.e744d7026d')
      : sourceMessage('copy.transfers.1654d061b5'),
    deal = bid.fee,
  ) => {
    if (accept && !npcOffer(w, club, player, clubOf(w), deal)) {
      accept = false;
      detail = sourceMessage('copy.transfers.30aac47a5f');
    }
    const release = BigInt(playingCoachDepartureCost(w, player.id));
    if (accept && release > 0n && BigInt(w.cash) + BigInt(deal) < release) {
      accept = false;
      detail = sourceMessage('copy.transfers.7017097137');
    }
    if (accept) completeSale(w, bid, player, deal);
    else bid.status = 'rejected';
    pushInbox(w, {
      kind: 'staff-report',
      title: clip(
        sourceMessage('copy.transfers.9cee38f04c', {
          p0: who,
          p1: club.name,
          p2: player.name,
          p3: moneyLabel(w, deal),
          p4: accept
            ? sourceMessage('copy.RecruitmentDesk.831defcf7a')
            : sourceMessage('copy.EventCenter.cc6314d04d'),
        }),
        160,
      ),
      detail: fittedDetail(
        (room) => `${summary} · ${typeof detail === 'string' ? detail : detail(room)}`,
      ),
      attention: false,
      ref: bid.id,
    });
    if (!accept) resent(w, bid, player);
  };
  if (forcedSales(w.distress) && BigInt(fee) >= distressSaleFee(BigInt(value))) {
    const blocker = saleBlocker(w, player);
    report(
      !blocker,
      blocker ??
        sourceMessage('finance.distress.forcedSaleShare', { percent: DISTRESS.saleShare * 100 }),
      sourceMessage('copy.transfers.e744d7026d'),
    );
    return;
  }
  if (untouchable && offered < UNTOUCHABLE_BAR) {
    // Whoever decides, an untouchable player is not discussed below the bar.
    report(false, sourceMessage('copy.transfers.b100c715c7', { p0: offered, p1: UNTOUCHABLE_BAR }));
    return;
  }
  if (isDelegated(w, 'sales')) {
    if (player.stance === 'listed') {
      const blocker = saleBlocker(w, player);
      report(!blocker, blocker || sourceMessage('copy.transfers.f3dca7c29b'));
      return;
    }
    const blocker = saleBlocker(w, player);
    if (untouchable) {
      // A starter nobody on the bench can play makes the manager hold out longer (→CLUB-24).
      const starter = ownStarters(w).some((p) => p.id === player.id),
        verdict = untouchableVerdict(w, offered, starter && !slotCovered(w, player));
      report(
        verdict.accept && !blocker,
        sourceMessage('copy.transfers.88db755e4b', { p0: blocker || verdict.reason }),
        sourceMessage('copy.transfers.bac92950ec'),
      );
      return;
    }
    if (blocker) {
      report(false, blocker);
      return;
    }
    answerAsSeller(w, bid, player, club, offered, report);
    return;
  }
  pushInbox(w, {
    kind: 'incoming-bid',
    title: clip(
      sourceMessage('copy.transfers.8f75758d7e', {
        p0: club.name,
        p1: player.name,
        p2: moneyLabel(w, fee),
        p3: untouchable ? sourceMessage('copy.transfers.4a41dc5263') : '',
      }),
      160,
    ),
    detail: sourceMessage('copy.transfers.dbf5657414', {
      p0: summary,
      p1: untouchable ? sourceMessage('copy.transfers.6a01f0e5c8', { p0: offered }) : '',
      p2: seasonDayLabel(w.year, bid.due),
    }),
    attention: true,
    ref: bid.id,
  });
}
/**
 * How a bid for our player is answered and reported: the decision, its reason (a text, or one built
 * with a factor's name at most `room` long, →`fittedDetail`), who decided and the fee of the deal.
 */
type SaleReport = (
  accept: boolean,
  detail: string | ((room: number) => string),
  who?: string,
  deal?: string,
) => void;
/**
 * The 단장 answers another club's bid for our player as the selling club (→CLUB-18, →CLUB-52), from
 * the bid's own draw: his asking fee is the sale bar of value, and his place, contract, age, our
 * money and the player's wishes set how far below it he holds out, never below 80% of value. A bid
 * at the reservation sells; one within reach of it draws a counter at it, which the bidder takes
 * when its books allow (→WORLD-16); a lower one is refused. Under 핵심 지키기 the three best starters
 * are never sold. The report names the bar and every factor.
 */
function answerAsSeller(
  w: World,
  bid: TransferBid,
  player: Player,
  club: Club,
  offered: number,
  report: SaleReport,
) {
  const context = saleContext(w, { playerId: player.id, sellerId: w.playerClub, fee: bid.fee });
  if (!context) {
    report(false, sourceMessage('copy.transfers.30aac47a5f'));
    return;
  }
  if (w.build?.market === 'hold' && context.place === 'core') {
    report(false, sourceMessage('market.sale.own.core', { fee: moneyLabel(w, bid.fee), offered }));
    return;
  }
  const answer = saleAnswer(context, random(`${w.seed}:sale:${bid.id}`)()),
    terms = {
      asking: moneyLabel(w, context.asking),
      bar: context.saleBar!.percent,
      fee: moneyLabel(w, bid.fee),
      offered,
    },
    detail =
      (id: SourceMessageId, extra: Record<string, string> = {}) =>
      (room: number) =>
        sourceMessage(id, {
          ...terms,
          ...extra,
          reason: [
            ...(context.saleBar?.reduction
              ? [
                  sourceMessage('delegation.floor.saleReduction', {
                    points: context.saleBar.reduction,
                  }),
                ]
              : []),
            saleReason(w, answer, room),
          ].join(' · '),
        });
  if (answer.kind === 'accept') {
    report(true, detail('market.sale.own.accepted'));
    return;
  }
  if (answer.kind === 'refuse') {
    report(false, detail('market.sale.own.refused'));
    return;
  }
  const counter = answer.counter!;
  bid.counterFee = counter;
  const taken = !!npcOffer(w, club, player, clubOf(w), counter);
  report(
    taken,
    detail(taken ? 'market.sale.own.counterTaken' : 'market.sale.own.counterDeclined', {
      counter: moneyLabel(w, counter),
    }),
    undefined,
    taken ? counter : bid.fee,
  );
}
/**
 * Whether a starter has cover (→CLUB-24): a bench player who plays his formation slot within 3 of
 * the starter's 실효 OVR there. A player outside the XI always has.
 */
export function slotCovered(w: World, player: Player) {
  const xi = ownStarters(w),
    slot = xi.findIndex((p) => p.id === player.id);
  if (slot < 0) return true;
  const place = formationOf(w.tactic)[slot]!,
    level = slotOvr(player, place, ownMultiplier(player)),
    starters = new Set(xi.map((p) => p.id));
  return activePlayers(w).some(
    (other) =>
      !starters.has(other.id) &&
      !other.loanUntil &&
      slotOvr(other, place, ownMultiplier(other)) >= level - COVER_MARGIN,
  );
}
/** How far below a starter's 실효 OVR at his slot a bench player may be and still cover it. */
export const COVER_MARGIN = 3;
/**
 * An offer for one of our players was declined — by the owner, the 단장, his stance or by lapse
 * (→CLUB-27): from a bigger club (a higher division, or the same division and a higher
 * reputation) and of at least his value, an ambitious player may resent it.
 */
function resent(w: World, bid: TransferBid, p: Player | undefined) {
  if (!p || p.status !== 'active' || !bid.club) return;
  const club = w.clubs.find((c) => c.id === bid.club),
    own = clubOf(w);
  if (!club) return;
  const bigger =
    club.tier < own.tier || (club.tier === own.tier && club.reputation > own.reputation);
  if (bigger && BigInt(bid.fee) >= BigInt(playerValue(w, p)))
    ambitionAfterDecline(w, p, bid.id, club.name);
}
/** The most bids a save keeps (the save schema's bound). */
const BID_LIMIT = 200;
/**
 * Closed bids beyond the history kept are dropped, oldest first, except the open window's own: they
 * are whom the 단장 asked in it, never asked again in the window (→CLUB-33), so they stay while it
 * is open, within the save's bound.
 */
function pruneBids(w: World) {
  const bids = w.bids;
  if (!bids) return;
  const day = currentDay(w),
    window = transferWindow(w, day),
    days = transferWindowDays(w.year),
    opening = !window.open
      ? undefined
      : day <= days.summerClose
        ? days.summerOpen
        : days.winterOpen,
    current = (b: TransferBid) =>
      opening !== undefined && b.direction === 'out' && b.year === w.year && b.day >= opening;
  const closed = bids.filter((b) => !isOpen(b)),
    older = closed.filter((b) => !current(b)),
    over = Math.max(older.length - CLOSED_BID_HISTORY, bids.length - BID_LIMIT, 0);
  if (!over) return;
  const drop = new Set([...older, ...closed.filter(current)].slice(0, over));
  w.bids = bids.filter((b) => !drop.has(b));
}
/** Each day: answer due bids, receive other clubs' offers, open/close windows. */
export function dailyMarket(w: World, settleNpc = true): void {
  if (settleNpc) npcMarket(w);
  const day = currentDay(w),
    window = transferWindow(w, day);
  announceWindows(w, day);
  settleBids(w, window.open);
  if (window.open && forcedSales(w.distress)) handoverSales(w, true);
  if (window.open) {
    forceDistressSales(w);
    incomingBid(w, day, window.until!);
    listedOffers(w, day, window.until!);
    // With transfers delegated the 단장 looks for players (→CLUB-33).
    staffSignings(w);
  }
  closeNpcWindow(w);
  pruneBids(w);
}

/** Preserve live external negotiations and their original terms/due dates on handover. */
export function handoverRecruitment(w: World, delegated: boolean) {
  for (const bid of w.bids || []) {
    if (bid.direction !== 'out' || !isOpen(bid)) continue;
    if (!delegated) {
      delete bid.staff;
      continue;
    }
    bid.staff ??= 'short';
    if (bid.status !== 'countered') continue;
    const offer = marketOffer(w, bid);
    if (!offer?.available || !transferWindow(w).open || !bid.counterFee) {
      expire(
        w,
        bid,
        offer?.player.name || sourceMessage('copy.EventCenter.42bd764e17'),
        sourceMessage('copy.transfers.30aac47a5f'),
      );
      continue;
    }
    answerStaffCounter(w, bid, offer, askingFee(offer, bid.loan));
  }
}
export function handoverSales(w: World, forcedOnly = false) {
  for (const bid of w.bids || []) {
    if (bid.direction !== 'in' || bid.status !== 'pending') continue;
    const player = activePlayers(w).find((p) => p.id === bid.playerId),
      club = w.clubs.find((c) => c.id === bid.club);
    if (
      !player ||
      !club ||
      bid.year !== w.year ||
      bid.due < currentDay(w) ||
      !transferWindow(w).open
    )
      continue;
    if (
      forcedOnly &&
      (!forcedSales(w.distress) ||
        BigInt(bid.fee) < distressSaleFee(BigInt(playerValue(w, player))))
    )
      continue;
    answerIncoming(w, bid, player, club, playerValue(w, player), bid.fee);
  }
}
