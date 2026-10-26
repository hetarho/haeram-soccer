import type { FacilityPart, World } from '../../contracts/src/types';
import { dayCountedFrom } from './calendar';
import { addEvent } from './events';
import {
  ACADEMY_FACILITY,
  FACILITY_PARTS,
  facilityUpkeepUnits,
  partCostUnits,
  partLevel,
  partTop,
  STADIUM_STEPS,
  type StadiumWork,
  TRAINING_GROUND,
} from './facility-model';
import { clubOf } from './player-state';
import { footballQuote } from './quotes';

export {
  ACADEMY_FACILITY,
  academyFacilityTerms,
  EXPANSION_CAPACITY,
  FACILITY_PARTS,
  facilityBuiltUnits,
  facilityUpkeepUnits,
  MAX_LEVEL,
  partCostUnits,
  partLevel,
  partTop,
  STADIUM_STEPS,
  stadiumCapacity,
  stadiumStep,
  type StadiumWork,
  TRAINING_GROUND,
  trainingGroundBase,
} from './facility-model';

/** Construction on the facility ladders (→ECON-32): starting, timing and opening works. */
export const WORK_INFO: Record<StadiumWork | 'level', { label: string; days: number }> = {
  expansion: { label: '증축', days: 180 },
  rebuild: { label: '재건축', days: 540 },
  level: { label: '공사', days: 90 },
};
export const FACILITY_PART_LABEL: Record<FacilityPart, string> = {
  stadium: '경기장',
  training: '훈련장',
  academy: '유소년 시설',
};

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
/** A year's facility upkeep in the club's money. */
export function facilityUpkeep(w: World) {
  return footballQuote(clubOf(w).country, w.year, facilityUpkeepUnits(w));
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
