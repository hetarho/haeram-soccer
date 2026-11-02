import { useGameState } from '../runtime/store';
import { BANKRUPTCY_ROUNDS, CASH_WARNING_ROUNDS } from '../../../../packages/engine/src/settlement';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { Money } from './Money';
import { careerOver, ownerStatuses } from './ownerSheet';
import s from './App.module.css';

/**
 * Trouble is shown, never stopped for (→WEB-56, OWNER-15): debt plays on under a red band counting
 * down to bankruptcy (→ECON-24), and a taken-over club's owner shows 구단주 파산 위기 and 퇴진 압박
 * as their own statuses beside it. None opens a modal or halts the clock.
 */
export function CashAlarm() {
  const w = useGameState((state) => state.view?.world);
  if (!w || careerOver(w)) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const cash = BigInt(w.cash);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const owner = ownerStatuses(w);
  const club = cash < 0n || runway < CASH_WARNING_ROUNDS;
  if (!club && !owner.length) return null;
  // With an owner beside it the club's own crisis is named apart from his (→OWNER-15).
  const crisis = w.owner ? '구단 파산 위기' : '파산 위기';
  return (
    <>
      {club && (
        <div
          data-ui="notice"
          data-tone="danger"
          className={s.cashAlarm}
          role="status"
          data-testid="cash-alarm"
        >
          {cash < 0n ? (
            <>
              <b>{crisis}</b> 잔고 <Money value={w.cash} code={own.country} year={w.year} /> ·{' '}
              {BANKRUPTCY_ROUNDS - (w.insolvent ?? 0)}라운드 안에 흑자로 돌아오지 못하면 파산해요
            </>
          ) : (
            <>
              <b>자금 위기</b> 운영비 약 {runway}주분 남음 · 바닥난 채 {BANKRUPTCY_ROUNDS}라운드가
              지나면 파산해요
            </>
          )}
        </div>
      )}
      {owner.map((status) => (
        <div
          key={status.id}
          data-ui="notice"
          data-tone="danger"
          className={s.cashAlarm}
          role="status"
          data-testid={`${status.id}-crisis`}
        >
          <b>{status.title}</b> {status.detail}
        </div>
      ))}
    </>
  );
}
