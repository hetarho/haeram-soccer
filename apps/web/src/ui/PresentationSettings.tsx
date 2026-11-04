import { localizeValue, useTextLocale } from '../presentation/text';
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
  useTextLocale();
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
      {localizeValue(t('presentation.open'))}
    </button>
  );
}

/** Registry choices with transactional change feedback; `field` narrows it to one preference. */
export function PresentationSettingsControls({ field }: { field?: PresentationField }) {
  useTextLocale();
  const controller = usePresentationController();
  const snapshot = usePresentation();
  const { t } = useLocale();
  return (
    <div
      className={`${s.settings} ${field ? s.single : ''}`}
      data-testid="presentation-settings"
      aria-busy={snapshot.pending}
    >
      {localizeValue(
        field !== 'locale' && (
          <label>
            <span>{localizeValue(t('presentation.theme'))}</span>
            <Select
              aria-label={localizeValue(t('presentation.theme'))}
              data-testid="presentation-theme"
              value={snapshot.theme!.id}
              onValueChange={(themeId) => void controller.select({ themeId })}
            >
              {localizeValue(
                snapshot.themeRegistry!.entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {localizeValue(entry.label)}
                  </option>
                )),
              )}
            </Select>
          </label>
        ),
      )}
      {localizeValue(
        field !== 'theme' && (
          <label>
            <span>{localizeValue(t('presentation.language'))}</span>
            <Select
              aria-label={localizeValue(t('presentation.language'))}
              data-testid="presentation-locale"
              value={snapshot.locale!.id}
              onValueChange={(localeId) => void controller.select({ localeId })}
            >
              {localizeValue(
                snapshot.localeRegistry!.entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                )),
              )}
            </Select>
          </label>
        ),
      )}
      {localizeValue(
        snapshot.sessionOnly && (
          <p role="status" data-testid="presentation-session-only">
            {localizeValue(t('presentation.sessionOnly'))}
          </p>
        ),
      )}
      {localizeValue(
        !!snapshot.error && (
          <div role="alert" data-testid="presentation-error">
            <p>{localizeValue(t('presentation.changeFailed'))}</p>
            <button data-testid="presentation-retry" onClick={() => void controller.retry()}>
              {localizeValue(t('presentation.retry'))}
            </button>
          </div>
        ),
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
  useTextLocale();
  const { open, field, close } = usePresentationSettings();
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Dialog
      key={field ?? 'all'}
      label={localizeValue(t(field ? pickerTitle[field] : 'presentation.title'))}
      onClose={close}
      picker
    >
      <PresentationSettingsControls field={field} />
    </Dialog>
  );
}
