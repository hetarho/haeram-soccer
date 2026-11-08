import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { memo } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import { financialBreakdown } from '../../../../../../packages/engine/src/finance';
import { money, number } from '../../../presentation/format';
import s from './FinancialBreakdown.module.css';

type Breakdown = ReturnType<typeof financialBreakdown>;

export const FinancialBreakdown = memo(
  function FinancialBreakdown({
    w,
    breakdown = financialBreakdown(w),
  }: {
    w: World;
    breakdown?: Breakdown;
  }) {
    useTextLocale();
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    const format = (amount: string) => money(amount, club.country, w.year);
    const costs = breakdown.costs;
    return (
      <section
        data-surface="panel"
        className={s.panel}
        aria-label={displayMessage('copy.FinancialBreakdown.1bd659d06e')}
      >
        <div className={s.heading}>
          <div>
            <small>{richMessage('copy.FinancialBreakdown.9cccdb004b')}</small>
            <h3>{richMessage('copy.FinancialBreakdown.03bb500d3d')}</h3>
          </div>
          <span>
            {richMessage('copy.BusinessWorkbench.b58cd6400a', {
              p0: w.year,
              p1: String(w.year + 1).slice(-2),
            })}
          </span>
        </div>
        <div className={s.summary}>
          <div>
            <span>{richMessage('copy.ClubCashSummary.967f1e3a31')}</span>
            <strong className={BigInt(breakdown.net) < 0n ? s.negative : undefined}>
              {localizeValue(format(breakdown.net))}
            </strong>
            <small>{richMessage('copy.FinancialBreakdown.7920b56b2c')}</small>
          </div>
          <div>
            <span>{richMessage('copy.ClubCashSummary.861779d896')}</span>
            <strong className={BigInt(w.cash) < 0n ? s.negative : undefined}>
              {localizeValue(format(w.cash))}
            </strong>
            <small>{richMessage('copy.FinancialBreakdown.d31a21b21f')}</small>
          </div>
          <div>
            <span>{richMessage('copy.ClubCashSummary.9ab3a675ca')}</span>
            <strong>{localizeValue(format(costs.nextRound))}</strong>
            <small>{richMessage('copy.FinancialBreakdown.289c3f5fa7')}</small>
          </div>
        </div>
        <div className={s.columns}>
          <div>
            <h4>{richMessage('copy.FinancialBreakdown.029e3642cc')}</h4>
            <dl>
              {localizeValue(
                breakdown.income
                  .filter((row) => BigInt(row.amount) !== 0n)
                  .map((row) => (
                    <div key={row.key}>
                      <dt>{localizeValue(row.label)}</dt>
                      <dd>{localizeValue(format(row.amount))}</dd>
                    </div>
                  )),
              )}
            </dl>
            <div className={s.total}>
              <span>{richMessage('copy.FinancialBreakdown.fb58eb285a')}</span>
              <b>{localizeValue(format(w.income))}</b>
            </div>
          </div>
          <div>
            <h4>{richMessage('copy.FinancialBreakdown.6a849b5f77')}</h4>
            <dl>
              {localizeValue(
                breakdown.expense
                  .filter((row) => BigInt(row.amount) !== 0n)
                  .map((row) => (
                    <div key={row.key}>
                      <dt>{localizeValue(row.label)}</dt>
                      <dd>{localizeValue(format(row.amount))}</dd>
                    </div>
                  )),
              )}
            </dl>
            <div className={s.total}>
              <span>{richMessage('copy.FinancialBreakdown.e82ab98937')}</span>
              <b>{localizeValue(format(w.expense))}</b>
            </div>
          </div>
          <div>
            <h4>{richMessage('copy.ClubCashSummary.382afa688e')}</h4>
            <dl>
              {localizeValue(
                (
                  [
                    [sourceMessage('copy.FinancialBreakdown.4bdab1482a'), costs.playerWages],
                    [sourceMessage('copy.FinancialBreakdown.db1fa5856a'), costs.managerWage],
                    [sourceMessage('copy.FinancialBreakdown.cc06b9815f'), costs.staffWages],
                    [sourceMessage('copy.FinancialBreakdown.be5fd48c10'), costs.maintenance],
                    [sourceMessage('copy.FinancialBreakdown.614f1dbc56'), costs.investment],
                    [sourceMessage('copy.FinancialBreakdown.d4527c802c'), costs.academy],
                    [sourceMessage('copy.FinancialBreakdown.2d914c9be2'), costs.expenses],
                    [sourceMessage('copy.FinancialBreakdown.ddebd211b6'), costs.loan],
                  ] as const
                )
                  .filter(
                    ([label, amount]) =>
                      label === sourceMessage('copy.FinancialBreakdown.4bdab1482a') ||
                      BigInt(amount) !== 0n,
                  )
                  .map(([label, amount]) => (
                    <div key={label}>
                      <dt>{localizeValue(label)}</dt>
                      <dd>{localizeValue(format(amount))}</dd>
                    </div>
                  )),
              )}
            </dl>
            <div className={s.total}>
              <span>{richMessage('copy.ClubCashSummary.c186eb9e27')}</span>
              <b>{localizeValue(format(costs.annual))}</b>
            </div>
          </div>
        </div>
        <div data-surface="sheet" className={s.forecast}>
          <div>
            <h4>{richMessage('copy.FinancialBreakdown.ed865d6d50')}</h4>
            <p>
              {richMessage('copy.FinancialBreakdown.752828fd69', {
                p0: number(breakdown.gate.attendanceLow),
                p1: number(breakdown.gate.attendanceHigh),
                p2: number(breakdown.gate.capacity),
              })}
            </p>
            <p>
              {richMessage('copy.FinancialBreakdown.a720f9040b', {
                p0: number(breakdown.gate.supporters),
                p1: ' ',
                p2: number(breakdown.catchment),
              })}
            </p>
            <p>
              {richMessage('copy.FinancialBreakdown.2ee6e23e8b', {
                p0: format(breakdown.gate.incomeLow),
                p1: format(breakdown.gate.incomeHigh),
                p2: ' ',
                p3: format(breakdown.gate.costLow),
                p4: format(breakdown.gate.costHigh),
              })}
            </p>
          </div>
          <p>{richMessage('copy.FinancialBreakdown.8d8007a3d1')}</p>
        </div>
        {localizeValue(
          !!breakdown.recent.length && (
            <div className={s.receipts}>
              <h4>{richMessage('copy.FinancialBreakdown.dd4938954f')}</h4>
              <ol>
                {localizeValue(
                  breakdown.recent.slice(0, 6).map((receipt, index) => (
                    <li key={`${receipt.year}:${receipt.round}:${receipt.kind}:${index}`}>
                      <span>
                        <small>
                          {richMessage('copy.FinancialBreakdown.26b12749e4', { p0: receipt.round })}
                        </small>
                        {localizeValue(receipt.title)}
                      </span>
                      <b className={receipt.direction === 'expense' ? s.negative : undefined}>
                        {localizeValue(receipt.direction === 'expense' ? '−' : '+')}
                        {localizeValue(format(receipt.amount))}
                      </b>
                    </li>
                  )),
                )}
              </ol>
            </div>
          ),
        )}
        {localizeValue(
          BigInt(w.cash) < 0n && (
            <p data-surface="inset" className={s.warning}>
              {richMessage('copy.FinancialBreakdown.37113490b0')}
            </p>
          ),
        )}
      </section>
    );
  },
  (before, after) =>
    before.breakdown === after.breakdown &&
    before.w.year === after.w.year &&
    before.w.round === after.w.round &&
    before.w.cash === after.w.cash &&
    before.w.income === after.w.income &&
    before.w.expense === after.w.expense &&
    before.w.players === after.w.players &&
    before.w.manager === after.w.manager &&
    before.w.clubs === after.w.clubs &&
    before.w.events === after.w.events &&
    before.w.ticket === after.w.ticket &&
    before.w.stadium === after.w.stadium &&
    before.w.trainingGround === after.w.trainingGround &&
    before.w.academyFacility === after.w.academyFacility &&
    before.w.facilityWorks === after.w.facilityWorks &&
    before.w.campaigns === after.w.campaigns,
);
