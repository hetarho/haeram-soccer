import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useId, useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { ClubLink } from '../entities/club';
import { TabList, TabPanel } from './PageTabs';
import type { LeagueChoice } from './league';
import { leagueName } from './LeaguePicker';
import s from './App.module.css';

export type CompetitionRow = { id: string; points: number; gf: number; ga: number };
/** Only table facts retained for the selected competition; no invented historical W-D-L. */
export function CompetitionRecords({ w, rows }: { w: World; rows: CompetitionRow[] }) {
  useTextLocale();
  const [metric, setMetric] = useState<'points' | 'gf' | 'ga' | 'gd'>('points');
  const idPrefix = useId();
  const value = (row: CompetitionRow) => (metric === 'gd' ? row.gf - row.ga : row[metric]);
  const sorted = [...rows].sort(
    (a, b) =>
      (metric === 'ga' ? value(a) - value(b) : value(b) - value(a)) || a.id.localeCompare(b.id),
  );
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.CompetitionRecords.806b2bfe20')}
    >
      <div className={s.panelHeading}>
        <h3>{richMessage('copy.CompetitionRecords.7a6fc01cc4')}</h3>
      </div>
      <div className={s.panelBody}>
        <TabList
          idPrefix={idPrefix}
          label={displayMessage('copy.CompetitionRecords.06798ebd1c')}
          tabs={
            [
              ['points', sourceMessage('copy.ClubTrends.e8fd75919a')],
              ['gf', sourceMessage('copy.summary.eb4e291be3')],
              ['ga', sourceMessage('copy.CompetitionRecords.a3474aee21')],
              ['gd', sourceMessage('copy.CompetitionRecords.6832a4ed5d')],
            ] as const
          }
          value={metric}
          onChange={setMetric}
        />
      </div>
      <TabPanel idPrefix={idPrefix} value={metric}>
        <div className={s.tableWrap}>
          <table aria-label={displayMessage('copy.CompetitionRecords.1015ba71c6')}>
            <thead>
              <tr>
                <th>{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                <th>{richMessage('copy.ClubTrends.e8fd75919a')}</th>
                <th>{richMessage('copy.summary.eb4e291be3')}</th>
                <th>{richMessage('copy.CompetitionRecords.64b97f7438')}</th>
                <th>{richMessage('copy.CompetitionRecords.6832a4ed5d')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                sorted.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {localizeValue(
                        w.clubs.some((club) => club.id === row.id) ? (
                          <ClubLink w={w} id={row.id} crest={14} />
                        ) : (
                          '—'
                        ),
                      )}
                    </td>
                    <td>{localizeValue(row.points)}</td>
                    <td>{localizeValue(row.gf)}</td>
                    <td>{localizeValue(row.ga)}</td>
                    <td>{localizeValue(row.gf - row.ga)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </TabPanel>
      <p className={s.panelBody}>{richMessage('copy.CompetitionRecords.83d4b8eac5')}</p>
    </section>
  );
}
export function UnavailableLeagueRecord({
  league,
  label,
  onOwn,
}: {
  league: LeagueChoice;
  label: string;
  onOwn: () => void;
}) {
  useTextLocale();
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.CompetitionRecords.f1f089aa1c')}
    >
      <div className={s.panelBody}>
        <h3>
          {localizeValue(leagueName(league))} · {localizeValue(label)}
        </h3>
        <p>{richMessage('copy.CompetitionRecords.2820f78887', { p0: label })}</p>
        <button type="button" onClick={onOwn}>
          {richMessage('copy.CompetitionRecords.0920a5265f')}
        </button>
      </div>
    </section>
  );
}
