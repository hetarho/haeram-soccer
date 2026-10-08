import { useEffect, useRef, useState } from 'react';
import type { Command, World } from '../../../../packages/contracts/src/types';
type Entry = { command: Command; before: World; after: World };
import { useGameState } from '../runtime/store';
import { describeOutcome } from './outcome';
import s from './ActionOutcome.module.css';
import { fadeOutOnRemove } from './motion';

const outcomeExit = fadeOutOnRemove([
  { opacity: 1, transform: 'none' },
  { opacity: 0, transform: 'translateY(-10px) scale(0.98)' },
]);

const VISIBLE_MS = 8000;

/**
 * Shows what the player's last decision changed. Decisions made inside a sheet are held until
 * every dialog has closed. Each keeps its own before/after, because the clock may run between them.
 */
export function ActionOutcome() {
  const lastAction = useGameState((state) => state.lastAction);
  const world = useGameState((state) => state.view?.world);
  const [batch, setBatch] = useState<{
    entries: Entry[];
    seen: number;
    /** Once a card has been on screen, the next decision starts a new card. */
    shown?: boolean;
  }>();
  const [dialogs, setDialogs] = useState(0);
  const timer = useRef<number>(undefined);
  useEffect(() => {
    const open = new Set<string>();
    const change = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; open: boolean }>).detail;
      if (detail.open) open.add(detail.id);
      else open.delete(detail.id);
      setDialogs(open.size);
    };
    window.addEventListener('haeram:dialog', change);
    return () => window.removeEventListener('haeram:dialog', change);
  }, []);
  const [handled, setHandled] = useState(lastAction?.id);
  if (lastAction && lastAction.id !== handled) {
    setHandled(lastAction.id);
    // Live playback reveals a match itself. Other actions freeze the world they published,
    // so later clock ticks never leak into the summary.
    if (lastAction.command.type === 'next-match' || !world) setBatch(undefined);
    else
      setBatch((current) => {
        const entry = { command: lastAction.command, before: lastAction.before, after: world };
        const keep =
          current && !current.shown && current.entries[0].before.id === lastAction.before.id;
        return { entries: [...(keep ? current.entries : []), entry], seen: lastAction.id };
      });
  }
  const latest = batch?.entries.at(-1);
  const outcome = latest && describeOutcome(latest.command, latest.before, latest.after);
  const earlier = (batch?.entries.slice(0, -1) || []).flatMap(
    (entry) => describeOutcome(entry.command, entry.before, entry.after) || [],
  );
  const visible = !!outcome && dialogs === 0;
  // Opening another sheet means the player has moved on from a card already seen.
  if (dialogs > 0 && batch?.shown) setBatch(undefined);
  useEffect(() => {
    if (!visible) return;
    setBatch((current) => current && (current.shown ? current : { ...current, shown: true }));
    timer.current = window.setTimeout(() => setBatch(undefined), VISIBLE_MS);
    return () => window.clearTimeout(timer.current);
  }, [visible, batch?.seen]);
  if (!visible || !outcome) return null;
  return (
    <aside
      key={batch!.seen}
      ref={outcomeExit}
      className={s.outcome}
      role="status"
      aria-live="polite"
      aria-label="방금 한 결정의 결과"
      data-testid="action-outcome"
      onPointerEnter={() => window.clearTimeout(timer.current)}
    >
      <header>
        <i aria-hidden="true">✓</i>
        <b>{outcome.title}</b>
        <button onClick={() => setBatch(undefined)}>확인</button>
      </header>
      {outcome.changes.length > 0 && (
        <ul>
          {outcome.changes.slice(0, 5).map((change) => (
            <li key={change.label}>
              <span>{change.label}</span>
              <b className={change.trend ? s[change.trend] : undefined}>
                {change.previous && (
                  <>
                    <del>{change.previous}</del> →{' '}
                  </>
                )}
                {change.value}
              </b>
            </li>
          ))}
        </ul>
      )}
      {outcome.events.slice(0, 2).map((event, i) => (
        <p key={i}>
          <b>{event.title}</b> {event.detail}
        </p>
      ))}
      {outcome.note && <small>{outcome.note}</small>}
      {earlier.length > 0 && (
        <p className={s.earlier}>
          함께 반영한 결정 ·{' '}
          {earlier.map((entry) => entry.title.replace(/했어요$|바꿨어요$/, '')).join(', ')}
        </p>
      )}
    </aside>
  );
}
