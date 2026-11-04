import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { Player, World } from '../../../../../../packages/contracts/src/types';
import { ClubLink } from '../../../entities/club';
import type { GameClient } from '../../../runtime/client';
import type { Read } from '../../../shared/lib';
import { Dialog } from '../../../ui/Dialog';
import { PersonCareerLink } from '../../../ui/PersonCareer';
import { PlayerProfile } from '../../../ui/PlayerProfile';
import a from '../../../ui/Analysis.module.css';

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
  read: Read<{ player: Player; club: string }>;
  client: GameClient;
  onClose: () => void;
}) {
  useTextLocale();
  const found = read.status === 'ready' ? read.value : undefined;
  const name = found?.player.name ?? sourceMessage('team.column.player');
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
            {richMessage('copy.OtherPlayerSheet.7c16259479')}
          </p>
        ),
      )}
      {localizeValue(
        found && (
          <>
            <p>
              {richMessage('copy.OtherPlayerSheet.b3ec12ceb7', {
                p0: found.player.position,
                p1: w.year - found.player.born,
                p2: ' ',
                p3: (
                  <span onClickCapture={onClose}>
                    <ClubLink w={w} id={found.club} crest={14} />
                  </span>
                ),
              })}
            </p>
            <PlayerProfile w={w} player={found.player} own={false} />
          </>
        ),
      )}
      <PersonCareerLink id={id} name={name} client={client} />
      <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
    </Dialog>
  );
}
