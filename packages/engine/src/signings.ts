import { message as sourceMessage } from '../../contracts/src/messages';
import { closeNeedFor, openNeeds } from './replacements';
import { bidCeiling, directorTrait, staffBidShare } from './director-bidding';
import { SQUAD_TARGET } from './squad-size';
import { registration, registrationRoom } from './registration';
import { detectMediations, resolveDelegatedMediations } from './mediation';
import { careerDate, openEmployment, retainPerson } from './person-careers';
import { movePerson } from './npc-continuity';
import type {
  Line,
  Player,
  Position,
  ScoutOffer,
  SigningRequest,
  TransferBid,
  World,
  WorldMarketTarget,
} from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { LINE_MINIMUM, LINE_NAME, lineOf, POSITION_LABEL, requestLabel } from './player';
export { requestLabel } from './player';
import { currentDay, ROUND_INTERVAL_DAYS, SEASON_ROUNDS } from './calendar';
import { MARKET_REFRESH_ROUNDS } from './managerMarket';
import { clamp, compareIds, hash, random, ratio } from './primitives';
import {
  activePlayers,
  clubOf,
  lineOfPlayer,
  overall,
  formationOf,
  slotOvr,
  unhappyPenalty,
} from './player-state';
import { marketWageAt } from './market-prices';
import { addEvent } from './events';
import { joinClub, ownStarters } from './world';
import {
  delegatePlan,
  insolvencyStop,
  planLabel,
  runwayTest,
  spendingStance,
  type SpendingStance,
} from './delegation';
import { actedLevel, delegateOf, requestOf } from './delegation-info';
import {
  termsAnswer,
  termsChance,
  termsContext,
  WAGE_STEPS,
  type TermsContext,
} from './personal-terms';
import { moneyLabel } from './finance';
import { pushInbox } from './inbox';
import { isDelegated } from './responsibilities';
import { signFreeAgent, squadCommand } from './ops-squad';
import { isForeignCandidate, locateOffer, reachOffers, transferOffers } from './scout-search';
import { POLICY_INFO, policyOf } from './policy';
import {
  fittedDetail,
  namedTitle,
  placeBid,
  setTransferStance,
  termsReport,
  transferStance,
} from './transfers';
import { transferWindow, transferWindowDays } from './transfer-window';

/**
 * The 단장's signings with transfers delegated (→CLUB-33, →STAFF-20): what a squad must hold before he
 * looks for upgrades, and how often he looks while a window is open.
 */
export const SIGNING_CONFIG = {
  /** He looks on a window's opening day and every `lookDays`th day after it (→CLUB-33). */
  lookDays: 3,
  /**
   * A look makes moves until his pending bids reach this count, by the 선수 영입 step he acts on
   * (1–5): 1 at 적당히 and below, 2 at 넉넉히, 3 at 아낌없이 (→CLUB-33).
   */
  pendingByStep: [1, 1, 1, 2, 3] as readonly number[],
  /** However many moves a look could make, it makes at most this many. */
  movesPerLook: 8,
  lineMinimum: LINE_MINIMUM,
  squadMinimum: SQUAD_TARGET,
  /**
   * Above this many players less the listed, a 단장 who makes room lists surplus players down to
   * it at a regular look (→CLUB-33); each step's upgrade room is its stance's (→ECON-33).
   */
  trimSquad: 24,
  /** The youngest a player he lists to make room may be. */
  trimAge: 24,
  /**
   * The money bar (→CLUB-33): the highest OVR whose market wage at our division for a player aged
   * `barAge`, for the step's loss runway plus one season, fits the capital the runway test leaves.
   */
  barAge: 27,
  /** A non-starter more than this far below the bar is listed to make room for a dearer one. */
  barGap: 8,
  /** A shortlisted candidate must beat a slot's starter there by this much to be requested. */
  requestMargin: 5,
  /** The level a candidate must play a slot's position at to fit it: 준수 (→PLAYER-4). */
  fitLevel: 2,
  requestLimit: 3,
  /** Trust a manager loses when a window closes with none of his requests met. */
  unmetTrust: 3,
  /**
   * The 단장's wage offer (→CLUB-41): the highest step of a player's demand he offers, by the
   * 선수 영입 step he acts on (1–5), and the player's chance the smallest step offered must reach.
   */
  wageCeiling: [1, 1, 1.25, 1.5, 2] as readonly number[],
  termsChance: 0.6,
};

type Offer = ScoutOffer;
/**
 * Why the 단장 wants a player: a short role, or an upgrade over a slot's measure; `requested` when
 * the manager asked for the role (→CLUB-33).
 */
export type SigningNeed = (
  | { kind: 'short'; line: Line; count: number; minimum: number; squad: number }
  | { kind: 'replacement'; line: Line; playerId: string }
  | {
      kind: 'upgrade';
      line: Line;
      slot: number;
      position: Position;
      /** Who stands as the slot's measure: its starter, or a signing still settling in there. */
      measure: Player;
      /** What the measure is worth at the slot. */
      level: number;
      margin: number;
    }
) & { requested?: SigningRequest };
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
/**
 * Our players who joined in the window open on `day` and are still here, whoever signed them and
 * however (a fee, a free signing or a loan, →CLUB-33): every arrival since its opening.
 */
export function joinedThisWindow(w: World, day = currentDay(w)): Player[] {
  const opening = windowOpening(w, day),
    arrived = new Set(
      (w.recruitmentArrivals ?? [])
        .filter(({ at }) => at.year === w.year && at.day >= opening && at.day <= day)
        .map(({ player }) => player),
    );
  return activePlayers(w).filter((p) => arrived.has(p.id));
}

type ShortNeed = Extract<SigningNeed, { kind: 'short' }>;
type UpgradeNeed = Extract<SigningNeed, { kind: 'upgrade' }>;
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

/**
 * The 단장's plan's checks on a signing (→`delegatePlan`, ECON-33): the runway test with his wage
 * and his fee — with his wage the players' wage bill stays within what the cash carries for the
 * step's runway, and the fee plus the planned loss after it, times the runway, fits available
 * capital — and the plain insolvency stop lets it through. A line the team cannot field (`need`
 * short) is filled with a free agent whatever the plan says, as any director must put out a side:
 * only the insolvency stop reads that one.
 */
export function signingVerdict(
  w: World,
  player: Player,
  fee: string,
  need?: SigningNeed['kind'],
  bidId?: string,
) {
  // A bid being settled replaces its own reservation; other live bids still tie up cash.
  const planning = bidId ? { ...w, bids: w.bids?.filter((bid) => bid.id !== bidId) } : w;
  const plan = delegatePlan(planning, 'recruitment'),
    label = planLabel(w, 'recruitment'),
    wage = BigInt(player.wage);
  const no = (reason: string) => ({
    ok: false as const,
    reason: sourceMessage('delegation.verdict.wrap', { reason, plan: label }),
  });
  if (need === 'short' && BigInt(fee) === 0n) {
    const stop = insolvencyStop(planning, 0n, wage);
    return stop
      ? no(stop)
      : {
          ok: true as const,
          reason: sourceMessage('delegation.verdict.shortFree', { plan: label }),
        };
  }
  const bill = BigInt(plan.committed) + wage;
  if (wage > 0n && bill > BigInt(plan.budget))
    return no(
      sourceMessage('delegation.verdict.fundedWages', {
        bill: moneyLabel(w, bill.toString()),
        budget: moneyLabel(w, plan.budget),
      }),
    );
  if (!runwayTest(planning, plan, { fee: BigInt(fee), wage }).ok)
    return no(
      sourceMessage('delegation.verdict.squadBudget', {
        fee: moneyLabel(w, fee),
        wage: moneyLabel(w, player.wage),
        left: moneyLabel(w, plan.left),
      }),
    );
  const stop = insolvencyStop(planning, BigInt(fee), wage);
  if (stop) return no(stop);
  return {
    ok: true as const,
    reason: sourceMessage('delegation.verdict.wrap', {
      reason: sourceMessage('delegation.plan.signingRoom', {
        budget: moneyLabel(w, plan.budget),
        left: moneyLabel(w, plan.left),
      }),
      plan: label,
    }),
  };
}

/** The highest step of a player's demand the 단장 offers, by the 선수 영입 step he acts on (→CLUB-41). */
export function wageCeiling(w: World) {
  const level = actedLevel(requestOf(w, 'recruitment'), delegateOf(w).temperament);
  return SIGNING_CONFIG.wageCeiling[level - 1]!;
}
/** Our offer at a step of his demand, in whole minor units, as a bid reads it (→CLUB-53). */
const stepWage = (demand: string, step: number) =>
  ((BigInt(demand) * BigInt(Math.round(step * 10000))) / 10000n).toString();
/** The 단장's wage offer for a candidate and the player's chance at it, with its money check. */
export interface WageOffer {
  step: (typeof WAGE_STEPS)[number];
  wage: string;
  chance: number;
  lines: ReturnType<typeof termsChance>['lines'];
  /** The money checks with that wage (→`signingVerdict`). */
  reason: string;
  /** What his answer reads: our offer at that step of his demand (→CLUB-53). */
  context: TermsContext;
}
/**
 * The 단장's wage offer (→CLUB-41, →CLUB-53): the smallest step of the player's demand whose chance
 * is at least `termsChance`, up to his acted 선수 영입 step's ceiling, that passes the money checks
 * with that wage and `fee`. When no step does, the reason says why, and he moves to the next candidate.
 */
export function wageOffer(
  w: World,
  offer: Offer,
  fee: string,
  need?: SigningNeed['kind'],
): { ok: true; offer: WageOffer } | { ok: false; reason: string } {
  const club = offer.source.kind === 'club' ? offer.source.club : undefined,
    context = termsContext(w, {
      playerId: offer.player.id,
      ...(club ? { clubId: club } : {}),
      step: 1,
    });
  if (!context) return { ok: false, reason: sourceMessage('copy.ops_squad.c94b14b4dc') };
  // His demand is the one the bid pins, the offer's quote (→CLUB-14), as his answer reads it.
  const demand = offer.player.wage,
    ceiling = wageCeiling(w);
  let refused: string | undefined;
  for (const step of WAGE_STEPS) {
    if (step > ceiling) break;
    const wage = stepWage(demand, step),
      asked = { ...context, demand, offer: wage },
      read = termsChance(asked);
    if (read.chance < SIGNING_CONFIG.termsChance) continue;
    const verdict = signingVerdict(w, { ...offer.player, wage }, fee, need);
    if (verdict.ok)
      return {
        ok: true,
        offer: {
          step,
          wage,
          chance: read.chance,
          lines: read.lines,
          reason: verdict.reason,
          context: asked,
        },
      };
    refused ??= verdict.reason;
  }
  return {
    ok: false,
    reason:
      refused ??
      sourceMessage('market.staff.noTerms', {
        percent: Math.round(ceiling * 100),
        chance: Math.round(SIGNING_CONFIG.termsChance * 100),
      }),
  };
}
/** The wage he offered and the player's chance at it, for his reports. */
const wageLine = (w: World, terms: WageOffer) =>
  sourceMessage('market.staff.wageOffer', {
    wage: moneyLabel(w, terms.wage),
    percent: Math.round(terms.step * 100),
    chance: Math.round(terms.chance * 100),
  });

/** The need in words, with the row behind it and the manager's request when it is one. */
export function needLine(w: World, need: SigningNeed) {
  const asked = need.requested
    ? sourceMessage('copy.signings.9a09ea9254', { p0: requestLabel(need.requested) })
    : '';
  if (need.kind === 'replacement')
    return sourceMessage('copy.signings.bf13cbb429', { p0: LINE_NAME[need.line] });
  if (need.kind === 'short')
    return (
      asked +
      (need.count < need.minimum
        ? sourceMessage('copy.signings.19d3170548', {
            p0: LINE_NAME[need.line],
            p1: need.count,
            p2: need.minimum,
          })
        : sourceMessage('copy.signings.a884ab54f9', {
            p0: need.squad,
            p1: SIGNING_CONFIG.squadMinimum,
          }))
    );
  return sourceMessage('delegation.need.upgrade', {
    asked,
    position: POSITION_LABEL[need.position],
    starter: need.measure.name,
    level: Math.round(need.level),
    margin: need.margin,
    plan: planLabel(w, 'recruitment'),
  });
}
/** " · 감독이 고른 선수" when the 단장 moves for the manager's pick. */
const pickNote = (need: SigningNeed, player: Player) =>
  need.requested?.pick === player.id ? sourceMessage('copy.signings.12b34e9f78') : '';
const recruitmentLine = (w: World) =>
  sourceMessage('copy.signings.3c1f7d75ad', {
    p0: POLICY_INFO.recruitment.levels[policyOf(w).recruitment - 1].name,
  });

/** Ability and potential first, then free status and stable id. */
const byCandidate = (a: Offer, b: Offer) =>
  overall(b.player) - overall(a.player) ||
  b.player.potential - a.player.potential ||
  Number(b.freeAgent) - Number(a.freeAgent) ||
  compareIds(a.player.id, b.player.id);
/**
 * The candidates for a need (→CLUB-33): the manager's pick, then the rest of the shortlist, then
 * the others of `offers` (the players within the scout's reach), each by ability, potential, free
 * status and id. With `byGain` (an upgrade at 넉넉히 and 아낌없이) everyone after the manager's pick
 * comes by how far he beats the slot's measure there, then in that order.
 */
function candidates(
  w: World,
  offers: Offer[],
  need: SigningNeed,
  tried: Set<string>,
  byGain = false,
) {
  const listed = new Set(shortlistOffers(w).map(({ offer }) => offer.player.id)),
    pick = need.requested?.pick,
    rank = (offer: Offer) =>
      offer.player.id === pick ? 0 : byGain || listed.has(offer.player.id) ? 1 : 2;
  return offers
    .map((offer, index) => ({ offer, index }))
    .filter(
      ({ offer }) =>
        offer.available &&
        !offer.player.loanUntil &&
        !tried.has(offer.player.id) &&
        (need.kind !== 'upgrade'
          ? lineOfPlayer(offer.player) === need.line
          : playsAt(offer.player, need.position) &&
            atSlot(w, offer.player, need.slot) >= need.level + need.margin) &&
        !registrationRoom(w, { ...offer.player, joined: w.year }),
    )
    .map((entry) => ({
      ...entry,
      gain:
        byGain && need.kind === 'upgrade'
          ? Math.round(atSlot(w, entry.offer.player, need.slot) - need.level)
          : 0,
    }))
    .sort(
      (a, b) => rank(a.offer) - rank(b.offer) || b.gain - a.gain || byCandidate(a.offer, b.offer),
    );
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
          measure: starter,
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
 * his list (→CLUB-51), his reach's count per line with its places abroad, by the sporting measures,
 * free status and id, as 영입's rows shape it, with the manager's requests. A window's
 * requests stay as they were at its opening.
 */
export function drawShortlist(w: World) {
  const listed = listable(w).map(({ offer }) => offer);
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
export function noteSigning(w: World, player: Player, sourceClub?: string) {
  const source = sourceClub ? w.clubs.find((club) => club.id === sourceClub) : undefined;
  // Establish the real seller before moving a previously unretained player, including his loan
  // parent. Reads never enroll players; only the completed move opens this employment fact.
  if (source) {
    retainPerson(w, player, source.id);
    openEmployment(w, player.id, 'player', source.id);
  }
  const foreign = isForeignCandidate(w, player.id, source?.id);
  closeNeedFor(w, player);
  movePerson(w, player, w.playerClub, true, player.loanUntil);
  (w.recruitmentArrivals ??= []).push({
    player: player.id,
    name: player.name,
    position: player.position,
    positions: { ...player.positions },
    at: careerDate(w),
  });
  joinClub(player, foreign ? 'abroad' : 'domestic', w.year);
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
    title: sourceMessage('copy.signings.ab7622ed62', { p0: m.name }),
    detail: sourceMessage('copy.signings.53e0647ca7', {
      p0: window.requests.map(requestLabel).join('·'),
      p1: SIGNING_CONFIG.unmetTrust,
      p2: m.trust,
    }),
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
/**
 * How an upgrade is measured (→CLUB-33). `signed`, in force: a player who joined in this window and
 * plays the slot's position stands as its measure when he beats its starter there, each such player
 * for one slot only, so a signing still settling in (→PLAYER-11) closes the slot he was bought for.
 * `starter`, the reading released before T804, measures a slot by its starter alone; it stays only
 * for measurement scripts (`scripts/seller-spread.ts --setting starter`).
 */
export const UPGRADE_MEASURE: { inForce: 'starter' | 'signed' } = { inForce: 'signed' };
/**
 * The money the bar reads (→ECON-33, →CLUB-33): the capital the runway test leaves at the current
 * wage bill (the recruitment plan's fee room), and the seasons a new wage must be carried for: the
 * step's runway plus one. None at the steps without a bar or when nothing is left.
 */
function barMoney(w: World, refunded = 0n) {
  const plan = delegatePlan(w, 'recruitment', undefined, undefined, refunded),
    money = BigInt(plan.left);
  return plan.stance.signing.bar && money > 0n
    ? { money, seasons: BigInt(plan.runway + 1) }
    : undefined;
}
/**
 * The 단장's money bar (→CLUB-33, →ECON-33), at the 선수 영입 steps he acts on with one (넉넉히,
 * 아낌없이): the highest OVR whose market wage at our division for a player aged `barAge` (→CLUB-25),
 * for the step's runway plus one season, fits the capital the runway test leaves at the current
 * wage bill; none at the other steps or when not even the lowest fits. As NPC clubs read the level
 * a place can carry (`affordableLevel`), on money.
 */
export function moneyBar(w: World, refunded = 0n): number | undefined {
  const read = barMoney(w, refunded),
    template = activePlayers(w)[0];
  if (read === undefined || !template) return undefined;
  const club = clubOf(w),
    regular: Player = { ...template, born: w.year - SIGNING_CONFIG.barAge, potential: 0 },
    fits = (ovr: number) =>
      BigInt(marketWageAt(club.country, w.year, club.tier, regular, ovr)) * read.seasons <=
      read.money;
  let low = 1,
    high = 99;
  if (!fits(low)) return undefined;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}
/** Whether an upgrade need's measure stands more than its margin below the money bar (→CLUB-33). */
export const belowBar = (need: SigningNeed, bar: number | undefined) =>
  bar !== undefined && need.kind === 'upgrade' && bar - need.level > need.margin;
/**
 * The squad as the window open on `day` found it: this window's arrivals taken out and the players
 * sold in it back, read from their recorded moves. Injuries, unhappiness and the tactic stay as now.
 */
function squadAtOpening(w: World, day: number): World {
  const opening = windowOpening(w, day),
    inWindow = ({ year, day: at }: { year: number; day: number }) =>
      year === w.year && at >= opening && at <= day,
    arrived = new Set(
      (w.recruitmentArrivals ?? []).filter(({ at }) => inWindow(at)).map(({ player }) => player),
    ),
    left = (p: Player) =>
      p.status === 'sold' &&
      (w.playerRecords?.[p.id]?.moves ?? []).some(
        (move) => move.from === w.playerClub && !move.loan && inWindow(move),
      );
  return {
    ...w,
    players: w.players.map((p) =>
      arrived.has(p.id)
        ? { ...p, status: 'sold' as const }
        : left(p)
          ? { ...p, status: 'active' as const }
          : p,
    ),
  };
}
/**
 * The money bar the window open on `day` is capped by (→CLUB-33): the bar now, or the bar with this
 * window's signings undone when that is higher — the fees they actually paid (a counter's included,
 * read from the recorded transfer facts) back in the cash and out of the season's fees, their wages
 * off the bill, the 단장's open bids withdrawn. What the window's own
 * signings spent never lowers its cap; money the plan lost otherwise (a re-plan on lower income)
 * does, and money it gained raises it.
 */
export function windowBar(w: World, day = currentDay(w)): number | undefined {
  const now = moneyBar(w),
    opening = windowOpening(w, day),
    inWindow = (bid: TransferBid) =>
      bid.direction === 'out' && bid.year === w.year && bid.day >= opening && bid.day <= day,
    bids = w.bids ?? [],
    arrived = new Set(joinedThisWindow(w, day).map((p) => p.id));
  if (!arrived.size && !bids.some((bid) => inWindow(bid) && isOpen(bid))) return now;
  // The fee a signing paid is its recorded fact's: an accepted counter pays `counterFee`, not the bid.
  const refunded = (w.transfers?.facts ?? []).reduce(
    (total, fact) =>
      fact.direction === 'in' &&
      fact.year === w.year &&
      fact.day >= opening &&
      fact.day <= day &&
      fact.currency === w.currency
        ? total + BigInt(fact.fee)
        : total,
    0n,
  );
  const undone: World = {
    ...w,
    cash: (BigInt(w.cash) + refunded).toString(),
    players: w.players.map((p) => (arrived.has(p.id) ? { ...p, status: 'sold' as const } : p)),
    bids: bids.filter((bid) => !(inWindow(bid) && isOpen(bid))),
  };
  const before = moneyBar(undone, refunded);
  return before === undefined ? now : now === undefined ? before : Math.max(now, before);
}
/**
 * The XI slots more than `margin` below the money bar (→CLUB-33), each counted once: the slots of the
 * XI the window open on `day` found (`squadAtOpening`), measured by their starters against `bar`
 * (the window's, `windowBar`). An upgrade that lifts one of them leaves it counted, and the money it
 * spent does not lower that bar, so the cap holds through the window; a slot a departure weakened,
 * a signing for a slot never below the bar and a repeated signing for one slot add nothing.
 */
export function slotsBelowBar(
  w: World,
  margin: number,
  bar: number | undefined,
  day = currentDay(w),
) {
  if (bar === undefined) return 0;
  return lineStarters(squadAtOpening(w, day)).filter((s) => bar - s.value > margin).length;
}
/**
 * The window's upgrade cap (→CLUB-33, →ECON-33): the step's, or at 넉넉히 and 아낌없이 the XI slots
 * below the money bar (`slotsBelowBar`) when that is more.
 */
export function upgradeCap(signing: SpendingStance['signing'], belowSlots: number) {
  return signing.barCap ? Math.max(signing.upgrades, belowSlots) : signing.upgrades;
}
/**
 * The upgrade needs (→CLUB-33): every outfield and keeper slot, the weakest starter there first,
 * each measured by its starter or by one of `joined` (this window's arrivals) who beats him there.
 * With a money `bar`, every slot whose measure is more than the margin below it comes first, the
 * weakest first, before the others; a candidate for any of them still beats its measure by the margin.
 */
export function upgradeNeeds(
  w: World,
  margin: number,
  joined: readonly Player[] = [],
  bar?: number,
): SigningNeed[] {
  const slots = formationOf(w.tactic),
    starters = lineStarters(w),
    starting = new Set(starters.map((s) => s.p.id)),
    fresh = UPGRADE_MEASURE.inForce === 'signed' ? joined.filter((p) => !starting.has(p.id)) : [],
    counted = new Set<string>();
  const needs: UpgradeNeed[] = starters
    .sort((a, b) => a.value - b.value || a.slot - b.slot)
    .map((starter) => {
      const position = slots[starter.slot]!.position;
      const arrival = fresh
        .filter((p) => !counted.has(p.id) && playsAt(p, position))
        .map((p) => ({ p, value: atSlot(w, p, starter.slot) }))
        .sort((a, b) => b.value - a.value || compareIds(a.p.id, b.p.id))[0];
      const settling = arrival && arrival.value > starter.value ? arrival : undefined;
      if (settling) counted.add(settling.p.id);
      return {
        kind: 'upgrade' as const,
        line: starter.line,
        slot: starter.slot,
        position,
        measure: settling?.p ?? starter.p,
        level: settling?.value ?? starter.value,
        margin,
      };
    });
  if (bar === undefined) return needs;
  const below = needs
    .filter((need) => belowBar(need, bar))
    .sort((a, b) => a.level - b.level || a.slot - b.slot);
  return [...below, ...needs.filter((need) => !below.includes(need))];
}

/**
 * The 단장 asks a free agent at once on his wage step (→CLUB-53, free agent +1.0), from the player's
 * own draw of that day, the one the owner's offer reads (→ARCH-5). Agreeing, he leaves the pool on
 * that wage (→CLUB-49); refusing, the approach is kept as a staff bid he refused, so the window's
 * count sees the move and he is not asked again in it, and the report names his factors. Returns
 * whether he signed.
 */
function directorSignsFreeAgent(w: World, offer: Offer, need: SigningNeed, terms: WageOffer) {
  const day = currentDay(w),
    id = offer.player.id,
    draw = random(`${w.seed}:terms:free:${w.year}:${day}:${id.length <= 80 ? id : hash(id)}`)(),
    agreed = termsAnswer(terms.context, draw).accept,
    // The approach is kept as a staff bid, so the window's count sees it.
    bid: TransferBid = {
      id: `out:${w.year}:${day}:staff:${id}`.slice(0, 100),
      direction: 'out',
      playerId: id,
      fee: '0',
      offer: { player: offer.player, fee: offer.fee, loanFee: offer.loanFee },
      year: w.year,
      day,
      due: day,
      status: agreed ? 'completed' : 'rejected',
      staff: need.kind,
      ...(terms.step !== 1 ? { wage: terms.step } : {}),
      ...(agreed ? {} : { refusedBy: 'player' as const }),
    };
  if (!agreed) {
    w.bids = [...(w.bids || []), bid];
    pushInbox(w, {
      kind: 'staff-report',
      title: namedTitle('market.answer.free.title', offer.player.name),
      detail: fittedDetail((room) =>
        sourceMessage('market.answer.free.detail', {
          wage: moneyLabel(w, terms.wage),
          percent: Math.round(terms.step * 100),
          terms: termsReport(terms.chance, terms.lines, room),
        }),
      ),
      attention: false,
    });
    return false;
  }
  const p = signFreeAgent(w, offer, terms.wage);
  w.bids = [...(w.bids || []), bid];
  addEvent(
    w,
    'transfer-in',
    sourceMessage('copy.ClubStaff.2d43ec39f3', { p0: p.name }),
    sourceMessage('copy.signings.2856924462', {
      p0: p.position,
      p1: w.year - p.born,
      p2: moneyLabel(w, p.wage),
      p3: p.until,
    }),
    '0',
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.signings.ce393e327b', { p0: p.name }),
    detail: `${sourceMessage('copy.signings.b30a33d536', {
      p0: needLine(w, need),
      p1: pickNote(need, offer.player),
      p2: p.position,
      p3: w.year - p.born,
      p4: overall(p),
      p5: moneyLabel(w, p.wage),
      p6: recruitmentLine(w),
      p7: terms.reason,
    })} · ${wageLine(w, terms)}`.slice(0, 1000),
    attention: false,
  });
  return true;
}

/**
 * Our players who joined this season or last (→CLUB-33): every recorded arrival of those seasons,
 * and any player whose joining season is one of them, except the squad the owner took over, who
 * were at the club before him.
 */
function recentJoiners(w: World) {
  const since = w.year - 1,
    takeover = w.owner?.takeover?.year,
    recent = new Set(
      (w.recruitmentArrivals ?? [])
        .filter(({ at }) => at.year >= since)
        .map(({ player }) => player),
    );
  for (const p of activePlayers(w))
    if (p.joined !== undefined && p.joined >= since && p.joined !== takeover) recent.add(p.id);
  return recent;
}
/**
 * At 넉넉히 and 아낌없이 with sales delegated too, a regular look over `trimSquad` players less the
 * listed lists surplus players at 협상 가능 down to it (→CLUB-33, →CLUB-22): outside the manager's XI,
 * aged `trimAge` or over, never loaned, retiring or joined in this window; the least able, then the
 * oldest, then by id. With a money bar (`moneyBar`) the same look also lists, at any squad size,
 * the non-starters aged `trimAge` or over more than `barGap` below it who did not join this season or
 * last, once a signing for their line has joined in this window, never leaving a line's unlisted
 * players below its minimum (→CLUB-40). One report names the
 * look's listings. Listing is no move: it does not wait for his bids.
 */
export function makeRoom(w: World, day = currentDay(w)) {
  if (!spendingStance(w, 'recruitment').signing.makeRoom || !isDelegated(w, 'sales')) return;
  const players = activePlayers(w),
    unlisted = players.filter((p) => transferStance(p) !== 'listed').length,
    bar = moneyBar(w);
  if (unlisted <= SIGNING_CONFIG.trimSquad && bar === undefined) return;
  const starters = new Set(ownStarters(w).map((p) => p.id)),
    arrivals = joinedThisWindow(w, day),
    joined = new Set(arrivals.map((p) => p.id)),
    // The bar lists a weak player only once a signing for his line has joined in this window.
    replaced = new Set(arrivals.map(lineOfPlayer));
  const eligible = players
    .filter(
      (p) =>
        transferStance(p) === 'open' &&
        !p.loanUntil &&
        p.retiring === undefined &&
        !starters.has(p.id) &&
        !joined.has(p.id) &&
        w.year - p.born >= SIGNING_CONFIG.trimAge,
    )
    .sort((a, b) => overall(a) - overall(b) || a.born - b.born || compareIds(a.id, b.id));
  const surplus = eligible.slice(0, Math.max(0, unlisted - SIGNING_CONFIG.trimSquad));
  const lineCount = (line: Line) =>
    players.filter(
      (p) => transferStance(p) !== 'listed' && !surplus.includes(p) && lineOfPlayer(p) === line,
    ).length;
  const left = Object.fromEntries(LINES.map((line) => [line, lineCount(line)])) as Record<
    Line,
    number
  >;
  const weak: Player[] = [],
    recent = recentJoiners(w);
  if (bar !== undefined)
    for (const p of eligible) {
      const line = lineOfPlayer(p);
      if (
        surplus.includes(p) ||
        !replaced.has(line) ||
        overall(p) >= bar - SIGNING_CONFIG.barGap ||
        recent.has(p.id) ||
        left[line] <= SIGNING_CONFIG.lineMinimum[line]
      )
        continue;
      left[line]--;
      weak.push(p);
    }
  const listing = [...surplus, ...weak];
  if (!listing.length) return;
  for (const p of listing) setTransferStance(w, p.id, 'listed');
  const names = listing.map((p) => p.name).join(' · ');
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.signings.d5ae34d4e2', { p0: listing.length }),
    detail: (surplus.length
      ? sourceMessage('copy.signings.fd697db2c6', {
          p0: unlisted,
          p1: SIGNING_CONFIG.trimSquad,
          p2: names,
        })
      : names
    ).slice(0, 400),
    attention: false,
  });
}

/** Short roles first, then replacements, then upgrades (→CLUB-33). */
const NEED_ORDER = { short: 0, replacement: 1, upgrade: 2 } as const;
/** How many bids the 단장 may keep pending, by the 선수 영입 step he acts on (→CLUB-33). */
export function pendingLimit(w: World) {
  const level = actedLevel(requestOf(w, 'recruitment'), delegateOf(w).temperament);
  return SIGNING_CONFIG.pendingByStep[level - 1]!;
}
/** His bids of this window still waiting for an answer. */
const pendingStaffBids = (w: World, day: number) =>
  windowBids(w, day).filter((bid) => bid.staff && isOpen(bid));
/** Where a bid for a candidate goes: his place on the list, else the player at his club. */
function targetOf(w: World, offer: Offer): number | WorldMarketTarget {
  const index = transferOffers(w).findIndex((one) => one.player.id === offer.player.id);
  if (index >= 0 || offer.source.kind !== 'club') return index;
  return { world: w.id, kind: 'club', clubId: offer.source.club, playerId: offer.player.id };
}
/**
 * Whether a pending bid's player would meet a need when he joins: one of its line for a short line
 * or a replacement, one who beats the slot's measure by the margin for an upgrade. Each pending
 * player covers one need, so the 단장 does not bid twice for one place.
 */
function uncovered(w: World, needs: SigningNeed[], pending: TransferBid[]) {
  const waiting = pending.flatMap((bid) => (bid.offer ? [bid.offer.player] : []));
  return needs.filter((need) => {
    const i = waiting.findIndex((p) =>
      need.kind === 'upgrade'
        ? playsAt(p, need.position) && atSlot(w, p, need.slot) >= need.level + need.margin
        : lineOfPlayer(p) === need.line,
    );
    if (i < 0) return true;
    waiting.splice(i, 1);
    return false;
  });
}

/**
 * The 단장's look (→CLUB-33): with transfers delegated and a window open, on its opening day and
 * every `lookDays`th day after it, every day while a replacement need is open (plus a negotiator's
 * next-day raises), he makes moves — a free agent signed or a trait-priced bid — until his pending
 * bids reach the step's count (`pendingLimit`), each for the first need not already covered by a
 * pending bid that a candidate meets within the runway test, each pending fee reserved (→ECON-33).
 * Short roles come before replacements and upgrades, and the manager's requested roles before
 * the others.
 */
export function staffSignings(w: World) {
  const day = currentDay(w),
    window = transferWindow(w, day);
  if (!window.open) return;
  const regular = (day - windowOpening(w, day)) % SIGNING_CONFIG.lookDays === 0;
  if (regular) {
    detectMediations(w);
    if (resolveDelegatedMediations(w)) return;
  }
  if (!isDelegated(w, 'recruitment')) return;
  if (regular) makeRoom(w, day);
  const bids = windowBids(w, day),
    limit = pendingLimit(w);
  // Today's moves are made: a second call on the same day changes nothing.
  if (bids.some((bid) => bid.staff && bid.day === day)) return;
  if (pendingStaffBids(w, day).length >= limit) return;
  // A refused negotiator bid gets its next answer-day move outside the regular look gate.
  const retry = [...bids].reverse().find(
    (bid) =>
      directorTrait(w) === 'negotiator' &&
      bid.staff &&
      bid.status === 'rejected' &&
      // A player who refused our terms is not haggled with over the fee (→CLUB-53).
      bid.refusedBy !== 'player' &&
      bid.due < day &&
      !bids.some((later) => later.playerId === bid.playerId && later.day > bid.day) &&
      BigInt(bid.fee) < BigInt(ratio(bid.offer?.fee ?? '0', BigInt(bidCeiling(w)), 100n)),
  );
  let retried = false;
  if (retry && directorTrait(w) === 'negotiator') {
    const offers = transferOffers(w),
      index = offers.findIndex((offer) => offer.available && offer.player.id === retry.playerId),
      offer = index >= 0 ? offers[index] : locateOffer(w, retry.playerId, retry.club);
    if (offer?.available) {
      const previous = bids.filter((bid) => bid.staff && bid.playerId === retry.playerId).length;
      const fee = ratio(offer.fee, BigInt(staffBidShare(w, previous)), 100n);
      const terms = wageOffer(w, offer, fee);
      const room = registrationRoom(w, { ...offer.player, joined: w.year });
      if (terms.ok && !room) {
        placeBid(w, targetOf(w, offer), fee, false, retry.staff, terms.offer.step);
        pushInbox(w, {
          kind: 'staff-report',
          title: sourceMessage('copy.signings.6773850ac5', { p0: offer.player.name }),
          detail: `${sourceMessage('copy.signings.2bce8a2d24', {
            p0: staffBidShare(w, previous),
            p1: terms.offer.reason,
          })} · ${wageLine(w, terms.offer)}`,
          attention: false,
        });
        retried = true;
        if (pendingStaffBids(w, day).length >= limit) return;
      } else {
        retry.status = 'expired';
        pushInbox(w, {
          kind: 'staff-report',
          title: sourceMessage('copy.signings.e773f7135a', { p0: offer.player.name }),
          detail: room ?? (terms.ok ? terms.offer.reason : terms.reason),
          attention: false,
        });
      }
    } else retry.status = 'expired';
  }
  const replacing = openNeeds(w).some((need) => need.day < day);
  // Off a regular look he moves only for a replacement, or past a negotiator's ended haggle.
  if (!regular && !replacing && (!retry || retried)) return;
  for (let move = 0; move < SIGNING_CONFIG.movesPerLook; move++) {
    if (!staffMove(w, day)) return;
    if (pendingStaffBids(w, day).length >= limit) return;
  }
}

/**
 * One move of a look (→CLUB-33): the first need no pending bid covers that a candidate meets —
 * the manager's pick, the shortlist, then the players within the scout's reach, an upgrade at
 * 넉넉히 and 아낌없이 by slot gain — with a wage step and fee inside the money checks. Whether a
 * move was made.
 */
function staffMove(w: World, day: number) {
  const players = activePlayers(w);
  if (players.length >= registration(w).ceiling) return false;
  const bids = windowBids(w, day),
    stance = spendingStance(w, 'recruitment'),
    unlisted = players.filter((p) => transferStance(p) !== 'listed').length,
    upgrades = bids.filter(
      (bid) => bid.staff === 'upgrade' && (bid.status === 'completed' || isOpen(bid)),
    ).length,
    tried = new Set(bids.map((bid) => bid.playerId)),
    joined = joinedThisWindow(w, day),
    replacements: SigningNeed[] = openNeeds(w)
      .filter((need) => need.day < day)
      .map((need) => ({ kind: 'replacement', line: need.line, playerId: need.playerId }));
  const margin = stance.signing.margin,
    bar = margin !== undefined && stance.signing.bar ? moneyBar(w) : undefined,
    upgradeList =
      margin !== undefined && (stance.signing.room === undefined || unlisted <= stance.signing.room)
        ? upgradeNeeds(w, margin, joined, bar)
        : [];
  const cap = upgradeCap(
    stance.signing,
    stance.signing.barCap && margin !== undefined
      ? slotsBelowBar(w, margin, windowBar(w, day), day)
      : 0,
  );
  const requests = signingRequests(w),
    found: SigningNeed[] = [
      ...shortLines(w),
      ...replacements,
      ...(upgrades < cap ? upgradeList : []),
    ];
  const needs = uncovered(
    w,
    found
      .map((need) => {
        const requested = requests.find((request) =>
          need.kind !== 'upgrade'
            ? request.kind === 'short' && request.line === need.line
            : request.slot === need.slot,
        );
        return requested ? { ...need, requested } : need;
      })
      .map((need, order) => ({ need, order }))
      .sort(
        (a, b) =>
          NEED_ORDER[a.need.kind] - NEED_ORDER[b.need.kind] ||
          Number(!a.need.requested) - Number(!b.need.requested) ||
          a.order - b.order,
      )
      .map(({ need }) => need),
    pendingStaffBids(w, day),
  );
  if (!needs.length) return false;
  const offers = reachOffers(w),
    plan = delegatePlan(w, 'recruitment');
  for (const need of needs)
    for (const { offer } of candidates(
      w,
      offers,
      need,
      tried,
      need.kind === 'upgrade' && !!stance.signing.bar,
    )) {
      const fee = offer.freeAgent ? '0' : ratio(offer.fee, BigInt(staffBidShare(w)), 100n);
      // His lowest wage step already failing the runway test rules out every higher one.
      if (
        !(need.kind === 'short' && offer.freeAgent) &&
        !runwayTest(w, plan, { fee: BigInt(fee), wage: BigInt(offer.player.wage) }).ok
      )
        continue;
      const terms = wageOffer(w, offer, fee, need.kind);
      if (!terms.ok) continue;
      if (offer.freeAgent) directorSignsFreeAgent(w, offer, need, terms.offer);
      else {
        placeBid(w, targetOf(w, offer), fee, false, need.kind, terms.offer.step);
        const bid = w.bids!.findLast((one) => one.playerId === offer.player.id)!;
        pushInbox(w, {
          kind: 'staff-report',
          title: sourceMessage('copy.signings.0e14ee5884', { p0: offer.player.name }),
          detail: `${sourceMessage('copy.signings.8ca7bd666f', {
            p0: needLine(w, need),
            p1: pickNote(need, offer.player),
            p2: offer.player.position,
            p3: w.year - offer.player.born,
            p4: overall(offer.player),
            p5: moneyLabel(w, fee),
            p6: staffBidShare(w),
            p7: moneyLabel(w, offer.fee),
            p8: recruitmentLine(w),
            p9: terms.offer.reason,
          })} · ${wageLine(w, terms.offer)}`.slice(0, 1000),
          attention: false,
          ref: bid.id,
        });
      }
      return true;
    }
  return false;
}

/** Start one real ordinary move for a mediated request; owner decisions retain owner spending permissions. */
export function pursueRequest(
  w: World,
  request: SigningRequest,
  person: string,
  actor: 'owner' | 'delegated',
) {
  const picked = requestCandidates(w, request).find(({ offer }) => offer.player.id === person);
  if (!picked || !transferWindow(w).open) return sourceMessage('copy.signings.b38bc71204');
  const day = currentDay(w),
    { offer, index } = picked;
  const room = registrationRoom(w, { ...offer.player, joined: w.year });
  if (room) return room;
  const fee = offer.freeAgent
    ? '0'
    : actor === 'owner'
      ? offer.fee
      : ratio(offer.fee, BigInt(staffBidShare(w)), 100n);
  if (actor === 'delegated') {
    if (
      (day - windowOpening(w, day)) % SIGNING_CONFIG.lookDays !== 0 ||
      // A free agent who refused our terms at once leaves the day's move open, so a mediation
      // can pursue its next alternative (→CLUB-39, →CLUB-53).
      pendingStaffBids(w, day).length >= pendingLimit(w) ||
      windowBids(w, day).some((b) => b.staff && b.refusedBy !== 'player' && b.day === day)
    )
      return sourceMessage('copy.signings.475daa54a3');
    const terms = wageOffer(w, offer, fee);
    if (!terms.ok) return terms.reason;
    if (offer.freeAgent) {
      const starter = request.slot === undefined ? undefined : ownStarters(w)[request.slot];
      const need: SigningNeed =
        request.kind === 'upgrade' && starter && request.slot !== undefined && request.position
          ? {
              kind: 'upgrade',
              line: request.line,
              slot: request.slot,
              position: request.position,
              measure: starter,
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
      directorSignsFreeAgent(w, offer, need, terms.offer);
    } else placeBid(w, index, fee, false, request.kind, terms.offer.step);
  } else {
    if (BigInt(w.cash) < BigInt(fee)) return sourceMessage('copy.signings.e890653f5c');
    if (offer.freeAgent) squadCommand(w, { type: 'recruit', candidate: index });
    else placeBid(w, index, fee);
  }
  return undefined;
}
