import type { ReactNode } from 'react';
import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { PlayerProfileRead, World } from '../../../../../../packages/contracts/src/types';
import { ClubLink } from '../../../entities/club';
import type { GameClient } from '../../../runtime/client';
import type { Read } from '../../../shared/lib';
import { Dialog } from '../../../shared/ui/Dialog';
import { PersonCareerLink } from '../../../features/person-career';
import { number, seasonName } from '../../../presentation/format';
import { PlayerProfile, ballonDorLine } from '../../../entities/player';
import a from '../../../shared/ui/styles/Analysis.module.css';

/**
 * Another club's player (→WEB-59, PLAYER-18): his club and age, then the profile as our chief
 * scout reads him — personality as a range — and his career record. His stats stay with his club.
 */
export function OtherPlayerSheet({
  w,
  id,
  read,
  client,
  onClose,
}: {
  w: World;
  id: string;
  read: Read<PlayerProfileRead>;
  client: GameClient;
  onClose: () => void;
}) {
  useTextLocale();
  const found = read.status === 'ready' ? read.value : undefined;
  const name = found?.player.name ?? sourceMessage('team.column.player');
  const honours =
    found && found.kind !== 'representative' ? ballonDorLine(w.history, id) : undefined;
  const clubLink = (club: string) => (
    <span onClickCapture={onClose}>
      <ClubLink w={w} id={club} crest={14} />
    </span>
  );
  let affiliation: ReactNode;
  if (found?.kind === 'free') affiliation = displayMessage('copy.PlayerCompare.f201ec1d4f');
  else if (found?.kind === 'retired' && found.retired) {
    const season = seasonName(found.retired.year);
    affiliation = found.club
      ? richMessage('player.record.retiredAtClub', { season, club: clubLink(found.club) })
      : richMessage('player.record.retired', { season });
  } else if (found?.kind === 'representative' && found.club)
    affiliation = richMessage('player.record.representative', { club: clubLink(found.club) });
  else if (found?.club) affiliation = clubLink(found.club);
  return (
    <Dialog label={localizeValue(name)} fixed onClose={onClose}>
      {localizeValue(
        read.status === 'loading' && (
          <p className={a.note} role="status">
            {richMessage('copy.OtherPlayerSheet.3bf84e4582')}
          </p>
        ),
      )}
      {localizeValue(
        read.status === 'failed' && (
          <p className={a.note} role="alert">
            {localizeValue(read.error)}
          </p>
        ),
      )}
      {localizeValue(
        found && (
          <>
            <p>
              {richMessage('copy.OtherPlayerSheet.b3ec12ceb7', {
                p0: found.player.position,
                p1: number(w.year - found.player.born),
                p2: ' ',
                p3: affiliation,
              })}
            </p>
            {honours && <p>{localizeValue(honours)}</p>}
            <PlayerProfile w={w} player={found.player} own={false} />
            {found.kind !== 'representative' && found.lines.length > 0 && (
              <div className={a.advanced}>
                <table>
                  <caption>{richMessage('player.record.table')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{richMessage('copy.ClubTrends.a3142392a3')}</th>
                      <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                      <th scope="col">{richMessage('copy.BallonDorView.b849877c07')}</th>
                      <th scope="col">{richMessage('copy.summary.68a6cf8ed8')}</th>
                      <th scope="col">{richMessage('copy.BallonDorView.8d901cc28d')}</th>
                      <th scope="col">{richMessage('copy.RecordsRoom.2a022bd612')}</th>
                      <th scope="col">{richMessage('copy.SeasonReview.2d238e2626')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...found.lines].reverse().map((line) => (
                      <tr key={`${line.year}:${line.club}`}>
                        <th scope="row">{seasonName(line.year)}</th>
                        <td>{clubLink(line.club)}</td>
                        <td>{number(line.appearances)}</td>
                        <td>{number(line.goals)}</td>
                        <td>{number(line.assists)}</td>
                        <td>{line.saves === undefined ? '—' : number(line.saves)}</td>
                        <td>{line.cleanSheets === undefined ? '—' : number(line.cleanSheets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ),
      )}
      <PersonCareerLink id={id} name={name} client={client} />
      <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
    </Dialog>
  );
}
