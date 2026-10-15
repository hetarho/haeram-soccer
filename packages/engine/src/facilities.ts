import type { FacilityPart, World } from '../../contracts/src/types';
import { dayCountedFrom } from './calendar';
import { addEvent, clubOf, footballQuote } from './world';

/**
 * The facility parts (→ECON-32): a stadium of eight steps, each an expansion or a rebuild, and a
 * training ground and academy facilities of five levels. Costs and upkeep are units on the
 * football index (→ECON-26), so the ladders keep their weight against football's income in every
 * era; each step costs a fixed multiple of the one before (stadium ×2.5, training ground and
 * academy ×4), so no step is a bargain early or a sudden wall later, and the whole takes a career.
 */
export const STADIUM_STEPS = [
  { name: '동네 구장', capacity: 2500, work: undefined, cost: 0 },
  { name: '관중석 증축', capacity: 5000, work: 'expansion', cost: 600 },
  { name: '새 구장', capacity: 10000, work: 'rebuild', cost: 1500 },
  { name: '스탠드 증축', capacity: 15000, work: 'expansion', cost: 3750 },
  { name: '현대식 구장', capacity: 30000, work: 'rebuild', cost: 9400 },
  { name: '2층 스탠드', capacity: 40000, work: 'expansion', cost: 23400 },
  { name: '대형 경기장', capacity: 60000, work: 'rebuild', cost: 58600 },
  { name: '코너 증축', capacity: 75000, work: 'expansion', cost: 146500 },
  { name: '명문 구장', capacity: 90000, work: 'expansion', cost: 366000 },
] as const;
export type StadiumWork = 'expansion' | 'rebuild';
export const WORK_INFO: Record<StadiumWork | 'level', { label: string; days: number }> = {
  expansion: { label: '증축', days: 180 },
  rebuild: { label: '재건축', days: 540 },
  level: { label: '공사', days: 90 },
};
/** An expansion closes part of the ground while its stand is built; a rebuild happens elsewhere. */
export const EXPANSION_CAPACITY = 0.9;
export const MAX_LEVEL = 5;
/** The training ground by level: unit cost and the development base it adds (→CLUB-12). */
export const TRAINING_GROUND = [
  { cost: 0, base: 0 },
  { cost: 1500, base: 0.06 },
  { cost: 6000, base: 0.2 },
  { cost: 24000, base: 0.37 },
  { cost: 96000, base: 0.53 },
  { cost: 384000, base: 0.75 },
] as const;
/** The academy facilities by level: unit cost, intake, intake potential and growth (→CLUB-16). */
export const ACADEMY_FACILITY = [
  { cost: 0, intake: 0, potential: 0, growth: 1 },
  { cost: 1200, intake: 0, potential: 1, growth: 1.05 },
  { cost: 4800, intake: 1, potential: 2, growth: 1.12 },
  { cost: 19200, intake: 1, potential: 3, growth: 1.22 },
  { cost: 76800, intake: 1, potential: 4, growth: 1.35 },
  { cost: 307200, intake: 1, potential: 4, growth: 1.5 },
] as const;
/** A year's upkeep of a training ground or academy facilities, in units by level. */
const LEVEL_UPKEEP = [0, 40, 120, 300, 600, 1000];
export const FACILITY_PARTS: readonly FacilityPart[] = ['stadium', 'training', 'academy'];
export const FACILITY_PART_LABEL: Record<FacilityPart, string> = {
  stadium: '경기장',
  training: '훈련장',
  academy: '유소년 시설',
};
type Parts = Pick<World, 'stadium' | 'trainingGround' | 'academyFacility'>;

/** The step or level a part stands at. */
export function partLevel(w: Parts, part: FacilityPart) {
  return part === 'stadium'
    ? w.stadium
    : part === 'training'
      ? w.trainingGround
      : w.academyFacility;
}
/** The top step or level of a part. */
export function partTop(part: FacilityPart) {
  return part === 'stadium' ? STADIUM_STEPS.length - 1 : MAX_LEVEL;
}
/** Unit cost of building a part up to `level`. */
export function partCostUnits(part: FacilityPart, level: number): number {
  return part === 'stadium'
    ? STADIUM_STEPS[level].cost
    : part === 'training'
      ? TRAINING_GROUND[level].cost
      : ACADEMY_FACILITY[level].cost;
}
/** Days of work to build a part up to `level`. */
export function workDays(part: FacilityPart, level: number) {
  return part === 'stadium' ? WORK_INFO[STADIUM_STEPS[level].work!].days : WORK_INFO.level.days;
}
/** The work in progress on a part, with the days it has left, if any. */
export function facilityWork(w: World, part: FacilityPart) {
  const work = w.facilityWorks?.[part];
  if (!work) return undefined;
  const days = workDays(part, work.to);
  return { ...work, days, left: Math.max(0, work.day + days - dayCountedFrom(w, work.year)) };
}
/** Seats the ground holds today: its step's, 10% fewer while a stand is being added. */
export function stadiumCapacity(w: Pick<World, 'stadium' | 'facilityWorks'>) {
  const built = STADIUM_STEPS[w.stadium].capacity,
    work = w.facilityWorks?.stadium;
  return work && STADIUM_STEPS[work.to].work === 'expansion'
    ? Math.round(built * EXPANSION_CAPACITY)
    : built;
}
/** A year's upkeep in units: the stadium by its seats, the other parts by level. */
export function facilityUpkeepUnits(w: Parts) {
  const level = (STADIUM_STEPS[w.stadium].capacity - 2500) / 5000;
  return (
    180 +
    40 * level +
    5 * level * level +
    LEVEL_UPKEEP[w.trainingGround] +
    LEVEL_UPKEEP[w.academyFacility]
  );
}
/** A year's facility upkeep in the club's money. */
export function facilityUpkeep(w: World) {
  return footballQuote(clubOf(w).country, w.year, facilityUpkeepUnits(w));
}
/** Units spent building every part to where it stands, for the club's value (→HIST-12). */
export function facilityBuiltUnits(w: Parts) {
  let units = 0;
  for (const part of FACILITY_PARTS)
    for (let level = 1; level <= partLevel(w, part); level++) units += partCostUnits(part, level);
  return units;
}
/** The training ground's development base (→CLUB-12). */
export function trainingGroundBase(w: Pick<World, 'trainingGround'>) {
  return TRAINING_GROUND[w.trainingGround].base;
}
/** The academy facilities' terms (→CLUB-16). */
export function academyFacilityTerms(w: Pick<World, 'academyFacility'>) {
  return ACADEMY_FACILITY[w.academyFacility];
}
/** The stadium step's name and seats. */
export function stadiumStep(w: Pick<World, 'stadium'>) {
  return STADIUM_STEPS[w.stadium];
}

/** What the next work on a part would build, cost and take; none at the top. */
export function nextWork(w: World, part: FacilityPart) {
  const level = partLevel(w, part);
  if (level >= partTop(part)) return undefined;
  const to = level + 1,
    step = part === 'stadium' ? STADIUM_STEPS[to] : undefined;
  return {
    part,
    to,
    kind: step ? (step.work as StadiumWork) : ('level' as const),
    label: step
      ? `${WORK_INFO[step.work as StadiumWork].label} · ${step.name}`
      : `${FACILITY_PART_LABEL[part]} ${to}단계`,
    capacity: step?.capacity,
    days: workDays(part, to),
    units: partCostUnits(part, to),
    cost: footballQuote(clubOf(w).country, w.year, partCostUnits(part, to)),
  };
}

/** Starts the next work on a part, paying for it now (→ECON-32). */
export function startFacilityWork(w: World, part: FacilityPart, pay: (amount: string) => void) {
  if (!FACILITY_PARTS.includes(part)) throw new Error('시설 부문을 확인하세요.');
  if (w.facilityWorks?.[part])
    throw new Error(`${FACILITY_PART_LABEL[part]} 공사가 이미 진행 중입니다.`);
  const next = nextWork(w, part);
  if (!next) throw new Error(`${FACILITY_PART_LABEL[part]}은(는) 이미 최고 단계입니다.`);
  pay(next.cost);
  w.facilityWorks = {
    ...w.facilityWorks,
    [part]: { to: next.to, year: w.year, day: dayCountedFrom(w, w.year) },
  };
  addEvent(
    w,
    'facility',
    `${FACILITY_PART_LABEL[part]} 공사 시작 · ${next.label}`,
    `${next.days}일 공사${next.capacity ? ` · 완공 후 ${next.capacity.toLocaleString('en-US')}석` : ''}${next.kind === 'expansion' ? ' · 공사 중에는 관중석 10% 폐쇄' : ''}`,
    next.cost,
  );
}

/** Daily: works whose days are done open, their effect and upkeep starting now. */
export function progressFacilityWorks(w: World) {
  const works = w.facilityWorks;
  if (!works) return;
  for (const part of FACILITY_PARTS) {
    const work = facilityWork(w, part);
    if (!work || work.left > 0) continue;
    if (part === 'stadium') w.stadium = work.to;
    else if (part === 'training') w.trainingGround = work.to;
    else w.academyFacility = work.to;
    delete works[part];
    addEvent(
      w,
      'facility-open',
      `${FACILITY_PART_LABEL[part]} 완공 · ${
        part === 'stadium' ? STADIUM_STEPS[work.to].name : `${work.to}단계`
      }`,
      part === 'stadium'
        ? `${STADIUM_STEPS[work.to].capacity.toLocaleString('en-US')}석`
        : part === 'training'
          ? `선수 성장 기반 +${TRAINING_GROUND[work.to].base}`
          : `입단 +${ACADEMY_FACILITY[work.to].intake}명 · 잠재력 +${ACADEMY_FACILITY[work.to].potential} · 성장 ×${ACADEMY_FACILITY[work.to].growth}`,
    );
  }
  if (!works.stadium && !works.training && !works.academy) delete w.facilityWorks;
}
