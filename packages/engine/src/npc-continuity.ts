import { endPlayingCoachForDeparture } from './playing-coach';
import { COUNTRIES } from '../../catalogs/src/index';
import type { Club, PersonCareer, Player, World } from '../../contracts/src/types';
import { coachingGrade } from './aptitude';
import {
  careerDate,
  closeEmployment,
  openEmployment,
  playingChanged,
  playingFor,
  retainPerson,
} from './person-careers';
import { invalidateNpcSquads, makePlayer, npcSquad, squadPlaceAge, squadPlaces } from './world';
import { clubStyle } from './tactics';
import { lineOf } from './player';
import { hasOwner } from './owner';

/**
 * A club's generated squad of the season (`npcSquad`), drawn once a season in a world nobody owns
 * a club in (T669): materializing the season's people and every roster after it read the same
 * draw, each reader its own copies. A career draws it afresh every time, as before.
 */
const drawnSquads = new WeakMap<World, { year: number; clubs: Map<string, [string, Player[]]> }>();
function generatedSquad(w: World, c: Club): Player[] {
  if (hasOwner(w)) return npcSquad(w.seed, w.year, c);
  let drawn = drawnSquads.get(w);
  if (drawn?.year !== w.year) drawnSquads.set(w, (drawn = { year: w.year, clubs: new Map() }));
  // What the draw reads of the club besides its ID.
  const key = `${c.country}:${c.tier}:${c.strength}`;
  let entry = drawn.clubs.get(c.id);
  if (entry?.[0] !== key) drawn.clubs.set(c.id, (entry = [key, npcSquad(w.seed, w.year, c)]));
  return entry[1].map((p) => ({ ...p }));
}

/** Each pool's ID set, read once: the pool is replaced whole on every change (→CLUB-49). */
const freeAgentIds = new WeakMap<readonly { id: string }[], Set<string>>();
/**
 * Whether `id` is a free agent's (→CLUB-49): the club that let him go keeps his generated place
 * empty while he is one, as it does for a registered player who moved, so nobody is in two places.
 */
export function isFreeAgent(w: { freeAgents?: readonly { id: string }[] }, id: string) {
  const pool = w.freeAgents;
  if (!pool?.length) return false;
  let ids = freeAgentIds.get(pool);
  if (!ids) freeAgentIds.set(pool, (ids = new Set(pool.map((p) => p.id))));
  return ids.has(id);
}
/** Whether a generated identity is accounted for elsewhere: registered, or a free agent. */
const departed = (w: World, id: string) => !!w.people?.[id] || isFreeAgent(w, id);

/** Registry enrollment occurs in simulation lifecycle, never from a read-only roster query. */
export function materializePeople(w: World) {
  for (const p of [...w.players, ...(w.academy?.players || [])])
    if (p.status === 'active' && p.qualities) {
      retainPerson(w, p, w.playerClub, true);
      openEmployment(w, p.id, 'player', w.playerClub);
    }
  const occupiedOrigins = new Set(
    Object.values(w.people || {})
      .filter((person) => person.playing === 'active' && person.origin?.club === person.club)
      .map((person) => `${person.origin!.club}:${person.origin!.slot}`),
  );
  for (const c of w.clubs) {
    if (c.id === w.playerClub) continue;
    const raw = generatedSquad(w, c);
    for (let slot = 0; slot < raw.length; slot++) {
      if (occupiedOrigins.has(`${c.id}:${slot}`)) continue;
      let p = raw[slot];
      // A free agent's place is filled for the season he is one by someone nobody records.
      if (isFreeAgent(w, p.id)) continue;
      // The old generated identity can have moved or retired. Its vacant place gets a new person.
      if (w.people?.[p.id]) p = replacement(w, c, p, slot);
      if ((coachingGrade(p) ?? 0) < 4) continue;
      const person = retainPerson(w, p, c.id);
      person.origin = { club: c.id, slot };
      openEmployment(w, person.id, 'player', c.id);
    }
  }
  invalidateNpcSquads(w);
}
/**
 * A new person for generated place `slot`, whose identity `p` is accounted for elsewhere: drawn as
 * the place is (`npcSquad`), at its position and age, in its formation role and carrying the
 * club's press load, so a refilled squad plays as its generated one does.
 */
function replacement(w: World, c: Club, p: Player, slot: number) {
  let serial = 0;
  let id = `${c.id}:vacancy:${slot}:${w.year}`;
  while (departed(w, id)) id = `${c.id}:vacancy:${slot}:${w.year}:${++serial}`;
  const player = makePlayer(
    COUNTRIES.some((country) => country.code === c.country) ? c.country : 'ENG',
    w.seed,
    id,
    w.year,
    c.strength,
    p.position,
    squadPlaceAge(w.seed, c.id, w.year, slot).age,
    c.tier,
    squadPlaces(clubStyle(c))[slot]?.role,
  );
  player.fatigue = p.fatigue;
  return player;
}

function identity(p: Player, person: PersonCareer): Player {
  return {
    ...p,
    id: person.id,
    name: person.name,
    born: person.born,
    qualities: { ...person.qualities },
    personality: { ...p.personality, professionalism: person.professionalism },
  };
}
/** Playing attributes remain the ordinary current club-strength draw; identity grants no bonus. */
export function continuousSquad(w: World, c: Club): Player[] {
  const raw = generatedSquad(w, c);
  if (!w.people && !w.freeAgents?.length) return raw;
  const people = w.people ? playingFor(w, c.id) : [];
  const used = new Set<string>();
  const players = raw.map((p, slot) => {
    const native = people.find(
      (person) => person.origin?.club === c.id && person.origin.slot === slot,
    );
    if (native) {
      used.add(native.id);
      return identity(p, native);
    }
    if (departed(w, p.id)) return replacement(w, c, p, slot);
    return p;
  });
  // Actual arrivals use unretained playing places first. A retained native must remain
  // represented too: replacing his slot must not hide an active person from the roster/market.
  const occupied = new Set<number>();
  for (const person of people) {
    if (used.has(person.id)) continue;
    const vacant = (p: Player, i: number) => !occupied.has(i) && !used.has(p.id);
    let slot = players.findIndex((p, i) => vacant(p, i) && p.position === person.position);
    if (slot < 0)
      slot = players.findIndex(
        (p, i) => vacant(p, i) && lineOf(p.position) === lineOf(person.position),
      );
    if (slot < 0) slot = players.findIndex(vacant);
    if (slot < 0) {
      // All generated places already represent retained players. Keep the arrival with the same
      // ordinary club-strength attribute model rather than silently dropping either identity.
      const model =
        raw.find((p) => p.position === person.position) ??
        makePlayer(
          COUNTRIES.some((country) => country.code === c.country) ? c.country : 'ENG',
          w.seed,
          person.id,
          w.year,
          c.strength,
          person.position,
          w.year - person.born,
          c.tier,
        );
      players.push(identity({ ...model, fatigue: raw[0].fatigue }, person));
      occupied.add(players.length - 1);
      continue;
    }
    occupied.add(slot);
    players[slot] = identity(players[slot], person);
  }
  return players;
}
/** A recorded move, with one identity and one active player affiliation. Unknown destinations stay unknown. */
export function movePerson(w: World, p: Player, club?: string, own = false, loanUntil?: number) {
  const person = retainPerson(w, p, undefined, own || p.id.startsWith(`${w.playerClub}:`));
  if (loanUntil !== undefined && !person.loan)
    person.loan = { club: person.club, until: loanUntil };
  if (
    person.club === club &&
    person.playing === (club ? 'active' : 'released') &&
    (club
      ? person.employment.some((job) => !job.to && job.role === 'player' && job.club === club)
      : !person.employment.some((job) => !job.to && job.role === 'player'))
  )
    return person;
  closeEmployment(w, p.id, 'player', careerDate(w));
  if (club) openEmployment(w, p.id, 'player', club);
  else {
    delete person.club;
    person.playing = 'released';
    playingChanged(w);
  }
  invalidateNpcSquads(w);
  return person;
}
export function returnLoan(w: World, p: Player) {
  endPlayingCoachForDeparture(w, p.id, true);
  const person = retainPerson(w, p, undefined, true);
  const parent = person.loan?.club;
  movePerson(w, p, parent);
  delete person.loan;
  delete p.loanUntil;
  p.status = 'sold';
}
