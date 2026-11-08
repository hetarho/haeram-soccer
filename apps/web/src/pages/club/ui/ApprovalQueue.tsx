import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useEffect, useRef, useState } from 'react';
import type { ResponsibilityKey, World } from '../../../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../../../packages/engine/src/stopping';
import {
  isDelegated,
  RESPONSIBILITY_KEYS,
  settingsOf,
} from '../../../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../../../runtime/client';
import {
  approvalStanding,
  overdueSummary,
  type ProgressionController,
} from '../../../runtime/progression';
import { useGameState } from '../../../runtime/store';
import {
  approvalGroups,
  QUEUE_RETURN,
  requestKeys,
  requestSubject,
  returnFocus,
  type ApprovalTitle,
  type QueueReturn,
} from '../../../shared/routing/approvalOrder';
import { Dialog } from '../../../shared/ui/Dialog';
import { eventDesk } from '../../../shared/routing/eventRouting';
import {
  responsibilityDelegates,
  RESPONSIBILITY_DETAILS,
  RESPONSIBILITY_LABELS,
} from '../../../entities/office';
import { OfficeBar } from './OfficeBar';
import {
  applyOfficeChange,
  officeProposal,
  type OfficeChange,
  type OfficeProposal,
} from '../../../entities/office';
import { PendingHandover } from '../../../features/approvals';
import { modeSwitchBlocked } from '../../../entities/office';
import { openApprovalRequest } from '../../../shared/routing/state';
import { TaskReturn } from './TaskReturn';
import { useTaskMemory } from '../../../shared/routing/taskMemory';
import s from './ApprovalQueue.module.css';

/** The responsibility a waiting request belongs to, as its row's kind. */
function requestTag(item: StopReason) {
  const key = requestKeys(item)[0];
  if (key) return RESPONSIBILITY_LABELS[key];
  const desk = eventDesk(item);
  return desk === 'sponsor'
    ? sourceMessage('club.operations.sponsor')
    : desk === 'investment'
      ? sourceMessage('copy.ApprovalQueue.e999efbc68')
      : sourceMessage('copy.ApprovalQueue.d47c78190a');
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
  useTextLocale();
  return (
    <ul className={s.requests} aria-label={displayMessage('copy.ApprovalQueue.7aa3d9f618')}>
      {localizeValue(
        items.map((item, index) => {
          const standing = approvalStanding(w, item.id);
          const subject = requestSubject(w, item);
          return (
            <li key={item.id} data-request-id={item.id} data-tagged={tagged || undefined}>
              {localizeValue(
                tagged && (
                  <span data-ui="label" className={s.tag}>
                    {localizeValue(requestTag(item))}
                  </span>
                ),
              )}
              <span className={s.request}>
                <b>{localizeValue(item.title)}</b>
                <small className={s.meta}>
                  {localizeValue(subject && <span>{localizeValue(subject)} · </span>)}
                  <span
                    className={standing.overdue ? s.overdue : s.due}
                    data-testid="approval-deadline"
                  >
                    {localizeValue(standing.label)}
                  </span>
                </small>
              </span>
              <button
                type="button"
                className={s.review}
                data-review-id={item.id}
                // Requests of one kind share a title, so the action names its subject as well.
                aria-label={displayMessage('copy.ApprovalQueue.e0a25467b9', {
                  p0: item.title,
                  p1: subject ? ` · ${subject}` : '',
                })}
                onClick={() => {
                  onReview?.(item, index);
                  openApprovalRequest(w.id, item);
                }}
              >
                {richMessage('copy.ApprovalQueue.7e0e212667')}
              </button>
            </li>
          );
        }),
      )}
    </ul>
  );
}

const TITLE_LABELS: Record<Exclude<ApprovalTitle, ResponsibilityKey>, string> = {
  finance: sourceMessage('club.operations.investment'),
  other: sourceMessage('copy.ApprovalQueue.8cb77e12b4'),
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
  useTextLocale();
  return (
    <div
      className={s.switch}
      role="group"
      aria-label={displayMessage('copy.ApprovalQueue.437c2908c9', {
        p0: RESPONSIBILITY_LABELS[title],
      })}
      data-ui="choices"
    >
      {localizeValue(
        ([false, true] as const).map((value) => (
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
            {localizeValue(
              value
                ? sourceMessage('copy.ApprovalQueue.e4b0c79fac')
                : sourceMessage('copy.ApprovalQueue.20c483bdda'),
            )}
          </button>
        )),
      )}
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
  useTextLocale();
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
      setMessage(
        error instanceof Error ? error.message : sourceMessage('copy.ApprovalQueue.def8fed41f'),
      );
    } finally {
      setApplying(false);
    }
  };
  return (
    <Dialog
      label={localizeValue(
        next
          ? sourceMessage('copy.ApprovalQueue.44b4c69072')
          : sourceMessage('copy.ApprovalQueue.33dbc38b17'),
      )}
      onClose={close}
      actions={
        <div className={s.dialogActions}>
          <button type="button" disabled={applying} onClick={close}>
            {richMessage('common.cancel')}
          </button>
          <button
            type="button"
            data-ui="primary"
            disabled={blocked || applying || w.id !== proposal.id}
            onClick={() => void apply()}
          >
            {localizeValue(
              next
                ? one
                  ? sourceMessage('copy.ApprovalQueue.c45086de02', { p0: one })
                  : sourceMessage('copy.ApprovalQueue.2f9cc9b110', { p0: changed.length })
                : sourceMessage('copy.ApprovalQueue.2157d80d03'),
            )}
          </button>
        </div>
      }
    >
      <div className={s.confirm} aria-busy={applying}>
        <ul className={s.confirmList}>
          {localizeValue(
            changed.map((key) => (
              <li key={key}>
                <b>{localizeValue(RESPONSIBILITY_LABELS[key])}</b>
                <span>
                  {localizeValue(
                    next
                      ? `→ ${responsibilityDelegates(w, key).join(' · ')}`
                      : RESPONSIBILITY_DETAILS[key],
                  )}
                </span>
              </li>
            )),
          )}
        </ul>
        <strong>
          {localizeValue(
            next
              ? sourceMessage('copy.ApprovalQueue.ad5a5a1fb5')
              : sourceMessage('copy.ApprovalQueue.a75b4320f0'),
          )}
        </strong>
        <PendingHandover proposal={proposal} />
        {localizeValue(message && <p role="alert">{localizeValue(message)}</p>)}
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
  useTextLocale();
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
  const groups = approvalGroups(w, pending).filter(
    (group) => !requestsOnly || group.items.length > 0,
  );
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
    <section
      className={s.queue}
      aria-label={displayMessage('copy.ApprovalButtons.216a759610')}
      data-testid="approval-queue"
    >
      {localizeValue(!requestsOnly && <TaskReturn />)}
      {localizeValue(
        !requestsOnly && <OfficeBar title={displayMessage('copy.ApprovalButtons.216a759610')} />,
      )}
      <div className={s.summary}>
        <p data-testid="approval-counts" ref={empty} tabIndex={-1}>
          {localizeValue(
            pending.length ? (
              <>
                {richMessage('copy.ApprovalQueue.619fea260a', {
                  p0: <b>{localizeValue(pending.length)}</b>,
                  p1: late.overdue > 0 && (
                    <b className={s.overdue}>
                      {displayMessage('copy.ApprovalQueue.1a9b5a1063', {
                        p0: late.overdue,
                        p1: late.morale,
                      })}
                    </b>
                  ),
                })}
              </>
            ) : (
              sourceMessage('copy.ApprovalQueue.bcbd9f66de')
            ),
          )}
        </p>
        {localizeValue(
          !requestsOnly && (
            <div
              className={s.bulk}
              role="group"
              aria-label={displayMessage('copy.ApprovalQueue.bbe9a6c28a')}
              data-ui="choices"
            >
              {localizeValue(
                (['direct', 'delegated'] as const).map((value) => {
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
                      {localizeValue(
                        value === 'delegated'
                          ? sourceMessage('copy.ApprovalQueue.d2002255a1')
                          : sourceMessage('copy.ApprovalQueue.0878910c76'),
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          ),
        )}
      </div>
      <ol className={s.titles} aria-label={displayMessage('copy.ApprovalQueue.86301db843')}>
        {localizeValue(
          groups.map(({ title, items }) => {
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
                    {localizeValue(
                      responsibility
                        ? RESPONSIBILITY_LABELS[responsibility]
                        : TITLE_LABELS[title as 'finance' | 'other'],
                    )}
                    {localizeValue(
                      items.length > 0 && (
                        <span data-ui="count" className={s.titleCount}>
                          {localizeValue(items.length)}
                        </span>
                      ),
                    )}
                  </h3>
                  {localizeValue(
                    !requestsOnly && responsibility && (
                      <DelegationSwitch
                        title={localizeValue(responsibility)}
                        delegated={!!delegated}
                        disabled={blocked}
                        onPropose={propose}
                      />
                    ),
                  )}
                </header>
                {localizeValue(
                  !requestsOnly && (
                    <p className={s.delegate}>
                      {localizeValue(
                        responsibility ? (
                          <>
                            <span className={s.delegateMark}>
                              {localizeValue(
                                delegated
                                  ? sourceMessage('copy.ApprovalQueue.6e6a9d207d')
                                  : sourceMessage('copy.ApprovalQueue.1d27c18bbd'),
                              )}
                            </span>
                            {localizeValue(responsibilityDelegates(w, responsibility).join(' · '))}
                          </>
                        ) : (
                          <>
                            {richMessage('copy.ApprovalQueue.b792756148', {
                              p0: (
                                <span className={s.delegateMark}>
                                  {richMessage('copy.ApprovalQueue.d47c78190a')}
                                </span>
                              ),
                            })}
                          </>
                        ),
                      )}
                    </p>
                  ),
                )}
                {localizeValue(
                  items.length ? (
                    <ApprovalRows w={w} items={items} onReview={review} tagged={false} />
                  ) : (
                    <p className={s.quiet}>
                      {localizeValue(responsibility && RESPONSIBILITY_DETAILS[responsibility])} ·
                      {localizeValue(' ')}
                      {localizeValue(
                        delegated
                          ? sourceMessage('copy.ApprovalQueue.36f27b901e')
                          : sourceMessage('copy.ApprovalQueue.d57737a605'),
                      )}
                    </p>
                  ),
                )}
              </li>
            );
          }),
        )}
      </ol>
      {localizeValue(
        proposal && (
          <DelegationConfirm
            w={w}
            proposal={proposal}
            client={client}
            controller={controller}
            onDone={() => setProposal(undefined)}
          />
        ),
      )}
    </section>
  );
}
