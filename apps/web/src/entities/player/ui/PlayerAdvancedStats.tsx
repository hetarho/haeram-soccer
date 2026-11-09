import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { decimal, number } from '../../../presentation/format';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { Player, World } from '../../../../../../packages/contracts/src/types';
import { PD, per90, playerAdvanced, share, type PlayerAdvanced } from '../../match/@x/player';
import { Term } from '../../../shared/ui/Term';
import s from '../../../shared/ui/styles/Analysis.module.css';

/**
 * A player's advanced production over the chosen scope, with totals and per-90 rates: an own
 * player's records, or a participant's totals of the season's complete statistics, whose full-model
 * matches carry every counter on either engine (`fullStatsAdvanced`).
 */
export function PlayerAdvancedStats(
  props: { w: World; player: Player; scope: 'season' | 'career' } | { advanced: PlayerAdvanced },
) {
  useTextLocale();
  const { matches, minutes, totals, spatialMatches, spatialMinutes } =
    'advanced' in props ? props.advanced : playerAdvanced(props.w, props.player.id, props.scope);
  if (!matches)
    return (
      <p className={s.note} data-testid="player-advanced">
        {richMessage('copy.PlayerAdvancedStats.9dab98a206')}
      </p>
    );
  const rows: [string, string, string, string][] = [
    ['xg', 'xG', decimal(totals[PD.xg] / 100, 2), per90(totals[PD.xg] / 100, minutes)],
    ['xa', 'xA', decimal(totals[PD.xa] / 100, 2), per90(totals[PD.xa] / 100, minutes)],
    [
      'key-pass',
      sourceMessage('copy.MatchReport.532ac6f371'),
      number(totals[PD.keyPasses]),
      per90(totals[PD.keyPasses], minutes),
    ],
    [
      'big-chance',
      sourceMessage('copy.PlayerAdvancedStats.49edc138c5'),
      number(totals[PD.bigChancesCreated]),
      per90(totals[PD.bigChancesCreated], minutes),
    ],
    [
      'final-third',
      sourceMessage('copy.PlayerAdvancedStats.c4f75aa388'),
      `${share(totals[PD.finalThirdCompleted], totals[PD.finalThirdPasses])} · ${number(totals[PD.finalThirdCompleted])}/${number(totals[PD.finalThirdPasses])}`,
      per90(totals[PD.finalThirdCompleted], minutes, 1),
    ],
    [
      'progressive',
      sourceMessage('copy.PlayerAdvancedStats.af1b560101'),
      number(totals[PD.progressivePasses]),
      per90(totals[PD.progressivePasses], minutes, 1),
    ],
    [
      'take-on',
      sourceMessage('copy.PlayerAdvancedStats.a1acacac81'),
      number(totals[PD.takeOns]),
      per90(totals[PD.takeOns], minutes, 1),
    ],
    [
      'high-turnover',
      sourceMessage('copy.PlayerAdvancedStats.11212f27d2'),
      number(totals[PD.highTurnovers]),
      per90(totals[PD.highTurnovers], minutes),
    ],
  ];
  // The grid engine's counters, over its matches only, so older matches do not dilute the rates.
  if (spatialMatches) {
    const count = (
      term: string,
      label: string,
      index: number,
    ): [string, string, string, string] => [
      term,
      label,
      number(totals[index]),
      per90(totals[index], spatialMinutes, 1),
    ];
    rows.push(
      count('box-entry', sourceMessage('copy.MatchReport.649752aebf'), PD.boxEntries),
      count(
        'line-breaking',
        sourceMessage('copy.PlayerAdvancedStats.0ad2f4840a'),
        PD.lineBreakingPasses,
      ),
      [
        'xt',
        sourceMessage('copy.PlayerAdvancedStats.af1292ae9d'),
        decimal(totals[PD.xtAdded] / 1000, 2),
        per90(totals[PD.xtAdded] / 1000, spatialMinutes),
      ],
      count('cut-back', sourceMessage('copy.PlayerAdvancedStats.cf8188e2fc'), PD.cutBacks),
      count(
        'progressive-carry',
        sourceMessage('copy.PlayerAdvancedStats.0801bcf3fb'),
        PD.progressiveCarries,
      ),
    );
  }
  return (
    <section
      className={s.advanced}
      aria-label={displayMessage('copy.PlayerAdvancedStats.d3572f7d72')}
      data-testid="player-advanced"
    >
      <h4>{richMessage('copy.PlayerAdvancedStats.d3572f7d72')}</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">{richMessage('copy.PlayerAdvancedStats.e5bb8a61ad')}</th>
            <th scope="col">{richMessage('copy.PlayerAdvancedStats.149df7a8bd')}</th>
            <th scope="col">{richMessage('copy.CareerRecordBook.77d4f682b4')}</th>
          </tr>
        </thead>
        <tbody>
          {localizeValue(
            rows.map(([term, label, total, rate]) => (
              <tr key={term}>
                <th scope="row">
                  <Term id={term}>{localizeValue(label)}</Term>
                </th>
                <td>{localizeValue(total)}</td>
                <td>{localizeValue(rate)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p className={s.note}>
        {richMessage('copy.PlayerAdvancedStats.355a81fcda', {
          p0: number(matches),
          p1: number(minutes),
          p2:
            spatialMatches && spatialMatches < matches
              ? sourceMessage('copy.PlayerAdvancedStats.542aafd70f', {
                  p0: number(spatialMatches),
                  p1: number(spatialMinutes),
                })
              : '',
          p3: minutes < 180 ? sourceMessage('copy.PlayerAdvancedStats.1998dc989b') : '',
        })}
      </p>
    </section>
  );
}
