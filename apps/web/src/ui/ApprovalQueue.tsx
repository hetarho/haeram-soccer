import { useEffect, useRef, useState } from 'react';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import {
  isDelegated,
  RESPONSIBILITY_KEYS,
  settingsOf,
} from '../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../runtime/client';
import {
  approvalStanding,
  overdueSummary,
  type ProgressionController,
} from '../runtime/progression';
import { useGameState } from '../runtime/store';
import {
  approvalGroups,
  QUEUE_RETURN,
  requestKeys,
  requestSubject,
  returnFocus,
  type ApprovalTitle,
  type QueueReturn,
} from './approvalOrder';
import { Dialog } from './Dialog';
import { eventDesk } from './eventRouting';
import {
  responsibilityDelegates,
  RESPONSIBILITY_DETAILS,
  RESPONSIBILITY_LABELS,
} from './intervention';
import { OfficeBar } from './OfficeBar';
import {
  applyOfficeChange,
  officeProposal,
  type OfficeChange,
  type OfficeProposal,
} from './officeChanges';
import { PendingHandover } from './OwnerOfficeView';
import { modeSwitchBlocked } from './progressMode';
import { openApprovalRequest } from './state';
import { TaskReturn } from './TaskReturn';
import { useTaskMemory } from './taskMemory';
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
  tagged = true,
}: {
  w: World;
  items: readonly StopReason[];
  onReview?: (item: StopReason, index: number) => void;
  /** Off under a 결재함 title, which already names the kind. */
  tagged?: boolean;
}) {
  return (
    <ul className={s.requests} aria-label="결재 대기 업무">
      {items.map((item, index) => {
        const standing = approvalStanding(w, item.id);
        const subject = requestSubject(w, item);
        return (
          <li key={item.id} data-request-id={item.id} data-tagged={tagged || undefined}>
            {tagged && (
              <span data-ui="label" className={s.tag}>
                {requestTag(item)}
              </span>
            )}
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
              // Requests of one kind share a title, so the action names its subject as well.
              aria-label={`${item.title}${subject ? ` · ${subject}` : ''} · 검토하기`}
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

const TITLE_LABELS: Record<Exclude<ApprovalTitle, ResponsibilityKey>, string> = {
  finance: '재정·투자',
  other: '기타 결재',
};
/** One title's 직접/위임: a pressed pair that proposes the other choice. */
function DelegationSwitch({
  title,
  delegated,
  disabled,
  onPropose,
}: {
  title: ResponsibilityKey;
  delegated: boolean;
  disabled: boolean;
  onPropose: (change: OfficeChange) => void;
}) {
  return (
    <div
      className={s.switch}
      role="group"
      aria-label={`${RESPONSIBILITY_LABELS[title]} 결재 방식`}
      data-ui="choices"
    >
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          data-ui={delegated === value ? 'secondary' : undefined}
          aria-pressed={delegated === value}
          disabled={disabled}
          onClick={() => {
            if (delegated !== value)
              onPropose({ responsibilities: { [title]: value ? 'delegated' : 'direct' } });
          }}
        >
          {value ? '위임' : '직접'}
        </button>
      ))}
    </div>
  );
}

/**
 * The 결재함's 직접/위임 confirmation (→WEB-79): the same guarded proposal the 결재라인 overview
 * confirms, naming whom each title goes to and the waiting requests that move with it.
 */
function DelegationConfirm({
  w,
  proposal,
  client,
  controller,
  onDone,
}: {
  w: World;
  proposal: OfficeProposal;
  client: GameClient;
  controller: ProgressionController;
  onDone: () => void;
}) {
  const blocked = useGameState(modeSwitchBlocked);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const changed = RESPONSIBILITY_KEYS.filter(
    (key) => proposal.change.responsibilities?.[key] !== undefined,
  );
  const next = proposal.change.responsibilities?.[changed[0]] === 'delegated';
  const one = changed.length === 1 ? responsibilityDelegates(w, changed[0]).join(' · ') : undefined;
  const close = () => {
    if (!applying) onDone();
  };
  const apply = async () => {
    setApplying(true);
    setMessage('');
    try {
      await applyOfficeChange(client, controller, proposal);
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '변경하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setApplying(false);
    }
  };
  return (
    <Dialog
      label={next ? '위임하겠습니다.' : '직접 결재하겠습니다.'}
      onClose={close}
      actions={
        <div className={s.dialogActions}>
          <button type="button" disabled={applying} onClick={close}>
            취소
          </button>
          <button
            type="button"
            data-ui="primary"
            disabled={blocked || applying || w.id !== proposal.id}
            onClick={() => void apply()}
          >
            {next ? (one ? `${one}에게 위임` : `${changed.length}개 업무 위임`) : '직접 결재하기'}
          </button>
        </div>
      }
    >
      <div className={s.confirm} aria-busy={applying}>
        <ul className={s.confirmList}>
          {changed.map((key) => (
            <li key={key}>
              <b>{RESPONSIBILITY_LABELS[key]}</b>
              <span>
                {next ? `→ ${delegates(w, key).join(' · ')}` : RESPONSIBILITY_DETAILS[key]}
              </span>
            </li>
          ))}
        </ul>
        <strong>
          {next
            ? '담당자에게 판단과 실행을 맡기고 결과를 보고받아요.'
            : '필요한 사안은 구단주가 직접 승인해요.'}
        </strong>
        <PendingHandover proposal={proposal} />
        {message && <p role="alert">{message}</p>}
      </div>
    </Dialog>
  );
}

/**
 * The owner office (→WEB-39/100): the 결재함 as every title of the owner's work with its waiting
 * requests below it, the titles that wait first, each naming whom it is delegated to with its
 * 직접/위임 right there, and 전체 직접/위임 over them all. The place a review left from belongs to this world's task memory; the
 * content region keeps the scroll (→WEB-74).
 */
export function ApprovalQueue({
  w,
  pending,
  client,
  controller,
  requestsOnly = false,
}: {
  w: World;
  pending: readonly StopReason[];
  client: GameClient;
  controller: ProgressionController;
  requestsOnly?: boolean;
}) {
  const blocked = useGameState(modeSwitchBlocked);
  const [proposal, setProposal] = useState<OfficeProposal>();
  const propose = (change: OfficeChange) => {
    if (!blocked) setProposal(officeProposal(w, change));
  };
  const settings = settingsOf(w).responsibilities;
  const delegatedCount = RESPONSIBILITY_KEYS.filter((key) => settings[key] === 'delegated').length;
  const bulk = (value: 'direct' | 'delegated') => {
    const changed = RESPONSIBILITY_KEYS.filter((key) => settings[key] !== value);
    if (changed.length)
      propose({ responsibilities: Object.fromEntries(changed.map((key) => [key, value])) });
  };
  const groups = approvalGroups(w, pending).filter((group) => !requestsOnly || group.items.length > 0);
  const late = overdueSummary(w, pending);
  const empty = useRef<HTMLParagraphElement>(null);
  const shown = useRef(groups.flatMap((group) => group.items));
  shown.current = groups.flatMap((group) => group.items);
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
  const review = (item: StopReason) => {
    const memory = useTaskMemory.getState();
    useTaskMemory.setState({
      values: {
        ...memory.values,
        [QUEUE_RETURN]: {
          id: item.id,
          index: shown.current.indexOf(item),
        } satisfies QueueReturn,
      },
    });
  };
  return (
    <section className={s.queue} aria-label="결재함" data-testid="approval-queue">
      {!requestsOnly && <TaskReturn />}
      {!requestsOnly && <OfficeBar title="결재함" />}
      <div className={s.summary}>
        <p data-testid="approval-counts" ref={empty} tabIndex={-1}>
          {pending.length ? (
            <>
              대기 <b>{pending.length}</b>건
              {late.overdue > 0 && (
                <b className={s.overdue}>
                  {` · 지연 ${late.overdue}건 · 라운드마다 분위기 −${late.morale}`}
                </b>
              )}
            </>
          ) : (
            '지금 결재할 업무가 없어요'
          )}
        </p>
        {!requestsOnly && <div className={s.bulk} role="group" aria-label="전체 결재 방식" data-ui="choices">
          {(['direct', 'delegated'] as const).map((value) => {
            const all =
              value === 'delegated'
                ? delegatedCount === RESPONSIBILITY_KEYS.length
                : delegatedCount === 0;
            return (
              <button
                key={value}
                type="button"
                data-ui={all ? 'secondary' : undefined}
                aria-pressed={all}
                disabled={blocked}
                onClick={() => bulk(value)}
              >
                {value === 'delegated' ? '전체 위임' : '전체 직접'}
              </button>
            );
          })}
        </div>}
      </div>
      <ol className={s.titles} aria-label="결재 항목">
        {groups.map(({ title, items }) => {
          const responsibility = title !== 'finance' && title !== 'other' ? title : undefined;
          const delegated = responsibility && isDelegated(w, responsibility);
          return (
            <li
              key={title}
              className={s.title}
              data-title={title}
              data-waiting={items.length > 0 || undefined}
            >
              <header className={s.titleHead}>
                <h3>
                  {responsibility
                    ? RESPONSIBILITY_LABELS[responsibility]
                    : TITLE_LABELS[title as 'finance' | 'other']}
                  {items.length > 0 && (
                    <span data-ui="count" className={s.titleCount}>
                      {items.length}
                    </span>
                  )}
                </h3>
                {!requestsOnly && responsibility && (
                  <DelegationSwitch
                    title={responsibility}
                    delegated={!!delegated}
                    disabled={blocked}
                    onPropose={propose}
                  />
                )}
              </header>
              {!requestsOnly && <p className={s.delegate}>
                {responsibility ? (
                  <>
                    <span className={s.delegateMark}>{delegated ? '위임 중' : '위임 대상'}</span>
                    {responsibilityDelegates(w, responsibility).join(' · ')}
                  </>
                ) : (
                  <>
                    <span className={s.delegateMark}>결재</span>구단주 직접
                  </>
                )}
              </p>}
              {items.length ? (
                <ApprovalRows w={w} items={items} onReview={review} tagged={false} />
              ) : (
                <p className={s.quiet}>
                  {responsibility && RESPONSIBILITY_DETAILS[responsibility]} ·{' '}
                  {delegated ? '위임받은 담당자가 처리하고 결과를 보고해요' : '대기 없음'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {proposal && (
        <DelegationConfirm
          w={w}
          proposal={proposal}
          client={client}
          controller={controller}
          onDone={() => setProposal(undefined)}
        />
      )}
    </section>
  );
}
