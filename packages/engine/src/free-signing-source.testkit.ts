/** Exact observed source proof for tests; never inferred from a generated ID or origin. */
import { personOf } from './person-reads';
import type { CareerDate, PlayerMove, World } from '../../contracts/src/types';
import { careerDate, compareCareerDates } from './person-careers';

export function freeSigningSourceWitness() {
  const releases = new Map<string, CareerDate>();
  return {
    release(w: World, id: string) {
      releases.set(id, careerDate(w));
    },
    consume(id: string) {
      releases.delete(id);
    },
    accepts(w: World, id: string, move: PlayerMove) {
      const released = releases.get(id);
      const person = personOf(w, id);
      const record = w.playerRecords?.[id];
      const last = record?.moves.at(-1);
      if (
        !released ||
        !person ||
        person.playing !== 'released' ||
        person.club !== undefined ||
        person.employment.some((job) => job.role === 'player' && !job.to) ||
        person.loan ||
        record?.loan ||
        move.loan ||
        move.fee !== '0' ||
        move.from === move.to ||
        !w.clubs.some((club) => club.id === move.from) ||
        !w.clubs.some((club) => club.id === move.to) ||
        !last ||
        last.to !== move.from ||
        compareCareerDates(last, released) > 0 ||
        compareCareerDates(released, move) > 0
      )
        return false;
      const locations = Object.entries(w.squads ?? {}).flatMap(([club, players]) =>
        players.filter((p) => p.id === id).map(() => club),
      );
      locations.push(
        ...w.players.filter((p) => p.id === id && p.status === 'active').map(() => w.playerClub),
      );
      // The free path may have registered its single destination before the before-append hook.
      return locations.length <= 1 && locations.every((club) => club === move.to);
    },
  };
}
