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
  return (
    <Element
      {...props}
      data-ui="card"
      data-surface={surface}
      className={`${s.card} ${className ?? ''}`}
    >
      {(meta != null || title != null) && (
        <header className={s.heading}>
          {meta != null && <div className={s.meta}>{meta}</div>}
          {title != null && <h4 className={s.title}>{title}</h4>}
        </header>
      )}
      {children != null && <div className={s.content}>{children}</div>}
      {actions != null && <footer className={s.actions}>{actions}</footer>}
    </Element>
  );
}
