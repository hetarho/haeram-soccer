import type { ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { clubOf } from '../../../../packages/engine/src/world';
import { Money } from './Money';
import s from './FinanceOutlook.module.css';

function range(low: string, high: string, format: (value: string) => ReactNode) {
  if (low === high) return format(low);
  return (
    <>
      {format(low)} ~ {format(high)}
    </>
  );
}

/** Where cash heads if the club keeps its current contracts, policy and demand. */
export function FinanceOutlook({ w }: { w: World }) {
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const projection = financeProjection(w);
  const tone = (value: string) =>
    BigInt(value) < 0n ? s.negative : BigInt(value) > 0n ? s.positive : '';
  return (
    <section
      data-surface="panel"
      className={s.outlook}
      aria-label="재정 전망"
      data-testid="finance-outlook"
    >
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
        현재 계약·방향·관중 수요를 그대로 이어간다고 가정한 예상이에요. 리그 분배금은 지금 디비전
        기준이고, 순위 배분금은 현재 순위로 시즌 종료 때 받아요. 경기 결과, 승강, 이적, 해외 투어에
        따라 달라져요.
      </p>
    </section>
  );
}
