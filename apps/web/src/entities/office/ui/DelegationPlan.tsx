import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { BudgetResponsibility, World } from '../../../../../../packages/contracts/src/types';
import {
  BUDGET_STEP,
  requestLabel,
  RESPONSIBILITY_NAMES,
  TEMPERAMENT_INFO,
} from '../../../../../../packages/engine/src/delegation-info';
import { POLICY_INFO, policyOf } from '../../../../../../packages/engine/src/policy';
import { directionOf } from '../../../../../../packages/engine/src/direction';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import type { OfficeRead } from '../../../runtime/officeRead';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import { openDecisionSettings } from '../../../shared/routing/state';
import { Card } from '../../../shared/ui/Card';
import { Money } from '../../../shared/ui/Money';
import { compactMoney } from '../../../presentation/format';
import { DeskStats, type DeskStat } from './OfficeDesk';
import s from './DelegationPlan.module.css';

export type DelegatePlan = OfficeRead['delegation'][BudgetResponsibility]['plan'];

/** How the person heard the request, in one sentence. */
function responseLine(w: World, plan: DelegatePlan) {
  const code = clubOf(w).country,
    level = requestLabel(plan.key, plan.level);
  if (plan.response === 'noMoney')
    return displayMessage(
      plan.key === 'sales' ? 'delegation.response.salesNoMoney' : 'delegation.response.noMoney',
      {
        cash: compactMoney(plan.cash, code, w.year),
        reserve: compactMoney(plan.reserve, code, w.year),
      },
    );
  if (plan.response === 'followed')
    return displayMessage('delegation.response.followed', { level });
  return displayMessage(
    plan.response === 'tempered' ? 'delegation.response.tempered' : 'delegation.response.raised',
    { temperament: TEMPERAMENT_INFO[plan.delegate.temperament].label, level },
  );
}

/** The plan's money in tiles: what he keeps and, by work, what he will spend or how he sells. */
function planStats(w: World, plan: DelegatePlan, office: OfficeRead): DeskStat[] {
  const code = clubOf(w).country,
    amount = (value: string) => <Money value={value} code={code} year={w.year} plain />;
  const reserve: DeskStat = {
    label: sourceMessage('delegation.fact.reserve'),
    value: amount(plan.reserve),
    note: sourceMessage('delegation.fact.reserveNote', { weeks: plan.stance.runway }),
  };
  switch (plan.key) {
    case 'recruitment':
      return [
        {
          label: sourceMessage('delegation.fact.signingBudget'),
          value: amount(plan.budget),
          note: sourceMessage('delegation.fact.signingLeft', {
            left: compactMoney(plan.left, code, w.year),
          }),
        },
        reserve,
      ];
    case 'academy': {
      const choice = plan.choices.find((one) => one.kind === 'policy' && one.key === 'academy');
      const level = choice?.kind === 'policy' ? choice.level : policyOf(w).academy;
      return [
        {
          label: POLICY_INFO.academy.label,
          value: POLICY_INFO.academy.levels[level - 1].name,
          note: sourceMessage('delegation.fact.yearly', {
            amount: compactMoney(office.policyCosts.academy[level]?.academy ?? '0', code, w.year),
          }),
        },
        reserve,
      ];
    }
    case 'contracts':
      return [
        {
          label: sourceMessage('delegation.fact.wageShare'),
          value: sourceMessage('delegation.fact.wageShareValue', {
            share: Math.round(plan.stance.wageShare * 100),
          }),
        },
        reserve,
      ];
    case 'sales':
      return [
        {
          label: sourceMessage('delegation.fact.sellSteps'),
          value: sourceMessage('delegation.fact.sellStepsValue', {
            first: plan.stance.sellSteps[0],
            second: plan.stance.sellSteps[1],
          }),
        },
        reserve,
      ];
    default:
      return [
        ...plan.choices.slice(0, 1).map((choice) => ({ label: choice.label, value: choice.value })),
        reserve,
      ];
  }
}

/** A choice of the plan that differs from what is in force now. */
function pending(w: World, plan: DelegatePlan) {
  return plan.choices.filter((choice) =>
    choice.kind === 'policy'
      ? policyOf(w)[choice.key] !== choice.level
      : directionOf(w, choice.key) !== choice.option,
  );
}

/**
 * A person's plan for a request (→`delegatePlan`): how he heard it, the money he keeps and
 * spends, and the settings he sets himself. The delegation page shows it for the request being
 * chosen; a work's page for the request in force.
 */
export function PlanPreview({
  w,
  plan,
  showChoices = true,
}: {
  w: World;
  plan: DelegatePlan;
  showChoices?: boolean;
}) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  // A setting already shown as a tile is not listed again (→`planStats`).
  const listed = plan.choices.filter(
    (choice, index) =>
      !(plan.key === 'academy' && choice.key === 'academy') &&
      !((plan.key === 'manager' || plan.key === 'staff') && index === 0),
  );
  return (
    <div className={s.plan} data-testid={`delegation-plan-${plan.key}`}>
      <p className={s.response} data-response={plan.response}>
        {localizeValue(responseLine(w, plan))}
      </p>
      {localizeValue(
        (plan.key === 'recruitment' || plan.key === 'academy') && plan.response !== 'noMoney' && (
          <p className={s.spare}>
            {richMessage('delegation.plan.spare', {
              cash: compactMoney(plan.cash, clubOf(w).country, w.year),
              spare: compactMoney(plan.spare, clubOf(w).country, w.year),
              share: plan.level * BUDGET_STEP,
            })}
          </p>
        ),
      )}
      <DeskStats
        label={displayMessage('delegation.plan.heading')}
        stats={planStats(w, plan, office)}
      />
      {localizeValue(
        showChoices && listed.length > 0 && (
          <dl className={s.choices} aria-label={displayMessage('delegation.choices.title')}>
            {localizeValue(
              listed.map((choice) => (
                <div key={choice.key}>
                  <dt>{localizeValue(choice.label)}</dt>
                  <dd>{localizeValue(choice.value)}</dd>
                </div>
              )),
            )}
          </dl>
        ),
      )}
    </div>
  );
}

/**
 * Who decides a work, at the head of its page: the person it is delegated to, his temperament,
 * the owner's request and his plan, with the settings below read only — or the owner himself.
 * Changing who decides or the request happens on the delegation page only.
 */
export function DelegationNote({
  w,
  responsibility,
}: {
  w: World;
  responsibility: BudgetResponsibility;
}) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  const { plan } = office.delegation[responsibility],
    delegated = isDelegated(w, responsibility),
    changes = delegated ? pending(w, plan) : [];
  return (
    <Card
      as="section"
      surface="detail"
      className={s.note}
      data-delegated={delegated || undefined}
      data-testid={`delegation-note-${responsibility}`}
      aria-label={localizeValue(RESPONSIBILITY_NAMES[responsibility])}
      meta={
        <span className={s.meta}>
          <span data-ui="badge" data-compact="">
            {localizeValue(
              delegated
                ? sourceMessage('delegation.badge.delegated')
                : sourceMessage('delegation.badge.direct'),
            )}
          </span>
          <span>{localizeValue(RESPONSIBILITY_NAMES[responsibility])}</span>
        </span>
      }
      title={
        delegated
          ? displayMessage('delegation.note.title', {
              post: plan.delegate.postLabel,
              name: plan.delegate.name,
            })
          : displayMessage('delegation.note.titleDirect')
      }
      actions={
        <button
          type="button"
          data-ui="secondary"
          aria-haspopup="dialog"
          onClick={() => openDecisionSettings(responsibility)}
        >
          {richMessage('delegation.note.open')}
        </button>
      }
    >
      {localizeValue(
        delegated ? (
          <>
            <p className={s.person}>
              {richMessage('delegation.note.person', {
                temperament: TEMPERAMENT_INFO[plan.delegate.temperament].label,
                request: requestLabel(responsibility, plan.request),
              })}
            </p>
            <PlanPreview w={w} plan={plan} showChoices={false} />
            {localizeValue(
              changes.length > 0 && (
                <p className={s.next}>
                  {richMessage('delegation.note.next', {
                    changes: changes
                      .map((choice) =>
                        displayMessage('delegation.change', {
                          label: choice.label,
                          value: choice.value,
                        }),
                      )
                      .join(' · '),
                  })}
                </p>
              ),
            )}
            <p className={s.hint}>{richMessage('delegation.note.delegated')}</p>
          </>
        ) : (
          <p className={s.hint}>{richMessage('delegation.note.direct')}</p>
        ),
      )}
    </Card>
  );
}
