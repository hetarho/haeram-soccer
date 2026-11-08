import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useGameState } from '../../../runtime/store';
import {
  BANKRUPTCY_ROUNDS,
  CASH_WARNING_ROUNDS,
} from '../../../../../../packages/engine/src/settlement';
import { operatingCosts } from '../../../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../../../packages/engine/src/investment';
import { Money } from '../../../shared/ui/Money';
import { careerOver, ownerStatuses } from '../../../entities/office/lib/ownerFigures';
import s from '../../../shared/ui/styles/App.module.css';

/**
 * Trouble is shown, never stopped for (→WEB-56, OWNER-15): debt plays on under a red band counting
 * down to bankruptcy (→ECON-24), and a taken-over club's owner shows 구단주 파산 위기 and 퇴진 압박
 * as their own statuses beside it. None opens a modal or halts the clock.
 */
export function CashAlarm() {
  useTextLocale();
  const w = useGameState((state) => state.view?.world);
  if (!w || careerOver(w)) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const cash = BigInt(w.cash);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const owner = ownerStatuses(w);
  const club = cash < 0n || runway < CASH_WARNING_ROUNDS;
  if (!club && !owner.length) return null;
  // With an owner beside it the club's own crisis is named apart from his (→OWNER-15).
  const crisis = w.owner
    ? sourceMessage('copy.CashAlarm.7c6b2c4fa1')
    : sourceMessage('copy.CashAlarm.be03d028d1');
  return (
    <>
      {localizeValue(
        club && (
          <div
            data-ui="notice"
            data-tone="danger"
            className={s.cashAlarm}
            role="status"
            data-testid="cash-alarm"
          >
            {localizeValue(
              cash < 0n ? (
                <>
                  {richMessage('copy.CashAlarm.466cd5aa0d', {
                    p0: <b>{localizeValue(crisis)}</b>,
                    p1: <Money value={w.cash} code={own.country} year={w.year} />,
                    p2: ' ',
                    p3: BANKRUPTCY_ROUNDS - (w.insolvent ?? 0),
                  })}
                </>
              ) : (
                <>
                  {richMessage('copy.CashAlarm.8773252530', {
                    p0: <b>{richMessage('copy.CashAlarm.027b8b25f5')}</b>,
                    p1: runway,
                    p2: BANKRUPTCY_ROUNDS,
                  })}
                </>
              ),
            )}
          </div>
        ),
      )}
      {localizeValue(
        owner.map((status) => (
          <div
            key={status.id}
            data-ui="notice"
            data-tone="danger"
            className={s.cashAlarm}
            role="status"
            data-testid={`${status.id}-crisis`}
          >
            <b>{localizeValue(status.title)}</b> {localizeValue(status.detail)}
          </div>
        )),
      )}
    </>
  );
}
