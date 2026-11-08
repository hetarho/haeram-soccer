import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { Metrics, Player } from '../../../../../../packages/contracts/src/types';
import { performanceRows, type PlayerScope } from '../lib/playerAnalysis';
import { observedRate } from '../lib/matchAnalysis';
import s from '../../../shared/ui/styles/Analysis.module.css';
/**
 * Totals and per-90 rates over actual minutes: an own player's season or club career, or any row
 * of the same Metrics (a participant of the season's complete statistics) under its own title.
 */
export function PlayerPerformance(
  props: { player: Player; scope: PlayerScope } | { stats: Metrics; title: string },
) {
  useTextLocale();
  const stats = 'player' in props ? props.player[props.scope] : props.stats,
    pass = observedRate(stats[3], stats[2]);
  const title =
    'player' in props
      ? props.scope === 'season'
        ? sourceMessage('copy.PlayerPerformance.592ed3f314')
        : sourceMessage('copy.CareerRecordBook.173e51eb0c')
      : props.title;
  return (
    <section className={s.content} aria-label={displayMessage('copy.PlayerPerformance.236ddc2ece')}>
      <h3>{localizeValue(title)}</h3>
      <p className={s.note}>
        {richMessage('copy.PlayerPerformance.c8eb322a32', { p0: stats[10] })}
      </p>
      {localizeValue(
        stats[10] < 180 && (
          <p className={s.note} role="status">
            {richMessage('copy.PlayerPerformance.df6172933a')}
          </p>
        ),
      )}
      <dl className={s.facts}>
        {localizeValue(
          performanceRows(stats).map((row) => (
            <div key={row.label}>
              <dt>{richMessage('copy.PlayerPerformance.0d56a6e576', { p0: row.label })}</dt>
              <dd>
                {localizeValue(row.per90 === undefined ? '—' : row.per90.toFixed(2))}
                <small>
                  {richMessage('copy.PlayerPerformance.564ee8dba3', {
                    p0: row.total,
                    p1: stats[10],
                  })}
                </small>
              </dd>
            </div>
          )),
        )}
        <div>
          <dt>{richMessage('copy.PlayerPerformance.2544b4dec5')}</dt>
          <dd>
            {localizeValue(pass.percent === undefined ? '—' : `${pass.percent.toFixed(1)}%`)}
            <small>
              {richMessage('copy.PlayerPerformance.95f2a3403f', { p0: stats[3], p1: stats[2] })}
            </small>
          </dd>
        </div>
      </dl>
    </section>
  );
}
