import { useEffect, useRef } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { approvalStanding, overdueSummary } from '../runtime/progression';
import {
  matchesFilter,
  orderApprovals,
  queueFilter,
  queueFilters,
  QUEUE_FILTER,
  QUEUE_RETURN,
  requestKeys,
  requestSubject,
  returnFocus,
  type QueueFilter,
  type QueueReturn,
} from './approvalOrder';
import { eventDesk } from './eventRouting';
import { RESPONSIBILITY_LABELS } from './intervention';
import { OfficeBar } from './OfficeBar';
import { Segments } from './Segments';
import { openApprovalRequest } from './state';
import { TaskReturn } from './TaskReturn';
import { useTaskMemory, useTaskState } from './taskMemory';
import s from './ApprovalQueue.module.css';

/** The responsibility a waiting request belongs to, as its row's kind. */
function requestTag(item: StopReason) {
  const key = requestKeys(item)[0];
  if (key) return RESPONSIBILITY_LABELS[key];
  const desk = eventDesk(item);
  return desk === 'sponsor' ? '후원' : desk === 'investment' ? '재정' : '결재';
}

/**
 * Waiting requests as rows: kind, title, subject, 결재 기한 in the warning colour once overdue
 * (→STAFF-48) and an explicit 검토 that opens the request itself (→WEB-100).
 */
export function ApprovalRows({
  w,
  items,
  onReview,
}: {
  w: World;
  items: readonly StopReason[];
  onReview?: (item: StopReason, index: number) => void;
}) {
  return (
    <ul className={s.requests} aria-label="결재 대기 업무">
      {items.map((item, index) => {
        const standing = approvalStanding(w, item.id);
        const subject = requestSubject(w, item);
        return (
          <li key={item.id} data-request-id={item.id}>
            <span data-ui="label" className={s.tag}>
              {requestTag(item)}
            </span>
            <span className={s.request}>
              <b>{item.title}</b>
              <small className={s.meta}>
                {subject && <span>{subject} · </span>}
                <span
                  className={standing.overdue ? s.overdue : s.due}
                  data-testid="approval-deadline"
                >
                  {standing.label}
                </span>
              </small>
            </span>
            <button
              type="button"
              className={s.review}
              data-review-id={item.id}
              aria-label={`${item.title} · 검토하기`}
              onClick={() => {
                onReview?.(item, index);
                openApprovalRequest(w.id, item);
              }}
            >
              검토
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The owner office (→WEB-39/100): a quiet 결재함 heading over every actual waiting request, in
 * deadline order with its filters, and nothing else to do there. The filter and the place a review
 * left from belong to this world's task memory; the content region keeps the scroll (→WEB-74).
 */
export function ApprovalQueue({
  w,
  pending,
  onOverview,
}: {
  w: World;
  pending: readonly StopReason[];
  onOverview: () => void;
}) {
  const [stored, setFilter] = useTaskState<QueueFilter>(w.id, QUEUE_FILTER, 'all');
  const filter = queueFilter(stored);
  const overdue = (id: string) => approvalStanding(w, id).overdue;
  const ordered = orderApprovals(w, pending);
  const rows = ordered.filter((item) => matchesFilter(overdue, item, filter));
  const late = overdueSummary(w, pending);
  const empty = useRef<HTMLHeadingElement>(null);
  const shown = useRef(rows);
  shown.current = rows;
  // Back from a review, focus moves to the request still waiting there or the one in its place.
  useEffect(() => {
    const memory = useTaskMemory.getState();
    const from = memory.values[QUEUE_RETURN] as QueueReturn | undefined;
    if (memory.world !== w.id || !from?.back) return;
    useTaskMemory.setState({
      values: Object.fromEntries(
        Object.entries(memory.values).filter(([key]) => key !== QUEUE_RETURN),
      ),
    });
    const id = returnFocus(shown.current, from);
    const target = id
      ? document.querySelector<HTMLElement>(`[data-review-id="${CSS.escape(id)}"]`)
      : empty.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [w.id]);
  const review = (item: StopReason, index: number) => {
    const memory = useTaskMemory.getState();
    useTaskMemory.setState({
      values: { ...memory.values, [QUEUE_RETURN]: { id: item.id, index } satisfies QueueReturn },
    });
  };
  const named = (value: QueueFilter) =>
    value === 'overdue' ? '지연' : value === 'all' ? '전체' : RESPONSIBILITY_LABELS[value];
  return (
    <section className={s.queue} aria-label="결재함" data-testid="approval-queue">
      <TaskReturn />
      <OfficeBar title="결재함" />
      <div className={s.summary}>
        <p data-testid="approval-counts">
          대기 <b>{pending.length}</b>건
          {late.overdue > 0 && (
            <b className={s.overdue}>
              {` · 지연 ${late.overdue}건 · 라운드마다 분위기 −${late.morale}`}
            </b>
          )}
        </p>
        <button type="button" data-ui="link" aria-haspopup="dialog" onClick={onOverview}>
          결재라인 모아보기
        </button>
      </div>
      {(pending.length > 0 || filter !== 'all') && (
        <Segments
          label="결재함 보기"
          options={queueFilters(overdue, ordered, filter)}
          value={filter}
          onChange={setFilter}
          wrap
        />
      )}
      {rows.length ? (
        <ApprovalRows w={w} items={rows} onReview={review} />
      ) : (
        <div className={s.empty} data-testid="approval-empty">
          <h3 ref={empty} tabIndex={-1}>
            {pending.length ? `${named(filter)} 결재가 없어요` : '지금 결재할 업무가 없어요'}
          </h3>
          <p>
            {pending.length
              ? `다른 결재 ${pending.length}건이 기다리고 있어요.`
              : '새 요청이 오면 결재 기한과 함께 여기에 쌓여요.'}
          </p>
          {filter !== 'all' && (
            <button type="button" onClick={() => setFilter('all')}>
              전체 보기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
