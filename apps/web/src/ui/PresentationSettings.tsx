import {
  useLocale,
  usePresentation,
  usePresentationController,
  usePresentationSettings,
} from '../presentation/react';
import { Dialog } from './Dialog';
import { Select } from './Select';
import s from './PresentationSettings.module.css';

export function PresentationSettingsTrigger({
  onOpen,
  className,
}: {
  onOpen?: () => void;
  className?: string;
}) {
  const { t } = useLocale();
  const settings = usePresentationSettings();
  return (
    <button
      type="button"
      data-testid="presentation-settings-trigger"
      className={className ?? s.trigger}
      onClick={() => {
        onOpen?.();
        settings.show();
      }}
    >
      {t('presentation.open')}
    </button>
  );
}

/** One host serves founding, slots, and the HUD menu. Options remain registry data. */
export function PresentationSettings() {
  const { open, close } = usePresentationSettings();
  const controller = usePresentationController();
  const snapshot = usePresentation();
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Dialog label={t('presentation.title')} onClose={close}>
      <div className={s.settings} data-testid="presentation-settings">
        <label>
          {t('presentation.language')}
          <Select
            aria-label={t('presentation.language')}
            data-testid="presentation-locale"
            value={snapshot.locale!.id}
            onValueChange={(localeId) => void controller.select({ localeId })}
          >
            {snapshot.localeRegistry!.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          {t('presentation.theme')}
          <Select
            aria-label={t('presentation.theme')}
            data-testid="presentation-theme"
            value={snapshot.theme!.id}
            onValueChange={(themeId) => void controller.select({ themeId })}
          >
            {snapshot.themeRegistry!.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </label>
        {snapshot.pending && (
          <p role="status" data-testid="presentation-pending">
            {t('presentation.applying')}
          </p>
        )}
        {snapshot.sessionOnly && (
          <p role="status" data-testid="presentation-session-only">
            {t('presentation.sessionOnly')}
          </p>
        )}
        {!!snapshot.error && (
          <div role="alert" data-testid="presentation-error">
            <p>{t('presentation.changeFailed')}</p>
            <button data-testid="presentation-retry" onClick={() => void controller.retry()}>
              {t('presentation.retry')}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
