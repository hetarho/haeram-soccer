import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Command, World } from '../../../../../packages/contracts/src/types';
type Entry = { command: Command; before: World; after: World };
import { useGameState } from '../../runtime/store';
import { describeOutcome } from '../model/outcome';
import s from './ActionOutcome.module.css';
import { PixelIcon } from '../../shared/ui/PixelIcon';
import { fadeOutOnRemove } from '../../shared/ui/motion';
import { useNavigation } from '../../shared/routing/state';

const outcomeExit = fadeOutOnRemove([
  { opacity: 1, transform: 'none' },
  { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
]);

const VISIBLE_MS = 8000;

/**
 * Shows what the player's last decision changed. Decisions made inside a sheet are held until
 * every dialog has closed. Each keeps its own before/after, because the clock may run between them.
 */
export function ActionOutcome() {
  useTextLocale();
  const page = useNavigation((state) => state.page);
  const element = useRef<HTMLElement | null>(null);
  const attach = useCallback((node: HTMLElement | null) => {
    element.current = node;
    return outcomeExit(node);
  }, []);
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
    // Live playback reveals a match itself, and a settings change shows on screen while leaving a
    // held card alone. Other actions freeze the world they published, so later clock ticks never
    // leak into the summary.
    const type = lastAction.command.type;
    if (type === 'next-match' || !world) setBatch(undefined);
    else if (type !== 'settings')
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
  // Anchor above the actual bottom controls; their heights vary by viewport and theme.
  useLayoutEffect(() => {
    const toast = element.current;
    if (!visible || !toast) return;
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-ui="season-transport"], [data-ui="game-shell"] > nav',
      ),
    );
    const place = () => {
      let edge = window.innerHeight;
      for (const control of controls) {
        const bounds = control.getBoundingClientRect();
        if (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.top < window.innerHeight &&
          bounds.bottom > 0
        )
          edge = Math.min(edge, Math.max(0, bounds.top));
      }
      toast.style.setProperty('--toast-clearance', `${window.innerHeight - edge}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    controls.forEach((control) => observer.observe(control));
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [visible, batch?.seen, page]);
  if (!visible || !outcome) return null;
  return createPortal(
    <aside
      key={batch!.seen}
      ref={attach}
      className={s.outcome}
      role="status"
      aria-live="polite"
      aria-label={displayMessage('copy.ActionOutcome.3539c4ca1a')}
      data-testid="action-outcome"
      onPointerEnter={() => window.clearTimeout(timer.current)}
    >
      <header>
        <i aria-hidden="true">
          <PixelIcon name="check" size={16} />
        </i>
        <b>{localizeValue(outcome.title)}</b>
        <button onClick={() => setBatch(undefined)}>
          {richMessage('copy.stories.1aacb54c49')}
        </button>
      </header>
      {localizeValue(
        outcome.changes.length > 0 && (
          <ul>
            {localizeValue(
              outcome.changes.slice(0, 5).map((change) => (
                <li key={change.label}>
                  <span>{localizeValue(change.label)}</span>
                  <b className={change.trend ? s[change.trend] : undefined}>
                    {localizeValue(
                      change.previous && (
                        <>
                          <del>{localizeValue(change.previous)}</del> →{localizeValue(' ')}
                        </>
                      ),
                    )}
                    {localizeValue(change.value)}
                  </b>
                </li>
              )),
            )}
          </ul>
        ),
      )}
      {localizeValue(
        outcome.events.slice(0, 2).map((event, i) => (
          <p key={i}>
            <b>{localizeValue(event.title)}</b> {localizeValue(event.detail)}
          </p>
        )),
      )}
      {localizeValue(outcome.note && <small>{localizeValue(outcome.note)}</small>)}
      {localizeValue(
        earlier.length > 0 && (
          <p className={s.earlier}>
            {richMessage('copy.ActionOutcome.7a98b5bba1', {
              p0: ' ',
              p1: earlier.map((entry) => entry.title.replace(/했어요$|바꿨어요$/, '')).join(', '),
            })}
          </p>
        ),
      )}
    </aside>,
    document.body,
  );
}
