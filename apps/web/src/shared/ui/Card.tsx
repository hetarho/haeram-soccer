import { localizeValue, useTextLocale } from '../../presentation/text';
import type { HTMLAttributes, ReactNode } from 'react';
import s from './Card.module.css';

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  as?: 'article' | 'section' | 'div';
  /** `ticket` and `dark` wear the home's next-match and season plates. */
  surface?: 'sheet' | 'detail' | 'ticket' | 'dark';
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

/** A compact record or summary on a shared material plane, with live content and actions. */
export function Card({
  as: Element = 'article',
  surface = 'detail',
  title,
  meta,
  actions,
  children,
  className,
  ...props
}: CardProps) {
  useTextLocale();
  return (
    <Element
      {...props}
      data-ui="card"
      data-surface={surface}
      className={`${s.card} ${className ?? ''}`}
    >
      {localizeValue(
        (meta != null || title != null) && (
          <header className={s.heading}>
            {localizeValue(meta != null && <div className={s.meta}>{localizeValue(meta)}</div>)}
            {localizeValue(title != null && <h4 className={s.title}>{localizeValue(title)}</h4>)}
          </header>
        ),
      )}
      {localizeValue(
        children != null && <div className={s.content}>{localizeValue(children)}</div>,
      )}
      {localizeValue(
        actions != null && <footer className={s.actions}>{localizeValue(actions)}</footer>,
      )}
    </Element>
  );
}
