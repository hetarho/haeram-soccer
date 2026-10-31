import {
  useLocale,
  usePresentation,
  usePresentationController,
  usePresentationSettings,
  type PresentationField,
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

/** Registry choices with transactional change feedback; `field` narrows it to one preference. */
export function PresentationSettingsControls({ field }: { field?: PresentationField }) {
  const controller = usePresentationController();
  const snapshot = usePresentation();
  const { t } = useLocale();
  return (
    <div
      className={`${s.settings} ${field ? s.single : ''}`}
      data-testid="presentation-settings"
      aria-busy={snapshot.pending}
    >
      {field !== 'locale' && (
        <label>
          <span>{t('presentation.theme')}</span>
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
      )}
      {field !== 'theme' && (
        <label>
          <span>{t('presentation.language')}</span>
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
  );
}

const pickerTitle = {
  theme: 'presentation.changeTheme',
  locale: 'presentation.changeLanguage',
} as const;

/**
 * One small centered picker over a light dim, so the page behind visibly changes with each
 * choice. The menu opens it for one preference; founding and slots open it for both.
 */
export function PresentationSettings() {
  const { open, field, close } = usePresentationSettings();
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Dialog
      key={field ?? 'all'}
      label={t(field ? pickerTitle[field] : 'presentation.title')}
      onClose={close}
      picker
    >
      <PresentationSettingsControls field={field} />
    </Dialog>
  );
}
