import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The chief scout's search (→CLUB-51): he finds players among those the world holds (→CLUB-50) —
 * other clubs' first-team players and the free agents (→CLUB-49) within his reach — and lists the
 * best of each line as 영입's rows shape his search (→ECON-16, →ECON-22). Reading, filtering or
 * changing a setting never creates a player: switching one away and back finds the same players.
 */
import type { Club, FreeAgent, Line, Player, ScoutOffer, World } from '../../contracts/src/types';
import { BUILD_SLOTS } from '../../contracts/src/build';
import { LINES } from '../../contracts/src/player';
import { activePlayers, clubOf, lineOfPlayer, overall } from './player-state';
import { clubById, squad } from './world';
import { currentDay } from './calendar';
import { compareIds } from './primitives';
import { policyEffects, policyOf } from './policy';
import { buildEffects, buildOf } from './build';
import { staffMember } from './staff-info';
import { associationAccessOrder } from './europe-access';
import { askedFeeFactor } from './owner-traits';
import { freeAgentsOf, nationalityOf, originClub } from './free-agents';
import {
  askingMultiplier,
  clubPlayer,
  clubTerms,
  freeAgentTerms,
  graduateIds,
  unavailableAtClub,
} from './world-market';

export const SCOUT_CONFIG = {
  /**
   * By the chief scout's ability, a vacant post the lowest: how far he looks at home — our league
   * with the divisions directly above and below, or every division of our country, each with our
   * country's free agents — and how many he lists per line.
   */
  reachBands: [
    { below: 60, home: 'adjacent', perLine: 2 },
    { below: 80, home: 'country', perLine: 3 },
    { below: Infinity, home: 'country', perLine: 4 },
  ],
  /**
   * 해외 스카우트망 levels 1–5: the other playable countries whose top flights he adds, strongest
   * league first, with their free agents; and the places of a line kept for players abroad.
   */
  abroadCountries: [0, 1, 2, 4, 7],
  abroadPlaces: [0, 1, 1, 2, 2],
  /** The spotter ranks players this old or younger by potential before ability (→STAFF-11). */
  youngAge: 23,
  /** However the cards cut it, he lists at least this many per line. */
  minPerLine: 1,
} as const;

export type ScoutHome = (typeof SCOUT_CONFIG.reachBands)[number]['home'];
export const SCOUT_HOME_LABEL: Readonly<Record<ScoutHome, string>> = {
  adjacent: sourceMessage('copy.scout_search.f7c215bd95'),
  country: sourceMessage('copy.scout_search.7156229250'),
};

/** Where and how the chief scout searches today (→CLUB-51). */
export interface ScoutReach {
  home: ScoutHome;
  perLine: number;
  /** The other countries whose top flights he searches, strongest league first (→EURO). */
  abroad: string[];
  /** A line's places kept for players abroad when it has any. */
  abroadPlaces: number;
  /** The ages and abilities (OVR) he looks at, both ends included (→ECON-16). */
  age: [number, number];
  ability: [number, number];
  /** Whom he ranks by potential before ability: everyone, those aged `youngAge` or under, nobody. */
  potentialFirst: 'all' | 'young' | 'none';
}

/** The band of a chief scout's ability (→CLUB-51); a vacant post is the lowest. */
export function reachBand(ability: number | undefined) {
  const value = ability ?? 0;
  return SCOUT_CONFIG.reachBands.find((band) => value < band.below)!;
}

/**
 * The chief scout's reach (→CLUB-51): his ability's home reach and count per line, 해외 스카우트망's
 * countries and places abroad, 영입 기조's ages and abilities (→ECON-16) and the cards' search
 * effects (→ECON-22) — the count, the band's shift at both ends, ranking and reach abroad.
 */
export function scoutReach(w: World): ScoutReach {
  const scout = staffMember(w, 'scout'),
    band = reachBand(scout?.ability),
    build = buildEffects(w),
    policy = policyOf(w),
    search = policyEffects(policy).offer,
    level = policy.globalScouting - 1,
    own = clubOf(w).country;
  const others = associationAccessOrder(w).filter((code) => code !== own);
  const countries =
    build.scoutNoAbroad > 0
      ? 0
      : Math.min(others.length, SCOUT_CONFIG.abroadCountries[level]! + build.scoutAbroadExtra);
  const perLine = Math.max(SCOUT_CONFIG.minPerLine, band.perLine + build.scoutPerLine),
    shift = build.scoutAbilityShift;
  return {
    home: band.home,
    perLine,
    abroad: others.slice(0, countries),
    abroadPlaces: countries ? Math.min(perLine, SCOUT_CONFIG.abroadPlaces[level]!) : 0,
    age: [search.age[0], search.age[1]],
    ability: [search.ability[0] + shift, search.ability[1] + shift],
    potentialFirst:
      build.scoutNeverPotentialFirst > 0
        ? 'none'
        : search.potentialFirst || build.scoutPotentialFirst > 0
          ? 'all'
          : scout?.trait === 'spotter'
            ? 'young'
            : 'none',
  };
}

/**
 * Whether a player would join from abroad (→PLAYER-11): his club's country, or a free agent's
 * nationality, is not ours. A player whose country is unknown joins as one of ours.
 */
export function isForeignCandidate(w: World, id: string, club?: string) {
  const country = club ? clubById(w, club)?.country : nationalityOf(w, id);
  return !!country && country !== clubOf(w).country;
}

/** The clubs he searches: our country's divisions his home reach covers, the top flights abroad. */
function reachClubs(w: World, reach: ScoutReach) {
  const own = clubOf(w);
  return w.clubs.filter((c) => {
    if (c.id === own.id || c.representative) return false;
    if (c.country !== own.country) return c.tier === 0 && reach.abroad.includes(c.country);
    return (
      reach.home === 'country' ||
      Math.abs(c.tier - own.tier) === 1 ||
      (c.tier === own.tier && c.group === own.group)
    );
  });
}

interface Found {
  player: Player;
  club?: Club;
  line: Line;
  abroad: boolean;
  /** The measures he ranks by, in order: ability then potential, or potential first. */
  first: number;
  second: number;
}
/** Free agents first, then the first measure, the second, and the id (→CLUB-33). */
const byRank = (a: Found, b: Found) =>
  Number(!b.club) - Number(!a.club) ||
  b.first - a.first ||
  b.second - a.second ||
  compareIds(a.player.id, b.player.id);

function offerOf(w: World, found: Found, multiplier: number, graduates: Set<string>): ScoutOffer {
  const source = found.club
    ? ({ kind: 'club', club: found.club.id } as const)
    : ({ kind: 'free' } as const);
  const terms = found.club
    ? clubTerms(w, found.club, found.player, multiplier, graduates)
    : freeAgentTerms(w, found.player as FreeAgent, graduates);
  return { ...terms, freeAgent: !found.club, available: true, source, foreign: found.abroad };
}

/**
 * Each player's OVR in a squad or the pool, kept per list: a club's derived squad and the pool
 * are new lists whenever they change, and nobody in them grows while he is listed there.
 */
const measured = new WeakMap<readonly Player[], number[]>();
function abilities(players: readonly Player[]) {
  let ovrs = measured.get(players);
  if (ovrs?.length !== players.length) measured.set(players, (ovrs = players.map(overall)));
  return ovrs;
}

/**
 * The players within the reach (→CLUB-51) whose age and ability fit the search, ranked free
 * agents first, then by ability and potential (potential first where the search says so), then
 * id; per line the reach's count, keeping its places abroad for the ablest found there. Our
 * players, players on loan at their club and announced retirements are never listed.
 */
function search(w: World, reach: ScoutReach): ScoutOffer[] {
  const own = clubOf(w).country,
    owned = new Set(activePlayers(w).map((p) => p.id)),
    found: Found[] = [];
  const consider = (player: Player, ovr: number, club: Club | undefined, country: string) => {
    const age = w.year - player.born;
    if (age < reach.age[0] || age > reach.age[1] || owned.has(player.id)) return;
    if (ovr < reach.ability[0] || ovr > reach.ability[1]) return;
    const potentialFirst =
      reach.potentialFirst === 'all' ||
      (reach.potentialFirst === 'young' && age <= SCOUT_CONFIG.youngAge);
    found.push({
      player,
      ...(club ? { club } : {}),
      line: lineOfPlayer(player),
      abroad: country !== own,
      first: potentialFirst ? player.potential : ovr,
      second: potentialFirst ? ovr : player.potential,
    });
  };
  for (const club of reachClubs(w, reach)) {
    const players = squad(w, club),
      ovrs = abilities(players);
    players.forEach((player, i) => {
      if (!unavailableAtClub(w, player)) consider(player, ovrs[i]!, club, club.country);
    });
  }
  const pool = freeAgentsOf(w),
    ovrs = abilities(pool);
  pool.forEach((agent, i) => {
    // A free agent of unknown nationality counts as one of ours.
    const country = nationalityOf(w, agent.id) ?? own;
    if (agent.status === 'active' && (country === own || reach.abroad.includes(country)))
      consider(agent, ovrs[i]!, undefined, country);
  });
  const multiplier = askingMultiplier(w),
    graduates = graduateIds(w);
  return LINES.flatMap((line) => {
    const ranked = found.filter((f) => f.line === line).sort(byRank);
    const kept = new Set(ranked.filter((f) => f.abroad).slice(0, reach.abroadPlaces));
    for (const f of ranked) if (kept.size < reach.perLine) kept.add(f);
    return ranked.filter((f) => kept.has(f)).map((f) => offerOf(w, f, multiplier, graduates));
  });
}

/**
 * Everything the list depends on besides the free-agent pool, which is replaced whole on every
 * change: the world's revision and day, our squad, the reach and what sets the asking fees.
 */
function listKey(w: World, reach: ScoutReach) {
  const own = clubOf(w),
    scout = staffMember(w, 'scout'),
    director = staffMember(w, 'director'),
    build = buildOf(w);
  return JSON.stringify([
    w.revision,
    w.year,
    currentDay(w),
    own.id,
    own.tier,
    own.group,
    w.players.length,
    activePlayers(w).length,
    reach,
    BUILD_SLOTS.map((slot) => build[slot] ?? ''),
    scout?.trait ?? '',
    director?.ability ?? '',
    director?.trait ?? '',
    askedFeeFactor(w),
  ]);
}
const lists = new WeakMap<
  World,
  { key: string; pool: readonly FreeAgent[] | undefined; offers: ScoutOffer[] }
>();

/**
 * The chief scout's list (→CLUB-51), the shortlist's source (→CLUB-33): existing players found
 * within his reach, line by line in line order, each carrying his source (→CLUB-50); a free agent
 * asks no fee and is never loaned. The same world state always gives the same list, kept per
 * world until anything it depends on changes, so the daily view and the 단장 read it cheaply.
 */
export function transferOffers(w: World): ScoutOffer[] {
  const reach = scoutReach(w),
    key = listKey(w, reach),
    cached = lists.get(w);
  if (cached && cached.key === key && cached.pool === w.freeAgents) return cached.offers;
  const offers = search(w, reach);
  lists.set(w, { key, pool: w.freeAgents, offers });
  return offers;
}

/**
 * A player by his id wherever the world holds him now, on today's terms, the reach aside: at the
 * club named, else at his recorded club or the club his id names, else in the pool. Undefined
 * when he is not there — a generated candidate of an older save among them (→CLUB-50).
 */
export function locateOffer(w: World, id: string, club?: string): ScoutOffer | undefined {
  const owned = activePlayers(w).some((p) => p.id === id);
  const at = (c: Club | undefined): ScoutOffer | undefined => {
    const player = c && c.id !== w.playerClub ? clubPlayer(w, c, id) : undefined;
    if (!c || !player) return undefined;
    return {
      ...clubTerms(w, c, player),
      freeAgent: false,
      available: !owned && !unavailableAtClub(w, player),
      source: { kind: 'club', club: c.id },
      foreign: c.country !== clubOf(w).country,
    };
  };
  if (club) return at(clubById(w, club));
  const recorded = w.people?.[id]?.club;
  const found = (recorded ? at(clubById(w, recorded)) : undefined) ?? at(originClub(w, id));
  if (found) return found;
  const agent = freeAgentsOf(w).find((p) => p.id === id);
  if (!agent) return undefined;
  return {
    ...freeAgentTerms(w, agent),
    freeAgent: true,
    available: !owned && agent.status === 'active',
    source: { kind: 'free' },
    foreign: isForeignCandidate(w, id),
  };
}
