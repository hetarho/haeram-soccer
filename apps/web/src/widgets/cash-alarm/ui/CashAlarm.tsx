import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useGameState } from '../../../runtime/store';
import { CASH_WARNING_ROUNDS } from '../../../../../../packages/engine/src/settlement';
import { operatingCosts } from '../../../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../../../packages/engine/src/investment';
import { clubDistressLine } from '../../../runtime/progression';
import { number } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { careerOver, ownerStatuses } from '../../../entities/office';
import s from '../../../shared/ui/styles/App.module.css';

/** The current distress stage and its next debt or recovery line (→WEB-56, ECON-24). */
export function CashAlarm() {
  useTextLocale();
  const w = useGameState((state) => state.view?.world);
  if (!w || careerOver(w)) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const cash = BigInt(w.cash);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const owner = ownerStatuses(w);
  const stage = w.distress?.stage ?? 0;
  const club = !!stage || cash < 0n || runway < CASH_WARNING_ROUNDS;
  if (!club && !owner.length) return null;
  const title = sourceMessage(
    stage ? `finance.distress.stage${stage}` : 'copy.CashAlarm.027b8b25f5',
  );
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
              stage || cash < 0n ? (
                <>
                  {richMessage(
                    stage === 3 ? 'finance.distress.recoveryBand' : 'finance.distress.nextBand',
                    {
                      title: <b>{localizeValue(title)}</b>,
                      cash: <Money value={w.cash} code={own.country} year={w.year} />,
                      limit: <Money value={clubDistressLine(w)} code={own.country} year={w.year} />,
                    },
                  )}
                </>
              ) : (
                <>
                  {richMessage('finance.cash.runway', {
                    title: <b>{richMessage('copy.CashAlarm.027b8b25f5')}</b>,
                    weeks: number(runway),
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
