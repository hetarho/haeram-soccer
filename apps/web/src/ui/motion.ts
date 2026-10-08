import { useEffect, useRef, useState } from 'react';

/** Shared easing for every interface transition: quick start, soft landing. */
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

export function reducedMotion() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Browser-native animation; skipped under reduced motion so states land immediately. */
export function play(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | undefined {
  if (!element || typeof element.animate !== 'function' || reducedMotion()) return undefined;
  return element.animate(keyframes, { easing: EASE, ...options });
}

/** Resolves when an exit animation ends (or immediately when motion is reduced). */
export function exit(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  duration = 160,
): Promise<void> {
  const animation = play(element, keyframes, { duration, easing: EASE_IN, fill: 'forwards' });
  if (!animation) return Promise.resolve();
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Keeps content mounted briefly after it disappears so it can animate out.
 * Returns the content to render and whether it is leaving.
 */
export function usePresence<T>(value: T | undefined, duration = 180) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number>(undefined);
  if (value !== undefined && (value !== shown || leaving)) {
    setShown(value);
    setLeaving(false);
  } else if (value === undefined && shown !== undefined && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    timer.current = window.setTimeout(
      () => {
        setShown(undefined);
        setLeaving(false);
      },
      reducedMotion() ? 0 : duration,
    );
    return () => window.clearTimeout(timer.current);
  }, [leaving, duration]);
  return { shown, leaving };
}

/**
 * Ref callback for fixed-position overlays: when the element leaves the DOM, a detached copy
 * plays `keyframes` and is removed, so cards never vanish abruptly. Keep the returned
 * callback stable (module level) so React only runs it on real removal.
 */
export function fadeOutOnRemove(keyframes: Keyframe[], duration = 180) {
  return (element: HTMLElement | null) => {
    if (!element) return;
    return () => {
      if (reducedMotion()) return;
      const ghost = element.cloneNode(true) as HTMLElement;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('data-testid');
      ghost.inert = true;
      ghost.style.pointerEvents = 'none';
      ghost.style.animation = 'none';
      document.body.appendChild(ghost);
      void exit(ghost, keyframes, duration).then(() => ghost.remove());
    };
  };
}
