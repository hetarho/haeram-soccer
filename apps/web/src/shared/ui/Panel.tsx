import type { ReactNode } from 'react';
import { localizeValue, useTextLocale } from '../../presentation/text';
import s from './styles/App.module.css';

export function Panel({
  title,
  note,
  action,
  children,
  footer,
}: {
  title: string;
  note?: ReactNode;
  /** A control at the header's end, such as a view-settings button. */
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useTextLocale();
  return (
    <section data-surface="panel" data-ui="content-panel" className={s.panel}>
      <div data-ui="panel-header" className={s.panelHead}>
        <div className={s.panelHeading}>
          <h3>{localizeValue(title)}</h3>
          {localizeValue(note && <span>{localizeValue(note)}</span>)}
        </div>
        {localizeValue(action)}
      </div>
      {localizeValue(children)}
      {localizeValue(
        footer && (
          <div data-ui="panel-footer" className={s.panelFoot}>
            {localizeValue(footer)}
          </div>
        ),
      )}
    </section>
  );
}
