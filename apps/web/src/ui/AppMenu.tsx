import { useId, type ReactNode } from 'react';
import { useLocale, usePresentation, usePresentationSettings } from '../presentation/react';
import { Dialog } from './Dialog';
import { PixelIcon, type PixelIconName } from './PixelIcon';
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
    <button className={s.row} data-ui="tertiary" data-menu-row onClick={onClick}>
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
  onNews,
  onGuide,
  onGlossary,
  saveTools,
}: {
  onClose: () => void;
  onNews: () => void;
  onGuide: () => void;
  onGlossary: () => void;
  saveTools: ReactNode;
}) {
  const { t } = useLocale();
  const snapshot = usePresentation();
  const settings = usePresentationSettings();
  const id = useId();
  const label = (entries: readonly { id: string; label: string }[], current: string) =>
    entries.find((entry) => entry.id === current)?.label;
  const open = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Dialog label={t('shell.menu')} onClose={onClose}>
      <div className={s.menu} data-testid="app-menu">
        {/* Each preference closes the menu and opens a small centered picker, so the change shows. */}
        <section aria-labelledby={`${id}-appearance`}>
          <h3 id={`${id}-appearance`}>{t('shell.appearance')}</h3>
          <MenuRow
            icon="eye"
            title={t('presentation.changeTheme')}
            detail={label(snapshot.themeRegistry!.entries, snapshot.theme!.id)}
            onClick={open(() => settings.show('theme'))}
          />
          <MenuRow
            icon="news"
            title={t('presentation.changeLanguage')}
            detail={label(snapshot.localeRegistry!.entries, snapshot.locale!.id)}
            onClick={open(() => settings.show('locale'))}
          />
        </section>
        <section aria-labelledby={`${id}-game`}>
          <h3 id={`${id}-game`}>{t('shell.gameSettings')}</h3>
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
