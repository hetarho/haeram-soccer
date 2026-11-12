import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState, type ReactNode } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { BudgetLine, SeasonBudget } from '../../../../../../packages/engine/src/club-budget';
import {
  BUDGET_RESPONSIBILITIES,
  requestLabel,
  RESPONSIBILITY_NAMES,
  sharePercent,
} from '../../../../../../packages/engine/src/delegation-info';
import { POLICY_INFO } from '../../../../../../packages/engine/src/policy';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import type { OfficeRead } from '../../../runtime/officeRead';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import { openDecisionSettings } from '../../../shared/routing/state';
import { Card } from '../../../shared/ui/Card';
import { Money } from '../../../shared/ui/Money';
import { SeasonStepper } from '../../../shared/ui/SeasonStepper';
import { compactMoney, number, percent, seasonName } from '../../../presentation/format';
import { fixedCosts } from '../../player/@x/office';
import { PlanFlow, planSteps, type DelegatePlan } from './DelegationPlan';
import s from './ClubBudget.module.css';

/** A part of one of the two flow bars, coloured by what it is. */
type Tone = 'earned' | 'sales' | 'injection' | 'drawn' | 'fixed' | 'chosen' | 'kept';
interface Part {
  tone: Tone;
  label: string;
  amount: bigint;
  /** The ledger lines it sums, for its legend. */
  lines: readonly BudgetLine[];
}
const positive = (amount: bigint) => (amount > 0n ? amount : 0n);
const total = (lines: readonly BudgetLine[]) =>
  lines.reduce((all, line) => all + BigInt(line.amount), 0n);

/**
 * A season's money as two bars of one length: what came in (what the club earned, player sales,
 * the owner's money, and any cash it had to draw on) and where it went (what went out whatever
 * anyone decided, what was chosen, and what was kept).
 */
function flowParts(budget: SeasonBudget) {
  const of = (keys: readonly string[]) => budget.lines.filter((line) => keys.includes(line.key)),
    income = budget.lines.filter((line) => line.group === 'income'),
    sales = of(['sales']),
    injection = of(['injection']),
    earned = income.filter((line) => line.key !== 'sales' && line.key !== 'injection'),
    fixed = budget.lines.filter((line) => line.group === 'fixed'),
    chosen = budget.lines.filter((line) => line.group === 'spend'),
    result = BigInt(budget.income) - BigInt(budget.expense);
  const inParts: Part[] = [
    {
      tone: 'earned',
      label: sourceMessage('budget.part.earned'),
      amount: positive(total(earned)),
      lines: earned,
    },
    {
      tone: 'sales',
      label: sourceMessage('copy.intervention.5ea61dab56'),
      amount: positive(total(sales)),
      lines: [],
    },
    {
      tone: 'injection',
      label: sourceMessage('copy.fan_mood.3881f2a2d6'),
      amount: positive(total(injection)),
      lines: [],
    },
    {
      tone: 'drawn',
      label: sourceMessage('budget.part.drawn'),
      amount: positive(-result),
      lines: [],
    },
  ];
  const outParts: Part[] = [
    {
      tone: 'fixed',
      label: sourceMessage('budget.group.fixed'),
      amount: positive(total(fixed)),
      lines: fixed,
    },
    {
      tone: 'chosen',
      label: sourceMessage('budget.group.spend'),
      amount: positive(total(chosen)),
      lines: chosen,
    },
    {
      tone: 'kept',
      label: sourceMessage('budget.part.kept'),
      amount: positive(result),
      lines: [],
    },
  ];
  return { inParts, outParts };
}

/** One bar of parts, each as wide as its share of `scale`. */
function FlowBar({ parts, scale }: { parts: readonly Part[]; scale: bigint }) {
  useTextLocale();
  return (
    <span className={s.bar} aria-hidden="true">
      {localizeValue(
        parts
          .filter((part) => part.amount > 0n)
          .map((part) => (
            <span
              key={part.tone}
              data-tone={part.tone}
              style={{ width: `${scale > 0n ? Number((part.amount * 10000n) / scale) / 100 : 0}%` }}
            />
          )),
      )}
    </span>
  );
}

/** Each part of a bar: its swatch, name, amount and share of the season's income, then its lines. */
function FlowLegend({
  parts,
  income,
  amount,
  money,
}: {
  parts: readonly Part[];
  income: bigint;
  amount: (value: string) => ReactNode;
  money: (value: string) => string;
}) {
  useTextLocale();
  return (
    <ul className={s.legend}>
      {localizeValue(
        parts
          .filter((part) => part.amount > 0n)
          .map((part) => (
            <li key={part.tone} data-tone={part.tone}>
              <span className={s.swatch} aria-hidden="true" />
              <span className={s.partName}>{localizeValue(part.label)}</span>
              <b className={s.partAmount}>{localizeValue(amount(part.amount.toString()))}</b>
              <small className={s.partShare}>
                {localizeValue(
                  income > 0n &&
                    displayMessage('budget.part.share', {
                      share: percent(Number(part.amount), Number(income)),
                    }),
                )}
              </small>
              {localizeValue(
                part.lines.length > 0 && (
                  <small className={s.partLines}>
                    {localizeValue(
                      part.lines
                        .filter((line) => BigInt(line.amount) !== 0n)
                        .map((line) =>
                          displayMessage('budget.part.line', {
                            label: line.label,
                            amount: money(line.amount),
                          }),
                        )
                        .join(' · '),
                    )}
                  </small>
                ),
              )}
            </li>
          )),
      )}
    </ul>
  );
}

/** The season's two bars and their legends: where the money came from and where it went. */
function MoneyFlow({ budget, code }: { budget: SeasonBudget; code: string }) {
  useTextLocale();
  const year = budget.year,
    amount = (value: string) => <Money value={value} code={code} year={year} plain />,
    money = (value: string) => compactMoney(value, code, year),
    { inParts, outParts } = flowParts(budget),
    inTotal = inParts.reduce((all, part) => all + part.amount, 0n),
    outTotal = outParts.reduce((all, part) => all + part.amount, 0n),
    scale = inTotal > outTotal ? inTotal : outTotal,
    income = BigInt(budget.income);
  const rows = [
    {
      key: 'in',
      title: sourceMessage('budget.group.income'),
      total: budget.income,
      parts: inParts,
    },
    {
      key: 'out',
      title: sourceMessage('budget.group.out'),
      total: budget.expense,
      parts: outParts,
    },
  ];
  return (
    <div className={s.flow} data-testid="budget-flow">
      {localizeValue(
        rows.map((row) => (
          <section
            key={row.key}
            className={s.flowRow}
            data-row={row.key}
            aria-label={localizeValue(row.title)}
          >
            <h4 className={s.flowHead}>
              <span>{localizeValue(row.title)}</span>
              <b>{localizeValue(amount(row.total))}</b>
            </h4>
            <FlowBar parts={row.parts} scale={scale} />
            <FlowLegend parts={row.parts} income={income} amount={amount} money={money} />
          </section>
        )),
      )}
    </div>
  );
}

/** One work's plan in a few words for the list (→`delegatePlan`). */
function planSummary(w: World, plan: DelegatePlan) {
  const code = clubOf(w).country,
    money = (value: string) => compactMoney(value, code, w.year),
    share = sharePercent(plan.share);
  switch (plan.key) {
    case 'recruitment':
      return displayMessage('budget.plans.signings', {
        budget: money(plan.budget),
        left: money(plan.left),
      });
    case 'contracts':
      return displayMessage('budget.plans.wageCap', { share });
    case 'academy':
      return displayMessage('budget.plans.academy', {
        level: POLICY_INFO.academy.levels[plan.youth!.level - 1].name,
        budget: money(plan.budget),
      });
    case 'sales':
      return displayMessage('budget.plans.sellLine', { share });
    default: {
      const choice = plan.choices[0];
      return choice
        ? displayMessage('delegation.change', { label: choice.label, value: choice.value })
        : '';
    }
  }
}

/**
 * The 단장's plan for this season (→`delegatePlan`): for each money work he holds, his income →
 * share → committed → left steps, then every work with who decides it and his plan in a few words.
 * Read only; who decides and the request change on the delegation page.
 */
function SeasonPlan({ w, office }: { w: World; office: OfficeRead }) {
  useTextLocale();
  const shown = (['recruitment', 'academy'] as const).filter((key) => isDelegated(w, key));
  return (
    <section className={s.plans} aria-label={displayMessage('budget.plans.title')}>
      <header className={s.groupHead}>
        <h4>{richMessage('budget.plans.title')}</h4>
        <small>{richMessage('budget.plans.lead')}</small>
      </header>
      {localizeValue(
        shown.map((key) => {
          const plan = office.delegation[key].plan;
          return (
            <section
              key={key}
              className={s.planFlow}
              aria-label={localizeValue(RESPONSIBILITY_NAMES[key])}
            >
              <h5>{localizeValue(RESPONSIBILITY_NAMES[key])}</h5>
              <PlanFlow label={RESPONSIBILITY_NAMES[key]} steps={planSteps(w, plan)!} />
            </section>
          );
        }),
      )}
      <ul className={s.planList}>
        {localizeValue(
          BUDGET_RESPONSIBILITIES.map((key) => {
            const { plan } = office.delegation[key],
              delegated = isDelegated(w, key);
            return (
              <li key={key} data-delegated={delegated || undefined}>
                <span className={s.label}>{localizeValue(RESPONSIBILITY_NAMES[key])}</span>
                <span className={s.who}>
                  {localizeValue(
                    delegated
                      ? displayMessage('budget.plans.delegated', {
                          post: plan.delegate.postLabel,
                          request: requestLabel(key, plan.request),
                        })
                      : displayMessage('budget.plans.direct'),
                  )}
                </span>
                <b className={s.amount}>{localizeValue(delegated ? planSummary(w, plan) : '')}</b>
              </li>
            );
          }),
        )}
      </ul>
      <div className={s.planActions}>
        <button
          type="button"
          data-ui="secondary"
          aria-haspopup="dialog"
          onClick={() => openDecisionSettings('recruitment')}
        >
          {richMessage('delegation.note.open')}
        </button>
      </div>
    </section>
  );
}

/** This year's fixed costs at today's contracts, one line each with its share as a quiet bar. */
function Forecast({ w, code }: { w: World; code: string }) {
  useTextLocale();
  const costs = fixedCosts(w),
    annual = BigInt(costs.annual);
  return (
    <section className={s.forecast} aria-label={displayMessage('budget.forecast.title')}>
      <header className={s.groupHead}>
        <h4>
          {richMessage('budget.forecast.title')}{' '}
          <b>
            <Money value={costs.annual} code={code} year={w.year} plain />
          </b>
        </h4>
        <small>{richMessage('budget.forecast.note')}</small>
      </header>
      <ul className={s.lines}>
        {localizeValue(
          costs.kinds.map(([label, value]) => {
            const amount = BigInt(value),
              share = annual > 0n && amount > 0n ? Number((amount * 1000n) / annual) / 10 : 0;
            return (
              <li key={label}>
                <span className={s.label}>{localizeValue(label)}</span>
                <b className={s.amount}>
                  <Money value={value} code={code} year={w.year} plain />
                </b>
                <span className={s.meter} aria-hidden="true">
                  <span style={{ width: `${Math.min(100, share)}%` }} />
                </span>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}

/**
 * 구단 예산: the club's money season by season (→`seasonBudget`), browsed with the same ‹ season ›
 * stepper as the league pages (→WEB-40). A season reads as two bars of one length — where the money
 * came from and where it went: what went out whatever anyone decided, what was chosen, what was
 * kept — with that season's transfers. The season in progress adds the 단장's plan in his terms and
 * this year's fixed costs. `titled` is false under a tab that already names it.
 */
export function ClubBudget({ w, titled = true }: { w: World; titled?: boolean }) {
  useTextLocale();
  const office = useOfficeRead(w);
  const [chosen, setYear] = useState(w.year);
  if (!office) return <p role="status">{richMessage('copy.InvestmentView.d6008342de')}</p>;
  const years = office.budgets.map((season) => season.year),
    budget = office.budgets.find((season) => season.year === chosen) ?? office.budgets.at(-1)!,
    year = budget.year;
  const code = clubOf(w).country,
    result = BigInt(budget.income) - BigInt(budget.expense),
    current = year === w.year,
    net = BigInt(budget.transfers.outFees) - BigInt(budget.transfers.inFees);
  return (
    <section
      className={s.budget}
      aria-label={displayMessage('budget.title')}
      data-testid="club-budget"
    >
      <header className={s.head}>
        <div>
          {localizeValue(titled && <h3>{richMessage('budget.title')}</h3>)}
          <small>{richMessage('budget.lead')}</small>
        </div>
        <SeasonStepper years={years} value={year} current={w.year} onChange={setYear} />
      </header>
      <Card
        as="div"
        surface="ticket"
        className={s.verdict}
        meta={
          budget.closed
            ? displayMessage('budget.meta.closed', {
                season: seasonName(year),
                rank: number(budget.rank ?? 0),
              })
            : displayMessage('budget.meta.open', { season: seasonName(year), round: w.round })
        }
        title={
          <span className={s.result}>
            <span
              className={result > 0n ? s.up : result < 0n ? s.down : undefined}
              data-testid="season-result"
            >
              {localizeValue(
                result === 0n
                  ? displayMessage('budget.result.even')
                  : displayMessage(
                      result > 0n ? 'budget.result.surplus' : 'budget.result.deficit',
                      {
                        amount: compactMoney(
                          (result < 0n ? -result : result).toString(),
                          code,
                          year,
                        ),
                      },
                    ),
              )}
            </span>
            <small className={s.cash}>
              {richMessage(budget.closed ? 'budget.cash.closed' : 'budget.cash.now', {
                cash: <Money value={budget.cash} code={code} year={year} plain />,
              })}
            </small>
          </span>
        }
      >
        <MoneyFlow budget={budget} code={code} />
        <p className={s.transfers}>
          {richMessage('budget.transfers', {
            in: number(budget.transfers.in),
            inFees: compactMoney(budget.transfers.inFees, code, year),
            out: number(budget.transfers.out),
            outFees: compactMoney(budget.transfers.outFees, code, year),
          })}{' '}
          {localizeValue(
            net !== 0n &&
              displayMessage(net > 0n ? 'budget.transfers.netGain' : 'budget.transfers.netSpend', {
                net: compactMoney((net < 0n ? -net : net).toString(), code, year),
              }),
          )}
        </p>
      </Card>
      {localizeValue(current && <SeasonPlan w={w} office={office} />)}
      {localizeValue(current && <Forecast w={w} code={code} />)}
    </section>
  );
}
