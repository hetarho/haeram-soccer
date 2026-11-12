import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { useEffect, useState } from 'react';
import type {
  BudgetResponsibility,
  SpendRequest,
  World,
} from '../../../../../packages/contracts/src/types';
import {
  requestLabel,
  requestOf,
  RESPONSIBILITY_NAMES,
  SPEND_REQUESTS,
  TEMPERAMENT_INFO,
} from '../../../../../packages/engine/src/delegation-info';
import type { GameClient } from '../../runtime/client';
import { useOfficeRead } from '../../shared/lib/useOfficeRead';
import { InvestmentSlider, PlanPreview, useClubSettingAction } from '../../entities/office';
import s from './DelegationRequest.module.css';

/**
 * The owner's request to the person a work is delegated to (→`SpendRequest`): how much to spend
 * on a five-step scale, his temperament beside it, and the plan he would make of the request being
 * chosen before it is sent. Sending is one command; the plan applies from his next decision.
 */
export function DelegationRequest({
  w,
  client,
  responsibility,
}: {
  w: World;
  client: GameClient;
  responsibility: BudgetResponsibility;
}) {
  useTextLocale();
  const current = requestOf(w, responsibility);
  const [draft, setDraft] = useState<SpendRequest>(current);
  useEffect(() => setDraft(current), [current]);
  const action = useClubSettingAction(client);
  const office = useOfficeRead(w);
  if (!office) return null;
  const read = office.delegation[responsibility],
    plan = read.previews[draft - 1],
    temperament = TEMPERAMENT_INFO[plan.delegate.temperament],
    label =
      responsibility === 'sales'
        ? displayMessage('delegation.request.labelSales')
        : displayMessage('delegation.request.label');
  return (
    <section
      className={s.request}
      aria-label={localizeValue(label)}
      data-testid={`delegation-request-${responsibility}`}
    >
      <header className={s.head}>
        <h4>{localizeValue(label)}</h4>
        <small>
          {richMessage('delegation.request.current', {
            request: requestLabel(responsibility, current),
          })}
        </small>
      </header>
      <InvestmentSlider
        label={localizeValue(label)}
        options={SPEND_REQUESTS.map((level) => ({
          value: level,
          name: requestLabel(responsibility, level),
        }))}
        value={draft}
        disabled={action.blocked}
        onChange={setDraft}
      />
      <div className={s.judgement} data-surface="inset">
        <p className={s.person}>
          <b>
            {richMessage('delegation.request.person', {
              post: plan.delegate.postLabel,
              name: plan.delegate.name,
              temperament: temperament.label,
            })}
          </b>
          <small>{localizeValue(temperament.summary)}</small>
        </p>
        <PlanPreview w={w} plan={plan} />
      </div>
      <footer className={s.footer}>
        <small>{richMessage('delegation.request.note')}</small>
        <button
          type="button"
          data-ui="primary"
          disabled={action.blocked || draft === current}
          onClick={() =>
            void action.apply(
              { type: 'delegation-request', responsibility, level: draft },
              sourceMessage('delegation.request.sent', {
                area: RESPONSIBILITY_NAMES[responsibility],
                request: requestLabel(responsibility, draft),
              }),
            )
          }
        >
          {localizeValue(
            action.busy
              ? sourceMessage('copy.ClubSettingControl.304d48a5d2')
              : sourceMessage('delegation.request.send'),
          )}
        </button>
      </footer>
      {localizeValue(action.error && <p role="alert">{localizeValue(action.error)}</p>)}
      {localizeValue(
        action.message && (
          <p role="status" className={s.message}>
            {localizeValue(action.message)}
          </p>
        ),
      )}
    </section>
  );
}
