import type { GameClient } from '../runtime/client';
import { lazy, Suspense, useEffect } from 'react';
import { useGameState } from '../runtime/store';
import type { PlayerScope } from './playerAnalysis';
import { useNavigation, usePlayerSheet } from './state';
import link from './ClubLink.module.css';

// The sheet loads the first time one opens, keeping the profile out of the entry (→ARCH-28).
const OpenPlayerSheet = lazy(() =>
  import('./PlayerSheetDialog').then((module) => ({ default: module.OpenPlayerSheet })),
);

/**
 * One of our players named anywhere: pressing the name opens his player sheet. It looks like a
 * club name (→WEB-58), text with a dotted underline, and its accessible name says what it opens.
 */
export function PlayerLink({
  id,
  name,
  scope,
  className,
}: {
  id: string;
  name: string;
  /** The record the sheet opens on; the club career unless given. */
  scope?: PlayerScope;
  className?: string;
}) {
  return (
    <button
      data-ui="link"
      type="button"
      className={`${link.link} ${className ?? ''}`}
      aria-label={`${name} 선수 기록`}
      onClick={(event) => {
        event.currentTarget.focus();
        usePlayerSheet.getState().open(id, scope);
      }}
    >
      <span>{name}</span>
    </button>
  );
}

/** The one place player sheets open, over any view or dialog. */
export function PlayerSheetHost({ client }: { client: GameClient }) {
  const id = usePlayerSheet((state) => state.id);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // A sheet belongs to the view and the world it was opened from.
  useEffect(() => () => usePlayerSheet.getState().close(), [page, worldId]);
  return id ? (
    <Suspense fallback={null}>
      <OpenPlayerSheet id={id} client={client} />
    </Suspense>
  ) : null;
}
