import { message as sourceMessage } from '../../contracts/src/messages';
import { SALE_BARS } from './transfer-policy';
import { worldMarketOffer } from './world-market';
import { openNeed, windowCallUps } from './replacements';
import { bidCeiling, haggling } from './director-bidding';
import { registrationRoom } from './registration';
import { endPlayingCoachForDeparture, playingCoachDepartureCost } from './playing-coach';
import { movePerson } from './npc-continuity';
import type {
  Club,
  Player,
  ScoutOffer,
  TransferBid,
  TransferStance,
  World,
  WorldMarketTarget,
} from '../../contracts/src/types';
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
import { applyDelegatePlans, wagePressure } from './delegation';
import { SAFETY_ROUNDS } from './delegation-info';
import { moneyLabel, operatingCosts } from './finance';
import { fixedCostRunway } from './investment';
import { staffEffects } from './staff';
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

/** Daily chance that another club bids for one of our players while a window is open. */
const INCOMING_BID_CHANCE = 0.06;
const MAX_PENDING_INCOMING = 3;
const INCOMING_RESPONSE_DAYS = 5;
const SQUAD_MINIMUM = 14;
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
function acceptanceChance(w: World, fee: string, asking: string) {
  return clamp(
    0.35 +
      (feeRatio(fee, asking) - 1) * 1.2 +
      staffEffects(w).bidAcceptance +
      managerStyleEffects(w).bidAcceptance +
      (clubOf(w).reputation - 40) / 400,
    0.05,
    0.95,
  );
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
    // Older pinned offers may lack the returning player's own academy qualification.
    player: current?.player.graduate ? { ...player, graduate: true } : player,
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
  const room = registrationRoom(w, {
    ...offer.player,
    joined: w.year,
    ...(loan ? { loanUntil: w.year + 1 } : {}),
  });
  if (room) return room;
  if (BigInt(w.cash) < BigInt(fee)) return sourceMessage('copy.playing_coach.8791d586e5');
  return undefined;
}
function completeSigning(w: World, bid: TransferBid, offer: MarketOffer, fee: string) {
  // The bid keeps its record of him; the squad gets its own copy.
  const p = structuredClone(offer.player);
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
    if (w.players[prior].graduate) p.graduate = true;
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
function completeSale(w: World, bid: TransferBid, p: Player) {
  const club = w.clubs.find((c) => c.id === bid.club);
  if (BigInt(w.cash) + BigInt(bid.fee) < BigInt(playingCoachDepartureCost(w, p.id)))
    throw new Error(sourceMessage('copy.transfers.4c1042837b'));
  const wasStarter = ownStarters(w).some((starter) => starter.id === p.id);
  credit(w, bid.fee);
  endPlayingCoachForDeparture(w, p.id);
  p.status = 'sold';
  delete p.stance;
  // His sale ends his talk, his unhappiness and his transfer request (→CLUB-27).
  leaveContract(w, p);
  movePerson(w, p, club?.id, true);
  if (wasStarter || activePlayers(w).length < 20) openNeed(w, p);
  const fact = recordTransfer(w, {
    direction: 'out',
    loan: false,
    player: p,
    club: bid.club,
    fee: bid.fee,
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
    bid.fee,
  );
  bid.status = 'completed';
}
function markRelatedRead(w: World, id: string) {
  if (w.inbox?.some((item) => item.ref === id && !item.read))
    w.inbox = w.inbox.map((item) => (item.ref === id ? { ...item, read: true } : item));
}
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Our offer for a market player; the selling club answers in two to four days. */
export function placeBid(
  w: World,
  candidate: number | WorldMarketTarget,
  fee: string,
  loan = false,
  staff?: TransferBid['staff'],
): void {
  const scouted = typeof candidate === 'number' ? transferOffers(w)[candidate] : undefined;
  const offer = typeof candidate === 'number' ? scouted : worldMarketOffer(w, candidate);
  if (!offer?.available) throw new Error(sourceMessage('copy.ops_squad.c94b14b4dc'));
  if (offer.freeAgent) throw new Error(sourceMessage('copy.transfers.79ea9f1dde'));
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
  };
  w.bids = [...(w.bids || []), bid];
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
      completeSigning(w, bid, offer!, fee);
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
export interface BidOutlook {
  /** Rounded acceptance probability, 0.05–0.95. */
  chance: number;
  label: '높음' | '보통' | '낮음';
  asking: string;
  /** Whether a refusal may come back as a counter offer (70–100% of asking). */
  counterPossible: boolean;
}
/** Read model for the bid form; never a guarantee. */
export function bidOutlook(
  w: World,
  candidate: number | WorldMarketTarget,
  fee: string,
  loan = false,
): BidOutlook {
  const offer =
    typeof candidate === 'number' ? transferOffers(w)[candidate] : worldMarketOffer(w, candidate);
  const asking = offer ? askingFee(offer, loan) : '0';
  const valid =
    !!offer?.available && !offer.freeAgent && /^\d{1,80}$/.test(fee) && BigInt(fee) >= 1n;
  const chance = valid ? Math.round(acceptanceChance(w, fee, asking) * 100) / 100 : 0;
  const r = valid ? feeRatio(fee, asking) : 0;
  return {
    chance,
    label:
      chance >= 0.6
        ? sourceMessage('copy.player.5327dee9ab')
        : chance >= 0.35
          ? sourceMessage('copy.teamState.666599febd')
          : sourceMessage('copy.player.9f07b9bc5f'),
    asking,
    counterPossible: valid && r >= 0.7 && r <= 1,
  };
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
    move = bid.loan ? sourceMessage('team.loan') : sourceMessage('copy.areas.60be4d7b53');
  const r = random(`${w.seed}:bid:${bid.id}`),
    roll = r(),
    chance = acceptanceChance(w, bid.fee, asking),
    feeShare = feeRatio(bid.fee, asking);
  if (roll < chance) {
    const financial = bid.staff ? signingVerdict(w, p, bid.fee) : undefined;
    const blocker =
      financial && !financial.ok ? financial.reason : signingBlocker(w, offer, bid.fee, bid.loan);
    // The 단장's bids are his to follow up; their answers only report (→CLUB-33).
    const attention = !bid.staff;
    if (blocker) {
      bid.status = 'rejected';
      pushInbox(w, {
        kind: 'bid-response',
        title: clip(sourceMessage('copy.transfers.138ea75077', { p0: p.name, p1: move }), 160),
        detail: sourceMessage('copy.transfers.6b0ecd8998', {
          p0: moneyLabel(w, bid.fee),
          p1: blocker,
        }),
        attention,
        ref: bid.id,
      });
      return;
    }
    completeSigning(w, bid, offer, bid.fee);
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(sourceMessage('copy.transfers.4bd8c1ff7d', { p0: p.name, p1: move }), 160),
      detail: sourceMessage('copy.transfers.500d09e6f8', {
        p0: p.position,
        p1: w.year - p.born,
        p2: moneyLabel(w, bid.fee),
        p3: bid.staff ? sourceMessage('copy.transfers.fba4d72f3f') : '',
      }),
      attention,
      ref: bid.id,
    });
  } else if (feeShare >= 0.7 && feeShare <= 1 && roll < chance + (1 - chance) * 0.7) {
    bid.status = 'countered';
    bid.counterFee = ratio(asking, BigInt(integer(r, 110, 125)), 100n);
    if (bid.staff) {
      answerStaffCounter(w, bid, offer, asking);
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
      detail: sourceMessage('copy.transfers.4806c94809', {
        p0: moneyLabel(w, bid.fee),
        p1: moneyLabel(w, asking),
      }),
      attention: true,
      ref: bid.id,
    });
  } else {
    bid.status = 'rejected';
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(sourceMessage('copy.transfers.9f030caf7e', { p0: p.name, p1: move }), 160),
      detail: bid.staff
        ? sourceMessage('copy.transfers.328d32d40e', {
            p0: moneyLabel(w, bid.fee),
            p1: moneyLabel(w, asking),
          })
        : sourceMessage('copy.transfers.964210f510', {
            p0: moneyLabel(w, bid.fee),
            p1: moneyLabel(w, asking),
          }),
      attention: !bid.staff,
      ref: bid.id,
    });
  }
}
/**
 * The 단장 answers a counter to his own bid at once (→CLUB-33, →STAFF-20): he accepts while it still
 * passes 재정 기조's money checks, else declines; the report says which and why.
 */
function answerStaffCounter(w: World, bid: TransferBid, offer: MarketOffer, asking: string) {
  const p = offer.player,
    fee = bid.counterFee!,
    verdict = signingVerdict(w, p, fee),
    blocker = signingBlocker(w, offer, fee, bid.loan),
    belowCeiling = BigInt(bid.fee) < BigInt(ratio(asking, BigInt(bidCeiling(w)), 100n)),
    bargaining = haggling(w) && belowCeiling,
    accept = !bargaining && verdict.ok && !blocker;
  if (accept) completeSigning(w, bid, offer, fee);
  else bid.status = bargaining || (verdict.ok && !blocker) ? 'rejected' : 'expired';
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
    detail: sourceMessage('copy.transfers.4a233f3fc1', {
      p0: moneyLabel(w, bid.fee),
      p1: moneyLabel(w, asking),
      p2: Math.round(feeRatio(bid.fee, asking) * 100),
      p3: bargaining
        ? sourceMessage('copy.transfers.c294c4e9ad')
        : accept
          ? verdict.reason
          : (blocker ?? verdict.reason),
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
/** A young player with room to grow: the staff hold out for 200% of value (→CLUB-18). */
export const PROSPECT_AGE = 22;
export const PROSPECT_GROWTH = 8;
export function isProspect(w: World, p: Player) {
  return w.year - p.born <= PROSPECT_AGE && p.potential - overall(p) >= PROSPECT_GROWTH;
}
/**
 * The lowest fee, as a percentage of value, delegated staff accept for a player (→CLUB-18):
 * 130%, or 200% for a prospect, lowered for age, a contract near its end, a wage bill past the
 * 단장's sales lines (`wagePressure`) and a cash crisis (`SAFETY_ROUNDS`), never below 80%. Each cut
 * is listed so the report can say why.
 */
export function saleBar(w: World, p: Player) {
  const age = w.year - p.born,
    // Contracts renew when the year turns, so 1 is the final season.
    seasons = p.until - w.year,
    runway = fixedCostRunway(w.cash, operatingCosts(w).annual),
    prospect = isProspect(w, p),
    base = SALE_BARS[w.build?.market ?? 'standard'][prospect ? 1 : 0],
    pressure = wagePressure(w),
    cuts: string[] = [];
  let percent = base;
  const cut = (points: number, why: string) => {
    percent -= points;
    cuts.push(`${why} −${points}%p`);
  };
  if (age >= 33) cut(30, sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: age }));
  else if (age >= 30) cut(15, sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: age }));
  if (seasons <= 1) cut(20, sourceMessage('copy.transfers.53f9e38caf'));
  else if (seasons === 2) cut(10, sourceMessage('copy.transfers.d8bb752fd6'));
  if (runway < SAFETY_ROUNDS) cut(20, sourceMessage('copy.transfers.c1074e3430'));
  else if (pressure.level)
    cut(
      pressure.level === 2 ? 20 : 10,
      sourceMessage('delegation.sale.wages', { share: pressure.share }),
    );
  return { percent: Math.max(SALE_BAR_FLOOR, percent), base, prospect, cuts };
}
/**
 * Whether the delegated staff may sell this player at all (→CLUB-18): a non-starter, or a starter
 * aged 30+ with a bench player of his role within 3 ability — never a starter under 핵심 지키기.
 */
export function saleAllowed(w: World, starter: boolean, age: number, covered: boolean) {
  return !starter || (w.build?.market !== 'hold' && age >= 30 && covered);
}
/**
 * The sale bar's base by the 매각 기조 card (→CLUB-18), of value and for a prospect: the club's
 * stance on selling sets how good an offer must be before the staff take it.
 */
export { SALE_BARS } from './transfer-policy';
const SALE_BAR_FLOOR = 80;
/** "유망주 기준 200%" or "기준 95%(130%에서 31세 −15%p · …)" for the staff report. */
function saleBarLabel(bar: ReturnType<typeof saleBar>) {
  const steps = [
    ...bar.cuts,
    ...(bar.percent === SALE_BAR_FLOOR ? [sourceMessage('copy.transfers.c7f5debdf7')] : []),
  ];
  return `${bar.prospect ? sourceMessage('copy.transfers.bd0e2a77d1') : sourceMessage('copy.LabPage.eaea55bff6')} ${bar.percent}%${steps.length ? sourceMessage('copy.transfers.06ddab0099', { p0: bar.base, p1: steps.join(' · ') }) : ''}`;
}
/**
 * A club that would buy `p`: one whose level suits him (from 4 below to 12 above his ability),
 * the stronger ones more often, from any country. Weaker players go to smaller clubs.
 */
export function suitorFor(w: World, p: Player, r: () => number): Club | undefined {
  const ability = overall(p);
  const pool = w.clubs
    .filter(
      (c) =>
        c.id !== w.playerClub &&
        c.strength >= ability - 4 &&
        c.strength <= ability + 12 &&
        !(c.representative && !c.id.startsWith('euro:') && ability >= 45),
    )
    .sort((a, b) => compareIds(a.id, b.id));
  if (!pool.length) return undefined;
  const weights = pool.map((c) => 1 + Math.max(0, c.strength - ability + 4) / 4);
  let target = r() * weights.reduce((sum, v) => sum + v, 0);
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i];
    if (target < 0) return pool[i];
  }
  return pool[pool.length - 1];
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
 * delegated: the market card sets the price, a wage bill past the 단장's second sales line lowers
 * it by 25 points, a cash crisis sells, and the manager holds out 25 points longer for a starter
 * nobody can replace.
 */
export function untouchableVerdict(w: World, offered: number, essential: boolean) {
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual),
    market = w.build?.market,
    card = cardOf(buildOf(w), 'market').label,
    pressure = wagePressure(w);
  if (runway < SAFETY_ROUNDS)
    return { accept: true, reason: sourceMessage('copy.transfers.838216488c', { p0: runway }) };
  if (market === 'hold')
    return { accept: false, reason: sourceMessage('copy.transfers.57ffab38e3', { p0: card }) };
  const base = UNTOUCHABLE_PRICE[market ?? 'standard'],
    steps = [sourceMessage('copy.transfers.363d93e2b9', { p0: card, p1: base })];
  let bar = base;
  if (pressure.level === 2) {
    bar -= 25;
    steps.push(sourceMessage('delegation.sale.wagesUntouchable', { share: pressure.share }));
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
    const club = suitorFor(w, p, r);
    if (!club) continue;
    const value = playerValue(w, p),
      share =
        (LISTED_OFFER.low + r() * (LISTED_OFFER.high - LISTED_OFFER.low)) * buildEffects(w).saleFee;
    const fee = offerFee(w, scaleBy(value, share, 1000n));
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
    const summary = sourceMessage('copy.transfers.0a9e8d6e85', {
      p0: p.position,
      p1: w.year - p.born,
      p2: overall(p),
      p3: moneyLabel(w, value),
    });
    if (isDelegated(w, 'sales')) {
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
  const club = suitorFor(w, player, r);
  if (!club) return;
  const value = playerValue(w, player),
    fee = offerFee(w, ratio(value, BigInt(Math.round(integer(r, 90, 160) * build.saleFee)), 100n));
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
  const report = (
    accept: boolean,
    detail: string,
    who: string = isDelegated(w, 'sales')
      ? sourceMessage('copy.transfers.e744d7026d')
      : sourceMessage('copy.transfers.1654d061b5'),
  ) => {
    if (
      accept &&
      BigInt(w.cash) + BigInt(bid.fee) < BigInt(playingCoachDepartureCost(w, player.id))
    ) {
      accept = false;
      detail = sourceMessage('copy.transfers.7017097137');
    }
    if (accept) completeSale(w, bid, player);
    else bid.status = 'rejected';
    pushInbox(w, {
      kind: 'staff-report',
      title: clip(
        sourceMessage('copy.transfers.9cee38f04c', {
          p0: who,
          p1: club.name,
          p2: player.name,
          p3: moneyLabel(w, fee),
          p4: accept
            ? sourceMessage('copy.RecruitmentDesk.831defcf7a')
            : sourceMessage('copy.EventCenter.cc6314d04d'),
        }),
        160,
      ),
      detail: `${summary} · ${detail}`,
      attention: false,
      ref: bid.id,
    });
    if (!accept) resent(w, bid, player);
  };
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
    const starters = new Set(ownStarters(w).map((p) => p.id));
    // A starter leaves only with a bench player ready to play his slot (→CLUB-24).
    const covered = slotCovered(w, player);
    const starter = starters.has(player.id),
      blocker = saleBlocker(w, player);
    if (untouchable) {
      const verdict = untouchableVerdict(w, offered, starter && !covered);
      report(
        verdict.accept && !blocker,
        sourceMessage('copy.transfers.88db755e4b', { p0: blocker || verdict.reason }),
        sourceMessage('copy.transfers.bac92950ec'),
      );
      return;
    }
    const bar = saleBar(w, player),
      premium = BigInt(fee) * 100n >= BigInt(value) * BigInt(bar.percent),
      expendable = saleAllowed(w, starter, age, covered);
    const accept = premium && expendable && !blocker;
    const against = sourceMessage('copy.transfers.4107e9b5df', {
      p0: offered,
      p1: saleBarLabel(bar),
    });
    report(
      accept,
      accept
        ? sourceMessage('copy.transfers.b9bf12065d', {
            p0: against,
            p1: starter ? sourceMessage('copy.transfers.f145fa2aab') : '',
          })
        : blocker
          ? blocker
          : !premium
            ? sourceMessage('copy.transfers.18f8d5571f', { p0: against })
            : sourceMessage('copy.transfers.efb4411288'),
    );
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
function pruneBids(w: World) {
  const bids = w.bids;
  if (!bids) return;
  const closed = bids.filter((b) => !isOpen(b));
  if (closed.length <= CLOSED_BID_HISTORY) return;
  const drop = new Set(closed.slice(0, closed.length - CLOSED_BID_HISTORY));
  w.bids = bids.filter((b) => !drop.has(b));
}
/** Each day: answer due bids, receive other clubs' offers, open/close windows. */
export function dailyMarket(w: World): void {
  const day = currentDay(w),
    window = transferWindow(w, day);
  announceWindows(w, day);
  settleBids(w, window.open);
  if (window.open) {
    incomingBid(w, day, window.until!);
    listedOffers(w, day, window.until!);
    // With transfers delegated the 단장 looks for players (→CLUB-33).
    staffSignings(w);
  }
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
export function handoverSales(w: World) {
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
    answerIncoming(w, bid, player, club, playerValue(w, player), bid.fee);
  }
}
