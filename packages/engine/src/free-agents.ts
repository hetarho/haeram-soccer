import { retirePlayerRecord } from './player-records';
import { recordRetirementNews } from './news';
import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The world's free agents (→CLUB-49): players football let go, held without a club. They join at
 * the close on release; at each market refresh some join a club nobody owns; one unsigned through
 * a whole season retires; above the cap the least able retire. They age and decline as any player
 * and never grow. `w.freeAgents` is replaced whole on every change, here.
 */
import type { FreeAgent, Line, Player, World } from '../../contracts/src/types';
import { ATTRIBUTES, FREE_AGENT_CAP } from '../../contracts/src/player';
import { COUNTRIES } from '../../catalogs/src/index';
import { compareIds, random, zeroMetrics } from './primitives';
import { overall } from './player-state';
import { clubById, invalidateNpcSquad, joinClub, NPC_SQUAD, stature, refillPlace } from './world';
import { movePerson } from './npc-continuity';
import { RETIREMENT, retirePerson } from './careers';
import { ageAttributes } from './training';
import { AGEING, lineOf } from './player';
import { divisionFor, signingClauses } from './contracts';
import { marketWage, marketWageAt } from './market-prices';
import { clubRegistration, registrationExempt, registrationRoom } from './registration';
import { isForeignCandidate } from './scout-search';
import { addEvent } from './events';
import { moneyLabel } from './finance';
import { npcCanPay, npcWageBill, npcWageLimit } from './books';
import { clubStyle } from './tactics';
import { inPounds } from './club-value';
import { LINE_MINIMUM } from './player';

export { isFreeAgent } from './npc-continuity';

/** Measurement observers never change a draw, fact or checkpoint. */
export const FREE_AGENT_FLOW: {
  observe?: (kind: 'release' | 'sign' | 'retire', player: Player, club?: string) => void;
} = {};

export const FREE_AGENT_CONFIG = {
  /** The most the world holds; above it the least able retire at the close. */
  cap: FREE_AGENT_CAP,
  /** Seasons a free signing's contract runs past this one, as a generated youngster's (`makePlayer`). */
  term: 3,
} as const;

/** The pool, empty for a world made before it. */
export const freeAgentsOf = (w: World): readonly FreeAgent[] => w.freeAgents ?? [];

/**
 * The country a player was generated in, from the club his ID names (→WORLD-12): a free agent's
 * nationality. Unknown for an ID that names no club, such as a market candidate's.
 */
export function nationalityOf(w: World, id: string): string | undefined {
  return originClub(w, id)?.country;
}
/** The first club a generated player's ID names, even after he moves. */
export function originClub(w: World, id: string) {
  const parts = id.split(':');
  return clubById(w, parts.slice(0, 4).join(':')) ?? clubById(w, parts.slice(0, 2).join(':'));
}
/** Leaving the pool frees only his old club's generated place. */
function freePlace(w: World, id: string) {
  const club = originClub(w, id);
  if (club && !w.squads?.[club.id]) invalidateNpcSquad(w, club.id);
}

/**
 * What the pool keeps of a player who left a club: identity, attributes, positions, personality,
 * qualities, traits, potential, reputation and agent; no season or career figures, contract,
 * clauses, stance or loan. His wage is set when he is admitted.
 */
function freeAgentOf(p: Player, since: number): FreeAgent {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    positions: { ...p.positions },
    born: p.born,
    attrs: { ...p.attrs },
    personality: { ...p.personality },
    ...(p.qualities ? { qualities: { ...p.qualities } } : {}),
    traits: [...p.traits],
    // A generated player's starting fit; joining a club sets his own (→PLAYER-10).
    adaptation: 0.8,
    potential: p.potential,
    reputation: p.reputation,
    wage: '0',
    until: since,
    status: 'active',
    fatigue: 0,
    career: zeroMetrics(),
    season: zeroMetrics(),
    ...(p.agent ? { agent: p.agent } : {}),
    freeSince: since,
  };
}
/**
 * A season's ageing without growth (→PLAYER-17): only attributes past their decline age change,
 * by their group's amount with noise, and none ever rises. `season` is the one he enters.
 */
function declineFreeAgent(w: World, p: FreeAgent, season: number) {
  const age = season - p.born,
    before = { ...p.attrs };
  ageAttributes(
    p,
    age,
    random(`${w.seed}:free-agent-age:${p.id}:${season}`),
    (a) => age < AGEING[a].declineFrom,
  );
  for (const a of ATTRIBUTES) p.attrs[a] = Math.min(p.attrs[a], before[a]);
}
/** His market wage at the division his ability suits in his country (→CLUB-25). */
function freeAgentWage(w: World, p: FreeAgent) {
  const nationality = nationalityOf(w, p.id),
    code = COUNTRIES.some((c) => c.code === nationality) ? nationality! : 'ENG',
    ovr = overall(p);
  return marketWageAt(code, Math.max(w.year, p.freeSince), divisionFor(code, ovr), p, ovr);
}
/** Ablest first, then ID: the order the cap keeps and the close's top-up signs in. */
function byAbility(pool: readonly FreeAgent[]) {
  return pool
    .map((p) => ({ p, ovr: overall(p) }))
    .sort((a, b) => b.ovr - a.ovr || compareIds(a.p.id, b.p.id))
    .map(({ p }) => p);
}

/** A free agent stops playing; linked profiles and registered people's careers survive. */
function retireFreeAgent(w: World, p: Player) {
  const person = w.people?.[p.id];
  const club =
    person?.employment.filter((job) => job.role === 'player').at(-1)?.club ??
    w.playerRecords?.[p.id]?.moves.at(-1)?.to;
  if (retirePlayerRecord(w, p, club)) recordRetirementNews(w, p, club);
  if (person) retirePerson(w, person);
  FREE_AGENT_FLOW.observe?.('retire', p);
}
/** Admit releases before signings; only the season close applies the pool cap. */
function admit(w: World, joining: readonly FreeAgent[]) {
  const held = new Set(freeAgentsOf(w).map((p) => p.id));
  const fresh = joining.filter((p) => !held.has(p.id));
  for (const p of fresh) {
    held.add(p.id);
    p.wage = freeAgentWage(w, p);
    const from = w.people?.[p.id]?.club;
    movePerson(w, p);
    FREE_AGENT_FLOW.observe?.('release', p, from);
    freePlace(w, p.id);
  }
  w.freeAgents = [...freeAgentsOf(w), ...fresh];
  return fresh;
}

/** After the close's signings, retire the least able surplus, including new releases. */
export function capFreeAgents(w: World) {
  const pool = byAbility(freeAgentsOf(w));
  for (const p of pool.slice(FREE_AGENT_CONFIG.cap)) {
    retireFreeAgent(w, p);
    freePlace(w, p.id);
  }
  w.freeAgents = pool.slice(0, FREE_AGENT_CONFIG.cap);
}

/** A whole season unsigned ends a career; the remaining pool ages without training. */
export function closeFreeAgents(w: World, closedYear: number) {
  const stayed: FreeAgent[] = [];
  for (const p of freeAgentsOf(w)) {
    if (p.freeSince <= closedYear || w.people?.[p.id]?.retirement) {
      retireFreeAgent(w, p);
      freePlace(w, p.id);
    } else {
      declineFreeAgent(w, p, closedYear + 1);
      p.wage = freeAgentWage(w, p);
      stayed.push(p);
    }
  }
  w.freeAgents = stayed;
}

/** Our player has not received annual development yet when his expired contract is released. */
export function joinAtClose(w: World, p: Player) {
  const agent = freeAgentOf(p, w.year);
  declineFreeAgent(w, agent, w.year);
  return admit(w, [agent]).length > 0;
}
/** An NPC release has already developed and aged in the shared summer. */
export function joinFreeAgents(w: World, player: Player, since: number) {
  return admit(w, [freeAgentOf(player, since)]).length > 0;
}

/** New summer terms include their first season, shortening with age (→CLUB-26). */
export function npcContractTerm(age: number) {
  return age <= 23 ? 5 : age <= 27 ? 4 : age <= 30 ? 3 : age <= 33 ? 2 : 1;
}

/** The missing lines take priority over topping up the standing squad. */
function settlementFacts(w: World, club: World['clubs'][number], year: number) {
  const players = w.squads![club.id]!;
  const missing = (Object.keys(LINE_MINIMUM) as Line[]).filter(
    (line) => players.filter((q) => lineOf(q.position) === line).length < LINE_MINIMUM[line],
  );
  const wanted = missing.length
    ? missing
    : players.length >= NPC_SQUAD.size
      ? []
      : [lineOf(refillPlace(clubStyle(club), players))];
  return {
    wanted,
    registration: clubRegistration(club, year, players),
    bill: npcWageBill(w, club),
    limit: npcWageLimit(w, club, year),
  };
}

function wantsFreeAgent(facts: ReturnType<typeof settlementFacts>, p: FreeAgent, year: number) {
  if (!facts.wanted.includes(lineOf(p.position))) return false;
  const state = facts.registration;
  return (
    state.total < state.ceiling &&
    (registrationExempt(state.rule, year, { ...p, joined: year }) || state.counted < state.allowed)
  );
}

/** Ablest affordable first; contested players prefer stature, then wage in comparable money. */
export function refreshFreeAgents(w: World, year = w.year) {
  // A war gap or an older checkpoint may leave an announced retiree in the held pool.
  w.freeAgents = freeAgentsOf(w).filter((p) => {
    const person = w.people?.[p.id];
    if (
      year - p.born < RETIREMENT.lastAge &&
      person?.playing !== 'retired' &&
      (person?.retirement?.year === undefined || person.retirement.year >= year)
    )
      return true;
    retireFreeAgent(w, p);
    freePlace(w, p.id);
    return false;
  });
  const clubs = w.clubs.filter(
    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id],
  );
  const facts = new Map(clubs.map((club) => [club.id, settlementFacts(w, club, year)]));
  let signed: boolean;
  do {
    signed = false;
    for (const agent of byAbility(freeAgentsOf(w))) {
      const offers = clubs
        .filter((c) => wantsFreeAgent(facts.get(c.id)!, agent, year))
        .map((club) => {
          const wage = marketWageAt(club.country, year, club.tier, agent);
          return { club, wage, pounds: BigInt(inPounds(club.country, year, wage)) };
        })
        .filter(({ club, wage }) => npcCanPay(w, club, wage, undefined, year, facts.get(club.id)!));
      offers.sort(
        (a, b) =>
          stature(w.seed, b.club.id) - stature(w.seed, a.club.id) ||
          (a.pounds > b.pounds ? -1 : a.pounds < b.pounds ? 1 : compareIds(a.club.id, b.club.id)),
      );
      const offer = offers[0];
      if (!offer) continue;
      const { club, wage } = offer;
      const player = takeFreeAgent(w, agent.id)!;
      player.wage = wage;
      player.until = year + npcContractTerm(year - player.born) - 1;
      joinClub(player, nationalityOf(w, player.id) === club.country ? 'domestic' : 'abroad', year);
      // Employment records the free move's actual club and date; a free move has no fee.
      movePerson(w, player, club.id);
      FREE_AGENT_FLOW.observe?.('sign', player, club.id);
      facts.set(club.id, settlementFacts(w, club, year));
      signed = true;
    }
  } while (signed);
}

/** Takes a free agent out of the pool for a signing; undefined when he is not in it. */
export function takeFreeAgent(w: World, id: string): Player | undefined {
  const agent = freeAgentsOf(w).find((p) => p.id === id);
  if (!agent) return undefined;
  w.freeAgents = freeAgentsOf(w).filter((p) => p !== agent);
  freePlace(w, id);
  const { freeSince: _since, ...player } = agent;
  void _since;
  return player;
}

/**
 * The close's top-up (→CLUB-3, CLUB-40): the ablest free agent of `line` rated at most `level`,
 * the average strength of the division the club will play in, signs on its market wage
 * (→CLUB-25) with his signing's clauses (→CLUB-29) and no fee. `full` when registration has no
 * room (→CLUB-44); undefined when no free agent of the line fits.
 */
export function signFreeAgentAtClose(
  w: World,
  line: Line,
  level: number,
): Player | 'full' | undefined {
  const agent = byAbility(
    freeAgentsOf(w).filter((p) => lineOf(p.position) === line && overall(p) <= level),
  )[0];
  if (!agent) return undefined;
  if (registrationRoom(w, { ...agent, joined: w.year })) return 'full';
  const p = takeFreeAgent(w, agent.id)!;
  p.wage = marketWage(w, p);
  p.until = w.year + FREE_AGENT_CONFIG.term;
  p.clauses = signingClauses(w, p);
  // A former player of ours keeps his career with the club on the row he left.
  const prior = w.players.findIndex((row) => row.id === p.id);
  if (prior >= 0) {
    p.career = [...w.players[prior]!.career];
    if (w.players[prior]!.graduate) p.graduate = true;
    w.players[prior] = p;
  } else w.players.push(p);
  joinClub(p, isForeignCandidate(w, p.id) ? 'abroad' : 'domestic', w.year);
  movePerson(w, p, w.playerClub, true);
  addEvent(
    w,
    'free-agent-signing',
    sourceMessage('copy.free_agents.b9563581fa', { p0: p.name }),
    sourceMessage('copy.free_agents.66f9dc1d1c', {
      p0: p.position,
      p1: w.year - p.born,
      p2: moneyLabel(w, p.wage),
      p3: p.until,
    }),
  );
  return p;
}
