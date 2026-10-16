import { clubManager } from './managerMarket';
import type {
  CareerDate,
  CareerEmployment,
  CareerRole,
  PersonCareer,
  Player,
  World,
} from '../../contracts/src/types';
import { currentDay } from './calendar';
const settlementDates = new WeakMap<World, CareerDate>();
/** Rollover skips summer in the live clock; contracts settled at the close keep their actual date. */
export function atCareerDate<T>(w: World, date: CareerDate, settle: () => T): T {
  const previous = settlementDates.get(w);
  settlementDates.set(w, { ...date });
  try {
    return settle();
  } finally {
    if (previous) settlementDates.set(w, previous);
    else settlementDates.delete(w);
  }
}
export const careerDate = (w: World): CareerDate => ({
  ...(settlementDates.get(w) ?? { year: w.year, day: currentDay(w) }),
});
export const compareCareerDates = (a: CareerDate, b: CareerDate) =>
  a.year - b.year || a.day - b.day;
export function resolvePerson(w: World, id: string) {
  return w.people?.[id];
}
/** Idempotent enrollment; never merge two different people or invent past appearances. */
export function retainPerson(
  w: World,
  player: Player,
  club?: string,
  formerOwn = false,
): PersonCareer {
  const existing = resolvePerson(w, player.id);
  if (existing) {
    if (
      existing.name !== player.name ||
      existing.born !== player.born ||
      existing.professionalism !== player.personality.professionalism ||
      JSON.stringify(existing.qualities) !== JSON.stringify(player.qualities)
    )
      throw new Error('인물 신원이 일치하지 않아요.');
    if (formerOwn) {
      existing.formerOwn = true;
      existing.ownCareer = [...player.career];
    }
    return existing;
  }
  if (!player.qualities) throw new Error('기록된 지도자 자질이 없어요.');
  if (club && !w.clubs.some((c) => c.id === club)) throw new Error('구단을 확인하세요.');
  const person: PersonCareer = {
    id: player.id,
    name: player.name,
    born: player.born,
    position: player.position,
    professionalism: player.personality.professionalism,
    qualities: { ...player.qualities },
    playing: player.status === 'retired' ? 'retired' : club ? 'active' : 'released',
    ...(club ? { club } : {}),
    ...(formerOwn ? { formerOwn: true, ownCareer: [...player.career] } : {}),
    employment: [],
    mentors: [],
  };
  (w.people ??= {})[person.id] = person;
  return person;
}
function personOf(w: World, id: string) {
  const person = resolvePerson(w, id);
  if (!person) throw new Error('인물을 확인하세요.');
  return person;
}
export function openEmployment(
  w: World,
  id: string,
  role: CareerRole,
  club: string,
  from = careerDate(w),
): CareerEmployment {
  const person = personOf(w, id);
  if (!w.clubs.some((c) => c.id === club)) throw new Error('구단을 확인하세요.');
  const active = person.employment.filter((job) => !job.to);
  const same = active.find((job) => job.role === role && job.club === club);
  if (same) {
    syncMentorExposure(w, person, from);
    return same;
  }
  if (
    active.some(
      (job) =>
        job.role === role ||
        job.club !== club ||
        (role === 'manager' && job.role !== 'player') ||
        (role !== 'player' && role !== 'manager' && job.role === 'manager'),
    )
  )
    throw new Error('중복 재직은 불가능해요.');
  if (
    role !== 'player' &&
    Object.values(w.people || {}).some(
      (other) =>
        other.id !== id &&
        other.employment.some((job) => !job.to && job.role === role && job.club === club),
    )
  )
    throw new Error('이미 담당자가 있어요.');
  if (
    person.employment.some(
      (job) => job.role === role && job.to && compareCareerDates(job.to, from) > 0,
    )
  )
    throw new Error('재직 날짜를 확인하세요.');
  const job = { role, club, from: { ...from } };
  person.employment.push(job);
  employmentVersions.set(w, (employmentVersions.get(w) ?? 0) + 1);
  syncMentorExposure(w, person, from);
  person.club = club;
  if (role === 'player') {
    person.playing = 'active';
  }
  return job;
}
export function closeEmployment(w: World, id: string, role: CareerRole, to = careerDate(w)) {
  const person = personOf(w, id);
  const job = person.employment.find((job) => !job.to && job.role === role);
  if (!job) return;
  if (compareCareerDates(to, job.from) < 0) throw new Error('재직 날짜를 확인하세요.');
  job.to = { ...to };
  employmentVersions.set(w, (employmentVersions.get(w) ?? 0) + 1);
  const remaining = person.employment.find((job) => !job.to);
  if (remaining) person.club = remaining.club;
  else delete person.club;
  if (role === 'player') person.playing = 'released';
  syncMentorExposure(w, person, to);
}

export const isCoachingRole = (role: CareerRole) =>
  ['assistant', 'attack', 'defense', 'goalkeeping', 'fitness', 'youth'].includes(role);
const DAY_MS = 86400000;
export const careerOrdinal = (date: CareerDate) =>
  Math.floor(Date.UTC(date.year, 7, 1) / DAY_MS) + date.day;
export function careerDateFromOrdinal(day: number): CareerDate {
  const date = new Date(day * DAY_MS),
    year = date.getUTCMonth() >= 7 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return { year, day: day - Math.floor(Date.UTC(year, 7, 1) / DAY_MS) };
}
type Interval = [number, number];
function union(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [from, to] of intervals
    .filter(([a, b]) => b >= a)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const previous = result.at(-1);
    if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
    else result.push([from, to]);
  }
  return result;
}
function coachingIntervals(person: PersonCareer, at: CareerDate): Interval[] {
  const end = careerOrdinal(at);
  return union(
    person.employment
      .filter((job) => isCoachingRole(job.role) && careerOrdinal(job.from) <= end)
      .map((job) => [careerOrdinal(job.from), Math.min(end, careerOrdinal(job.to ?? at))]),
  );
}
/** A virtual anniversary advances only by the union of actually employed calendar days. */
export function coachingService(person: PersonCareer, at: CareerDate) {
  const intervals = coachingIntervals(person, at),
    days = intervals.reduce((sum, [a, b]) => sum + b - a, 0),
    first = intervals[0]?.[0];
  if (first === undefined) return { days, qualified: false };
  const start = new Date(first * DAY_MS),
    anniversary = Math.floor(
      Date.UTC(start.getUTCFullYear() + 3, start.getUTCMonth(), start.getUTCDate()) / DAY_MS,
    );
  return {
    days,
    first: careerDateFromOrdinal(first),
    virtual: careerDateFromOrdinal(first + days),
    qualified: first + days >= anniversary,
  };
}
/** A mutation records the currently shared manager; profiles only read these facts. */
export function syncMentorExposure(w: World, person: PersonCareer, at = careerDate(w)) {
  const job = person.employment.find((job) => !job.to && isCoachingRole(job.role));
  const active = person.mentors.filter((mentor) => !mentor.to);
  if (!job) {
    for (const mentor of active) mentor.to = { ...at };
    return;
  }
  const club = w.clubs.find((club) => club.id === job.club);
  if (!club) return;
  const manager = job.club === w.playerClub ? w.manager : clubManager(w, club);
  if (
    active.length === 1 &&
    active[0].manager === manager.id &&
    active[0].club === job.club &&
    active[0].school === manager.style
  )
    return;
  for (const mentor of active) mentor.to = { ...at };
  person.mentors.push({
    manager: manager.id,
    name: manager.name,
    ...(manager.style ? { school: manager.style } : {}),
    club: job.club,
    from: { ...at },
  });
}
export function syncMentorExposures(w: World) {
  for (const person of Object.values(w.people || {}))
    if (
      person.mentors.some((m) => !m.to) ||
      person.employment.some((job) => !job.to && isCoachingRole(job.role))
    )
      syncMentorExposure(w, person);
}
export function longestMentor(person: PersonCareer, at: CareerDate) {
  const employed = coachingIntervals(person, at),
    end = careerOrdinal(at);
  const grouped = new Map<
    string,
    {
      manager: string;
      name: string;
      school: NonNullable<PersonCareer['mentors'][number]['school']>;
      spells: Interval[];
      recent: number;
      start: number;
    }
  >();
  for (const mentor of person.mentors) {
    if (!mentor.school) continue;
    const from = careerOrdinal(mentor.from),
      to = Math.min(end, careerOrdinal(mentor.to ?? at));
    if (from > to) continue;
    const actual = employed
      .map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as Interval)
      .filter(([a, b]) => b > a);
    if (!actual.length) continue;
    const entry = grouped.get(mentor.manager) ?? {
      manager: mentor.manager,
      name: mentor.name,
      school: mentor.school,
      spells: [],
      recent: -Infinity,
      start: -Infinity,
    };
    entry.spells.push(...actual);
    entry.recent = Math.max(entry.recent, ...actual.map((i) => i[1]));
    entry.start = Math.max(entry.start, from);
    grouped.set(mentor.manager, entry);
  }
  return [...grouped.values()]
    .map(({ spells, ...mentor }) => ({
      ...mentor,
      days: union(spells).reduce((sum, [a, b]) => sum + b - a, 0),
    }))
    .sort(
      (a, b) =>
        b.days - a.days ||
        b.recent - a.recent ||
        b.start - a.start ||
        (a.manager < b.manager ? -1 : a.manager > b.manager ? 1 : 0),
    )[0];
}

const employmentVersions = new WeakMap<World, number>();
const coachingIndexes = new WeakMap<
  World,
  {
    people: World['people'];
    version: number;
    active: { person: PersonCareer; job: CareerEmployment }[];
  }
>();
/** Derived runtime index; canonical employment remains the single authority. */
export function activeCoachingEmployment(w: World) {
  const version = employmentVersions.get(w) ?? 0,
    hit = coachingIndexes.get(w);
  if (hit && hit.people === w.people && hit.version === version) return hit.active;
  const active = Object.values(w.people || {}).flatMap((person) =>
    person.employment
      .filter((job) => !job.to && isCoachingRole(job.role))
      .map((job) => ({ person, job })),
  );
  coachingIndexes.set(w, { people: w.people, version, active });
  return active;
}
export function addCareerYears(date: CareerDate, years: number): CareerDate {
  const from = new Date(careerOrdinal(date) * DAY_MS);
  return careerDateFromOrdinal(
    Math.floor(
      Date.UTC(from.getUTCFullYear() + years, from.getUTCMonth(), from.getUTCDate()) / DAY_MS,
    ),
  );
}
