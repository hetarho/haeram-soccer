const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The browser's reduced-motion preference, read on each call. A missing or failing media query
 * means full motion, so animation stays a progressive enhancement.
 */
export function reducedMotion() {
  try {
    return matchMedia(REDUCED_MOTION).matches;
  } catch {
    return false;
  }
}
