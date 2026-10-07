import { Children, isValidElement, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './App.module.css';

// Safari blurs clicked buttons before React opens their dialog. Keep the pointer opener too.
let pointerTrigger: WeakRef<HTMLElement> | undefined;
const rememberPointerTrigger = (event: PointerEvent) => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('button,a[href],input,select,[tabindex]')
      : null;
  if (target) pointerTrigger = new WeakRef(target);
};
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', rememberPointerTrigger, true);
  import.meta.hot?.dispose(() =>
    document.removeEventListener('pointerdown', rememberPointerTrigger, true),
  );
}

export function Dialog({
  label,
  children,
  onClose,
  wide = false,
  actions: footerActions,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  actions?: ReactNode;
}) {
  const element = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const labelId = useId();
  const content = Children.toArray(children);
  const actionsIndex = content.findLastIndex(
    (child) =>
      isValidElement<{ className?: string }>(child) &&
      child.props.className?.split(' ').includes(s.actions),
  );
  const inferredActions = actionsIndex >= 0 ? content.splice(actionsIndex, 1)[0] : undefined;
  const actions = footerActions === undefined ? inferredActions : footerActions;
  useEffect(() => {
    const active = document.activeElement;
    const previous =
      active instanceof HTMLElement && active !== document.body ? active : pointerTrigger?.deref();
    const scroll = { x: window.scrollX, y: window.scrollY };
    const bodyStyle = document.body.style;
    const old = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      width: bodyStyle.width,
      htmlOverflow: document.documentElement.style.overflow,
    };
    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `${-scroll.y}px`;
    bodyStyle.left = `${-scroll.x}px`;
    bodyStyle.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    const background = Array.from(document.body.children)
      .filter(
        (node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop.current,
      )
      .map((node) => ({ node, inert: node.inert }));
    for (const { node } of background) node.inert = true;
    const focusable = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((target) => !target.matches(':disabled') && target.getClientRects().length);
    const focusFirst = () => (focusable()[0] || element.current)?.focus({ preventScroll: true });
    focusFirst();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const targets = focusable(),
          first = targets[0],
          last = targets.at(-1);
        if (!targets.length) {
          e.preventDefault();
          element.current?.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === element.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || !element.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => {
      if (!element.current?.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', focus);
      for (const { node, inert } of background) node.inert = inert;
      bodyStyle.overflow = old.overflow;
      bodyStyle.position = old.position;
      bodyStyle.top = old.top;
      bodyStyle.left = old.left;
      bodyStyle.width = old.width;
      document.documentElement.style.overflow = old.htmlOverflow;
      window.scrollTo(scroll.x, scroll.y);
      requestAnimationFrame(() => {
        if (
          previous?.isConnected &&
          !previous.closest('[inert]') &&
          !document.querySelector('[role="dialog"][aria-modal="true"]')
        )
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return createPortal(
    <div
      ref={backdrop}
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
        aria-labelledby={labelId}
        tabIndex={-1}
      >
        <header className={s.modalHead}>
          <h2 id={labelId}>{label}</h2>
          <button className={s.modalClose} aria-label="창 닫기" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={s.modalBody}>{content}</div>
        {actions && <footer className={s.modalActions}>{actions}</footer>}
      </section>
    </div>,
    document.body,
  );
}
