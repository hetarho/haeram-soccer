import type { ClubBuild } from '../../contracts/src/build';
import type {
  ClubPolicy,
  ContractTerm,
  Direction,
  DirectionKey,
  FacilityPart,
  GameSettings,
  InboxItem,
  MatchPlayback,
  OwnerState,
  TransferBid,
  World,
} from '../../contracts/src/types';
import { clubOf } from './player-state';
import { advanceDays } from './season';
import { currentDay, seasonLength } from './calendar';
import { placeBid, playerValue, respondBid } from './transfers';
import { transferOffers } from './scout-search';
import { POLICY_KEYS, policyOf } from './policy';
import { DIRECTION_DEFAULT } from './direction';
import { startFacilityWork } from './facilities';
import { debit } from './transactions';
import { initializeCoaching } from './coaching-entry';
import { playingCoachQuote, submitPlayingCoachProposal } from './playing-coach';
import { defaultSettings, RESPONSIBILITY_KEYS } from './responsibilities';
import { coachDelegated } from './hiring';
import { fillDelegatedPost, STAFF_ROLES } from './staff';
import { footballQuote } from './quotes';
import { FAN_MOOD, OWNER_BUSINESS, OWNER_DIVIDEND } from './owner-config';
import { stageAll } from './staging/frames';

/**
 * Puts direction rows in force on a test world, as a founded or saved club holds them: cards,
 * dials, the ticket price and direction rows (→ECON-16/17/22/25). No owner action or staff rule
 * changes them in a career, so tests set them directly. A row left out keeps its value; a dial or
 * direction row at its default is stored as the engine stores it, absent.
 */
export function holdRows(
  w: World,
  rows: {
    build?: ClubBuild;
    policy?: Partial<ClubPolicy>;
    ticket?: number;
    direction?: Partial<Record<DirectionKey, string>>;
  },
) {
  if (rows.build) {
    if (Object.keys(rows.build).length) w.build = { ...rows.build };
    else delete w.build;
  }
  if (rows.policy) {
    const current = policyOf(w),
      next = { ...current, ...rows.policy };
    if (POLICY_KEYS.some((key) => next[key] !== current[key])) w.policy = next;
  }
  if (rows.ticket !== undefined) w.ticket = rows.ticket;
  if (rows.direction) {
    const next: Record<string, string> = { ...w.direction };
    for (const [key, option] of Object.entries(rows.direction) as [DirectionKey, string][])
      if (option === DIRECTION_DEFAULT[key]) delete next[key];
      else next[key] = option;
    if (Object.keys(next).length) w.direction = next as Direction;
    else delete w.direction;
  }
  return w;
}

/**
 * Starts a part's next work and pays for it now, as a world saved with a work under way holds it
 * (→ECON-32). No career starts one, so tests that need a work in progress start it here.
 */
export function startWork(w: World, part: FacilityPart) {
  startFacilityWork(w, part, (fee) => debit(w, fee));
  return w;
}

/**
 * Puts a combined playing-coach quote to the club as staff filling his department's post do
 * (→STAFF-32): it waits in the 결재함 while either responsibility is direct and is settled at once
 * when both are delegated. Staff pick the player, length and term by their own rule when a post
 * opens and the owner never proposes, so tests that need a given proposal stage it here.
 */
export function stagePlayingCoach(w: World, id: string, years: 1 | 2, term: ContractTerm) {
  initializeCoaching(w, w.people![id]);
  const quote = playingCoachQuote(w, id, years, term);
  if (!quote) throw new Error('No playing-coach quote for this player, length and term.');
  return submitPlayingCoachProposal(w, quote);
}

/** Another club's accepted offer for one of our players at his value (window must be open). */
export function sellPlayer(w: World, id: string) {
  const p = w.players.find((player) => player.id === id)!;
  const club = w.clubs.find((c) => c.id !== w.playerClub && !c.representative)!;
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `in:test:${w.year}:${day}:${id}`,
    direction: 'in',
    playerId: id,
    club: club.id,
    fee: playerValue(w, p),
    year: w.year,
    day,
    due: day + 5,
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  respondBid(w, bid.id, true);
  return bid;
}

/**
 * Signs another club's player from the chief scout's list as his club's yes to our bid at the
 * asking fee would (→CLUB-4): no instant purchase exists, so the bid is answered with a counter at
 * the same fee and accepted (window must be open). Returns the completed bid.
 */
export function buyOffer(w: World, candidate: number, loan = false) {
  const offer = transferOffers(w)[candidate]!;
  const fee = loan ? offer.loanFee : offer.fee;
  placeBid(w, candidate, fee, loan);
  const bid = w.bids!.findLast((one) => one.playerId === offer.player.id)!;
  if (bid.status !== 'completed') {
    bid.status = 'countered';
    bid.counterFee = fee;
    respondBid(w, bid.id, true);
  }
  return bid;
}

/**
 * Four shapes of authority tests hand to the staff, from the owner deciding everything to the
 * staff deciding everything: 1 none; 2 the academy and contract talks; 3 all but recruitment and
 * sales; 4 all. Match-eve stops stay on through 2 and window stops through 3. A career sets each
 * responsibility on its own in 결재 설정 (→WEB-45); tests name one of these four.
 */
export function staffAuthority(step: 1 | 2 | 3 | 4): GameSettings {
  const settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS)
    settings.responsibilities[key] =
      step === 4 ||
      (step === 3 && key !== 'recruitment' && key !== 'sales') ||
      (step === 2 && (key === 'academy' || key === 'contracts'))
        ? 'delegated'
        : 'direct';
  settings.observations = { matchEve: step <= 2, windowOpen: step <= 3 };
  return settings;
}

/**
 * Puts `staffAuthority(step)` in force and lets the staff fill every coaching post now theirs at
 * once, where a career's staff would fill it on their next daily look (→STAFF-15).
 */
export function handTo(w: World, step: 1 | 2 | 3 | 4) {
  w.settings = staffAuthority(step);
  for (const role of STAFF_ROLES) if (coachDelegated(w, role)) fillDelegatedPost(w, role);
  return w;
}

/** The inbox items still waiting for the owner: attention items not yet read. */
export function unreadAttention(w: World): InboxItem[] {
  return (w.inbox || []).filter((item) => item.attention && !item.read);
}

/**
 * Lives the days up to and including the own club's next match, settling every day between (the
 * app's next-match step lives in the host); returns that match's playback.
 */
export function advanceToNextMatch(
  w: World,
  settlement?: (w: World, p: MatchPlayback) => void,
  observe = true,
) {
  const matchCount = w.ownMatches.length;
  let playback: MatchPlayback | undefined;
  for (let n = 0; n < 2 * seasonLength(w) && !w.critical; n++) {
    const p = advanceDays(w, 1, settlement, observe);
    if (p) playback = p;
    if (w.ownMatches.length > matchCount) break;
  }
  return playback;
}

/** Node journeys stage explicitly; ordinary engine progression never stages a watched match. */
export function stagedPlayback(playback: MatchPlayback): MatchPlayback {
  return playback.script && playback.staging
    ? {
        ...playback,
        frames: stageAll(playback.script, playback.staging, playback.record, playback.squads),
      }
    : playback;
}

/**
 * Gives a test world an owner as a takeover leaves one (→OWNER, ECON-38): 재벌 총수 with no traits,
 * a fortune of 100,000 units on the football index, the stake and dividend dial at their defaults,
 * 팬 민심 at its start and the takeover on this season at no price or debt; `owner` overrides any
 * of it. Owner rules are tested on it until a takeover builds the career.
 */
export function withOwner(w: World, owner: Partial<OwnerState> = {}): OwnerState {
  const fortune = footballQuote(clubOf(w).country, w.year, 100000);
  w.owner = {
    tier: 'chaebol',
    traits: [],
    fortune,
    stake: OWNER_BUSINESS.stake.start,
    dividendShare: OWNER_DIVIDEND.start,
    fanMood: FAN_MOOD.start,
    ffpInjections: [],
    takeover: {
      year: w.year,
      clubId: w.playerClub,
      price: '0',
      debt: '0',
      fortune,
      currency: w.currency,
    },
    seasonRecords: [],
    ...owner,
  };
  return w.owner;
}
