import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The world's free agents (→CLUB-49): players football let go, held without a club. They join at
 * the close on release; at each market refresh some join a club nobody owns; one unsigned through
 * a whole season retires; above the cap the least able retire. They age and decline as any player
 * and never grow. `w.freeAgents` is replaced whole on every change, here. Persisted clubs'
 * contract decisions follow in T863; older checkpoints keep their generated let-go path.
 */
import type { Club, FreeAgent, Line, Player, World } from '../../contracts/src/types';
import { ATTRIBUTES, FREE_AGENT_CAP } from '../../contracts/src/player';
import { COUNTRIES } from '../../catalogs/src/index';
import { compareIds, random, zeroMetrics } from './primitives';
import { overall } from './player-state';
import { clubById, invalidateNpcSquad, invalidateNpcSquads, joinClub, squad } from './world';
import { movePerson } from './npc-continuity';
import { closeEmployment, openEmployment } from './person-careers';
import { retirementChanceWithContext, retirePerson } from './careers';
import { ageAttributes } from './training';
import { AGEING, lineOf } from './player';
import { divisionFor, signingClauses } from './contracts';
import { marketWage, marketWageAt } from './market-prices';
import { suitorFor } from './transfers';
import { registrationRoom } from './registration';
import { isForeignCandidate } from './scout-search';
import { addEvent } from './events';
import { moneyLabel } from './finance';
import { moveSquadPlayer } from './persisted-squads';

export { isFreeAgent } from './npc-continuity';

export const FREE_AGENT_CONFIG = {
  /** Players each club nobody owns lets go at the close: its least able of `letGoMinAge` or older. */
  letGoPerClub: 2,
  letGoMinAge: 21,
  /** Each refresh's chance that a free agent joins a club nobody owns. */
  joinChance: 0.2,
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
  return marketWageAt(code, p.freeSince, divisionFor(code, ovr), p, ovr);
}
/** Ablest first, then ID: the order the cap keeps and the close's top-up signs in. */
function byAbility(pool: readonly FreeAgent[]) {
  return pool
    .map((p) => ({ p, ovr: overall(p) }))
    .sort((a, b) => b.ovr - a.ovr || compareIds(a.p.id, b.p.id))
    .map(({ p }) => p);
}

/** A free agent stops playing: a registered person's retirement is recorded, nobody else's. */
function retireFreeAgent(w: World, p: Player) {
  const person = w.people?.[p.id];
  if (person) retirePerson(w, person);
}
/**
 * Admits `joining` to the pool and cuts it to the cap, the least able retiring (→CLUB-49). A
 * registered newcomer's move is recorded as a release; nobody else gets a record (storage). A
 * newcomer the cap leaves out is never let go: like an unrecorded one, whose old club generates
 * him again, a registered one stays where he is rather than retire young.
 */
function admit(w: World, joining: readonly FreeAgent[]) {
  const held = new Set(freeAgentsOf(w).map((p) => p.id));
  const fresh = joining.filter((p) => !held.has(p.id));
  if (!fresh.length) return [];
  const pool = byAbility([...freeAgentsOf(w), ...fresh]),
    kept = new Set(pool.slice(0, FREE_AGENT_CONFIG.cap)),
    cut = pool.slice(FREE_AGENT_CONFIG.cap);
  const admitted = fresh.filter((p) => kept.has(p));
  for (const p of admitted) {
    p.wage = freeAgentWage(w, p);
    // A registered player still at his club is released; the record keeps his career with us.
    const person = w.people?.[p.id];
    if (person?.playing === 'active') {
      const club = person.club;
      closeEmployment(w, p.id, 'player');
      if (club) invalidateNpcSquad(w, club);
    }
    moveSquadPlayer(w, p);
    freePlace(w, p.id);
  }
  // Those already held keep their order; newcomers follow in the order they were let go.
  w.freeAgents = freeAgentsOf(w)
    .filter((p) => kept.has(p))
    .concat(admitted);
  for (const p of cut) if (held.has(p.id)) retireFreeAgent(w, p);
  if (!w.squads) invalidateNpcSquads(w);
  return admitted;
}

/**
 * A club nobody owns's let-go players of `year`'s squad (→CLUB-49): its `letGoPerClub` least able
 * aged `letGoMinAge` or older, an announced retirement excluded (he retires instead).
 */
function letGo(w: World, c: Club, year: number) {
  return squad(w, c)
    .filter((p) => year - p.born >= FREE_AGENT_CONFIG.letGoMinAge && !staying(w, p.id))
    .map((p) => ({ p, ovr: overall(p) }))
    .sort((a, b) => a.ovr - b.ovr || compareIds(a.p.id, b.p.id))
    .slice(0, FREE_AGENT_CONFIG.letGoPerClub)
    .map(({ p }) => p);
}
/** An announced retirement retires instead (→CLUB-3); one on a club's staff as well stays. */
function staying(w: World, id: string) {
  const person = w.people?.[id];
  return (
    !!person?.retirement || !!person?.employment.some((job) => !job.to && job.role !== 'player')
  );
}
/**
 * Whom the clubs nobody owns let go of their `year` squads (→CLUB-49), each free from `since`:
 * every league club but ours lets go of its least able by `letGo`'s rule. Read at the close before
 * a promotion playoff, which the squads still play as they stood.
 */
export function lettingGo(w: World, year: number, since: number): FreeAgent[] {
  return w.clubs
    // Persisted clubs' contract decisions follow in T863; never release a generated copy of one.
    .filter((c) => c.id !== w.playerClub && !c.representative && !w.squads?.[c.id])
    .flatMap((c) => letGo(w, c, year).map((p) => freeAgentOf(p, since)));
}

/**
 * Legacy generated-world setup: persisted worlds start without free agents (→CLUB-49).
 */
export function seedFreeAgents(w: World) {
  if (w.squads) return;
  admit(w, lettingGo(w, w.year, w.year));
}

/**
 * The close of `closedYear` (→CLUB-49), before the year rolls over: a free agent unsigned through
 * the season retires; the players the clubs nobody owns let go (`released`, read before the
 * playoff) each face the retirement chance (→CLUB-3) unless, registered, he already decided on
 * 1 April; the newcomers age a season without growing, free from the next one, and the pool is
 * cut to the cap.
 */
export function closeFreeAgents(w: World, closedYear: number, released: readonly FreeAgent[]) {
  const stayed = freeAgentsOf(w).filter((p) => p.freeSince > closedYear);
  for (const p of freeAgentsOf(w))
    if (p.freeSince <= closedYear) {
      retireFreeAgent(w, p);
      freePlace(w, p.id);
    }
  if (stayed.length !== freeAgentsOf(w).length) {
    w.freeAgents = stayed;
  }
  const joining = released.filter((p) => {
    const chance = retirementChanceWithContext(closedYear, p.born, p.position);
    // At 41 everyone stops; below it a registered player's 1 April decision stands.
    if (chance >= 1) return false;
    return (
      !!w.people?.[p.id] || random(`${w.seed}:free-agent-retire:${p.id}:${closedYear}`)() >= chance
    );
  });
  for (const p of joining) declineFreeAgent(w, p, p.freeSince);
  admit(w, joining);
}

/**
 * Our player whose contract ran out and whom no club signed (→CLUB-28), at the close once the
 * year has rolled over: he ages a season without growing and joins the pool, free from this one.
 * Whether he was admitted: the cap leaves out one less able than all it holds.
 */
export function joinAtClose(w: World, p: Player) {
  const agent = freeAgentOf(p, w.year);
  declineFreeAgent(w, agent, w.year);
  return admit(w, [agent]).length > 0;
}
/**
 * Admits a player free from `since`; whether he joined. Over the cap the least able held one
 * retires, or the newcomer is left out when he is less able than all it holds.
 */
export function joinFreeAgents(w: World, player: Player, since: number) {
  return admit(w, [freeAgentOf(player, since)]).length > 0;
}

/**
 * A market refresh (→CLUB-49): every 4 league rounds and at the close, each free agent joins a
 * club nobody owns with `joinChance`, the club drawn as for an expiring contract (→CLUB-28), all
 * from his own stream. A persisted destination receives the actual player; a representative or
 * legacy generated squad keeps its identity-based continuity.
 */
export function refreshFreeAgents(w: World) {
  const pool = freeAgentsOf(w);
  if (!pool.length) return;
  const left: FreeAgent[] = [];
  const stayed = pool.filter((p) => {
    const r = random(`${w.seed}:free-agent:${p.id}:${w.year}:${w.round}`);
    const club = r() < FREE_AGENT_CONFIG.joinChance ? suitorFor(w, p, r) : undefined;
    if (!club) return true;
    left.push(p);
    // His move, recorded: he held no place anywhere, so only his new club's roster changes.
    if (w.squads?.[club.id]) {
      const { freeSince: _since, ...player } = p;
      void _since;
      player.until = w.year + FREE_AGENT_CONFIG.term;
      player.wage = marketWageAt(club.country, w.year, club.tier, player);
      if (w.people?.[p.id]) movePerson(w, player, club.id);
      else moveSquadPlayer(w, player, club.id);
    } else if (w.people?.[p.id]) {
      openEmployment(w, p.id, 'player', club.id);
      invalidateNpcSquad(w, club.id);
    }
    return false;
  });
  if (!left.length) return;
  w.freeAgents = stayed;
  for (const p of left) freePlace(w, p.id);
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
