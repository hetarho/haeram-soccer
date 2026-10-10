import type { Club, Player, TransferBid, World } from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { currentDay, SEASON_END_DAY, seasonDayLabel, seasonDayOf } from './calendar';
import { clamp, compareIds, hash, integer, random, ratio } from './primitives';
import { activePlayers, addEvent, clubOf, overall, quote, selectedLineup } from './world';
import { CASH_WARNING_ROUNDS, credit, debit, transferOffers } from './operations';
import { operatingCosts } from './finance';
import { fixedCostRunway } from './investment';
import { staffEffects } from './staff';
import { managerStyleEffects } from './styles';
import { visionEffects } from './vision';
import { pushInbox } from './inbox';

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
 * What another club would consider fair for one of our players: the direct sale price
 * plus a bounded premium for unrealised potential in players aged 23 or younger.
 */
export function playerValue(w: World, player: Player): string {
  const base = Math.max(10, (overall(player) - 25) * 5);
  const age = w.year - player.born;
  const premium =
    age <= 23
      ? Math.min(
          base,
          Math.max(0, player.potential - overall(player)) * 1.5 * (1 + (23 - age) * 0.15),
        )
      : 0;
  return quote(clubOf(w).country, w.year, base + premium);
}
/** Compact money text for inbox records, matching the UI's currency notation. */
export function moneyLabel(w: World, amount: string) {
  const c = currency(clubOf(w).country, w.year),
    n = BigInt(amount),
    sign = n < 0n ? '−' : '',
    abs = n < 0n ? -n : n;
  const group = (v: bigint) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (c.code === 'GBP-LSD')
    return `${sign}£${group(abs / 240n)} ${(abs % 240n) / 12n}s ${abs % 12n}d`;
  const units = BigInt(c.units);
  return `${sign}${c.symbol}${group(abs / units)}${c.units === 100 ? '.' + String(abs % units).padStart(2, '0') : ''}`;
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
function marketOffer(w: World, bid: TransferBid) {
  return transferOffers(w, bid.year).find((o) => o.player.id === bid.playerId);
}
function askingFee(offer: ReturnType<typeof transferOffers>[number], loan?: boolean) {
  return loan ? offer.loanFee : offer.fee;
}
function signingBlocker(
  w: World,
  offer: ReturnType<typeof transferOffers>[number] | undefined,
  fee: string,
) {
  if (!offer?.available) return '이미 계약했거나 없는 선수입니다.';
  if (activePlayers(w).length >= SQUAD_LIMIT) return '선수단 정원은 26명입니다.';
  if (BigInt(w.cash) < BigInt(fee)) return '보유 자금이 부족합니다.';
  return undefined;
}
function completeSigning(
  w: World,
  bid: TransferBid,
  offer: ReturnType<typeof transferOffers>[number],
  fee: string,
) {
  const p = offer.player;
  debit(w, fee);
  if (bid.loan) p.loanUntil = w.year + 1;
  w.players.push(p);
  addEvent(
    w,
    'transfer-in',
    `${p.name} ${bid.loan ? '임대' : '영입'}`,
    `${p.role} · ${w.year - p.born}세 · 연봉 ${p.wage} · 계약 ${p.until}년 · 협상 타결`,
    fee,
  );
  bid.status = 'completed';
}
function saleBlocker(w: World, p: Player | undefined) {
  if (!p || p.status !== 'active' || p.loanUntil) return '매각 가능한 선수가 아닙니다.';
  const active = activePlayers(w);
  if (
    active.length <= SQUAD_MINIMUM ||
    (p.role === 'GK' && active.filter((x) => x.role === 'GK').length <= 1)
  )
    return '최소 선수단과 골키퍼를 유지해야 합니다.';
  return undefined;
}
function completeSale(w: World, bid: TransferBid, p: Player) {
  const club = w.clubs.find((c) => c.id === bid.club);
  p.status = 'sold';
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
export function placeBid(w: World, candidate: number, fee: string, loan = false): void {
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
  const day = currentDay(w),
    window = transferWindow(w, day),
    id = bidId('out', w, day, offer.player.id, `${w.revision}:`),
    wait = integer(random(`${w.seed}:bid-due:${id}`), 2, 4);
  const bid: TransferBid = {
    id,
    direction: 'out',
    playerId: offer.player.id,
    fee,
    ...(loan ? { loan: true } : {}),
    year: w.year,
    day,
    due: Math.min(day + wait, window.until ?? day + wait),
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  addEvent(
    w,
    'transfer-bid',
    `${offer.player.name} ${loan ? '임대' : '영입'} 제안`,
    `${offer.player.role} · ${w.year - offer.player.born}세 · 제안 ${moneyLabel(w, fee)} · 요구액 ${moneyLabel(w, askingFee(offer, loan))} · ${seasonDayLabel(w.year, bid.due)}까지 답변`,
  );
  // On deadline day the selling club answers at once, so the owner can still reply to a counter.
  if (bid.due <= day) decideOutgoing(w, bid);
}
/** Owner answer to a selling club's counter offer or to another club's bid for our player. */
export function respondBid(w: World, id: string, accept: boolean): void {
  const bid = (w.bids || []).find((b) => b.id === id);
  if (!bid) throw new Error('없는 이적 제안입니다.');
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
    if (accept) {
      assertTransferWindow(w);
      const p = w.players.find((x) => x.id === bid.playerId),
        blocker = saleBlocker(w, p);
      if (blocker) throw new Error(blocker);
      completeSale(w, bid, p!);
    } else bid.status = 'rejected';
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
  const offers = new Map<number, ReturnType<typeof transferOffers>>();
  const offersOf = (year: number) => {
    if (!offers.has(year)) offers.set(year, transferOffers(w, year));
    return offers.get(year)!;
  };
  return (w.bids || [])
    .map((bid, index) => {
      const offer =
        bid.direction === 'out'
          ? offersOf(bid.year).find((o) => o.player.id === bid.playerId)
          : undefined;
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
            ((bid.direction === 'out' && bid.status === 'countered' && !!offer?.available) ||
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
  if (opening && !already('window-open'))
    pushInbox(w, {
      kind: 'window-open',
      title: `${WINDOW_INFO[opening].name} 개장`,
      detail: `${WINDOW_INFO[opening].deadline}까지 이적료가 있는 영입·임대·매각과 협상을 진행할 수 있어요. 다른 구단의 제안도 들어옵니다.`,
      attention: true,
    });
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
    if (blocker) {
      bid.status = 'rejected';
      pushInbox(w, {
        kind: 'bid-response',
        title: clip(`${p.name} ${move} 무산`, 160),
        detail: `상대 구단은 ${moneyLabel(w, bid.fee)} 제안을 받아들였지만 마무리하지 못했어요. ${blocker}`,
        attention: true,
        ref: bid.id,
      });
      return;
    }
    completeSigning(w, bid, offer, bid.fee);
    pushInbox(w, {
      kind: 'bid-response',
      title: clip(`${p.name} ${move} 완료`, 160),
      detail: `${p.role} · ${w.year - p.born}세 · ${moneyLabel(w, bid.fee)} 제안이 받아들여졌어요.`,
      attention: true,
      ref: bid.id,
    });
  } else if (feeShare >= 0.7 && feeShare <= 1 && roll < chance + (1 - chance) * 0.7) {
    bid.status = 'countered';
    bid.counterFee = ratio(asking, BigInt(integer(r, 110, 125)), 100n);
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
      detail: `우리 제안 ${moneyLabel(w, bid.fee)} · 요구액 ${moneyLabel(w, asking)}. 더 높은 금액으로 다시 제안할 수 있어요.`,
      attention: true,
      ref: bid.id,
    });
  }
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
      else if (!open || today > bid.due)
        expire(w, bid, p.name, '답변 기한이 지나 제안이 만료됐어요.');
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
    base = prospect ? 200 : 130,
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
  if (runway < CASH_WARNING_ROUNDS) cut(20, '운영자금 위기');
  else if (runway < 30) cut(10, '운영자금 빠듯');
  return { percent: Math.max(SALE_BAR_FLOOR, percent), base, prospect, cuts };
}
const SALE_BAR_FLOOR = 80;
/** "유망주 기준 200%" or "기준 95%(130%에서 31세 −15%p · …)" for the staff report. */
function saleBarLabel(bar: ReturnType<typeof saleBar>) {
  const steps = [...bar.cuts, ...(bar.percent === SALE_BAR_FLOOR ? ['최저 80%'] : [])];
  return `${bar.prospect ? '유망주 기준' : '기준'} ${bar.percent}%${steps.length ? `(${bar.base}%에서 ${steps.join(' · ')})` : ''}`;
}
function incomingBid(w: World, day: number, until: number) {
  const pending = (w.bids || []).filter((b) => b.direction === 'in' && b.status === 'pending');
  if (pending.length >= MAX_PENDING_INCOMING) return;
  const r = random(`${w.seed}:incoming:${w.year}:${day}`);
  const vision = visionEffects(w);
  if (r() >= INCOMING_BID_CHANCE * vision.incomingBids) return;
  const wanted = new Set(pending.map((b) => b.playerId));
  const pool = activePlayers(w)
    .filter((p) => !p.loanUntil && !wanted.has(p.id) && !saleBlocker(w, p))
    .sort((a, b) => compareIds(a.id, b.id));
  const own = clubOf(w);
  const bidders = w.clubs
    .filter(
      (c) =>
        c.country === own.country && !c.representative && c.id !== own.id && c.tier <= own.tier,
    )
    .sort((a, b) => compareIds(a.id, b.id));
  if (!pool.length || !bidders.length) return;
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
  const club = bidders[integer(r, 0, bidders.length - 1)],
    value = playerValue(w, player),
    fee = ratio(value, BigInt(Math.round(integer(r, 90, 160) * vision.saleFee)), 100n);
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
  const age = w.year - player.born,
    summary = `${player.role} · ${age}세 · 능력 ${overall(player)} · 평가 가치 ${moneyLabel(w, value)}`;
  if (w.delegation?.transfers) {
    const starters = new Set(
      selectedLineup(activePlayers(w), w.lineup, w.manager, w.year).map((p) => p.id),
    );
    // A starter leaves only when an ageing player has a ready bench replacement in his role.
    const covered = activePlayers(w).some(
      (other) =>
        other.id !== player.id &&
        other.role === player.role &&
        !starters.has(other.id) &&
        !other.loanUntil &&
        overall(other) >= overall(player) - 3,
    );
    const bar = saleBar(w, player),
      offered = Number((BigInt(fee) * 100n) / BigInt(value)),
      premium = BigInt(fee) * 100n >= BigInt(value) * BigInt(bar.percent),
      starter = starters.has(player.id),
      expendable = !starter || (age >= 30 && covered),
      blocker = saleBlocker(w, player);
    const accept = premium && expendable && !blocker;
    const against = `평가 가치의 ${offered}%로 ${saleBarLabel(bar)}`;
    if (accept) completeSale(w, bid, player);
    else bid.status = 'rejected';
    pushInbox(w, {
      kind: 'staff-report',
      title: clip(
        `스태프가 ${club.name}의 ${player.name} 제안(${moneyLabel(w, fee)})을 ${accept ? '수락' : '거절'}했어요`,
        160,
      ),
      detail: `${summary} · ${
        accept
          ? `제안이 ${against}를 넘어 매각했어요.${starter ? ' 같은 포지션에 대신 뛸 선수가 있어요.' : ''}`
          : blocker
            ? blocker
            : !premium
              ? `제안이 ${against}에 못 미쳐 거절했어요.`
              : '대체할 선수가 없는 주전이라 남기기로 했어요.'
      }`,
      attention: false,
      ref: bid.id,
    });
    return;
  }
  pushInbox(w, {
    kind: 'incoming-bid',
    title: clip(`${club.name}이(가) ${player.name}에게 ${moneyLabel(w, fee)} 제안`, 160),
    detail: `${summary} · ${seasonDayLabel(w.year, bid.due)}까지 수락하거나 거절하세요.`,
    attention: true,
    ref: bid.id,
  });
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
  if (window.open) incomingBid(w, day, window.until!);
  pruneBids(w);
}
