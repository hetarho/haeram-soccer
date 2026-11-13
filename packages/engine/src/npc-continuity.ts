import { endPlayingCoachForDeparture } from './playing-coach';
import { COUNTRIES } from '../../catalogs/src/index';
import type { Club, PersonCareer, Player, World } from '../../contracts/src/types';
import { coachingGrade } from './aptitude';
import {
  careerDate,
  closeEmployment,
  compareCareerDates,
  openEmployment,
  playingChanged,
  playingFor,
  retainPerson,
} from './person-careers';
import {
  generatedPlayer,
  invalidateNpcSquad,
  invalidateNpcSquads,
  makePlayer,
  npcSquad,
  spreadTerm,
  squadPlaceAge,
  squadPlaces,
} from './world';
import { clubStyle } from './tactics';
import { lineOf } from './player';
import { hasOwner } from './owner';
import { clamp, integer, random } from './primitives';
import { seasonPlayerJobs } from './fixture-copy';
import { moveSquadPlayer } from './persisted-squads';

/**
 * Representative clubs' generated squads, also used by checkpoints without stored squads until
 * their writer founds them. Materializing people and roster reads share the season's draw.
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
    if (w.squads?.[c.id]) {
      for (const p of w.squads[c.id]) {
        if ((coachingGrade(p) ?? 0) < 4) continue;
        retainPerson(w, p, c.id);
        openEmployment(w, p.id, 'player', c.id);
      }
      continue;
    }
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
 * WORLD-6's refill of a place a sale emptied: `below` how far under the club's strength he plays
 * until the next summer, `age` his age's offset from the place's, `ages` the ages he is drawn within.
 */
export const REFILL = {
  below: [2, 6] as const,
  age: [-4, 4] as const,
  ages: [17, 35] as const,
};
/**
 * Whether `id`, the holder a place at `club` lost, left it this season for another club, by a sale
 * or a loan (→WORLD-6): his player job there ended the day his next one began. Only an active
 * person's jobs of the season are read (`seasonPlayerJobs`), all a fixture's read copy carries.
 */
function soldThisSeason(w: World, club: string, id: string) {
  const person = w.people?.[id];
  if (person?.playing !== 'active') return false;
  const jobs = seasonPlayerJobs(person, w.year);
  return jobs.some((job) => {
    const left = job.to;
    return (
      job.club === club &&
      left?.year === w.year &&
      jobs.some((next) => next.club !== club && compareCareerDates(next.from, left) === 0)
    );
  });
}
/**
 * A new person for generated place `slot`, whose identity `p` is accounted for elsewhere (→WORLD-6,
 * WORLD-11): at its position, in its formation role and carrying the club's press load. He is the
 * same person through the place's cohort (`${club}:vacancy:${slot}:${cohort}`), the next `:serial`
 * once he too is accounted for elsewhere. From his own stream he is up to `REFILL.age` years from
 * the place's age, so a year older each season (held at `REFILL.ages`' ends where the place's age
 * and his offset would leave them), and, while a sale or a loan emptied the place this season,
 * `REFILL.below` under the club's strength; from the next summer he plays at it. With
 * `SQUAD_SPREAD` at `spread` his class and age term (`spreadTerm`) go on top, as a squad member's.
 */
function replacement(w: World, c: Club, p: Player, slot: number) {
  const place = squadPlaceAge(w.seed, c.id, w.year, slot),
    base = `${c.id}:vacancy:${slot}:${place.cohort}`;
  let serial = 0,
    id = base,
    left = p.id;
  while (departed(w, id)) {
    left = id;
    id = `${base}:${++serial}`;
  }
  const r = random(`${w.seed}:${id}:refill`),
    below = integer(r, ...REFILL.below),
    age = clamp(place.age + integer(r, ...REFILL.age), ...REFILL.ages),
    level = c.strength - (soldThisSeason(w, c.id, left) ? below : 0);
  const player = generatedPlayer(
    COUNTRIES.some((country) => country.code === c.country) ? c.country : 'ENG',
    w.seed,
    id,
    w.year,
    Math.round(level + spreadTerm(w.seed, id, age)),
    p.position,
    age,
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
/** Stored clubs keep their players; representatives retain the seasonal generation model. */
export function continuousSquad(w: World, c: Club): Player[] {
  if (w.squads?.[c.id]) return w.squads[c.id];
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
  const ownRow = w.players.find((row) => row.id === p.id);
  if (person.formerOwn && ownRow) person.ownCareer = [...ownRow.career];
  if (loanUntil !== undefined && !person.loan)
    person.loan = { club: person.club, until: loanUntil };
  const previousClub = person.club;
  moveSquadPlayer(w, p, club);
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
  if (previousClub) invalidateNpcSquad(w, previousClub);
  if (club) invalidateNpcSquad(w, club);
  return person;
}
export function returnLoan(w: World, p: Player) {
  endPlayingCoachForDeparture(w, p.id, true);
  const person = retainPerson(w, p, undefined, true);
  const parent = person.loan?.club;
  delete p.loanUntil;
  movePerson(w, p, parent);
  delete person.loan;
  p.status = parent === w.playerClub ? 'active' : 'sold';
}
