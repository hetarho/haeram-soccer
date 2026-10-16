import { SQUAD_TARGET } from './squad-size';
import { registration, registrationRoom } from './registration';
import { detectMediations, resolveDelegatedMediations } from './mediation';
import { careerDate } from './person-careers';
import { movePerson } from './npc-continuity';
import type {
  Line,
  Player,
  Position,
  SigningRequest,
  TransferBid,
  World,
} from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { LINE_MINIMUM, lineOf, POSITION_LABEL } from './player';
import { currentDay, ROUND_INTERVAL_DAYS, SEASON_ROUNDS } from './calendar';
import { MARKET_REFRESH_ROUNDS } from './managerMarket';
import { clamp, compareIds, ratio } from './primitives';
import {
  activePlayers,
  addEvent,
  joinClub,
  lineOfPlayer,
  overall,
  formationOf,
  ownStarters,
  slotOvr,
  unhappyPenalty,
} from './world';
import { directionOption, financeStance } from './direction';
import { moneyLabel, operatingCosts, recentRevenue, wageBill } from './finance';
import { financeProjection } from './projection';
import { signingClauses } from './contracts';
import { pushInbox } from './inbox';
import { isDelegated } from './responsibilities';
import { isForeignCandidate, transferOffers, squadCommand } from './ops-squad';
import { POLICY_INFO, policyOf } from './policy';
import { placeBid, transferWindow, transferWindowDays } from './transfers';

/**
 * The 단장's signings with transfers delegated (→CLUB-33, →STAFF-20): what a squad must hold before he
 * looks for upgrades, and how often he looks while a window is open.
 */
export const SIGNING_CONFIG = {
  lookDays: 7,
  lineMinimum: LINE_MINIMUM,
  squadMinimum: SQUAD_TARGET,
  /** He looks for upgrades only while the squad has at most this many players. */
  upgradeSquad: 24,
  /** Candidates the chief scout lists per line. */
  shortlistPerLine: 3,
  /** A shortlisted candidate must beat a slot's starter there by this much to be requested. */
  requestMargin: 5,
  /** The level a candidate must play a slot's position at to fit it: 준수 (→PLAYER-4). */
  fitLevel: 2,
  requestLimit: 3,
  /** Trust a manager loses when a window closes with none of his requests met. */
  unmetTrust: 3,
};
const LINE_NAME: Readonly<Record<Line, string>> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
};

type Offer = ReturnType<typeof transferOffers>[number];
/**
 * Why the 단장 wants a player: a short role, or an upgrade over a starter; `requested` when the
 * manager asked for the role (→CLUB-33).
 */
export type SigningNeed = (
  | { kind: 'short'; line: Line; count: number; minimum: number; squad: number }
  | {
      kind: 'upgrade';
      line: Line;
      slot: number;
      position: Position;
      starter: Player;
      level: number;
      margin: number;
    }
) & { requested?: SigningRequest };
/** A request in words: the line it asks for, or the formation slot's position. */
export const requestLabel = (request: Pick<SigningRequest, 'line' | 'position'>) =>
  request.position ? `${POSITION_LABEL[request.position]} 자리` : LINE_NAME[request.line];
/** Whether a player fits a slot request: he plays its position at 준수 or better (→CLUB-33). */
const playsAt = (p: Player, position: Position) =>
  (p.positions[position] ?? 0) >= SIGNING_CONFIG.fitLevel;
/** What a player would be worth at a formation slot: OVR there × his level, adaptation left out. */
const atSlot = (w: World, p: Player, slot: number) => slotOvr(p, formationOf(w.tactic)[slot]!);
/** Whether a joining player meets a request (→CLUB-33): his line for a short one, else the slot's position. */
export const meetsRequest = (request: SigningRequest, p: Player) =>
  request.position ? playsAt(p, request.position) : request.line === lineOfPlayer(p);

const isOpen = (bid: TransferBid) => bid.status === 'pending' || bid.status === 'countered';
/** The opening day of the window open on `day`. */
function windowOpening(w: World, day: number) {
  const d = transferWindowDays(w.year);
  return day <= d.summerClose ? d.summerOpen : d.winterOpen;
}
/** The bids of this window, the owner's and the 단장's. */
function windowBids(w: World, day: number) {
  const opening = windowOpening(w, day);
  return (w.bids || []).filter(
    (bid) => bid.direction === 'out' && bid.year === w.year && bid.day >= opening,
  );
}

type ShortNeed = Extract<SigningNeed, { kind: 'short' }>;
/**
 * Every short role in role order: fewer than its minimum, or, with the squad under 20 and every
 * role at its minimum, the role furthest below its share of a 20-player squad.
 */
export function shortLines(w: World): ShortNeed[] {
  const squad = activePlayers(w),
    count = (line: Line) => squad.filter((p) => lineOfPlayer(p) === line).length,
    need = (line: Line): ShortNeed => ({
      kind: 'short',
      line,
      count: count(line),
      minimum: SIGNING_CONFIG.lineMinimum[line],
      squad: squad.length,
    });
  const short = LINES.filter((line) => count(line) < SIGNING_CONFIG.lineMinimum[line]);
  if (short.length) return short.map(need);
  if (squad.length >= SIGNING_CONFIG.squadMinimum) return [];
  return [
    need(
      [...LINES].sort(
        (a, b) =>
          count(a) - SIGNING_CONFIG.lineMinimum[a] - (count(b) - SIGNING_CONFIG.lineMinimum[b]),
      )[0]!,
    ),
  ];
}
/** The first short line, if any. */
export function shortLine(w: World): ShortNeed | undefined {
  return shortLines(w)[0];
}

/**
 * 재정 기조's checks on a signing (→ECON-33): the fee within its share of the cash above the
 * runway, and with his wage the runway, the wage bill ceiling and the season's cash projection.
 */
export function signingVerdict(w: World, player: Player, fee: string) {
  const stance = financeStance(w),
    finance = directionOption(w, 'finance').name,
    perRound = (BigInt(operatingCosts(w).annual) + BigInt(player.wage)) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(stance.runway),
    spare = BigInt(w.cash) - runway,
    cap = spare > 0n ? ratio(spare.toString(), BigInt(stance.signing.feeShare * 100), 100n) : '0';
  const no = (reason: string) => ({
    ok: false as const,
    reason: `${reason}(재정 기조 ${finance})`,
  });
  if (spare < BigInt(fee))
    return no(`이적료를 내면 운영자금이 ${stance.runway}라운드 운영비에 못 미쳐요`);
  if (BigInt(fee) > BigInt(cap))
    return no(
      `이적료 ${moneyLabel(w, fee)}가 여유 자금의 ${Math.round(stance.signing.feeShare * 100)}%(${moneyLabel(w, cap)})를 넘어요`,
    );
  const bill = BigInt(wageBill(w)) + BigInt(player.wage),
    revenue = recentRevenue(w),
    share = Math.round(stance.wageShare * 100);
  if (bill * 100n > BigInt(revenue) * BigInt(share))
    return no(
      `연봉을 더하면 연간 인건비 ${moneyLabel(w, bill.toString())}가 최근 12개월 수입 ${moneyLabel(w, revenue)}의 ${share}%를 넘어요`,
    );
  const cash = w.cash;
  w.players.push(player);
  w.cash = (BigInt(cash) - BigInt(fee)).toString();
  let seasonEnd: string;
  try {
    seasonEnd = financeProjection(w).seasonEnd.low;
  } finally {
    w.players.pop();
    w.cash = cash;
  }
  if (BigInt(seasonEnd) < runway)
    return no(
      `시즌 말 자금 전망(낮게 잡아 ${moneyLabel(w, seasonEnd)})이 ${stance.runway}라운드 운영비에 못 미쳐요`,
    );
  return {
    ok: true as const,
    reason: `이적료는 여유 자금의 ${Math.round(stance.signing.feeShare * 100)}% 안, 인건비는 수입의 ${share}% 안(재정 기조 ${finance})`,
  };
}

/** The need in words, with the row behind it and the manager's request when it is one. */
export function needLine(w: World, need: SigningNeed) {
  const asked = need.requested ? `감독 요청 ${requestLabel(need.requested)} · ` : '';
  if (need.kind === 'short')
    return (
      asked +
      (need.count < need.minimum
        ? `${LINE_NAME[need.line]}가 ${need.count}명뿐이라 ${need.minimum}명을 채워요`
        : `선수단이 ${need.squad}명뿐이라 ${SIGNING_CONFIG.squadMinimum}명을 채워요`)
    );
  return `${asked}${POSITION_LABEL[need.position]} 자리 주전 ${need.starter.name}(그 자리 OVR ${Math.round(need.level)})보다 그 자리에서 ${need.margin} 이상 나은 선수를 찾아요(재정 기조 ${directionOption(w, 'finance').name})`;
}
/** " · 감독이 고른 선수" when the 단장 moves for the manager's pick. */
const pickNote = (need: SigningNeed, player: Player) =>
  need.requested?.pick === player.id ? ' · 감독이 고른 선수' : '';
const recruitmentLine = (w: World) =>
  `영입 기조 ${POLICY_INFO.recruitment.levels[policyOf(w).recruitment - 1].name}`;

/** Free agents first, then by ability, potential and id. */
const byCandidate = (a: Offer, b: Offer) =>
  Number(b.freeAgent) - Number(a.freeAgent) ||
  overall(b.player) - overall(a.player) ||
  b.player.potential - a.player.potential ||
  compareIds(a.player.id, b.player.id);
/**
 * The candidates for a need (→CLUB-33): the manager's pick, then the rest of the shortlist, then
 * the market list, each free agents first, then by ability, potential and id.
 */
function candidates(w: World, offers: Offer[], need: SigningNeed, tried: Set<string>) {
  const listed = new Set(shortlistOffers(w).map(({ offer }) => offer.player.id)),
    pick = need.requested?.pick,
    rank = (offer: Offer) => (offer.player.id === pick ? 0 : listed.has(offer.player.id) ? 1 : 2);
  return offers
    .map((offer, index) => ({ offer, index }))
    .filter(
      ({ offer }) =>
        offer.available &&
        !registrationRoom(w, { ...offer.player, joined: w.year }) &&
        !offer.player.loanUntil &&
        !tried.has(offer.player.id) &&
        (need.kind === 'short'
          ? lineOfPlayer(offer.player) === need.line
          : playsAt(offer.player, need.position) &&
            atSlot(w, offer.player, need.slot) >= need.level + need.margin),
    )
    .sort((a, b) => rank(a.offer) - rank(b.offer) || byCandidate(a.offer, b.offer));
}

/** Existing suitability/availability ordering for a logical manager request. */
export function requestCandidates(w: World, request: SigningRequest) {
  const day = currentDay(w),
    tried = new Set(windowBids(w, day).map((bid) => bid.playerId));
  const starter = request.slot === undefined ? undefined : ownStarters(w)[request.slot];
  const need: SigningNeed =
    request.kind === 'upgrade' && starter && request.slot !== undefined && request.position
      ? {
          kind: 'upgrade',
          line: request.line,
          slot: request.slot,
          position: request.position,
          starter,
          level: atSlot(w, starter, request.slot),
          margin: SIGNING_CONFIG.requestMargin,
          requested: request,
        }
      : {
          kind: 'short',
          line: request.line,
          count: 0,
          minimum: SIGNING_CONFIG.lineMinimum[request.line],
          squad: activePlayers(w).length,
          requested: request,
        };
  if (request.kind === 'upgrade' && need.kind !== 'upgrade') return [];
  return candidates(w, transferOffers(w), need, tried);
}
/** The market list's candidates that are still on it and free to join, best first per role. */
function listable(w: World) {
  return transferOffers(w)
    .map((offer, index) => ({ offer, index }))
    .filter(({ offer }) => offer.available && !offer.player.loanUntil);
}
/**
 * The shortlist as it stands (→CLUB-33): this season's entries still on the market list and free
 * to join, in their order, with their index in the list.
 */
export function shortlistOffers(w: World) {
  const s = w.shortlist;
  if (!s || s.year !== w.year) return [];
  const offers = listable(w);
  return s.entries.flatMap((entry) =>
    offers.filter(({ offer }) => offer.player.id === entry.playerId),
  );
}
/** This season's requests, each pick kept only while that player is still shortlisted. */
export function signingRequests(w: World): SigningRequest[] {
  const s = w.shortlist;
  if (!s || s.year !== w.year) return [];
  const listed = new Set(shortlistOffers(w).map(({ offer }) => offer.player.id));
  return s.requests.map(({ pick, ...request }) =>
    pick && listed.has(pick) ? { ...request, pick } : request,
  );
}
/**
 * The manager's pick among the shortlisted who fit a request (→CLUB-33): the ablest (at the slot,
 * for a slot request), then potential; a 육성형 manager or one with the youth trait the highest
 * potential aged 23 or under first.
 */
function managerPick(w: World, listed: Offer[], request: Omit<SigningRequest, 'pick'>) {
  const pool = listed.filter((offer) => meetsRequest(request, offer.player));
  const ability = (p: Player) =>
    request.slot === undefined ? overall(p) : Math.round(atSlot(w, p, request.slot));
  const youngFirst = w.manager.style === 'developer' || w.manager.trait === 'youth';
  const young = youngFirst
    ? pool
        .filter((offer) => w.year - offer.player.born <= 23)
        .sort(
          (a, b) =>
            b.player.potential - a.player.potential ||
            ability(b.player) - ability(a.player) ||
            compareIds(a.player.id, b.player.id),
        )[0]
    : undefined;
  return (
    young ??
    [...pool].sort(
      (a, b) =>
        ability(b.player) - ability(a.player) ||
        b.player.potential - a.player.potential ||
        compareIds(a.player.id, b.player.id),
    )[0]
  )?.player.id;
}
/**
 * The manager's requests (→CLUB-33): every short line, then the slot of his formation whose starter
 * a shortlisted candidate who plays its position at 준수 or better beats by the most there (OVR at
 * the slot × level, adaptation left out), when by 5 or more; at most three, each with his pick.
 * An interim asks for nothing.
 */
function managerRequests(w: World, listed: Offer[]): SigningRequest[] {
  if (w.manager.interim) return [];
  const requests: Omit<SigningRequest, 'pick'>[] = shortLines(w).map(({ line }) => ({
    line,
    kind: 'short',
  }));
  const slots = formationOf(w.tactic);
  let upgrade: { slot: number; by: number } | undefined;
  for (const starter of lineStarters(w)) {
    const position = slots[starter.slot]!.position;
    if (requests.some((request) => request.line === starter.line)) continue;
    for (const offer of listed) {
      if (!playsAt(offer.player, position)) continue;
      const by = atSlot(w, offer.player, starter.slot) - starter.value;
      if (by >= SIGNING_CONFIG.requestMargin && (!upgrade || by > upgrade.by))
        upgrade = { slot: starter.slot, by };
    }
  }
  if (upgrade) {
    const position = slots[upgrade.slot]!.position;
    requests.push({ line: lineOf(position), kind: 'upgrade', slot: upgrade.slot, position });
  }
  return requests.slice(0, SIGNING_CONFIG.requestLimit).map((request) => {
    const pick = managerPick(w, listed, request);
    return pick ? { ...request, pick } : request;
  });
}
/**
 * The chief scout's draw (→CLUB-33), on a window's opening day and after every 4th league round:
 * up to three candidates per role from the market list as 영입's rows shape it, free agents first,
 * then by ability, potential and id, with the manager's requests. A window's requests stay as
 * they were at its opening.
 */
export function drawShortlist(w: World) {
  const offers = listable(w).map(({ offer }) => offer);
  const listed = LINES.flatMap((line) =>
    offers
      .filter((offer) => lineOfPlayer(offer.player) === line)
      .sort(byCandidate)
      .slice(0, SIGNING_CONFIG.shortlistPerLine),
  );
  const window = w.shortlist?.window;
  w.shortlist = {
    year: w.year,
    day: currentDay(w),
    entries: listed.map((offer) => ({
      playerId: offer.player.id,
      line: lineOfPlayer(offer.player),
    })),
    requests: managerRequests(w, listed),
    ...(window ? { window } : {}),
  };
}
/**
 * When the chief scout draws next (→CLUB-33): the winter window's opening or the next 4th league
 * round, whichever comes first, else the next season's first day.
 */
export function nextShortlistDraw(w: World): { year: number; day: number } {
  const day = currentDay(w),
    round = (Math.floor(w.round / MARKET_REFRESH_ROUNDS) + 1) * MARKET_REFRESH_ROUNDS,
    days = [
      transferWindowDays(w.year).winterOpen,
      ...(round <= SEASON_ROUNDS ? [round * ROUND_INTERVAL_DAYS] : []),
    ].filter((next) => next > day);
  return days.length ? { year: w.year, day: Math.min(...days) } : { year: w.year + 1, day: 0 };
}
/** A window opens: the chief scout draws, and the requests become the window's (→CLUB-33). */
export function openShortlistWindow(w: World) {
  drawShortlist(w);
  const s = w.shortlist!;
  delete s.window;
  if (s.requests.length)
    s.window = {
      year: w.year,
      opening: s.day,
      manager: w.manager.id,
      // The window keeps what was asked, not the picks.
      requests: s.requests.map((request) => {
        const asked = { ...request };
        delete asked.pick;
        return asked;
      }),
    };
}
/**
 * A player joined the squad: he starts to settle (→PLAYER-11), and a request he fits is met for the
 * window (→CLUB-33): a short line's, or a slot's whose position he plays at 준수 or better.
 */
export function noteSigning(w: World, player: Player) {
  movePerson(w, player, w.playerClub, true, player.loanUntil);
  (w.recruitmentArrivals ??= []).push({
    player: player.id,
    name: player.name,
    position: player.position,
    positions: { ...player.positions },
    at: careerDate(w),
  });
  joinClub(player, isForeignCandidate(player.id) ? 'abroad' : 'domestic', w.year);
  const window = w.shortlist?.window;
  if (
    window &&
    window.year === w.year &&
    window.requests.some((request) => meetsRequest(request, player))
  )
    window.met = true;
}
/**
 * The day after a window closes (→CLUB-33, →STAFF-5): the manager whose requests saw no player of
 * a requested role join in the window loses 3 trust, whoever held transfers, and the inbox says
 * so; a met request gains nothing.
 */
export function judgeRequests(w: World) {
  const s = w.shortlist,
    window = s?.window;
  if (!s || !window) return;
  delete s.window;
  const m = w.manager;
  if (window.year !== w.year || window.met || !window.requests.length || window.manager !== m.id)
    return;
  m.trust = clamp(m.trust - SIGNING_CONFIG.unmetTrust);
  pushInbox(w, {
    kind: 'staff-report',
    title: `${m.name} 감독의 영입 요청이 채워지지 않았어요`,
    detail: `이적시장이 열릴 때 요청한 ${window.requests.map(requestLabel).join('·')}에 맞는 선수가 아무도 오지 않았어요 · 감독 신뢰 −${SIGNING_CONFIG.unmetTrust}(지금 ${m.trust})`,
    attention: false,
  });
}

/**
 * The XI with each starter's slot, line and OVR where he plays: the formation slot's position and
 * role, at his level there, adaptation left out (→CLUB-33).
 */
function lineStarters(w: World) {
  const slots = formationOf(w.tactic);
  return ownStarters(w).map((p, i) => ({
    p,
    slot: i,
    line: lineOf(slots[i]!.position),
    value: slotOvr(p, slots[i]!) + unhappyPenalty(p),
  }));
}
/** The upgrade needs (→CLUB-33): every outfield and keeper slot, the weakest starter there first. */
function upgradeNeeds(w: World, margin: number): SigningNeed[] {
  const slots = formationOf(w.tactic);
  return lineStarters(w)
    .sort((a, b) => a.value - b.value || a.slot - b.slot)
    .map((starter) => ({
      kind: 'upgrade',
      line: starter.line,
      slot: starter.slot,
      position: slots[starter.slot]!.position,
      starter: starter.p,
      level: starter.value,
      margin,
    }));
}

/** A free agent joins at once on the market's terms, with his signing's clauses (→CLUB-29). */
function signFreeAgent(w: World, offer: Offer, need: SigningNeed, why: string) {
  const p = structuredClone(offer.player),
    day = currentDay(w);
  p.clauses = signingClauses(w, p);
  w.players.push(p);
  noteSigning(w, p);
  // The signing is kept as a completed staff bid, so the window's count sees it.
  w.bids = [
    ...(w.bids || []),
    {
      id: `out:${w.year}:${day}:staff:${p.id}`.slice(0, 100),
      direction: 'out',
      playerId: p.id,
      fee: '0',
      offer: { player: offer.player, fee: offer.fee, loanFee: offer.loanFee },
      year: w.year,
      day,
      due: day,
      status: 'completed',
      staff: need.kind,
    },
  ];
  addEvent(
    w,
    'transfer-in',
    `${p.name} 영입`,
    `${p.position} · ${w.year - p.born}세 · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${p.until}년 · 단장 영입`,
    '0',
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: `단장 영입 · 자유계약 ${p.name}`,
    detail:
      `${needLine(w, need)}${pickNote(need, offer.player)} · ${p.position} · ${w.year - p.born}세 · OVR ${overall(p)} · 연봉 ${moneyLabel(w, p.wage)} · ${recruitmentLine(w)} · ${why}`.slice(
        0,
        400,
      ),
    attention: false,
  });
}

/**
 * The 단장's look (→CLUB-33): with transfers delegated and a window open, on its opening
 * day and every 7th day after it, at most one move — a free agent signed or a bid at the asking
 * fee — for the first need a candidate meets within 재정 기조; none while one of his bids is open.
 * Short roles come before upgrades, and the manager's requested roles before the others.
 */
export function staffSignings(w: World) {
  const day = currentDay(w),
    window = transferWindow(w, day);
  if (!window.open || (day - windowOpening(w, day)) % SIGNING_CONFIG.lookDays !== 0) return;
  detectMediations(w);
  if (resolveDelegatedMediations(w)) return;
  if (!isDelegated(w, 'recruitment')) return;
  const bids = windowBids(w, day);
  if (bids.some((bid) => bid.staff && (isOpen(bid) || bid.day === day))) return;
  const squad = activePlayers(w).length;
  if (squad >= registration(w).ceiling) return;
  const stance = financeStance(w),
    upgrades = bids.filter(
      (bid) => bid.staff === 'upgrade' && (bid.status === 'completed' || isOpen(bid)),
    ).length,
    tried = new Set(bids.map((bid) => bid.playerId)),
    offers = transferOffers(w);
  const requests = signingRequests(w),
    short = shortLines(w),
    found: SigningNeed[] = short.length
      ? short
      : stance.signing.margin !== undefined &&
          upgrades < stance.signing.upgrades &&
          squad <= SIGNING_CONFIG.upgradeSquad
        ? upgradeNeeds(w, stance.signing.margin)
        : [];
  const needs = found
    .map((need) => {
      const requested = requests.find((request) =>
        need.kind === 'short'
          ? request.kind === 'short' && request.line === need.line
          : request.slot === need.slot,
      );
      return requested ? { ...need, requested } : need;
    })
    .map((need, order) => ({ need, order }))
    .sort((a, b) => Number(!a.need.requested) - Number(!b.need.requested) || a.order - b.order)
    .map(({ need }) => need);
  for (const need of needs)
    for (const { offer, index } of candidates(w, offers, need, tried)) {
      const fee = offer.freeAgent
        ? '0'
        : ratio(offer.fee, BigInt(Math.round(stance.signing.bid * 100)), 100n);
      const verdict = signingVerdict(w, offer.player, fee);
      if (!verdict.ok) continue;
      if (offer.freeAgent) signFreeAgent(w, offer, need, verdict.reason);
      else {
        placeBid(w, index, fee, false, need.kind);
        const bid = w.bids!.findLast((one) => one.playerId === offer.player.id)!;
        pushInbox(w, {
          kind: 'staff-report',
          title: `단장 영입 제안 · ${offer.player.name}`,
          detail:
            `${needLine(w, need)}${pickNote(need, offer.player)} · ${offer.player.position} · ${w.year - offer.player.born}세 · OVR ${overall(offer.player)} · 제안 ${moneyLabel(w, fee)} (요구액 ${moneyLabel(w, offer.fee)}) · ${recruitmentLine(w)} · ${verdict.reason}`.slice(
              0,
              400,
            ),
          attention: false,
          ref: bid.id,
        });
      }
      return;
    }
}

/** Start one real ordinary move for a mediated request; owner decisions retain owner spending permissions. */
export function pursueRequest(
  w: World,
  request: SigningRequest,
  person: string,
  actor: 'owner' | 'delegated',
) {
  const picked = requestCandidates(w, request).find(({ offer }) => offer.player.id === person);
  if (!picked || !transferWindow(w).open)
    return '현재 후보·이적시장·선수단 조건으로 진행할 수 없어요.';
  const day = currentDay(w),
    { offer, index } = picked;
  const room = registrationRoom(w, { ...offer.player, joined: w.year });
  if (room) return room;
  const fee = offer.freeAgent
    ? '0'
    : actor === 'owner'
      ? offer.fee
      : ratio(offer.fee, BigInt(Math.round(financeStance(w).signing.bid * 100)), 100n);
  if (actor === 'delegated') {
    if (
      (day - windowOpening(w, day)) % SIGNING_CONFIG.lookDays !== 0 ||
      windowBids(w, day).some((b) => b.staff && (isOpen(b) || b.day === day))
    )
      return '이번 주 영입 검토 또는 진행 중인 협상을 먼저 마쳐야 해요.';
    const verdict = signingVerdict(w, offer.player, fee);
    if (!verdict.ok) return verdict.reason;
    if (offer.freeAgent) {
      const starter = request.slot === undefined ? undefined : ownStarters(w)[request.slot];
      const need: SigningNeed =
        request.kind === 'upgrade' && starter && request.slot !== undefined && request.position
          ? {
              kind: 'upgrade',
              line: request.line,
              slot: request.slot,
              position: request.position,
              starter,
              level: atSlot(w, starter, request.slot),
              margin: SIGNING_CONFIG.requestMargin,
              requested: request,
            }
          : {
              kind: 'short',
              line: request.line,
              count: 0,
              minimum: SIGNING_CONFIG.lineMinimum[request.line],
              squad: activePlayers(w).length,
              requested: request,
            };
      signFreeAgent(w, offer, need, verdict.reason);
    } else placeBid(w, index, fee, false, request.kind);
  } else {
    if (BigInt(w.cash) < BigInt(fee)) return '보유 자금이 부족해요.';
    if (offer.freeAgent) squadCommand(w, { type: 'recruit', candidate: index });
    else placeBid(w, index, fee);
  }
  return undefined;
}
