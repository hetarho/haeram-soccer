import { reducedMotion } from '../ui/motion';

export interface ThemeTransitionPort {
  run(update: () => void): Promise<void>;
  cancel(): void;
  dispose(): void;
}

export const THEME_TRANSITION = {
  duration: 620,
} as const;

/** Root snapshots retain the document's clipping and stacking, including open overlays. */
export function createBrowserThemeTransition(
  document: Document,
  commit: (update: () => void) => void = (update) => update(),
): ThemeTransitionPort {
  let active: { transition: ViewTransition; cleanup: () => void } | undefined;
  let disposed = false;

  function cancel() {
    const previous = active;
    active = undefined;
    previous?.transition.skipTransition();
    previous?.cleanup();
  }

  return {
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
    async run(update) {
      cancel();
      if (
        disposed ||
        document.visibilityState === 'hidden' ||
        reducedMotion() ||
        typeof document.startViewTransition !== 'function'
      ) {
        commit(update);
        return;
      }

      const style = document.createElement('style');
      style.dataset.themeTransition = '';
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        style.remove();
      };
      let updated = false;
      const once = () => {
        if (updated) return;
        updated = true;
        // The host flushes reactive image consumers before the browser takes its new snapshot.
        commit(update);
      };
      try {
        // Naming a button extracts its pixels into a top-layer sibling of the root snapshot.
        // One composited root keeps buttons behind dialogs and inside their clipping parents.
        style.textContent = `
          ::view-transition-group(root) { animation-duration: 0s; }
          ::view-transition-new(root) { animation-duration: ${THEME_TRANSITION.duration}ms; }
        `;
        document.head.append(style);
        const transition = document.startViewTransition(once);
        const current = { transition, cleanup };
        active = current;
        // A skipped/rejected snapshot still invokes the guarded update. Do not await the
        // visual finish: the controls and subsequent selections remain usable immediately.
        void transition.ready.catch(() => {});
        void transition.finished
          .catch(() => {})
          .finally(() => {
            if (active !== current) return;
            active = undefined;
            cleanup();
          });
        await transition.updateCallbackDone;
      } catch (error) {
        if (active?.cleanup === cleanup) cancel();
        cleanup();
        // An exception from the commit itself remains a real resource error.
        if (updated) throw error;
        once();
      }
    },
  };
}
