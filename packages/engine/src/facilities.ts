import { message as sourceMessage } from '../../contracts/src/messages';
import type { FacilityPart, World } from '../../contracts/src/types';
import { dayCountedFrom } from './calendar';
import { addEvent } from './events';
import {
  ACADEMY_FACILITY,
  FACILITY_PARTS,
  facilityUpkeepUnits,
  partCostUnits,
  partUpkeepUnits,
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
  trainingGroundTerms,
} from './facility-model';

/**
 * Construction on the facility ladders (→ECON-32): quoted owner investments start works,
 * which finish on their scheduled day.
 */
export const WORK_INFO: Record<StadiumWork | 'level', { label: string; days: number }> = {
  expansion: { label: sourceMessage('copy.facilities.9c75a54841'), days: 180 },
  rebuild: { label: sourceMessage('copy.facilities.68176b115a'), days: 540 },
  level: { label: sourceMessage('copy.facilities.25e5184374'), days: 90 },
};
export const FACILITY_PART_LABEL: Record<FacilityPart, string> = {
  stadium: sourceMessage('copy.ClubOperations.64779ec1ad'),
  training: sourceMessage('copy.outcome.e9dbbe23f3'),
  academy: sourceMessage('copy.outcome.09de5cf710'),
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
/** Annual upkeep of one completed facility in the club's current currency. */
export function facilityPartUpkeep(w: World, part: FacilityPart) {
  return footballQuote(clubOf(w).country, w.year, partUpkeepUnits(w, part));
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
      : sourceMessage('copy.facilities.8c01bbd55b', { p0: FACILITY_PART_LABEL[part], p1: to }),
    capacity: step?.capacity,
    days: workDays(part, to),
    units: partCostUnits(part, to),
    cost: footballQuote(clubOf(w).country, w.year, partCostUnits(part, to)),
  };
}

/**
 * Starts the next work on a part, paying for it now (→ECON-32). The owner's investment command
 * validates its displayed quote first; the calibration harness can also build by its own rule.
 */
export function startFacilityWork(w: World, part: FacilityPart, pay: (amount: string) => void) {
  if (!FACILITY_PARTS.includes(part)) throw new Error(sourceMessage('copy.facilities.7038e27864'));
  if (w.facilityWorks?.[part])
    throw new Error(sourceMessage('copy.facilities.4c738d3593', { p0: FACILITY_PART_LABEL[part] }));
  const next = nextWork(w, part);
  if (!next)
    throw new Error(sourceMessage('copy.facilities.198b4bded8', { p0: FACILITY_PART_LABEL[part] }));
  pay(next.cost);
  w.facilityWorks = {
    ...w.facilityWorks,
    [part]: { to: next.to, year: w.year, day: dayCountedFrom(w, w.year) },
  };
  addEvent(
    w,
    'facility',
    sourceMessage('copy.facilities.4ef73586df', { p0: FACILITY_PART_LABEL[part], p1: next.label }),
    sourceMessage('copy.facilities.a1df534a97', {
      p0: next.days,
      p1: next.capacity
        ? sourceMessage('copy.facilities.f876faa93a', { p0: next.capacity.toLocaleString('en-US') })
        : '',
      p2: next.kind === 'expansion' ? sourceMessage('copy.facilities.51567a8c17') : '',
    }),
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
      sourceMessage('copy.facilities.f1f4a77cef', {
        p0: FACILITY_PART_LABEL[part],
        p1:
          part === 'stadium'
            ? STADIUM_STEPS[work.to].name
            : sourceMessage('copy.FacilityParts.bda7274853', { p0: work.to }),
      }),
      part === 'stadium'
        ? sourceMessage('copy.ClubOperations.e718a2e7a8', {
            p0: STADIUM_STEPS[work.to].capacity.toLocaleString('en-US'),
          })
        : part === 'training'
          ? sourceMessage('copy.FacilityParts.22f747ccff', {
              p0: TRAINING_GROUND[work.to].growth,
              p1: TRAINING_GROUND[work.to].recoveryBonus,
              p2: TRAINING_GROUND[work.to].goodwill,
            })
          : sourceMessage('copy.InvestmentView.87c8b2640a', {
              p0: ACADEMY_FACILITY[work.to].intake,
              p1: ACADEMY_FACILITY[work.to].potential,
              p2: ACADEMY_FACILITY[work.to].growth,
            }),
    );
  }
  if (!works.stadium && !works.training && !works.academy) delete w.facilityWorks;
}
