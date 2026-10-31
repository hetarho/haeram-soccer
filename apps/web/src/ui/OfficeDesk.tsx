import { useState, type HTMLAttributes, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import { Card } from './Card';
import { FacilityArt } from './FacilityArt';
import type { FacilityScene } from './facilityScene';
import { RESPONSIBILITY_LABELS } from './intervention';
import { eventDesk } from './eventRouting';
import { delegationCounts } from './officeSummary';
import { cashState } from './teamState';
import { openApprovalRequest } from './state';
import { approvalStanding, overdueSummary } from '../runtime/progression';
import s from './OfficeDesk.module.css';

export type DeskStat = { label: string; value: ReactNode; note?: ReactNode };

/**
 * A room of the owner office (→WEB-39), worn like the clubhouse's office scene: its artwork under
 * a light shade with the room's name and waiting count, its ways in on a strip under the art.
 */
export function DeskScene({
  w,
  kind,
  title,
  caption,
  pending,
  actions,
}: {
  w: World;
  kind: FacilityScene;
  title: string;
  caption?: ReactNode;
  pending?: number;
  actions?: ReactNode;
}) {
  return (
    <section
      className={s.scene}
      data-office-part="scene"
      aria-label={`${title} 현황`}
      data-testid="desk-scene"
    >
      <div className={s.view}>
        <FacilityArt kind={kind} world={w} className={s.sceneArt} eager />
        <div className={s.shade} aria-hidden="true" />
        <header className={s.sceneHead}>
          <b>{title}</b>
          {pending !== undefined && (
            <span className={s.waiting}>
              결재 대기{' '}
              {pending > 0 ? <b data-ui="count">{pending > 99 ? '99+' : pending}</b> : '0'}건
            </span>
          )}
          {caption && <span className={s.caption}>{caption}</span>}
        </header>
      </div>
      {actions && <footer className={s.sceneActions}>{actions}</footer>}
    </section>
  );
}

/** A room's live figures as one row of tiles, kept off its artwork. */
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

/** The responsibility a waiting decision belongs to, as its row's tag. */
function requestTag(item: StopReason) {
  const key = item.responsibilities?.[0] ?? item.responsibility;
  if (key) return RESPONSIBILITY_LABELS[key];
  const desk = eventDesk(item);
  return desk === 'sponsor' ? '후원' : desk === 'investment' ? '재정' : '결재';
}

/**
 * Waiting decisions on the office's ticket, like the next-match report's memo: the first few as
 * rows with their responsibility, 결재 기한 and a review button, the rest one tap away. The lobby's
 * tray also names what the overdue ones cost the squad each settled round (→WEB-100, →STAFF-48).
 */
export function ApprovalTray({
  w,
  items,
  limit = 4,
  morale = false,
}: {
  w: World;
  items: readonly StopReason[];
  limit?: number;
  morale?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  const late = overdueSummary(w, items);
  const meta = (
    <>
      {`결재함 · 대기 ${items.length}건`}
      {late.overdue > 0 && (
        <b className={s.overdue}>
          {` · 지연 ${late.overdue}건${morale ? ` · 라운드마다 분위기 −${late.morale}` : ''}`}
        </b>
      )}
    </>
  );
  return (
    <Card as="section" surface="ticket" className={s.tray} aria-label="결재 대기 업무" meta={meta}>
      {items.length ? (
        <ul className={s.requests}>
          {shown.map((item) => (
            <li key={item.id}>
              <span data-ui="label" className={s.tag}>
                {requestTag(item)}
              </span>
              <span className={s.request}>
                {item.title}
                <Standing w={w} id={item.id} />
              </span>
              <button
                type="button"
                className={s.review}
                aria-label={`${item.title} · 검토하기`}
                onClick={() => openApprovalRequest(w.id, item)}
              >
                검토
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.empty}>지금 결재할 업무가 없어요. 새 요청이 오면 여기에 쌓여요.</p>
      )}
      {items.length > limit && (
        <button
          type="button"
          data-ui="link"
          className={s.more}
          aria-expanded={all}
          onClick={() => setAll((open) => !open)}
        >
          {all ? '접기' : `${items.length - limit}건 더 보기`}
        </button>
      )}
    </Card>
  );
}

/** A row's days to its 결재 기한, in the warning colour once it is overdue. */
function Standing({ w, id }: { w: World; id: string }) {
  const { overdue, label } = approvalStanding(w, id);
  return (
    <small className={overdue ? s.overdue : s.due} data-testid="approval-deadline">
      {label}
    </small>
  );
}

/** The office rooms' shared column. */
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

/** The lobby's scene: the room with the office's waiting count and its two ways in. */
export function LobbyScene({
  w,
  pending,
  actions,
}: {
  w: World;
  pending: readonly StopReason[];
  actions: ReactNode;
}) {
  return (
    <DeskScene
      w={w}
      kind="manager"
      title="구단주 사무실"
      pending={pending.length}
      actions={actions}
    />
  );
}

/** The whole office at a glance: waiting decisions, delegation, money and sponsors. */
export function LobbyStats({
  w,
  sponsors,
  pending,
}: {
  w: World;
  sponsors: readonly SponsorSlotView[];
  pending: readonly StopReason[];
}) {
  const { delegated, total } = delegationCounts(w);
  const cash = cashState(w);
  const open = sponsors.filter((slot) => slot.open);
  return (
    <DeskStats
      label="구단주 사무실 지표"
      stats={[
        { label: '결재 대기', value: `${pending.length}건` },
        { label: '자동 처리', value: `${delegated} / ${total}`, note: '보고·결재 업무' },
        { label: cash.label, value: cash.value, note: cash.status },
        {
          label: '후원',
          value: `${open.filter((slot) => slot.contract).length} / ${open.length}자리`,
        },
      ]}
    />
  );
}
