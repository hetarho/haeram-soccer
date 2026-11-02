import type { Grade } from '../../contracts/src/player';
import type { Player, World } from '../../contracts/src/types';
import { coachingGrade, managerialGrade } from './aptitude';
import { coachingSpecialty } from './coaching-entry';
import { careerDate } from './person-careers';
import { managerialEntryReady } from './manager-entry';
import { GRADE_LABEL, personalityRange } from './player';
import { staffMember } from './staff';
import { scoutRangeScale } from './owner-traits';
export function aptitudeLabel(
  grade: Grade | undefined,
  own: boolean,
  scoutAbility?: number,
  scale = 1,
) {
  if (grade === undefined) return undefined;
  const [low, high] = own ? [grade, grade] : personalityRange(grade, scoutAbility, scale);
  return low === high ? GRADE_LABEL[low] : `${GRADE_LABEL[low]}~${GRADE_LABEL[high]}`;
}
/** Display-safe current assessment; true eligibility never uses the displayed range. */
export function careerAssessment(w: World, player: Player, own: boolean) {
  const person = w.people?.[player.id],
    scout = staffMember(w, 'scout')?.ability,
    scale = scoutRangeScale(w);
  return {
    coaching: aptitudeLabel(coachingGrade(player), own, scout, scale),
    managerial: aptitudeLabel(managerialGrade(player), own, scout, scale),
    specialty:
      person?.coaching?.role ??
      (player.qualities
        ? coachingSpecialty({
            position: player.position,
            professionalism: player.personality.professionalism,
            qualities: player.qualities,
          })
        : undefined),
    managerQualified: !!person?.management && managerialEntryReady(person, careerDate(w)),
  };
}
