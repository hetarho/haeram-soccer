import { useState } from 'react';
import { useLocale } from '../../presentation/react';
import { localizeValue, useTextLocale } from '../../presentation/text';
import { Dialog } from '../../shared/ui/Dialog';
import s from '../../shared/ui/styles/App.module.css';

export function SaveImportConfirmation({
  blocked,
  onClose,
  onExport,
  onImport,
}: {
  blocked: boolean;
  onClose: () => void;
  onExport: () => Promise<void>;
  onImport: () => Promise<void> | undefined;
}) {
  useTextLocale();
  const { t } = useLocale();
  const [importing, setImporting] = useState(false);
  const dismiss = () => {
    if (!importing) onClose();
  };
  const confirm = async () => {
    if (importing || blocked) return;
    const operation = onImport();
    if (!operation) return;
    setImporting(true);
    try {
      await operation;
    } finally {
      onClose();
    }
  };
  return (
    <Dialog label={localizeValue(t('save.confirmImport'))} onClose={dismiss}>
      <h2>{localizeValue(t('save.importQuestion'))}</h2>
      <p>{localizeValue(t('save.importNotice'))}</p>
      <div className={s.actions}>
        <button type="button" disabled={importing} onClick={() => void onExport()}>
          {localizeValue(t('save.exportCurrent'))}
        </button>
        <button type="button" disabled={importing} onClick={dismiss}>
          {localizeValue(t('common.cancel'))}
        </button>
        <button
          type="button"
          data-ui="primary"
          className={s.primary}
          disabled={importing || blocked}
          onClick={confirm}
        >
          {localizeValue(t('save.replaceAndImport'))}
        </button>
      </div>
    </Dialog>
  );
}
