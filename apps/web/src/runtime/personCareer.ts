import type { World } from '../../../../packages/contracts/src/types';
import {
  careerDate,
  coachingService,
  careerOrdinal,
  isCoachingRole,
} from '../../../../packages/engine/src/person-careers';
/** A selected person's retained facts, answered only from canonical worker state. */
export function personCareer(w: World, id: string) {
  const person = w.people?.[id];
  if (!person) return undefined;
  const at = careerDate(w),
    player = w.players.find((p) => p.id === id);
  const overlap = person.employment.some(
    (playing) =>
      playing.role === 'player' &&
      person.employment.some(
        (job) =>
          isCoachingRole(job.role) &&
          Math.max(careerOrdinal(playing.from), careerOrdinal(job.from)) <
            Math.min(careerOrdinal(playing.to ?? at), careerOrdinal(job.to ?? at)),
      ),
  );
  return structuredClone({
    person,
    at,
    service: coachingService(person, at),
    overlap,
    ownPlayingTotals: person.formerOwn ? (player?.career ?? person.ownCareer) : undefined,
  });
}
export type PersonCareerDetail = NonNullable<ReturnType<typeof personCareer>>;
