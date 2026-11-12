import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState, type ReactNode } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { BudgetGroup, BudgetLine } from '../../../../../../packages/engine/src/club-budget';
import {
  BUDGET_RESPONSIBILITIES,
  requestLabel,
  RESPONSIBILITY_NAMES,
} from '../../../../../../packages/engine/src/delegation-info';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import { openDecisionSettings } from '../../../shared/routing/state';
import { Card } from '../../../shared/ui/Card';
import { Money } from '../../../shared/ui/Money';
import { SeasonStepper } from '../../../shared/ui/SeasonStepper';
import { compactMoney, number, seasonName } from '../../../presentation/format';
import { cashState, fixedCosts } from '../../player/@x/office';
import { DeskStats } from './OfficeDesk';
import s from './ClubBudget.module.css';

const GROUPS: readonly { group: BudgetGroup; title: string; note: string }[] = [
  {
    group: 'fixed',
    title: sourceMessage('budget.group.fixed'),
    note: sourceMessage('budget.group.fixedNote'),
  },
  {
    group: 'spend',
    title: sourceMessage('budget.group.spend'),
    note: sourceMessage('budget.group.spendNote'),
  },
  {
    group: 'income',
    title: sourceMessage('budget.group.income'),
    note: sourceMessage('budget.group.incomeNote'),
  },
];

/** One group's lines with their share of the group as a quiet bar. */
function BudgetLines({
  lines,
  total,
  amount,
}: {
  lines: readonly BudgetLine[];
  total: bigint;
  amount: (value: string) => ReactNode;
}) {
  useTextLocale();
  if (!lines.length) return <p className={s.empty}>{richMessage('budget.none')}</p>;
  return (
    <ul className={s.lines}>
      {localizeValue(
        lines.map((line) => {
          const value = BigInt(line.amount),
            share = total > 0n && value > 0n ? Number((value * 1000n) / total) / 10 : 0;
          return (
            <li key={line.key} data-line={line.key}>
              <span className={s.label}>{localizeValue(line.label)}</span>
              <b className={s.amount}>{localizeValue(amount(line.amount))}</b>
              <span className={s.bar} aria-hidden="true">
                <span style={{ width: `${Math.min(100, share)}%` }} />
              </span>
            </li>
          );
        }),
      )}
    </ul>
  );
}

/**
 * Who spends the club's money this season and how (→`delegatePlan`): each spending work's person
 * and the owner's request, or the owner himself. Read only; who decides changes on the delegation
 * page.
 */
function SpendingPlans({ w }: { w: World }) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  const code = clubOf(w).country;
  return (
    <section className={s.plans} aria-label={displayMessage('budget.plans.title')}>
      <header className={s.groupHead}>
        <h4>{richMessage('budget.plans.title')}</h4>
        <small>{richMessage('budget.plans.lead')}</small>
      </header>
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
                <b className={s.amount}>
                  {localizeValue(
                    !delegated
                      ? ''
                      : key === 'recruitment'
                        ? displayMessage('budget.plans.signings', {
                            budget: compactMoney(plan.budget, code, w.year),
                            left: compactMoney(plan.left, code, w.year),
                          })
                        : plan.response === 'noMoney'
                          ? displayMessage('budget.plans.holding')
                          : displayMessage('budget.plans.reserve', {
                              reserve: compactMoney(plan.reserve, code, w.year),
                            }),
                  )}
                </b>
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

/**
 * 구단 예산: the club's money season by season (→`seasonBudget`), browsed with the same ‹ season ›
 * stepper as the league pages (→WEB-40) — what came in, the fixed costs paid every round, the
 * money spent on decisions and the season's transfers; the season in progress adds this year's
 * fixed costs and who spends the money now. `titled` is false under a tab that already names it.
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
    amount = (value: string) => <Money value={value} code={code} year={year} plain />;
  const income = BigInt(budget.income),
    result = income - BigInt(budget.expense),
    current = year === w.year,
    costs = current ? fixedCosts(w) : undefined,
    state = current ? cashState(w) : undefined;
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
          <span
            className={result > 0n ? s.up : result < 0n ? s.down : undefined}
            data-testid="season-result"
          >
            {localizeValue(
              result === 0n
                ? displayMessage('budget.result.even')
                : displayMessage(result > 0n ? 'budget.result.surplus' : 'budget.result.deficit', {
                    amount: compactMoney((result < 0n ? -result : result).toString(), code, year),
                  }),
            )}
          </span>
        }
      >
        <DeskStats
          label={displayMessage('budget.title')}
          stats={[
            { label: sourceMessage('budget.group.income'), value: amount(budget.income) },
            { label: sourceMessage('budget.group.fixed'), value: amount(budget.fixed) },
            { label: sourceMessage('budget.group.spend'), value: amount(budget.spent) },
            {
              label: budget.closed
                ? sourceMessage('budget.stat.closingCash')
                : sourceMessage('budget.stat.cashNow'),
              value: amount(budget.cash),
            },
          ]}
        />
        {localizeValue(
          state && costs && (
            <p className={s.runway} data-tone={state.tone}>
              {richMessage('budget.runway', {
                label: state.label,
                value: state.value,
                status: state.status,
                next: compactMoney(costs.nextRound, code, year),
              })}
            </p>
          ),
        )}
      </Card>
      <div className={s.groups}>
        {localizeValue(
          GROUPS.map(({ group, title, note }) => {
            const lines = budget.lines.filter((line) => line.group === group),
              total = lines.reduce((all, line) => all + BigInt(line.amount), 0n);
            return (
              <section
                key={group}
                className={s.group}
                data-surface="inset"
                data-group={group}
                aria-label={localizeValue(title)}
              >
                <header className={s.groupHead}>
                  <h4>
                    {localizeValue(title)} <b>{localizeValue(amount(total.toString()))}</b>
                  </h4>
                  <small>{localizeValue(note)}</small>
                </header>
                <BudgetLines lines={lines} total={total} amount={amount} />
              </section>
            );
          }),
        )}
      </div>
      <p className={s.transfers}>
        {richMessage('budget.transfers', {
          in: number(budget.transfers.in),
          inFees: compactMoney(budget.transfers.inFees, code, year),
          out: number(budget.transfers.out),
          outFees: compactMoney(budget.transfers.outFees, code, year),
        })}
      </p>
      {localizeValue(
        costs && (
          <section className={s.forecast} aria-label={displayMessage('budget.forecast.title')}>
            <header className={s.groupHead}>
              <h4>
                {richMessage('budget.forecast.title')} <b>{localizeValue(amount(costs.annual))}</b>
              </h4>
              <small>{richMessage('budget.forecast.note')}</small>
            </header>
            <BudgetLines
              lines={costs.kinds.map(([label, value]) => ({
                key: label,
                group: 'fixed',
                label,
                amount: value,
              }))}
              total={BigInt(costs.annual)}
              amount={amount}
            />
          </section>
        ),
      )}
      {localizeValue(current && <SpendingPlans w={w} />)}
    </section>
  );
}
