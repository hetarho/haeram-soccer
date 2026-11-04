import { localizeValue, useTextLocale } from '../presentation/text';
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
  useTextLocale();
  return (
    <button className={s.row} data-ui="navigation" data-menu-row onClick={onClick}>
      <span className={s.icon}>
        <PixelIcon name={icon} size={20} />
      </span>
      <span className={s.copy}>
        <b>{localizeValue(title)}</b>
        {localizeValue(detail && <small>{localizeValue(detail)}</small>)}
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
  useTextLocale();
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
    <Dialog label={localizeValue(t('shell.menu'))} onClose={onClose}>
      <div className={s.menu} data-testid="app-menu">
        {/* Each preference closes the menu and opens a small centered picker, so the change shows. */}
        <section aria-labelledby={`${id}-appearance`}>
          <h3 id={`${id}-appearance`}>{localizeValue(t('shell.appearance'))}</h3>
          <MenuRow
            icon="eye"
            title={localizeValue(t('presentation.changeTheme'))}
            detail={label(snapshot.themeRegistry!.entries, snapshot.theme!.id)}
            onClick={open(() => settings.show('theme'))}
          />
          <MenuRow
            icon="news"
            title={localizeValue(t('presentation.changeLanguage'))}
            detail={label(snapshot.localeRegistry!.entries, snapshot.locale!.id)}
            onClick={open(() => settings.show('locale'))}
          />
        </section>
        <section aria-labelledby={`${id}-game`}>
          <h3 id={`${id}-game`}>{localizeValue(t('shell.gameSettings'))}</h3>
          <MenuRow icon="bell" title={localizeValue(t('shell.news'))} onClick={open(onNews)} />
        </section>
        <section aria-labelledby={`${id}-help`}>
          <h3 id={`${id}-help`}>{localizeValue(t('shell.help'))}</h3>
          <MenuRow icon="news" title={localizeValue(t('shell.guide'))} onClick={open(onGuide)} />
          <MenuRow
            icon="table"
            title={localizeValue(t('shell.glossary'))}
            onClick={open(onGlossary)}
          />
        </section>
        <section className={s.saveTools} aria-labelledby={`${id}-saves`}>
          <h3 id={`${id}-saves`}>{localizeValue(t('shell.savedGames'))}</h3>
          {localizeValue(saveTools)}
        </section>
      </div>
    </Dialog>
  );
}
