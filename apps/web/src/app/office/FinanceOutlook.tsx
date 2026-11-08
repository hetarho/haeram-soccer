import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import type { ReactNode } from 'react';
import type { World } from '../../../../../packages/contracts/src/types';
import { financeProjection } from '../../../../../packages/engine/src/projection';
import { clubOf } from '../../../../../packages/engine/src/player-state';
import { Money } from '../../shared/ui/Money';
import s from './FinanceOutlook.module.css';

function range(low: string, high: string, format: (value: string) => ReactNode) {
  if (low === high) return format(low);
  return (
    <>
      {localizeValue(format(low))} ~ {localizeValue(format(high))}
    </>
  );
}

/** Where cash heads if the club keeps its current contracts, policy and demand. */
export function FinanceOutlook({ w }: { w: World }) {
  useTextLocale();
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const projection = financeProjection(w);
  const tone = (value: string) =>
    BigInt(value) < 0n ? s.negative : BigInt(value) > 0n ? s.positive : '';
  return (
    <section
      data-surface="panel"
      className={s.outlook}
      aria-label={displayMessage('copy.FinanceOutlook.462b9f6e87')}
      data-testid="finance-outlook"
    >
      <header>
        <h3>{richMessage('copy.FinanceOutlook.462b9f6e87')}</h3>
        <small>{richMessage('copy.FinanceOutlook.bfb43c3e4b')}</small>
      </header>
      <ol className={s.timeline}>
        <li>
          <span>{richMessage('copy.AwaySummary.df159f47a8')}</span>
          <b>{localizeValue(format(projection.now))}</b>
        </li>
        <li>
          <span>{richMessage('copy.FinanceOutlook.c7b9e4b914')}</span>
          <b className={tone(projection.seasonEnd.low)}>
            {localizeValue(range(projection.seasonEnd.low, projection.seasonEnd.high, format))}
          </b>
        </li>
        <li>
          <span>{richMessage('copy.FinanceOutlook.8c34ed54c0')}</span>
          <b className={tone(projection.nextYear.low)} data-testid="projection-next-year">
            {localizeValue(range(projection.nextYear.low, projection.nextYear.high, format))}
          </b>
        </li>
      </ol>
      {localizeValue(
        projection.lines.length > 0 && (
          <ul className={s.lines}>
            {localizeValue(
              projection.lines.map((line) => (
                <li key={line.label}>
                  <span>{localizeValue(line.label)}</span>
                  <b className={tone(line.amount)}>
                    {localizeValue(BigInt(line.amount) > 0n ? '+' : '')}
                    {localizeValue(format(line.amount))}
                  </b>
                </li>
              )),
            )}
          </ul>
        ),
      )}
      <p>{richMessage('copy.FinanceOutlook.8e77dffc4b')}</p>
    </section>
  );
}
