import type {
  CareerDate,
  CareerEmployment,
  CareerRole,
  PersonCareer,
  Player,
  World,
} from '../../contracts/src/types';
import { currentDay } from './calendar';
export const careerDate = (w: World): CareerDate => ({ year: w.year, day: currentDay(w) });
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
  if (same) return same;
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
  if (role === 'player') {
    const remaining = person.employment.find((job) => !job.to);
    if (remaining) person.club = remaining.club;
    else delete person.club;
    person.playing = 'released';
  }
}
