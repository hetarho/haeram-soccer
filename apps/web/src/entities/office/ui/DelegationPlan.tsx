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
import { compactMoney, decimal } from '../../../presentation/format';
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
 * capital above the reserve, the work's money, what it already pays, and what is left to spend. The steps are the
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

/**
 * The plan's loss runway in words (→ECON-33): the seasons of planned loss the cash must cover, or
 * that the plan stays within income.
 */
export function runwayLine(plan: Pick<DelegatePlan, 'runway'>) {
  return plan.runway > 0
    ? sourceMessage('delegation.runway.allowed', { seasons: plan.runway })
    : sourceMessage('delegation.runway.withinIncome');
}
/** A count of seasons or years with the decimals it has (at most two), in the reader's locale. */
function figure(value: number) {
  const places = [0, 1, 2].find(
    (digits) => Math.abs(value * 10 ** digits - Math.round(value * 10 ** digits)) < 1e-9,
  );
  return decimal(value, places ?? 2);
}
/** The planned loss now and the seasons of it the available capital covers. */
function coversLine(w: World, plan: DelegatePlan) {
  return coverageLine(plan, compactMoney(plan.loss, clubOf(w).country, w.year));
}
/**
 * The coverage note for a planned loss already written as `loss`. Coverage is kept to one decimal,
 * so capital covering less than a tenth of a season reads so, never as no cash at all.
 */
export function coverageLine(
  plan: Pick<DelegatePlan, 'loss' | 'covers' | 'capital'>,
  loss: string,
) {
  if (BigInt(plan.loss) === 0n) return sourceMessage('delegation.runway.noLoss');
  return plan.covers
    ? sourceMessage('delegation.runway.covers', { loss, seasons: figure(plan.covers) })
    : BigInt(plan.capital) > 0n
      ? sourceMessage('delegation.runway.coversLittle', { loss, seasons: figure(0.1) })
      : sourceMessage('delegation.runway.coversNone', { loss });
}

/** The plan's money as steps, for the works the 단장 plans with money. */
export function planSteps(w: World, plan: DelegatePlan): FlowStep[] | undefined {
  const code = clubOf(w).country,
    amount = (value: string) => <Money value={value} code={code} year={w.year} plain />,
    money = (value: string) => compactMoney(value, code, w.year),
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
      note: sourceMessage('delegation.flow.reserve', { years: figure(plan.reserveYears) }),
    },
    carried: FlowStep = {
      label: sourceMessage('delegation.flow.wageRoom'),
      value: amount(plan.budget),
      note: runwayLine(plan),
    },
    wages: FlowStep = {
      label: sourceMessage('delegation.flow.wages'),
      value: amount(plan.committed),
      note: coversLine(w, plan),
      tone: 'minus',
    };
  switch (plan.key) {
    case 'recruitment':
      return [
        revenue,
        capital,
        carried,
        wages,
        {
          label: sourceMessage('delegation.flow.signings'),
          value: amount(plan.left),
          tone: BigInt(plan.left) > 0n ? 'result' : 'empty',
        },
      ];
    case 'contracts':
      return [
        revenue,
        capital,
        carried,
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
        carried,
        { ...wages, label: sourceMessage('delegation.flow.wagesNow'), tone: undefined },
      ];
    default:
      return undefined;
  }
}

/** The plan in one or two plain sentences under its steps. */
function planSentence(w: World, plan: DelegatePlan): ReactNode {
  const seasons = plan.runway;
  switch (plan.key) {
    case 'recruitment':
      return plan.over
        ? richMessage(
            seasons > 0
              ? 'delegation.flow.recruitmentShort'
              : 'delegation.flow.recruitmentShortIncome',
          )
        : seasons > 0
          ? richMessage('delegation.flow.recruitmentRunway', { seasons })
          : richMessage('delegation.flow.recruitmentIncome');
    case 'contracts':
      return plan.over
        ? richMessage(
            seasons > 0 ? 'delegation.flow.contractsShort' : 'delegation.flow.contractsShortIncome',
          )
        : seasons > 0
          ? richMessage('delegation.flow.contractsRunway', { seasons })
          : richMessage('delegation.flow.contractsIncome');
    case 'academy':
      return (
        <>
          {richMessage('delegation.flow.academyLine')}{' '}
          {richMessage('delegation.flow.youthCoach', { name: personOf(w, 'youth').name })}
        </>
      );
    case 'sales':
      return seasons > 0
        ? richMessage(plan.over ? 'delegation.plan.salesPressed' : 'delegation.plan.salesCalm')
        : richMessage(
            plan.over ? 'delegation.plan.salesPressedIncome' : 'delegation.plan.salesCalmIncome',
          );
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
 * The 단장's plan for a request (→`delegatePlan`): how he heard it, the money as income → capital →
 * the wage bill the runway carries → already committed → left to spend, one plain sentence, and the settings he sets. The delegation
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
