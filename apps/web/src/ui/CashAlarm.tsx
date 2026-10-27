import { useGameState } from '../runtime/store';
import { BANKRUPTCY_ROUNDS, CASH_WARNING_ROUNDS } from '../../../../packages/engine/src/settlement';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { Money } from './Money';
import s from './App.module.css';
import c from './CashAlarm.module.css';

/** Debt plays on under a red band counting down to bankruptcy (→ECON-24). */
export function CashAlarm({ overlay = false }: { overlay?: boolean }) {
  const w = useGameState((state) => state.view?.world);
  if (!w || w.bankrupt) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const cash = BigInt(w.cash);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  if (cash >= 0n && runway >= CASH_WARNING_ROUNDS) return null;
  return (
    <div
      data-ui="notice"
      data-tone="danger"
      className={overlay ? c.overlay : s.cashAlarm}
      role="status"
      data-testid="cash-alarm"
    >
      {cash < 0n ? (
        <>
          <b>파산 위기</b> 잔고 <Money value={w.cash} code={own.country} year={w.year} /> ·{' '}
          {BANKRUPTCY_ROUNDS - (w.insolvent ?? 0)}라운드 안에 흑자로 돌아오지 못하면 파산해요
        </>
      ) : (
        <>
          <b>자금 위기</b> 운영비 약 {runway}주분 남음 · 바닥난 채 {BANKRUPTCY_ROUNDS}라운드가
          지나면 파산해요
        </>
      )}
    </div>
  );
}
