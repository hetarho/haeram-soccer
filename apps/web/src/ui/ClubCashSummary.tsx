import type { World } from '../../../../packages/contracts/src/types';
import { Card } from './Card';
import { DeskStats } from './OfficeDesk';
import { compactMoney, money } from './format';
import { cashState, fixedCosts, seasonBooks } from './teamState';
import o from './OwnerSheet.module.css';

/**
 * This season's income, spending and result first, then club cash, fixed costs and runway, shared
 * by the unified money dialog and legacy cash view.
 */
export function ClubCashSummary({ w }: { w: World }) {
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const format = (value: string) => compactMoney(value, own.country, w.year);
  const state = cashState(w);
  const costs = fixedCosts(w);
  const books = seasonBooks(w);
  const result = BigInt(books.result);
  return (
    <>
      <DeskStats
        label="이번 시즌 수지"
        stats={[
          { label: '시즌 수입', value: format(books.income), note: '지금까지' },
          { label: '시즌 지출', value: format(books.expense), note: '지금까지' },
          {
            label: '시즌 수지',
            value: (
              <span
                className={result > 0n ? o.up : result < 0n ? o.down : undefined}
                data-testid="season-result"
              >
                {result > 0n ? '+' : ''}
                {format(books.result)}
              </span>
            ),
            note: result > 0n ? '수익' : result < 0n ? '손해' : '본전',
          },
        ]}
      />
      <Card
        as="section"
        surface="ticket"
        aria-label="지금 상태"
        meta={`${state.label} ${state.value} · ${state.status}${state.attention ? ' · 주의' : ''}`}
      >
        <p>
          {BigInt(w.cash) < 0n
            ? '운영 자금이 적자예요. 급여와 운영비는 그대로 계속 나가요.'
            : `급여·시설 유지·운영 경비 기준으로 ${state.value}분 자금이 있어요. 입장 수입·후원·상금처럼 앞으로 들어올 돈은 빼고 셈해요.`}
        </p>
      </Card>
      <DeskStats
        label="자금 현황"
        stats={[
          { label: '보유 현금', value: format(w.cash), note: money(w.cash, own.country, w.year) },
          { label: '다음 라운드 고정 지출', value: format(costs.nextRound) },
          { label: state.label, value: state.value, note: state.status },
        ]}
      />
      <DeskStats
        label="연간 고정비"
        stats={[
          ...costs.kinds.map(([label, amount]) => ({ label, value: format(amount) })),
          { label: '연간 합계', value: format(costs.annual) },
        ]}
      />
    </>
  );
}
