import type { ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { ClubCrest } from './ClubCrest';
import { useTeamSheet } from './state';
import s from './ClubLink.module.css';

/**
 * A club's crest and name wherever a club is named: pressing it opens that club's team sheet,
 * ours included (→WEB-58). It reads as text with a dotted underline, and its accessible name says
 * what pressing does.
 */
export function ClubLink({
  w,
  id,
  crest = 16,
  short = false,
  mirror = false,
  large = false,
  className,
  children,
}: {
  w: Pick<World, 'seed' | 'clubs' | 'playerClub'>;
  id: string;
  /** Crest width in CSS pixels; 0 leaves the crest out. */
  crest?: number;
  /** The short name, for tight rows. */
  short?: boolean;
  /** The crest after the name, for a home side that reads toward the score. */
  mirror?: boolean;
  /** A headline name: its own box is the 44 px target. */
  large?: boolean;
  className?: string;
  /** Tags after the name, such as 우리 팀. */
  children?: ReactNode;
}) {
  const club = w.clubs.find((c) => c.id === id);
  if (!club) return <span className={className}>—</span>;
  const mark = crest > 0 && <ClubCrest w={w} id={id} size={crest} />;
  return (
    <button
      data-ui="link"
      type="button"
      className={`${s.link} ${large ? s.large : ''} ${className ?? ''}`}
      aria-label={`${club.name} 팀 정보`}
      onClick={(event) => {
        event.currentTarget.focus();
        useTeamSheet.getState().open(id);
      }}
    >
      {!mirror && mark}
      <span>
        {short ? club.short : club.name}
        {children}
      </span>
      {mirror && mark}
    </button>
  );
}
