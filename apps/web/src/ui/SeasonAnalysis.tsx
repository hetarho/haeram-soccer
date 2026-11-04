import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { Chart } from './Chart';
import { kindLabel, seasonName } from './format';
import { matchSplit, seasonProgress } from './seasonTrends';
import app from './App.module.css';
import s from './Analysis.module.css';

const VENUES = [
  ['all', sourceMessage('copy.DecisionRuleFacts.a4b69faf0c')],
  ['home', sourceMessage('fixture.home')],
  ['away', sourceMessage('fixture.away')],
] as const;
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * One season of ours in the chosen competitions (→WEB-54): played, W-D-L and goals overall, at
 * home and away, then the league points and the goal difference as they built up over the season.
 * Open from the start, so a change of season or competition shows at once.
 */
export function SeasonAnalysis({
  w,
  records,
  year,
  scope,
}: {
  w: World;
  records: MatchRecord[];
  year: number;
  scope: string;
}) {
  useTextLocale();
  const club = w.playerClub,
    progress = seasonProgress(records, club),
    league = progress.filter((step) => step.league);
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name ?? id;
  const line = ({ record, result }: (typeof progress)[number]) => {
    const home = record.home === club;
    return `${kindLabel[record.kind]} R${record.round} · ${home ? sourceMessage('fixture.home') : sourceMessage('fixture.away')} ${name(
      home ? record.away : record.home,
    )} ${result.own}–${result.other} ${result.result}`;
  };
  return (
    <div data-surface="sheet" className={s.disclosure}>
      <section className={s.content} aria-label={displayMessage('copy.SeasonAnalysis.793d50453a')}>
        <h3>
          {localizeValue(seasonName(year))} · {localizeValue(scope)}
        </h3>
        <div className={app.tableWrap}>
          <table className={s.split} aria-label={displayMessage('copy.SeasonAnalysis.cb4fb290f3')}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={app.srOnly}>{richMessage('copy.LabPage.d8ba487317')}</span>
                </th>
                <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
                <th scope="col">{richMessage('result.win')}</th>
                <th scope="col">{richMessage('result.draw')}</th>
                <th scope="col">{richMessage('result.loss')}</th>
                <th scope="col">{richMessage('copy.summary.eb4e291be3')}</th>
                <th scope="col">{richMessage('copy.CompetitionRecords.64b97f7438')}</th>
                <th scope="col">{richMessage('copy.CupsView.24734975b3')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                VENUES.map(([venue, label]) => {
                  const split = matchSplit(records, club, venue);
                  return (
                    <tr key={venue}>
                      <th scope="row">{localizeValue(label)}</th>
                      <td>{localizeValue(split.played)}</td>
                      <td>{localizeValue(split.won)}</td>
                      <td>{localizeValue(split.drawn)}</td>
                      <td>{localizeValue(split.lost)}</td>
                      <td>{localizeValue(split.gf)}</td>
                      <td>{localizeValue(split.ga)}</td>
                      <td>{localizeValue(signed(split.gf - split.ga))}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className={s.note}>{richMessage('copy.SeasonAnalysis.daf044a7c2')}</p>
        {localizeValue(
          progress.length ? (
            <>
              {localizeValue(
                league.length > 0 && (
                  <>
                    <h4>{richMessage('copy.SeasonAnalysis.123d0d95aa')}</h4>
                    <Chart
                      label={displayMessage('copy.SeasonAnalysis.6414cf48f9')}
                      values={league.map((step) => step.points)}
                      labels={league.map((step) => `R${step.record.round}`)}
                      format={(value) =>
                        sourceMessage('copy.LeagueInsights.788a732efc', { p0: Math.round(value) })
                      }
                      detail={(i) =>
                        sourceMessage('copy.SeasonAnalysis.1aa47bd7ff', {
                          p0: line(league[i]),
                          p1: league[i].points,
                        })
                      }
                    />
                  </>
                ),
              )}
              <h4>{richMessage('copy.SeasonAnalysis.990d4a3b8e')}</h4>
              <Chart
                label={displayMessage('copy.SeasonAnalysis.895a668d87')}
                values={progress.map((step) => step.difference)}
                labels={progress.map((_, i) =>
                  sourceMessage('copy.SeasonAnalysis.f0536ece4c', { p0: i + 1 }),
                )}
                format={(value) => signed(Math.round(value))}
                detail={(i) =>
                  sourceMessage('copy.SeasonAnalysis.4c5927ab75', {
                    p0: line(progress[i]),
                    p1: signed(progress[i].difference),
                  })
                }
              />
            </>
          ) : (
            <p className={s.note}>{richMessage('copy.SeasonAnalysis.b7fcfb1d8d')}</p>
          ),
        )}
      </section>
    </div>
  );
}
