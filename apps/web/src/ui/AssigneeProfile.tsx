import type { World } from '../../../../packages/contracts/src/types';
import { MANAGER_GONE } from '../../../../packages/engine/src/staff-info';
import type { GameClient } from '../runtime/client';
import { Dialog } from './Dialog';
import { DeskStats } from './OfficeDesk';
import { PersonCareerLink } from './PersonCareer';
import { Money } from './Money';
import { contractLine } from './format';
import { responsibilityAssignee, type ResponsibilityPost } from './intervention';

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
  const { label, member } = responsibilityAssignee(w, post);
  const current = post === 'manager' && member?.name === MANAGER_GONE ? undefined : member;
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  return (
    <Dialog label={`현재 ${label}`} onClose={onClose}>
      {current ? (
        <>
          <h3>{current.name}</h3>
          <p>
            {label}
            {current.born === undefined ? '' : ` · ${w.year - current.born}세`}
          </p>
          <DeskStats
            label="담당자 정보"
            stats={[
              { label: '능력', value: current.ability },
              ...(current.potential === undefined
                ? []
                : [{ label: '잠재력', value: current.potential }]),
              { label: '계약', value: contractLine(current.until, w.year) },
              {
                label: '연봉',
                value: <Money value={current.wage} code={club.country} year={w.year} />,
              },
            ]}
          />
          {current.person && w.people?.[current.person] && (
            <PersonCareerLink id={current.person} name={current.name} client={client} />
          )}
        </>
      ) : (
        <p>현재 {label}은 공석입니다.</p>
      )}
    </Dialog>
  );
}
