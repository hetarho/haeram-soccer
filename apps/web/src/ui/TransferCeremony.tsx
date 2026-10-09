import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { World } from '../../../../packages/contracts/src/types';
import { transferWindow, WINDOW_INFO } from '../../../../packages/engine/src/transfers';
import { activePlayers, clubOf } from '../../../../packages/engine/src/world';
import { money } from './format';
import { lockLayer } from './Dialog';
import { exit } from './motion';
import s from './TransferCeremony.module.css';

/** Fixed paper strips so the scene never depends on chance or wall time. */
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i % 8) * 110,
  duration: 1700 + (i % 5) * 260,
  drift: ((i * 53) % 80) - 40,
  tone: i % 3,
}));

/**
 * The opening of a transfer window as a full-screen moment: lights, confetti, the deadline and
 * the money to spend, then one way into the market.
 */
export function TransferCeremony({
  w,
  candidates,
  onEnter,
  onClose,
}: {
  w: World;
  /** Market candidates available this season. */
  candidates: number;
  onEnter: () => void;
  onClose: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const window = transferWindow(w);
  const info = WINDOW_INFO[window.kind || 'summer'];
  const club = clubOf(w);
  useEffect(() => {
    const layer = stage.current!;
    const unlock = lockLayer(layer);
    enter.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      // Two actions: Tab simply alternates between them inside the scene.
      if (event.key === 'Tab') {
        const targets = Array.from(layer.querySelectorAll<HTMLElement>('button'));
        const index = targets.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      unlock();
      const ghost = layer.cloneNode(true) as HTMLElement;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('role');
      ghost.inert = true;
      ghost.style.pointerEvents = 'none';
      document.body.appendChild(ghost);
      void exit(ghost, [{ opacity: 1 }, { opacity: 0 }], 220).then(() => ghost.remove());
    };
  }, []);
  return createPortal(
    <div
      ref={stage}
      className={s.stage}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="transfer-ceremony"
    >
      <div className={s.lights} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={s.confetti} aria-hidden="true">
        {CONFETTI.map((piece, i) => (
          <i
            key={i}
            className={s[`tone${piece.tone}`]}
            style={
              {
                left: `${piece.left}%`,
                animationDelay: `${piece.delay}ms`,
                animationDuration: `${piece.duration}ms`,
                '--drift': `${piece.drift}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section className={s.card}>
        <small className={s.kicker}>TRANSFER WINDOW · OPEN</small>
        <h2 id={titleId}>
          <span>{info.name}</span>
          <b>개장!</b>
        </h2>
        <p className={s.deadline}>
          {info.deadline} 마감 · {window.open ? `D-${window.daysLeft}` : '닫힘'}
        </p>
        <ul className={s.facts}>
          <li>
            <span>영입 예산</span>
            <b>{money(w.cash, club.country, w.year)}</b>
          </li>
          <li>
            <span>시장 후보</span>
            <b>{candidates}명</b>
          </li>
          <li>
            <span>선수단</span>
            <b>{activePlayers(w).length}/26</b>
          </li>
        </ul>
        <button ref={enter} className={s.enter} onClick={onEnter}>
          시장 입장 →
        </button>
        <button className={s.later} onClick={() => close.current()}>
          나중에 둘러보기
        </button>
      </section>
    </div>,
    document.body,
  );
}
