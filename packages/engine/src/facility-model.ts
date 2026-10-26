import type { FacilityPart, World } from '../../contracts/src/types';

/**
 * The facility parts (→ECON-32): a stadium of eight steps, each an expansion or a rebuild, and a
 * training ground and academy facilities of five levels. Costs and upkeep are units on the
 * football index (→ECON-26), so the ladders keep their weight against football's income in every
 * era; each step costs a fixed multiple of the one before (stadium ×2.5, training ground and
 * academy ×4), so no step is a bargain early or a sudden wall later, and the whole takes a career.
 *
 * Completed facts only: the ladders and what the built parts give. Starting and finishing works
 * live in facilities.ts, so artwork and domain reads never reach construction or the world.
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
