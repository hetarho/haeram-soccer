import { clubManager } from './managerMarket';
import type {
  CareerDate,
  Club,
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
type Registry = NonNullable<World['people']>;
/** Each registry's `Object.values`, read once (T450); `retainPerson` replaces it as it enrolls. */
const peopleLists = new WeakMap<Registry, readonly PersonCareer[]>();
const NOBODY: readonly PersonCareer[] = [];
/**
 * Everyone in `w.people`, in its own order: `Object.values(w.people)` without copying the
 * registry on every read, which a century of retired people made the season's largest history
 * cost (T450). The list is a snapshot, never changed in place, so a caller that enrolls someone
 * while it walks one keeps walking what it read; enrolment goes through `retainPerson`.
 */
export function peopleOf(w: World): readonly PersonCareer[] {
  const registry = w.people;
  if (!registry) return NOBODY;
  let list = peopleLists.get(registry);
  if (!list) peopleLists.set(registry, (list = Object.values(registry)));
  return list;
}
/** Each world's active players by club, from `peopleOf`'s list (T450); dropped as one moves. */
const playingIndexes = new WeakMap<
  World,
  { people: readonly PersonCareer[]; byClub: Map<string, PersonCareer[]> }
>();
/**
 * The people playing for `club` now (`playing` active, `club` it), in the registry's order:
 * `peopleOf(w).filter(...)` read from an index rebuilt after anyone joins the registry or changes
 * whom or whether he plays for (`playingChanged`).
 */
export function playingFor(w: World, club: string): readonly PersonCareer[] {
  const people = peopleOf(w);
  let hit = playingIndexes.get(w);
  if (!hit || hit.people !== people) {
    const byClub = new Map<string, PersonCareer[]>();
    for (const person of people) {
      if (person.playing !== 'active' || person.club === undefined) continue;
      const list = byClub.get(person.club);
      if (list) list.push(person);
      else byClub.set(person.club, [person]);
    }
    hit = { people, byClub };
    playingIndexes.set(w, hit);
  }
  return hit.byClub.get(club) ?? NOBODY;
}
/** Every write of a person's `playing` or `club` ends with this, so `playingFor` reads it. */
export function playingChanged(w: World) {
  playingIndexes.delete(w);
}
/** An ID an object orders first, as an array index, rather than by insertion. */
const indexLike = (id: string) => /^(0|[1-9]\d*)$/.test(id) && Number(id) < 2 ** 32 - 1;
function enrolled(registry: Registry, person: PersonCareer) {
  const list = peopleLists.get(registry);
  if (!list) return;
  if (indexLike(person.id)) peopleLists.delete(registry);
  else peopleLists.set(registry, [...list, person]);
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
  enrolled(w.people, person);
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
        (role !== 'player' && job.role !== 'player') ||
        (role === 'player' && ['manager', 'director', 'scout'].includes(job.role)) ||
        (job.role === 'player' && ['manager', 'director', 'scout'].includes(role)),
    )
  )
    throw new Error('중복 재직은 불가능해요.');
  if (role !== 'player' && occupiedPostByOther(w, role, club, id))
    throw new Error('이미 담당자가 있어요.');
  if (
    person.employment.some(
      (job) => job.role === role && job.to && compareCareerDates(job.to, from) > 0,
    )
  )
    throw new Error('재직 날짜를 확인하세요.');
  const job = { role, club, from: { ...from } };
  person.employment.push(job);
  if (isCoachingRole(role)) coachingIndexesEver.delete(w);
  employmentChanged(w, person, job, true);
  syncMentorExposure(w, person, from);
  person.club = club;
  if (role === 'player') {
    person.playing = 'active';
  }
  playingChanged(w);
  return job;
}
export function closeEmployment(w: World, id: string, role: CareerRole, to = careerDate(w)) {
  const person = personOf(w, id);
  const job = person.employment.find((job) => !job.to && job.role === role);
  if (!job) return;
  if (compareCareerDates(to, job.from) < 0) throw new Error('재직 날짜를 확인하세요.');
  job.to = { ...to };
  employmentChanged(w, person, job, false);
  const remaining = person.employment.find((job) => !job.to);
  if (remaining) person.club = remaining.club;
  else delete person.club;
  if (role === 'player') person.playing = 'released';
  playingChanged(w);
  syncMentorExposure(w, person, to);
}

const COACHING_ROLES: readonly CareerRole[] = [
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
];
export const isCoachingRole = (role: CareerRole) => COACHING_ROLES.includes(role);
const DAY_MS = 86400000;
/** Each year's 1 August as a day number, worked out once a process (T450): it reads only the year. */
const seasonStarts = new Map<number, number>();
function seasonStart(year: number) {
  let day = seasonStarts.get(year);
  if (day === undefined) seasonStarts.set(year, (day = Math.floor(Date.UTC(year, 7, 1) / DAY_MS)));
  return day;
}
export const careerOrdinal = (date: CareerDate) => seasonStart(date.year) + date.day;
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
  // Without a coaching job he has no service: what the intervals below give him (T450).
  if (!person.employment.some((job) => isCoachingRole(job.role)))
    return { days: 0, qualified: false };
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
  const club = clubById(w, job.club);
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
/** Each world's people who ever coached or had a mentor, from `peopleOf`'s list (T450). */
const coachingIndexesEver = new WeakMap<
  World,
  { people: readonly PersonCareer[]; coached: PersonCareer[] }
>();
/**
 * The people who ever held a coaching job or had a mentor, in the registry's order: the only ones
 * whose mentors a sync touches or whom coaching service can qualify (`coachingService`). Rebuilt
 * after anyone joins the registry or opens a coaching job, the only writes that add one.
 */
export function coachingPeople(w: World): readonly PersonCareer[] {
  const people = peopleOf(w);
  let hit = coachingIndexesEver.get(w);
  if (!hit || hit.people !== people) {
    const coached = people.filter(
      (person) =>
        person.mentors.length > 0 || person.employment.some((job) => isCoachingRole(job.role)),
    );
    hit = { people, coached };
    coachingIndexesEver.set(w, hit);
  }
  return hit.coached;
}
/** Each world's people with a coaching profile, from `peopleOf`'s list (T450). */
const profiledIndexes = new WeakMap<
  World,
  { people: readonly PersonCareer[]; profiled: PersonCareer[] }
>();
/**
 * The people with a coaching profile (`coaching`), in the registry's order: the only ones the
 * coaching market can place. Rebuilt after anyone joins the registry or is given a profile
 * (`coachingProfiled`), the only write that adds one.
 */
export function profiledCoaches(w: World): readonly PersonCareer[] {
  const people = peopleOf(w);
  let hit = profiledIndexes.get(w);
  if (!hit || hit.people !== people) {
    hit = { people, profiled: people.filter((person) => person.coaching) };
    profiledIndexes.set(w, hit);
  }
  return hit.profiled;
}
/** Every write of a person's coaching profile ends with this, so `profiledCoaches` reads it. */
export function coachingProfiled(w: World) {
  profiledIndexes.delete(w);
}
export function syncMentorExposures(w: World) {
  // The date each sync would read for itself: nothing in a sync moves it (T450).
  const at = careerDate(w);
  for (const person of coachingPeople(w))
    if (
      person.mentors.some((m) => !m.to) ||
      person.employment.some((job) => !job.to && isCoachingRole(job.role))
    )
      syncMentorExposure(w, person, at);
}
/** Each clubs list by ID, the first of an ID as `find` reads it (T450); a list that grew is read again. */
const clubIndexes = new WeakMap<World['clubs'], { size: number; byId: Map<string, Club> }>();
function clubById(w: World, id: string): Club | undefined {
  let hit = clubIndexes.get(w.clubs);
  if (!hit || hit.size !== w.clubs.length) {
    const byId = new Map<string, Club>();
    for (const club of w.clubs) if (!byId.has(club.id)) byId.set(club.id, club);
    hit = { size: w.clubs.length, byId };
    clubIndexes.set(w.clubs, hit);
  }
  return hit.byId.get(id);
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
type Posts = Map<CareerRole, Map<string, Set<string>>>;
const postIndexes = new WeakMap<
  World,
  { people: World['people']; version: number; posts: Posts }
>();
function occupiedPostByOther(w: World, role: CareerRole, club: string, person: string) {
  const version = employmentVersions.get(w) ?? 0;
  let hit = postIndexes.get(w);
  if (!hit || hit.people !== w.people || hit.version !== version) {
    const posts: Posts = new Map();
    for (const person of peopleOf(w))
      for (const job of person.employment)
        if (!job.to && job.role !== 'player') {
          let clubs = posts.get(job.role);
          if (!clubs) posts.set(job.role, (clubs = new Map()));
          let occupants = clubs.get(job.club);
          if (!occupants) clubs.set(job.club, (occupants = new Set()));
          occupants.add(person.id);
        }
    hit = { people: w.people, version, posts };
    postIndexes.set(w, hit);
  }
  const occupants = hit.posts.get(role)?.get(club);
  return !!occupants && (occupants.size > 1 || !occupants.has(person));
}
/** Update only an already-valid derived index, after the canonical mutation has succeeded. */
function employmentChanged(w: World, person: PersonCareer, job: CareerEmployment, active: boolean) {
  const previous = employmentVersions.get(w) ?? 0;
  employmentVersions.set(w, previous + 1);
  // Another role's job leaves the active coaching jobs as they were: their index stays (T450).
  const coaching = coachingIndexes.get(w);
  if (
    coaching &&
    coaching.people === w.people &&
    coaching.version === previous &&
    !isCoachingRole(job.role)
  )
    coaching.version = previous + 1;
  const hit = postIndexes.get(w);
  if (!hit || hit.people !== w.people || hit.version !== previous) return;
  if (job.role !== 'player') {
    let clubs = hit.posts.get(job.role);
    if (!clubs) hit.posts.set(job.role, (clubs = new Map()));
    let occupants = clubs.get(job.club);
    if (!occupants) clubs.set(job.club, (occupants = new Set()));
    if (active) occupants.add(person.id);
    else occupants.delete(person.id);
    if (!occupants.size) clubs.delete(job.club);
  }
  hit.version = previous + 1;
}
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
  const active: { person: PersonCareer; job: CareerEmployment }[] = [];
  // Only someone who ever coached holds a coaching job (`coachingPeople`, T450).
  for (const person of coachingPeople(w))
    for (const job of person.employment)
      if (!job.to && isCoachingRole(job.role)) active.push({ person, job });
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
