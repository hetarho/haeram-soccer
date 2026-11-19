import type { TableRow } from '../../../../../../packages/contracts/src/types';
import { leaguePoints } from '../../../../../../packages/engine/src/league-fixtures';
import { number } from '../../../presentation/format';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useTextLocale } from '../../../presentation/text';

type PointsRow = Pick<TableRow, 'points' | 'deducted' | 'deductionReason'>;
/** A separately recorded administrative sanction, beside the net league points. */
export function PointsDeduction({
  row,
}: {
  row?: Pick<PointsRow, 'deducted' | 'deductionReason'>;
}) {
  useTextLocale();
  if (!row?.deducted || row.deductionReason !== 'administration') return null;
  return (
    <small data-ui="badge" data-testid="points-deduction">
      {richMessage('league.points.administration', { points: number(row.deducted) })}
    </small>
  );
}
/** Match points remain gross in state; league displays subtract the recorded sanction once. */
export function LeaguePoints({ row }: { row: PointsRow }) {
  useTextLocale();
  return (
    <>
      {number(leaguePoints(row))} <PointsDeduction row={row} />
    </>
  );
}
