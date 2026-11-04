import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { openPlayer, type PlayerScope } from '../model/detail';
import s from '../../../shared/ui/TextLink.module.css';

/**
 * A player named anywhere, ours or another club's: pressing the name opens his detail (→WEB-59).
 * It looks like a club name (→WEB-58), text with a dotted underline, and its accessible name says
 * what it opens.
 */
export function PlayerLink({
  id,
  name,
  club,
  scope,
  className,
}: {
  id: string;
  name: string;
  /** Another club's player: the club he plays for, so his detail is found at once. */
  club?: string;
  /** The record the detail opens on; the club career unless given. */
  scope?: PlayerScope;
  className?: string;
}) {
  useTextLocale();
  return (
    <button
      data-ui="link"
      type="button"
      className={`${s.link} ${className ?? ''}`}
      aria-label={displayMessage('copy.MatchMaterial.1a923aba55', { p0: name })}
      onClick={(event) => {
        event.currentTarget.focus();
        openPlayer({ id, club, scope });
      }}
    >
      <span>{localizeValue(name)}</span>
    </button>
  );
}
