import { useEffect, useRef, type ReactNode } from 'react';
import s from './App.module.css';
export function Dialog({
  label,
  children,
  onClose,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
        ) || [],
      ).filter((e) => e.getClientRects().length);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const targets = focusable(),
          first = targets[0],
          last = targets.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={s.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={element}
        className={s.modal}
        style={wide ? { maxWidth: 900 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </section>
    </div>
  );
}
