import { useId, type ReactNode } from 'react';
import { useLocale } from '../presentation/react';
import { Dialog } from './Dialog';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { PresentationSettingsControls } from './PresentationSettings';
import s from './AppMenu.module.css';

function MenuRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: PixelIconName;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button className={s.row} onClick={onClick}>
      <span className={s.icon}>
        <PixelIcon name={icon} size={20} />
      </span>
      <span className={s.copy}>
        <b>{title}</b>
        {detail && <small>{detail}</small>}
      </span>
      <PixelIcon name="chevronRight" size={16} />
    </button>
  );
}

export function AppMenu({
  onClose,
  onResponsibilities,
  onNews,
  onGuide,
  onGlossary,
  saveTools,
}: {
  onClose: () => void;
  onResponsibilities: () => void;
  onNews: () => void;
  onGuide: () => void;
  onGlossary: () => void;
  saveTools: ReactNode;
}) {
  const { t } = useLocale();
  const id = useId();
  const open = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Dialog label={t('shell.menu')} onClose={onClose}>
      <div className={s.menu} data-testid="app-menu">
        <section className={s.appearance} aria-labelledby={`${id}-appearance`}>
          <h3 id={`${id}-appearance`}>{t('shell.appearance')}</h3>
          <PresentationSettingsControls inline />
        </section>
        <section aria-labelledby={`${id}-game`}>
          <h3 id={`${id}-game`}>{t('shell.gameSettings')}</h3>
          <MenuRow
            icon="people"
            title={t('shell.responsibilities')}
            detail={t('shell.responsibilitiesHint')}
            onClick={open(onResponsibilities)}
          />
          <MenuRow icon="bell" title={t('shell.news')} onClick={open(onNews)} />
        </section>
        <section aria-labelledby={`${id}-help`}>
          <h3 id={`${id}-help`}>{t('shell.help')}</h3>
          <div className={s.help}>
            <MenuRow icon="news" title={t('shell.guide')} onClick={open(onGuide)} />
            <MenuRow icon="table" title={t('shell.glossary')} onClick={open(onGlossary)} />
          </div>
        </section>
        <section className={s.saveTools} aria-labelledby={`${id}-saves`}>
          <h3 id={`${id}-saves`}>{t('shell.savedGames')}</h3>
          {saveTools}
        </section>
      </div>
    </Dialog>
  );
}
