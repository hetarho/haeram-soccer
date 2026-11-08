import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import type { World } from '../../../../../packages/contracts/src/types';
import { MANAGER_GONE } from '../../../../../packages/engine/src/staff-info';
import type { GameClient } from '../../runtime/client';
import { Dialog } from '../../shared/ui/Dialog';
import { DeskStats } from '../../entities/office';
import { PersonCareerLink } from '../../features/person-career';
import { Money } from '../../shared/ui/Money';
import { contractLine } from '../../presentation/format';
import { responsibilityAssignee, type ResponsibilityPost } from '../../entities/office';

/** Current post holders remain readable even when an older save has no person-career record. */
export function AssigneeProfile({
  w,
  post,
  client,
  onClose,
}: {
  w: World;
  post: ResponsibilityPost;
  client: GameClient;
  onClose: () => void;
}) {
  useTextLocale();
  const { label, member } = responsibilityAssignee(w, post);
  const current = post === 'manager' && member?.name === MANAGER_GONE ? undefined : member;
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  return (
    <Dialog
      label={displayMessage('copy.AssigneeProfile.b188515365', { p0: label })}
      onClose={onClose}
    >
      {localizeValue(
        current ? (
          <>
            <h3>{current.name}</h3>
            <p>
              {localizeValue(label)}
              {localizeValue(
                current.born === undefined
                  ? ''
                  : sourceMessage('copy.AssigneeProfile.c8bdab2932', { p0: w.year - current.born }),
              )}
            </p>
            <DeskStats
              label={displayMessage('copy.AssigneeProfile.e2a70fb9c3')}
              stats={[
                { label: sourceMessage('team.column.ability'), value: current.ability },
                ...(current.potential === undefined
                  ? []
                  : [
                      {
                        label: sourceMessage('copy.AssigneeProfile.ad725da0ea'),
                        value: current.potential,
                      },
                    ]),
                {
                  label: sourceMessage('team.column.contract'),
                  value: contractLine(current.until, w.year),
                },
                {
                  label: sourceMessage('team.column.wage'),
                  value: <Money value={current.wage} code={club.country} year={w.year} />,
                },
              ]}
            />
            {localizeValue(
              current.person && w.people?.[current.person] && (
                <PersonCareerLink id={current.person} name={current.name} client={client} />
              ),
            )}
          </>
        ) : (
          <p>{richMessage('copy.AssigneeProfile.7860f7f0f8', { p0: label })}</p>
        ),
      )}
    </Dialog>
  );
}
