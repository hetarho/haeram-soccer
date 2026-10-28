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
import { invalidateNpcSquads, makePlayer, npcSquad } from './world';
import { lineOf } from './player';

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
    const raw = npcSquad(w.seed, w.year, c);
    for (let slot = 0; slot < raw.length; slot++) {
      if (occupiedOrigins.has(`${c.id}:${slot}`)) continue;
      let p = raw[slot];
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
function replacement(w: World, c: Club, p: Player, slot: number) {
  let serial = 0;
  let id = `${c.id}:vacancy:${slot}:${w.year}`;
  while (w.people?.[id]) id = `${c.id}:vacancy:${slot}:${w.year}:${++serial}`;
  return makePlayer(
    COUNTRIES.some((country) => country.code === c.country) ? c.country : 'ENG',
    w.seed,
    id,
    w.year,
    c.strength,
    p.position,
    18 + ((w.year + slot) % 18),
    c.tier,
  );
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
  const raw = npcSquad(w.seed, w.year, c);
  if (!w.people) return raw;
  const people = playingFor(w, c.id);
  const used = new Set<string>();
  const players = raw.map((p, slot) => {
    const native = people.find(
      (person) => person.origin?.club === c.id && person.origin.slot === slot,
    );
    if (native) {
      used.add(native.id);
      return identity(p, native);
    }
    if (w.people?.[p.id]) return replacement(w, c, p, slot);
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
      const model = raw.find((p) => p.position === person.position) ?? raw[0];
      players.push(identity(model, person));
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
