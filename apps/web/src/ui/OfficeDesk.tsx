import type { HTMLAttributes, ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { ApprovalRows } from './ApprovalQueue';
import { Card } from './Card';
import s from './OfficeDesk.module.css';

export type DeskStat = { label: string; value: ReactNode; note?: ReactNode };

/** A work's live figures as one row of tiles. */
export function DeskStats({ label, stats }: { label: string; stats: readonly DeskStat[] }) {
  return (
    <dl className={s.stats} data-count={stats.length} aria-label={label} data-testid="desk-stats">
      {stats.map((stat) => (
        <div key={stat.label} data-ui="stat-tile">
          <dt>{stat.label}</dt>
          <dd>
            <b>{stat.value}</b>
            {stat.note != null && <small>{stat.note}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One work's waiting requests on a ticket, every one of them with its 결재 기한 and review, as
 * the 결재함 lists them (→WEB-100).
 */
export function ApprovalTray({ w, items }: { w: World; items: readonly StopReason[] }) {
  return (
    <Card
      as="section"
      surface="ticket"
      className={s.tray}
      aria-label="결재 대기 업무"
      meta={`결재 대기 ${items.length}건`}
    >
      {items.length ? (
        <ApprovalRows w={w} items={items} />
      ) : (
        <p className={s.empty}>지금 결재할 업무가 없어요. 새 요청이 오면 결재함에 쌓여요.</p>
      )}
    </Card>
  );
}

/** A work's shared column. */
export function DeskBody({
  children,
  ...props
}: { children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div {...props} className={s.body}>
      {children}
    </div>
  );
}

/** A desk's approval line and criteria side by side on wide screens, stacked on phones. */
export function DeskSettings({ children }: { children: ReactNode }) {
  return <div className={s.settings}>{children}</div>;
}
