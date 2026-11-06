import type {
  CareerDate,
  CareerEmployment,
  CareerRole,
  World,
} from '../../../../packages/contracts/src/types';
import {
  careerDate,
  coachingService,
  careerOrdinal,
  isCoachingRole,
} from '../../../../packages/engine/src/person-careers';
import { archivedFinish } from '../../../../packages/engine/src/club-past';
import { seasonAfter, seasonFrom } from '../../../../packages/engine/src/wartime';

/**
 * A season of a tenure: his club's league finish (→LEAGUE-1) as the season archive holds it, none
 * where the archive keeps no row of the club for it, or `current` for the season being played.
 */
export interface TenureSeason {
  year: number;
  finish?: { tier: number; group: number; place: number };
  current?: true;
}
/** A coaching, management or 단장 job of his record (`job`, its index) and its seasons. */
export interface Tenure {
  job: number;
  role: Exclude<CareerRole, 'player'>;
  club: string;
  seasons: TenureSeason[];
}

/**
 * Each job off the pitch with every season he held it for at least a day (→STAFF-50), the club's
 * finish read from `w.history` now and never stored; a season before the archive starts, or one
 * it holds no row for, shows none rather than a guess.
 */
function tenures(w: World, employment: readonly CareerEmployment[], at: CareerDate): Tenure[] {
  const archives = new Map(w.history.map((season) => [season.year, season]));
  const result: Tenure[] = [];
  employment.forEach((job, index) => {
    if (job.role === 'player') return;
    const club = w.clubs.findIndex((one) => one.id === job.club),
      from = careerOrdinal(job.from),
      to = job.to ? careerOrdinal(job.to) : Infinity,
      last = (job.to ?? at).year,
      seasons: TenureSeason[] = [];
    for (let year = seasonFrom(job.from.year); year <= last; year = seasonAfter(year)) {
      const start = careerOrdinal({ year, day: 0 }),
        end = careerOrdinal({ year: seasonAfter(year), day: 0 });
      if (Math.max(from, start) >= Math.min(to, end)) continue;
      const archive = archives.get(year),
        finish = archive && archivedFinish(w, archive.standings, club);
      seasons.push({
        year,
        ...(finish ? { finish } : !archive && year === w.year ? { current: true as const } : {}),
      });
    }
    result.push({ job: index, role: job.role, club: job.club, seasons });
  });
  return result;
}

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
    tenures: tenures(w, person.employment, at),
  });
}
export type PersonCareerDetail = NonNullable<ReturnType<typeof personCareer>>;
