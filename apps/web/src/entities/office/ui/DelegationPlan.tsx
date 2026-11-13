import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { ReactNode } from 'react';
import type { BudgetResponsibility, World } from '../../../../../../packages/contracts/src/types';
import {
  personOf,
  requestLabel,
  RESPONSIBILITY_NAMES,
  sharePercent,
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

/** How the 단장 heard the request, in one sentence that says why when he moved off it. */
function responseLine(plan: DelegatePlan) {
  const level = requestLabel(plan.key, plan.level);
  if (plan.response === 'followed')
    return displayMessage('delegation.response.followed', { level });
  return displayMessage(
    plan.response === 'tempered' ? 'delegation.response.tempered' : 'delegation.response.raised',
    { temperament: TEMPERAMENT_INFO[plan.delegate.temperament].label, level },
  );
}

/** A share of the planned income, in percent with at most one decimal. */
function shareOf(amount: string, revenue: string) {
  const income = BigInt(revenue);
  return income > 0n ? sharePercent(Number((BigInt(amount) * 10000n) / income)) : 0;
}

/** One step of a plan's money: what it is, the amount, a quiet note; `result` marks the last. */
export interface FlowStep {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'minus' | 'result' | 'empty';
}

/**
 * A plan's money read left to right as one sentence (→`PlanPreview`): the season's income, the
 * work's share of it, what that share already pays, and what is left to spend. The steps are the
 * shared stat tiles joined by arrows; on a phone they stack two by two.
 */
export function PlanFlow({ label, steps }: { label: string; steps: readonly FlowStep[] }) {
  useTextLocale();
  return (
    <ol className={s.flow} aria-label={localizeValue(label)} data-steps={steps.length}>
      {localizeValue(
        steps.map((step) => (
          <li key={step.label} data-ui="stat-tile" data-tone={step.tone}>
            <span className={s.stepLabel}>{localizeValue(step.label)}</span>
            <b>{localizeValue(step.value)}</b>
            {localizeValue(step.note && <small>{localizeValue(step.note)}</small>)}
          </li>
        )),
      )}
    </ol>
  );
}

/** The plan's money as steps, for the works the 단장 plans with a share of the income. */
export function planSteps(w: World, plan: DelegatePlan): FlowStep[] | undefined {
  const code = clubOf(w).country,
    amount = (value: string) => <Money value={value} code={code} year={w.year} plain />,
    money = (value: string) => compactMoney(value, code, w.year),
    share = sharePercent(plan.share),
    revenue: FlowStep = {
      label: sourceMessage('delegation.flow.revenue'),
      value: amount(plan.revenue),
      note: plan.lastRevenue
        ? sourceMessage('delegation.flow.revenueLast', { amount: money(plan.lastRevenue) })
        : undefined,
    },
    capital: FlowStep = {
      label: sourceMessage('delegation.flow.capital'),
      value: amount(plan.capital),
      note: sourceMessage('delegation.flow.reserve', { years: plan.reserveYears }),
    },
    wages: FlowStep = {
      label: sourceMessage('delegation.flow.wages'),
      value: amount(plan.committed),
      note: sourceMessage('delegation.flow.wagesNote', {
        share: shareOf(plan.committed, plan.revenue),
      }),
      tone: 'minus',
    };
  switch (plan.key) {
    case 'recruitment':
      return [
        revenue,
        capital,
        {
          label: sourceMessage('delegation.flow.budget'),
          value: amount(plan.budget),
          note: sourceMessage('delegation.flow.squadNote'),
        },
        wages,
        {
          label: sourceMessage('delegation.flow.signings'),
          value: amount(plan.left),
          note: sourceMessage('delegation.flow.signingsNote', {
            reinvest: money(plan.reinvest),
            spent: money(plan.spent),
          }),
          tone: BigInt(plan.left) > 0n ? 'result' : 'empty',
        },
      ];
    case 'contracts':
      return [
        revenue,
        capital,
        {
          label: sourceMessage('delegation.flow.budget'),
          value: amount(plan.budget),
        },
        wages,
        {
          label: sourceMessage('delegation.flow.raises'),
          value: amount(plan.left),
          tone: BigInt(plan.left) > 0n ? 'result' : 'empty',
        },
      ];
    case 'academy': {
      const youth = plan.youth!;
      return [
        revenue,
        capital,
        {
          label: sourceMessage('delegation.flow.budget'),
          value: amount(plan.budget),
        },
        {
          label: sourceMessage('delegation.flow.youthPay'),
          value: amount(youth.pay),
          note: sourceMessage('delegation.flow.youthPayNote'),
          tone: 'minus',
        },
        {
          label: sourceMessage('delegation.flow.academy'),
          value: POLICY_INFO.academy.levels[youth.level - 1].name,
          note: sourceMessage('delegation.flow.academyNote', { cost: money(youth.cost) }),
          tone: 'result',
        },
      ];
    }
    case 'sales':
      return [
        revenue,
        capital,
        {
          label: sourceMessage('delegation.flow.sellLine', { share }),
          value: amount(plan.budget),
          note: sourceMessage('delegation.flow.sellLineNote'),
        },
        { ...wages, label: sourceMessage('delegation.flow.wagesNow'), tone: undefined },
      ];
    default:
      return undefined;
  }
}

/** The plan in one or two plain sentences under its steps. */
function planSentence(w: World, plan: DelegatePlan): ReactNode {
  const share = sharePercent(plan.share),
    now = shareOf(
      plan.committed,
      (BigInt(plan.revenue) + (plan.key === 'sales' ? BigInt(plan.capital) : 0n)).toString(),
    );
  if ((plan.key === 'recruitment' || plan.key === 'contracts') && BigInt(plan.capital) > 0n) {
    const code = clubOf(w).country;
    return richMessage('delegation.plan.capital', {
      years: plan.reserveYears,
      capital: compactMoney(plan.capital, code, w.year),
    });
  }
  switch (plan.key) {
    case 'recruitment':
      return plan.over
        ? richMessage('delegation.flow.recruitmentOver', {
            now,
            share,
            reinvest: plan.reinvestShare,
          })
        : richMessage('delegation.flow.recruitmentLine', { share, reinvest: plan.reinvestShare });
    case 'contracts':
      return plan.over
        ? richMessage('delegation.flow.contractsOver', { now, share })
        : richMessage('delegation.flow.contractsLine', { share });
    case 'academy':
      return (
        <>
          {richMessage('delegation.flow.academyLine')}{' '}
          {richMessage('delegation.flow.youthCoach', { name: personOf(w, 'youth').name })}
        </>
      );
    case 'sales': {
      const [first, second] = plan.stance.sellAbove;
      return richMessage('delegation.plan.fundedSellLine', { first, second, now });
    }
    default:
      return undefined;
  }
}

/** The posts whose pay the 단장's criteria decide: the setting he sets and the pay now. */
function postStats(w: World, plan: DelegatePlan): DeskStat[] {
  const code = clubOf(w).country,
    first = plan.choices[0];
  return [
    ...(first ? [{ label: first.label, value: first.value }] : []),
    {
      label:
        plan.key === 'manager'
          ? sourceMessage('delegation.fact.managerWage')
          : sourceMessage('delegation.fact.staffWages'),
      value: <Money value={plan.committed} code={code} year={w.year} plain />,
      note: sourceMessage('delegation.flow.wagesNote', {
        share: shareOf(plan.committed, plan.revenue),
      }),
    },
  ];
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
 * The 단장's plan for a request (→`delegatePlan`): how he heard it, the money as income → share →
 * already committed → left to spend, one plain sentence, and the settings he sets. The delegation
 * page shows it for the request being chosen; a work's page for the request in force.
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
  const steps = planSteps(w, plan),
    sentence = planSentence(w, plan);
  // A setting already shown as a step or a tile is not listed again.
  const listed = plan.choices.filter(
    (choice, index) =>
      !(plan.key === 'academy' && choice.key === 'academy') &&
      !((plan.key === 'manager' || plan.key === 'staff') && index === 0),
  );
  return (
    <div className={s.plan} data-testid={`delegation-plan-${plan.key}`}>
      <p className={s.response} data-response={plan.response}>
        {localizeValue(responseLine(plan))}
      </p>
      {localizeValue(
        steps ? (
          <PlanFlow label={displayMessage('delegation.plan.heading')} steps={steps} />
        ) : (
          <DeskStats label={displayMessage('delegation.plan.heading')} stats={postStats(w, plan)} />
        ),
      )}
      {localizeValue(
        sentence && (
          <p className={s.sentence} data-over={plan.over || undefined}>
            {localizeValue(sentence)}
          </p>
        ),
      )}
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
 * Who decides a work, at the head of its page: the 단장 it is delegated to, his temperament, the
 * owner's request and his plan, with the settings below read only — or the owner himself.
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
