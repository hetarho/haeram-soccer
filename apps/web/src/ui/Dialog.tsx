import { Children, isValidElement, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './App.module.css';
import { exit, play, reducedMotion } from './motion';

const sheet = () => {
  try {
    return matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
};

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

// One background lock survives modal handoffs and nested sheets.
const layers: HTMLElement[] = [];
const inertBefore = new Map<HTMLElement, boolean>();
let unlockBody: (() => void) | undefined;
function syncBackground() {
  const top = layers.findLast((layer) => layer.isConnected);
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) continue;
    if (!inertBefore.has(node)) inertBefore.set(node, node.inert);
    node.inert = node !== top || inertBefore.get(node)!;
  }
}
/** Makes everything outside `layer` inert and locks body scroll until the returned release. */
export function lockLayer(layer: HTMLElement) {
  if (!layers.length) {
    const scroll = { x: scrollX, y: scrollY };
    const style = document.body.style;
    const old = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      left: style.left,
      width: style.width,
      html: document.documentElement.style.overflow,
    };
    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `${-scroll.y}px`;
    style.left = `${-scroll.x}px`;
    style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    unlockBody = () => {
      Object.assign(style, {
        overflow: old.overflow,
        position: old.position,
        top: old.top,
        left: old.left,
        width: old.width,
      });
      document.documentElement.style.overflow = old.html;
      window.scrollTo(scroll.x, scroll.y);
    };
  }
  layers.push(layer);
  syncBackground();
  return () => {
    const index = layers.indexOf(layer);
    if (index >= 0) layers.splice(index, 1);
    if (layers.length) syncBackground();
    else {
      for (const [node, inert] of inertBefore) node.inert = inert;
      inertBefore.clear();
      unlockBody?.();
      unlockBody = undefined;
    }
  };
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
  const requestClose = () => close.current();
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
    window.dispatchEvent(new CustomEvent('haeram:dialog', { detail: { id: labelId, open: true } }));
    const active = document.activeElement;
    const previous =
      active instanceof HTMLElement && active !== document.body ? active : pointerTrigger?.deref();
    const layer = backdrop.current!;
    const unlock = lockLayer(layer);
    const mobile = sheet();
    play(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    play(
      element.current,
      [
        { opacity: 0, transform: mobile ? 'translateY(56px)' : 'translateY(12px) scale(0.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: mobile ? 300 : 240 },
    );
    const focusable = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((target) => !target.matches(':disabled') && target.getClientRects().length);
    const focusFirst = () => (focusable()[0] || element.current)?.focus({ preventScroll: true });
    focusFirst();
    const key = (e: KeyboardEvent) => {
      if (layers.at(-1) !== layer) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
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
      if (layers.at(-1) !== layer) return;
      if (!element.current?.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    return () => {
      window.dispatchEvent(
        new CustomEvent('haeram:dialog', { detail: { id: labelId, open: false } }),
      );
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', focus);
      unlock();
      // Every close path unmounts; a detached copy fades out so no dialog vanishes abruptly.
      if (!reducedMotion()) {
        const ghost = layer.cloneNode(true) as HTMLElement;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.inert = true;
        ghost.style.pointerEvents = 'none';
        document.body.appendChild(ghost);
        const panel = ghost.querySelector('[role="dialog"]');
        panel?.removeAttribute('role');
        void Promise.all([
          exit(ghost, [{ opacity: 1 }, { opacity: 0 }], 180),
          exit(
            panel,
            [{ transform: 'none' }, { transform: mobile ? 'translateY(40px)' : 'scale(0.96)' }],
            180,
          ),
        ]).then(() => ghost.remove());
      }
      requestAnimationFrame(() => {
        if (
          previous?.isConnected &&
          !previous.closest('[inert]') &&
          (!document.querySelector('[role="dialog"][aria-modal="true"]') ||
            previous.closest('[role="dialog"][aria-modal="true"]'))
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
        if (e.target === e.currentTarget) requestClose();
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
          <button className={s.modalClose} aria-label="창 닫기" onClick={requestClose}>
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
