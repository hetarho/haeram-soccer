import { richMessage } from '../../../presentation/LocalizedMessage';
import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import type { ReactNode, Ref } from 'react';
import type { Fixture, World } from '../../../../../../packages/contracts/src/types';
import { ClubCrest } from '../../../entities/club/ui/ClubCrest';
import { competitionLabel } from '../../../presentation/format';
import s from '../../../shared/ui/styles/EventCenter.module.css';

/** Upcoming and unfinished match reports share their card and action layout. */
export function MatchReportCard({
  w,
  fixture,
  continuing = false,
  children,
  ref,
}: {
  w: World;
  fixture: Fixture;
  continuing?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  useTextLocale();
  const home = fixture.home === w.playerClub;
  const opponent = w.clubs.find((club) => club.id === (home ? fixture.away : fixture.home));
  return (
    <aside
      ref={ref}
      data-surface="panel"
      className={`${s.card} ${s.matchReport}`}
      aria-label={displayMessage('copy.EventCenter.46b289bb0a')}
      data-testid={continuing ? 'resume-match-card' : 'event-card'}
    >
      <header>
        <span className={s.kind}>
          {localizeValue(
            continuing
              ? sourceMessage('copy.MatchReportCard.6e749ef1ab')
              : sourceMessage('copy.MatchReportCard.937d98b3d5'),
          )}
        </span>
      </header>
      <h3>
        {richMessage('copy.MatchReportCard.d8bc1c7304', {
          p0: localizeValue(opponent && <ClubCrest w={w} id={opponent.id} size={22} />),
          p1: opponent?.name,
        })}
      </h3>
      <p>
        {localizeValue(home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'))} ·{' '}
        {localizeValue(competitionLabel(w, fixture))} ·{localizeValue(' ')}
        {localizeValue(
          continuing
            ? sourceMessage('copy.MatchReportCard.1932b035a7')
            : sourceMessage('copy.MatchReportCard.8077c4f008'),
        )}
      </p>
      {localizeValue(children)}
    </aside>
  );
}
