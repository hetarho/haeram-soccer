import type { World } from '../../../../packages/contracts/src/types';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { clubOf } from '../../../../packages/engine/src/world';
import { money } from './format';
import s from './FinanceOutlook.module.css';

const range = (low: string, high: string, format: (value: string) => string) =>
  low === high ? format(low) : `${format(low)} ~ ${format(high)}`;

/** Where cash heads if the club keeps its current contracts, policy and demand. */
export function FinanceOutlook({ w }: { w: World }) {
  const club = clubOf(w);
  const format = (value: string) => money(value, club.country, w.year);
  const projection = financeProjection(w);
  const tone = (value: string) =>
    BigInt(value) < 0n ? s.negative : BigInt(value) > 0n ? s.positive : '';
  return (
    <section className={s.outlook} aria-label="재정 전망" data-testid="finance-outlook">
      <header>
        <h3>재정 전망</h3>
        <small>지금 상태를 유지한다면</small>
      </header>
      <ol className={s.timeline}>
        <li>
          <span>지금</span>
          <b>{format(projection.now)}</b>
        </li>
        <li>
          <span>시즌 종료</span>
          <b className={tone(projection.seasonEnd.low)}>
            {range(projection.seasonEnd.low, projection.seasonEnd.high, format)}
          </b>
        </li>
        <li>
          <span>1시즌 뒤</span>
          <b className={tone(projection.nextYear.low)} data-testid="projection-next-year">
            {range(projection.nextYear.low, projection.nextYear.high, format)}
          </b>
        </li>
      </ol>
      {projection.lines.length > 0 && (
        <ul className={s.lines}>
          {projection.lines.map((line) => (
            <li key={line.label}>
              <span>{line.label}</span>
              <b className={tone(line.amount)}>
                {BigInt(line.amount) > 0n ? '+' : ''}
                {format(line.amount)}
              </b>
            </li>
          ))}
        </ul>
      )}
      <p>
        현재 계약·운영 방침·관중 수요를 그대로 이어간다고 가정한 예상이에요. 경기 결과, 이적, 캠페인
        결과에 따라 달라져요.
      </p>
    </section>
  );
}
