import type { Grade } from '../../contracts/src/player';
import type { Player, World } from '../../contracts/src/types';
import { coachingGrade, managerialGrade } from './aptitude';
import { canEncourageCoaching, coachingSpecialty } from './coaching-entry';
import { careerDate } from './person-careers';
import { managerialEntryReady } from './manager-entry';
import { playingCoachDurations } from './playing-coach';
import { GRADE_LABEL, personalityRange } from './player';
import { staffMember } from './staff';
export function aptitudeLabel(grade: Grade | undefined, own: boolean, scoutAbility?: number) {
  if (grade === undefined) return undefined;
  const [low, high] = own ? [grade, grade] : personalityRange(grade, scoutAbility);
  return low === high ? GRADE_LABEL[low] : `${GRADE_LABEL[low]}~${GRADE_LABEL[high]}`;
}
/** Display-safe current assessment; true eligibility never uses the displayed range. */
export function careerAssessment(w: World, player: Player, own: boolean) {
  const person = w.people?.[player.id],
    scout = staffMember(w, 'scout')?.ability;
  return {
    coaching: aptitudeLabel(coachingGrade(player), own, scout),
    managerial: aptitudeLabel(managerialGrade(player), own, scout),
    specialty:
      person?.coaching?.role ??
      (player.qualities
        ? coachingSpecialty({
            position: player.position,
            professionalism: player.personality.professionalism,
            qualities: player.qualities,
          })
        : undefined),
    encourage: own && canEncourageCoaching(w, player.id),
    encouragement: own
      ? person?.intention?.encouraged
        ? { willing: person.intention.willing, changed: person.intention.encouraged.changed }
        : undefined
      : undefined,
    playingCoachYears: own ? playingCoachDurations(w, player.id) : [],
    playingCoach: own ? w.playingCoachProposals?.[player.id] : undefined,
    managerQualified: !!person?.management && managerialEntryReady(person, careerDate(w)),
  };
}
export type CareerAssessment = ReturnType<typeof careerAssessment>;
