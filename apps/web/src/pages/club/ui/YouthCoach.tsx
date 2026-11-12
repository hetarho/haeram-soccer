import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type { World } from '../../../../../../packages/contracts/src/types';
import { staffMember, STAFF_TRAIT_INFO } from '../../../../../../packages/engine/src/staff-info';
import type { OfficeRead } from '../../../runtime/officeRead';
import { Card } from '../../../shared/ui/Card';
import { DeskStats, type DeskStat } from '../../../entities/office';
import { openStaff } from '../../../shared/routing/state';
import { decimal, signed } from '../../../presentation/format';
import s from '../../../shared/ui/styles/InvestmentView.module.css';

/**
 * The youth director's training, on the youth page (→WEB-116): what his ability and trait add to
 * the academy's prospects — growth, intake potential, and for a developer the under-21s' growth —
 * read as his effect, not as money. His pay and the academy's investment are the 단장's.
 */
export function YouthCoach({ w, office }: { w: World; office: OfficeRead }) {
  useTextLocale();
  const coach = staffMember(w, 'youth'),
    effects = office.youthCoach,
    times = (value: number) => `×${decimal(value, 2)}`;
  const stats: DeskStat[] = [
    { label: sourceMessage('youth.coach.growth'), value: times(effects.academyGrowth) },
    { label: sourceMessage('youth.coach.potential'), value: signed(effects.academyQuality) },
    ...(effects.youthDevelopment !== 1
      ? [{ label: sourceMessage('youth.coach.u21'), value: times(effects.youthDevelopment) }]
      : []),
  ];
  return (
    <Card
      as="section"
      surface="sheet"
      className={s.panel}
      data-testid="youth-coach"
      title={displayMessage('youth.coach.title')}
      meta={
        !coach
          ? displayMessage('team.vacant')
          : coach.trait
            ? displayMessage('youth.coach.personTrait', {
                name: coach.name,
                ability: Math.round(coach.ability),
                trait: STAFF_TRAIT_INFO[coach.trait].label,
              })
            : displayMessage('copy.AcademyPanel.95ca4ba319', {
                p0: coach.name,
                p1: Math.round(coach.ability),
              })
      }
      actions={
        <button type="button" data-ui="secondary" onClick={() => openStaff('youth')}>
          {richMessage('copy.AcademyPanel.3d7cc9563f')}
        </button>
      }
    >
      <DeskStats label={displayMessage('youth.coach.title')} stats={stats} />
      <p className={s.coachNote}>
        {localizeValue(coach ? richMessage('youth.coach.line') : richMessage('youth.coach.vacant'))}
      </p>
    </Card>
  );
}
