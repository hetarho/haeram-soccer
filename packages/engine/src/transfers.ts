import { movePerson } from './npc-continuity';
import type { Club, Player, TransferBid, TransferStance, World } from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { currentDay, SEASON_END_DAY, seasonDayLabel, seasonDayOf } from './calendar';
import { clamp, compareIds, hash, integer, random, ratio } from './primitives';
import {
  activePlayers,
  addEvent,
  clubOf,
  formationOf,
  overall,
  ownMultiplier,
  ownStarters,
  slotOvr,
} from './world';
import { ambitionAfterDecline, leaveContract, marketValue, signingClauses } from './contracts';
import { credit, debit } from './transactions';
import { transferOffers } from './ops-squad';
import { financeStance } from './direction';
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Daily chance that another club bids for one of our players while a window is open. */
export const INCOMING_BID_CHANCE = 0.06;
const MAX_PENDING_INCOMING = 3;
const INCOMING_RESPONSE_DAYS = 5;
const SQUAD_LIMIT = 26;
const SQUAD_MINIMUM = 14;
/** Resolved bids kept for the record; open negotiations are never pruned. */
const CLOSED_BID_HISTORY = 60;
export const WINDOW_INFO = {
  summer: { name: '여름 이적시장', deadline: '9월 1일', opening: '시즌 종료 직후' },
  winter: { name: '겨울 이적시장', deadline: '2월 1일', opening: '1월 1일' },
} as const;

export interface TransferWindowState {
  open: boolean;
  /** The current window while open, or the next window to open while closed. */
  kind?: 'summer' | 'winter';
  label: string;
  /** Season day of the deadline while open, or of the next opening while closed. */
  until?: number;
  daysLeft?: number;
}
function daysInSeason(year: number) {
  return (Date.UTC(year + 1, 7, 1) - Date.UTC(year, 7, 1)) / DAY_MS;
}
/** Season days of each window boundary; no window spans the season rollover. */
export function transferWindowDays(year: number) {
  return {
    /** The summer window opens on the first day of the season that follows the final round. */
    summerOpen: 0,
    summerClose: seasonDayOf(year, 9, 1),
    winterOpen: seasonDayOf(year, 1, 1),
    winterClose: seasonDayOf(year, 2, 1),
    /** The day this season closes, when the next summer window opens. */
    seasonClose: SEASON_END_DAY + 1,
  };
}
const dLabel = (days: number) => (days === 0 ? 'D-day' : `D-${days}`);
/** Summer from the season close to 1 September and winter 1 January–1 February. */
export function transferWindow(w: World, day = currentDay(w)): TransferWindowState {
  const d = transferWindowDays(w.year);
  const open = (kind: 'summer' | 'winter', until: number): TransferWindowState => ({
    open: true,
    kind,
    label: `${WINDOW_INFO[kind].name} · ${WINDOW_INFO[kind].deadline} 마감 · ${dLabel(until - day)}`,
    until,
    daysLeft: until - day,
  });
  const closed = (kind: 'summer' | 'winter', until: number): TransferWindowState => ({
    open: false,
    kind,
    label: `이적시장 닫힘 · ${WINDOW_INFO[kind].opening} 개장 · ${dLabel(until - day)}`,
    until,
    daysLeft: until - day,
  });
  if (day <= d.summerClose) return open('summer', d.summerClose);
  if (day < d.winterOpen) return closed('winter', d.winterOpen);
  if (day <= d.winterClose) return open('winter', d.winterClose);
  return closed('summer', Math.max(day, d.seasonClose));
}
/** Fee-bearing moves need an open window; free agents sign at any time. */
export function assertTransferWindow(w: World, freeAgent = false): void {
  if (!freeAgent && !transferWindow(w).open)
    throw new Error('이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.');
}
/**
 * What another club would consider fair for a player: his market value (→CLUB-25), steeply
 * more for ability and a young player's promise, less with age, by the division (ours unless
 * given) and the football index.
 */
export function playerValue(w: World, player: Player, division?: number): string {
  return marketValue(w, player, division);
}

const isOpen = (bid: TransferBid) => bid.status === 'pending' || bid.status === 'countered';
/** Today's day counted from 1 August of `year`, so dues survive the season rollover. */
function dayInSeasonOf(w: World, year: number) {
  let day = currentDay(w);
  for (let y = year; y < w.year; y++) day += daysInSeason(y);
  return day;
}
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
type MarketOffer = ReturnType<typeof transferOffers>[number];
/**
 * The player and terms a bid was made for, whatever the list shows meanwhile (→CLUB-14); a bid
 * pending from before 1.15.0 has no `offer` and finds him in its season's list as it did then.
 */
function marketOffer(w: World, bid: TransferBid): MarketOffer | undefined {
  if (!bid.offer)
    return transferOffers(w, bid.year, true).find((o) => o.player.id === bid.playerId);
  const { player, fee, loanFee } = bid.offer;
  return {
    player,
    fee,
    loanFee,
    freeAgent: false,
    available: !w.players.some((owned) => owned.id === player.id),
  };
}
function askingFee(offer: MarketOffer, loan?: boolean) {
  return loan ? offer.loanFee : offer.fee;
}
function signingBlocker(w: World, offer: MarketOffer | undefined, fee: string) {
  if (!offer?.available) return '이미 계약했거나 없는 선수입니다.';
  if (activePlayers(w).length >= SQUAD_LIMIT) return '선수단 정원은 26명입니다.';
  if (BigInt(w.cash) < BigInt(fee)) return '보유 자금이 부족합니다.';
  return undefined;
}
function completeSigning(w: World, bid: TransferBid, offer: MarketOffer, fee: string) {
  // The bid keeps its record of him; the squad gets its own copy.
  const p = structuredClone(offer.player);
  debit(w, fee);
  // A loan keeps his club's contract; a transfer signs one with its own clauses (→CLUB-29).
  if (bid.loan) p.loanUntil = w.year + 1;
  else p.clauses = signingClauses(w, p);
  w.players.push(p);
  noteSigning(w, p);
  addEvent(
    w,
    'transfer-in',
    `${p.name} ${bid.loan ? '임대' : '영입'}`,
    `${p.position} · ${w.year - p.born}세 · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${p.until}년 · 협상 타결`,
    fee,
  );
  bid.status = 'completed';
}
function saleBlocker(w: World, p: Player | undefined) {
  if (!p || p.status !== 'active' || p.loanUntil) return '매각 가능한 선수가 아닙니다.';
  const active = activePlayers(w);
  if (
    active.length <= SQUAD_MINIMUM ||
    (p.position === 'GK' && active.filter((x) => x.position === 'GK').length <= 1)
  )
    return '최소 선수단과 골키퍼를 유지해야 합니다.';
  return undefined;
}
function completeSale(w: World, bid: TransferBid, p: Player) {
  const club = w.clubs.find((c) => c.id === bid.club);
  p.status = 'sold';
  delete p.stance;
  // His sale ends his talk, his unhappiness and his transfer request (→CLUB-27).
  leaveContract(w, p);
  movePerson(w, p, club?.id, true);
  credit(w, bid.fee);
  addEvent(
    w,
    'transfer-out',
    `${p.name}의 새로운 도전`,
    `${club ? `${club.name} 이적` : '매각'} · 개인 경력 기록은 보존됩니다.`,
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
  candidate: number,
  fee: string,
  loan = false,
  staff?: TransferBid['staff'],
): void {
  const offer = transferOffers(w)[candidate];
  if (!offer?.available) throw new Error('이미 계약했거나 없는 선수입니다.');
  if (offer.freeAgent) throw new Error('자유계약 선수는 이적료 협상 없이 바로 영입할 수 있어요.');
  if (
    (w.bids || []).some((b) => b.direction === 'out' && b.playerId === offer.player.id && isOpen(b))
  )
    throw new Error('이 선수와는 이미 협상 중이에요. 기존 제안의 답을 먼저 확인하세요.');
  assertTransferWindow(w);
  if (activePlayers(w).length >= SQUAD_LIMIT) throw new Error('선수단 정원은 26명입니다.');
  if (typeof fee !== 'string' || !/^\d{1,80}$/.test(fee) || BigInt(fee) < 1n)
    throw new Error('제안 금액을 확인하세요.');
  if (BigInt(w.cash) < BigInt(fee)) throw new Error('보유 자금이 부족합니다.');
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
    offer: { player: offer.player, fee: offer.fee, loanFee: offer.loanFee },
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
    `${offer.player.name} ${loan ? '임대' : '영입'} 제안`,
    `${offer.player.position} · ${w.year - offer.player.born}세 · 제안 ${moneyLabel(w, fee)} · 요구액 ${moneyLabel(w, askingFee(offer, loan))} · ${seasonDayLabel(w.year, bid.due)}까지 답변`,
  );
  // On deadline day the selling club answers at once, so the owner can still reply to a counter.
  if (bid.due <= day) decideOutgoing(w, bid);
}
/** Owner answer to a selling club's counter offer or to another club's bid for our player. */
export function respondBid(w: World, id: string, accept: boolean): void {
  const bid = (w.bids || []).find((b) => b.id === id);
  if (!bid) throw new Error('없는 이적 제안입니다.');
  if (bid.staff) throw new Error('단장의 제안은 단장이 답해요.');
  if (bid.direction === 'out' && bid.status === 'countered') {
    if (accept) {
      assertTransferWindow(w);
      const offer = marketOffer(w, bid),
        fee = bid.counterFee || bid.fee,
        blocker = signingBlocker(w, offer, fee);
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
  } else throw new Error('응답할 수 있는 이적 제안이 아닙니다.');
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
export function bidOutlook(w: World, candidate: number, fee: string, loan = false): BidOutlook {
  const offer = transferOffers(w)[candidate];
  const asking = offer ? askingFee(offer, loan) : '0';
  const valid =
    !!offer?.available && !offer.freeAgent && /^\d{1,80}$/.test(fee) && BigInt(fee) >= 1n;
  const chance = valid ? Math.round(acceptanceChance(w, fee, asking) * 100) / 100 : 0;
  const r = valid ? feeRatio(fee, asking) : 0;
  return {
    chance,
    label: chance >= 0.6 ? '높음' : chance >= 0.35 ? '보통' : '낮음',
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
  const offers = new Map<number, MarketOffer[]>();
  const offersOf = (year: number) => {
    if (!offers.has(year)) offers.set(year, transferOffers(w, year, true));
    return offers.get(year)!;
  };
  return (w.bids || [])
    .map((bid, index) => {
      const offer =
        bid.direction !== 'out'
          ? undefined
          : bid.offer
            ? marketOffer(w, bid)
            : offersOf(bid.year).find((o) => o.player.id === bid.playerId);
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
      title: `${WINDOW_INFO[opening].name} 개장`,
      detail: `${WINDOW_INFO[opening].deadline}까지 이적료가 있는 영입·임대·매각과 협상을 진행할 수 있어요. 다른 구단의 제안도 들어옵니다.`,
      attention: true,
    });
    // The chief scout lists candidates and the manager asks before the window's first day of
    // business (→CLUB-33).
    openShortlistWindow(w);
    if (isDelegated(w, 'sales')) staffStances(w);
  }
  // The day after a window closes the manager's requests at its opening are judged (→CLUB-33).
  if (day === d.summerClose + 1 || day === d.winterClose + 1) judgeRequests(w);
  const closing = day === d.summerClose ? 'summer' : day === d.winterClose ? 'winter' : undefined;
  if (closing && !already('window-close'))
    pushInbox(w, {
      kind: 'window-close',
      title: `${WINDOW_INFO[closing].name} 마감일`,
      detail:
        '오늘이 마지막 날이에요. 남은 협상은 오늘 안에 답하세요. 내일부터는 자유계약 선수만 영입할 수 있어요.',
      attention: false,
    });
}
function expire(w: World, bid: TransferBid, name: string, reason: string) {
  bid.status = 'expired';
  // The earlier request can no longer be answered, so it stops asking for attention.
  markRelatedRead(w, bid.id);
  pushInbox(w, {
    kind: 'staff-report',
    title: clip(`${name} ${bid.direction === 'out' ? '협상' : '제안'} 종료`, 160),
    detail: reason,
    attention: false,
    ref: bid.id,
  });
}
function decideOutgoing(w: World, bid: TransferBid) {
  const offer = marketOffer(w, bid);
  if (!offer?.available) {
    expire(w, bid, offer?.player.name || '영입 대상', '선수가 다른 길을 택해 협상이 끝났어요.');
    return;
  }
  const p = offer.player,
    asking = askingFee(offer, bid.loan),
    move = bid.loan ? '임대' : '영입';
  const r = random(`${w.seed}:bid:${bid.id}`),
    roll = r(),
    chance = acceptanceChance(w, bid.fee, asking),
    feeShare = feeRatio(bid.fee, asking);
  if (roll < chance) {
    const blocker = signingBlocker(w, offer, bid.fee);
    // The 단장's bids are his to follow up; their answers only report (→CLUB-33).
    const attention = !bid.staff;
    if (blocker) {
      bid.status = 'rejected';
      pushInbox(w, {
        kind: 'bid-response',
        title: clip(`${p.name} ${move} 무산`, 160),
        detail: `상대 구단은 ${moneyLabel(w, bid.fee)} 제안을 받아들였지만 마무리하지 못했어요. ${blocker}`,
        attention,
        ref: bid.id,
      });
      return;
    }
    completeSigning(w, bid, offer, bid.fee);
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(`${p.name} ${move} 완료`, 160),
      detail: `${p.position} · ${w.year - p.born}세 · ${moneyLabel(w, bid.fee)} 제안이 받아들여졌어요.${bid.staff ? ' 단장의 제안이에요.' : ''}`,
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
      title: clip(`${p.name} 측 역제안 ${moneyLabel(w, bid.counterFee)}`, 160),
      detail: `우리 제안 ${moneyLabel(w, bid.fee)} · 요구액 ${moneyLabel(w, asking)}. 이적시장이 닫히기 전에 수락하거나 거절하세요.`,
      attention: true,
      ref: bid.id,
    });
  } else {
    bid.status = 'rejected';
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(`${p.name} ${move} 제안 거절`, 160),
      detail: bid.staff
        ? `단장의 제안 ${moneyLabel(w, bid.fee)} · 요구액 ${moneyLabel(w, asking)}. 다음에 다른 선수를 찾아요.`
        : `우리 제안 ${moneyLabel(w, bid.fee)} · 요구액 ${moneyLabel(w, asking)}. 더 높은 금액으로 다시 제안할 수 있어요.`,
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
    blocker = signingBlocker(w, offer, fee),
    accept = verdict.ok && !blocker;
  if (accept) completeSigning(w, bid, offer, fee);
  else bid.status = 'rejected';
  pushInbox(w, {
    kind: 'bid-response',
    title: clip(
      `${p.name} 측 역제안 ${moneyLabel(w, fee)} · 단장이 ${accept ? '수락' : '거절'}`,
      160,
    ),
    detail: `단장의 제안 ${moneyLabel(w, bid.fee)} · 요구액 ${moneyLabel(w, asking)} · ${accept ? verdict.reason : (blocker ?? verdict.reason)}`,
    attention: false,
    ref: bid.id,
  });
}
function settleBids(w: World, open: boolean) {
  const code = clubOf(w).country;
  for (const bid of w.bids || []) {
    if (!isOpen(bid)) continue;
    const today = dayInSeasonOf(w, bid.year);
    if (bid.year !== w.year && currency(code, bid.year).code !== w.currency) {
      expire(w, bid, '이적', '화폐 단위가 바뀌어 이전 금액의 협상이 끝났어요.');
    } else if (bid.direction === 'out') {
      const signed = w.players.find((x) => x.id === bid.playerId);
      if (signed) expire(w, bid, signed.name, '이미 우리 선수가 되어 협상을 정리했어요.');
      else if (!open)
        expire(
          w,
          bid,
          marketOffer(w, bid)?.player.name || '영입 대상',
          '이적시장이 닫혀 협상이 끝났어요.',
        );
      else if (bid.status === 'pending' && today >= bid.due) decideOutgoing(w, bid);
    } else {
      const p = w.players.find((x) => x.id === bid.playerId);
      if (!p || p.status !== 'active')
        expire(w, bid, p?.name || '선수', '선수가 이미 팀을 떠나 제안이 끝났어요.');
      else if (!open || today > bid.due) {
        expire(w, bid, p.name, '답변 기한이 지나 제안이 만료됐어요.');
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
 * 130%, or 200% for a prospect, lowered for age, a contract near its end and a short cash runway,
 * never below 80%. Each cut is listed so the report can say why.
 */
export function saleBar(w: World, p: Player) {
  const age = w.year - p.born,
    // Contracts renew when the year turns, so 1 is the final season.
    seasons = p.until - w.year,
    runway = fixedCostRunway(w.cash, operatingCosts(w).annual),
    prospect = isProspect(w, p),
    base = SALE_BARS[w.build?.market ?? 'standard'][prospect ? 1 : 0],
    [first, second] = financeStance(w).sellSteps,
    cuts: string[] = [];
  let percent = base;
  const cut = (points: number, why: string) => {
    percent -= points;
    cuts.push(`${why} −${points}%p`);
  };
  if (age >= 33) cut(30, `${age}세`);
  else if (age >= 30) cut(15, `${age}세`);
  if (seasons <= 1) cut(20, '계약 마지막 시즌');
  else if (seasons === 2) cut(10, '계약 1년 남음');
  if (runway < first) cut(20, '운영자금 위기');
  else if (runway < second) cut(10, '운영자금 빠듯');
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
export const SALE_BARS: Readonly<Record<string, readonly [number, number]>> = {
  selling: [110, 160],
  showcase: [120, 180],
  standard: [130, 200],
  hardball: [150, 230],
  hold: [150, 250],
};
const SALE_BAR_FLOOR = 80;
/** "유망주 기준 200%" or "기준 95%(130%에서 31세 −15%p · …)" for the staff report. */
function saleBarLabel(bar: ReturnType<typeof saleBar>) {
  const steps = [...bar.cuts, ...(bar.percent === SALE_BAR_FLOOR ? ['최저 80%'] : [])];
  return `${bar.prospect ? '유망주 기준' : '기준'} ${bar.percent}%${steps.length ? `(${bar.base}%에서 ${steps.join(' · ')})` : ''}`;
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
  listed: { label: '이적 명단', tag: '적극 매도', event: '이적 명단 등록' },
  open: { label: '협상 가능', tag: '좋은 제안이면 검토', event: '협상 가능으로 전환' },
  untouchable: { label: '이적 불가', tag: '거액 제안만 검토', event: '이적 불가 선언' },
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
    if (market === 'selling' && age(p) >= 30) changes.push([p, 'listed', '매각 기조 셀링 클럽']);
    else if (sell && age(p) <= 21) changes.push([p, 'listed', '육성 목표 판매용 육성']);
  }
  if (market === 'hold')
    for (const p of candidates
      .filter((one) => starters.has(one.id) && !one.transferRequest)
      .sort((a, b) => overall(b) - overall(a) || compareIds(a.id, b.id))
      .slice(0, 3))
      changes.push([p, 'untouchable', '매각 기조 핵심 지키기']);
  if (!changes.length) return;
  for (const [p, stance] of changes) setTransferStance(w, p.id, stance);
  pushInbox(w, {
    kind: 'staff-report',
    title: `단장이 이적 상태 ${changes.length}건을 정했어요`,
    detail: changes
      .map(([p, stance, why]) => `${p.name} ${STANCE_INFO[stance].label}(${why})`)
      .join(' · ')
      .slice(0, 400),
    attention: false,
  });
}
export function setTransferStance(w: World, id: string, stance: TransferStance) {
  const p = w.players.find((x) => x.id === id && x.status === 'active');
  if (!p || p.loanUntil) throw new Error('이적 상태를 정할 수 있는 선수가 아닙니다.');
  if (!TRANSFER_STANCES.includes(stance)) throw new Error('이적 상태를 확인하세요.');
  if (p.retiring !== undefined) throw new Error('은퇴를 앞둔 선수는 이적 상태를 바꿀 수 없어요.');
  if (p.transferRequest && stance === 'untouchable')
    throw new Error('이적을 요청한 선수는 이적 불가로 둘 수 없어요.');
  if (transferStance(p) === stance) return;
  if (stance === 'open') delete p.stance;
  else p.stance = stance;
  const value = playerValue(w, p);
  addEvent(
    w,
    'transfer-list',
    `${p.name} ${STANCE_INFO[stance].event}`,
    stance === 'listed'
      ? `적극 매도 · 평가 가치 ${moneyLabel(w, value)} · 이적시장 기간에 실제 구단의 제안을 받아요.`
      : stance === 'untouchable'
        ? `평가 가치의 ${UNTOUCHABLE_BAR}%(${moneyLabel(w, ratio(value, BigInt(UNTOUCHABLE_BAR), 100n))}) 미만 제안은 바로 거절하고, 그 이상 거액 제안만 검토해요.`
        : `평가 가치 ${moneyLabel(w, value)} · 다른 구단의 제안을 검토해요.`,
  );
}
/**
 * The fee, as a percentage of value, at which delegated staff and the manager let an untouchable
 * player go, by the build's market card; keeping the core sells at no price.
 */
export const UNTOUCHABLE_PRICE = { standard: 200, selling: 150, showcase: 175, hardball: 225 };
/**
 * The staff and manager's answer to a big offer for an untouchable player when transfers are
 * delegated: the market card sets the price, a tight cash runway lowers it by 25 points, a cash
 * crisis sells, and the manager holds out 25 points longer for a starter nobody can replace.
 */
export function untouchableVerdict(w: World, offered: number, essential: boolean) {
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual),
    market = w.build?.market,
    card = cardOf(buildOf(w), 'market').label,
    [first, second] = financeStance(w).sellSteps;
  if (runway < first)
    return { accept: true, reason: `자금 여력 ${runway}주의 운영자금 위기라 매각을 택했어요.` };
  if (market === 'hold')
    return { accept: false, reason: `매각 기조가 ${card}라 어떤 금액에도 지키기로 했어요.` };
  const base = UNTOUCHABLE_PRICE[market ?? 'standard'],
    steps = [`매각 기조 ${card} ${base}%`];
  let bar = base;
  if (runway < second) {
    bar -= 25;
    steps.push('운영자금 빠듯 −25%p');
  }
  if (essential) {
    bar += 25;
    steps.push('감독이 대체할 선수가 없다며 반대 +25%p');
  }
  const accept = offered >= bar;
  return {
    accept,
    reason: `평가 가치의 ${offered}%로 기준 ${bar}%(${steps.join(' · ')})${accept ? '를 넘어 매각했어요.' : '에 못 미쳐 지키기로 했어요.'}`,
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
    const fee = offerFee(w, ratio(value, BigInt(Math.round(share * 1000)), 1000n));
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
    const summary = `${p.position} · ${w.year - p.born}세 · 능력 ${overall(p)} · 평가 가치 ${moneyLabel(w, value)}`;
    if (isDelegated(w, 'sales')) {
      answerIncoming(w, bid, p, club, value, fee);
      continue;
    }
    pushInbox(w, {
      kind: 'incoming-bid',
      title: clip(`${club.name}이(가) 이적 명단의 ${p.name}에게 ${moneyLabel(w, fee)} 제안`, 160),
      detail: `${summary} · ${seasonDayLabel(w.year, bid.due)}까지 수락하거나 거절하세요.`,
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
  const age = w.year - player.born,
    offered = Number((BigInt(fee) * 100n) / BigInt(value)),
    untouchable = player.stance === 'untouchable',
    summary = `${player.position} · ${age}세 · 능력 ${overall(player)} · 평가 가치 ${moneyLabel(w, value)}`;
  const report = (
    accept: boolean,
    detail: string,
    who = isDelegated(w, 'sales') ? '단장이' : '구단이',
  ) => {
    if (accept) completeSale(w, bid, player);
    else bid.status = 'rejected';
    pushInbox(w, {
      kind: 'staff-report',
      title: clip(
        `${who} ${club.name}의 ${player.name} 제안(${moneyLabel(w, fee)})을 ${accept ? '수락' : '거절'}했어요`,
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
    report(
      false,
      `이적 불가 선수예요. 제안이 평가 가치의 ${offered}%로 기준 ${UNTOUCHABLE_BAR}%에 못 미쳐 바로 거절했어요.`,
    );
    return;
  }
  if (isDelegated(w, 'sales')) {
    if (player.stance === 'listed') {
      const blocker = saleBlocker(w, player);
      report(!blocker, blocker || '이적 명단에 오른 선수라 매각했어요.');
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
        `이적 불가 선수의 거액 제안 · ${blocker || verdict.reason}`,
        '감독과 상의한 단장이',
      );
      return;
    }
    const bar = saleBar(w, player),
      premium = BigInt(fee) * 100n >= BigInt(value) * BigInt(bar.percent),
      expendable = saleAllowed(w, starter, age, covered);
    const accept = premium && expendable && !blocker;
    const against = `평가 가치의 ${offered}%로 ${saleBarLabel(bar)}`;
    report(
      accept,
      accept
        ? `제안이 ${against}를 넘어 매각했어요.${starter ? ' 같은 포지션에 대신 뛸 선수가 있어요.' : ''}`
        : blocker
          ? blocker
          : !premium
            ? `제안이 ${against}에 못 미쳐 거절했어요.`
            : '대체할 선수가 없는 주전이라 남기기로 했어요.',
    );
    return;
  }
  pushInbox(w, {
    kind: 'incoming-bid',
    title: clip(
      `${club.name}이(가) ${player.name}에게 ${moneyLabel(w, fee)} ${untouchable ? '거액 ' : ''}제안`,
      160,
    ),
    detail: `${summary}${untouchable ? ` · 이적 불가 선수지만 평가 가치의 ${offered}%라 구단주의 확인이 필요해요` : ''} · ${seasonDayLabel(w.year, bid.due)}까지 수락하거나 거절하세요.`,
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
      expire(w, bid, offer?.player.name || '영입 대상', '현재 완료할 수 없는 협상이에요.');
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
