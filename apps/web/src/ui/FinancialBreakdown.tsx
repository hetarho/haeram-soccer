import { memo } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { financialBreakdown } from '../../../../packages/engine/src/finance';
import { money, number } from './format';
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
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    const format = (amount: string) => money(amount, club.country, w.year);
    const costs = breakdown.costs;
    return (
      <section className={s.panel} aria-label="수입과 지출 장부">
        <div className={s.heading}>
          <div>
            <small>CLUB ACCOUNTS</small>
            <h3>돈이 들어오고 나간 이유</h3>
          </div>
          <span>
            {w.year}/{String(w.year + 1).slice(-2)} 시즌
          </span>
        </div>
        <div className={s.summary}>
          <div>
            <span>출자를 제외한 시즌 수지</span>
            <strong className={BigInt(breakdown.operatingNet) < 0n ? s.negative : undefined}>
              {format(breakdown.operatingNet)}
            </strong>
            <small>실제 수입에서 추가 출자와 실제 지출을 차감</small>
          </div>
          <div>
            <span>구단주 추가 출자</span>
            <strong>{format(breakdown.ownerInvestment)}</strong>
            <small>운영 매출과 별도로 표시</small>
          </div>
          <div>
            <span>다음 라운드 고정 지출</span>
            <strong>{format(costs.nextRound)}</strong>
            <small>급여와 시설 유지비 · 경기 개최비 별도</small>
          </div>
        </div>
        <div className={s.columns}>
          <div>
            <h4>누적 수입</h4>
            <dl>
              {breakdown.income
                .filter((row) => BigInt(row.amount) !== 0n)
                .map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{format(row.amount)}</dd>
                  </div>
                ))}
            </dl>
            <div className={s.total}>
              <span>수입 합계</span>
              <b>{format(w.income)}</b>
            </div>
          </div>
          <div>
            <h4>누적 지출</h4>
            <dl>
              {breakdown.expense
                .filter((row) => BigInt(row.amount) !== 0n)
                .map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{format(row.amount)}</dd>
                  </div>
                ))}
            </dl>
            <div className={s.total}>
              <span>지출 합계</span>
              <b>{format(w.expense)}</b>
            </div>
          </div>
          <div>
            <h4>계약상 연간 고정비</h4>
            <dl>
              <div>
                <dt>선수 급여</dt>
                <dd>{format(costs.playerWages)}</dd>
              </div>
              <div>
                <dt>감독 급여</dt>
                <dd>{format(costs.managerWage)}</dd>
              </div>
              <div>
                <dt>시설 유지</dt>
                <dd>{format(costs.maintenance)}</dd>
              </div>
            </dl>
            <div className={s.total}>
              <span>연간 합계</span>
              <b>{format(costs.annual)}</b>
            </div>
          </div>
        </div>
        <div className={s.forecast}>
          <div>
            <h4>현재 조건의 다음 홈 경기</h4>
            <p>
              예상 관중 {number(breakdown.gate.attendanceLow)}–
              {number(breakdown.gate.attendanceHigh)}명 / 수용 {number(breakdown.gate.capacity)}명
            </p>
            <p>
              입장·상품 수입 {format(breakdown.gate.incomeLow)}–{format(breakdown.gate.incomeHigh)}{' '}
              · 개최비 {format(breakdown.gate.costLow)}–{format(breakdown.gate.costHigh)}
            </p>
          </div>
          <p>
            최근 경기 성적, 평판, 가격, 진행 중인 마케팅과 시설을 반영한 범위입니다. 후원은 실제
            리그 경기마다 나누어 받고, 승리·무승부 보너스와 최종 순위 상금은 별도로 정산합니다.
          </p>
        </div>
        {!!breakdown.recent.length && (
          <div className={s.receipts}>
            <h4>최근 실제 정산</h4>
            <ol>
              {breakdown.recent.slice(0, 6).map((receipt, index) => (
                <li key={`${receipt.year}:${receipt.round}:${receipt.kind}:${index}`}>
                  <span>
                    <small>{receipt.round}회차</small>
                    {receipt.title}
                  </span>
                  <b className={receipt.direction === 'expense' ? s.negative : undefined}>
                    {receipt.direction === 'expense' ? '−' : '+'}
                    {format(receipt.amount)}
                  </b>
                </li>
              ))}
            </ol>
          </div>
        )}
        {BigInt(w.cash) < 0n && (
          <p className={s.warning}>
            자금 부족이 계속되고 있습니다. 자동으로 자금이 보충되지 않습니다. 급여와 투자 규모를
            줄이고, 매각이나 명시적인 추가 출자를 결정하세요.
          </p>
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
    before.w.facilities === after.w.facilities &&
    before.w.campaigns === after.w.campaigns,
);
