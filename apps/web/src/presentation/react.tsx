import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { PresentationController } from './controller';
import type { ThemeImageNeed } from './theme';

const PresentationContext = createContext<PresentationController | null>(null);
const SettingsContext = createContext<{ open: boolean; show(): void; close(): void } | null>(null);

export function PresentationProvider({
  controller,
  children,
}: {
  controller: PresentationController;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PresentationContext value={controller}>
      <SettingsContext value={{ open, show: () => setOpen(true), close: () => setOpen(false) }}>
        {children}
      </SettingsContext>
    </PresentationContext>
  );
}

export function usePresentationController() {
  const controller = useContext(PresentationContext);
  if (!controller) throw new Error('PresentationProvider is missing');
  return controller;
}
export function usePresentation() {
  const controller = usePresentationController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
export function useLocale() {
  const locale = usePresentation().locale;
  if (!locale) throw new Error('Locale resources are not ready');
  return locale;
}
export function useTheme() {
  const theme = usePresentation().theme;
  if (!theme) throw new Error('Theme resources are not ready');
  return theme;
}
/** Decorative icons also render in isolated markup tests without application resources. */
export function useOptionalTheme() {
  const controller = useContext(PresentationContext);
  const theme = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    () => controller?.getSnapshot().theme,
    () => controller?.getSnapshot().theme,
  );
  return theme;
}
/** Register semantic needs so a new pack resolves only the facility scenes currently mounted. */
export function useThemeNeed(need: ThemeImageNeed) {
  const controller = useContext(PresentationContext);
  const identity = JSON.stringify(need);
  useLayoutEffect(() => controller?.registerNeed(need), [controller, identity]);
}
export function usePresentationSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('PresentationProvider is missing');
  return settings;
}

/** After first success, resource changes never unmount the game or its drafts/playback. */
export function PresentationBoundary({ children }: { children: ReactNode }) {
  const snapshot = usePresentation();
  const controller = usePresentationController();
  if (snapshot.locale && snapshot.theme) return children;
  return (
    <main aria-busy={snapshot.pending} style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <p
        role={snapshot.error ? 'alert' : 'status'}
        data-testid={snapshot.error ? 'presentation-initial-error' : 'presentation-pending'}
      >
        {snapshot.error
          ? '화면 설정을 불러오지 못했어요. 다시 시도해 주세요.'
          : '화면 설정을 불러오는 중…'}
      </p>
      {!!snapshot.error && (
        <button data-testid="presentation-retry" onClick={() => void controller.retry()}>
          다시 시도
        </button>
      )}
    </main>
  );
}
