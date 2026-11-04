import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useState } from 'react';
import type { CareerDate } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { PersonCareerDetail } from '../runtime/personCareer';
import { STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { Dialog } from './Dialog';
import { ClubLink } from '../entities/club';
import { useGameState } from '../runtime/store';
const date = (at: CareerDate) =>
  new Date(Date.UTC(at.year, 7, 1) + at.day * 86400000).toISOString().slice(0, 10);
export function PersonCareerLink({
  id,
  name,
  client,
}: {
  id: string;
  name: string;
  client: GameClient;
}) {
  useTextLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={displayMessage('copy.PersonCareer.2f57e832f7', { p0: name })}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {richMessage('copy.PersonCareer.9a06bc1606')}
      </button>
      {localizeValue(
        open && <PersonCareer id={id} client={client} onClose={() => setOpen(false)} />,
      )}
    </>
  );
}
export function PersonCareer({
  id,
  client,
  onClose,
}: {
  id: string;
  client: GameClient;
  onClose: () => void;
}) {
  useTextLocale();
  const [detail, setDetail] = useState<PersonCareerDetail>(),
    [error, setError] = useState<string>();
  const w = useGameState((state) => state.view?.world);
  useEffect(() => {
    let current = true;
    setDetail(undefined);
    setError(undefined);
    void client.personCareer(id).then(
      (value) => {
        if (current) setDetail(value);
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [id, client]);
  const d = detail?.person.id === id ? detail : undefined;
  return (
    <Dialog label={displayMessage('copy.PersonCareer.9a06bc1606')} onClose={onClose}>
      {localizeValue(
        error ? (
          <p role="status">{richMessage('copy.PersonCareer.d022448529', { p0: error })}</p>
        ) : !d ? (
          <p role="status">{richMessage('copy.PersonCareer.a0e882038c')}</p>
        ) : (
          <>
            <h2>{richMessage('copy.PersonCareer.0ab0fb4510', { p0: d.person.name })}</h2>
            <p>
              {richMessage('copy.PersonCareer.e0f5283afd', {
                p0: d.person.born,
                p1: d.at.year - d.person.born,
              })}
            </p>
            <h3>{richMessage('copy.PersonCareer.e3a69d9427')}</h3>
            {localizeValue(
              d.ownPlayingTotals ? (
                <p>
                  {richMessage('copy.PersonCareer.89a03c5123', {
                    p0: d.ownPlayingTotals[0],
                    p1: d.ownPlayingTotals[1],
                    p2: ' ',
                    p3: d.ownPlayingTotals[2],
                  })}
                </p>
              ) : (
                <p>{richMessage('copy.PersonCareer.d74811434b')}</p>
              ),
            )}
            <p>
              {richMessage('copy.PersonCareer.20d3e29b7c', {
                p0: d.service.days,
                p1: d.service.qualified ? sourceMessage('copy.PersonCareer.6e9e96fef5') : '',
              })}
            </p>
            {localizeValue(d.overlap && <p>{richMessage('copy.PersonCareer.69f7d4ddce')}</p>)}
            {localizeValue(
              d.person.coaching && (
                <p>
                  {richMessage('copy.PersonCareer.58317cb932', {
                    p0: d.person.coaching.ability,
                    p1: d.person.coaching.potential,
                  })}
                </p>
              ),
            )}
            {localizeValue(
              d.person.management && (
                <p>
                  {richMessage('copy.PersonCareer.6cb293c680', {
                    p0: d.person.management.ability,
                    p1: d.person.management.potential,
                    p2: ' ',
                    p3: STYLE_INFO[d.person.management.school].label,
                  })}
                </p>
              ),
            )}
            <h3>{richMessage('copy.PersonCareer.1e133e1a03')}</h3>
            <ol>
              {localizeValue(
                d.person.employment.map((job, index) => (
                  <li key={index}>
                    {localizeValue(
                      job.role === 'player'
                        ? sourceMessage('team.column.player')
                        : job.role === 'manager'
                          ? sourceMessage('staff.role.manager')
                          : STAFF_INFO[job.role].label,
                    )}
                    {localizeValue(' ')}·{' '}
                    {localizeValue(w ? <ClubLink w={w} id={job.club} /> : job.club)} ·{' '}
                    {localizeValue(date(job.from))}–
                    {localizeValue(
                      job.to ? date(job.to) : sourceMessage('copy.PersonCareer.3550bf8b47'),
                    )}
                  </li>
                )),
              )}
            </ol>
            <h3>{richMessage('copy.PersonCareer.98beea919f')}</h3>
            {localizeValue(
              d.person.mentors.length ? (
                <ul>
                  {localizeValue(
                    d.person.mentors.map((mentor, index) => (
                      <li key={index}>
                        {mentor.name} ·{localizeValue(' ')}
                        {localizeValue(
                          mentor.school
                            ? STYLE_INFO[mentor.school].label
                            : sourceMessage('copy.PersonCareer.b03d77dc0e'),
                        )}{' '}
                        ·{localizeValue(' ')}
                        {localizeValue(date(mentor.from))}–
                        {localizeValue(
                          mentor.to
                            ? date(mentor.to)
                            : sourceMessage('copy.InvestmentView.72d2bae2a7'),
                        )}
                      </li>
                    )),
                  )}
                </ul>
              ) : (
                <p>{richMessage('copy.PersonCareer.bc18b11028')}</p>
              ),
            )}
          </>
        ),
      )}
      <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
    </Dialog>
  );
}
