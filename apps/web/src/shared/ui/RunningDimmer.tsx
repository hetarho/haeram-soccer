import { useEffect, useId, useRef, type FocusEvent, type ReactNode } from 'react';
import { displayMessage, useTextLocale } from '../../presentation/text';
import { useStoppedRead } from '../lib/useStoppedRead';
import s from './RunningDimmer.module.css';

/** Keeps a view visible while making stale, clock-dependent reads unavailable. */
export function RunningDimmer({ children }: { children: ReactNode }) {
  useTextLocale();
  const running = useStoppedRead('running');
  const reasonId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLParagraphElement>(null);
  const hadFocus = useRef(false);

  useEffect(() => {
    if (running && (hadFocus.current || contentRef.current?.contains(document.activeElement))) {
      reasonRef.current?.focus();
      hadFocus.current = false;
    }
  }, [running]);

  const rememberFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) hadFocus.current = true;
  };
  const releaseFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hadFocus.current = false;
  };

  return (
    <div className={s.root} data-running={running || undefined}>
      <div
        ref={contentRef}
        className={running ? s.dimmed : undefined}
        aria-disabled={running || undefined}
        aria-describedby={reasonId}
        inert={running}
        onFocusCapture={rememberFocus}
        onBlurCapture={releaseFocus}
      >
        {children}
      </div>
      <p
        ref={reasonRef}
        id={reasonId}
        className={s.reason}
        role="status"
        aria-live="polite"
        tabIndex={running ? -1 : undefined}
        hidden={!running}
      >
        {displayMessage('progression.clockRunning.dimReason')}
      </p>
    </div>
  );
}
