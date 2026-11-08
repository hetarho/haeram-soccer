import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { PreOwnerSeason } from '../../../../../../packages/contracts/src/owner';
import { honoursBeforeOwner } from '../../../../../../packages/engine/src/club-past';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { Panel } from '../../../app/ui/App';
import { seasonName } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import {
  businessSign,
  finishText,
  honoursText,
  newestFirst,
  ownerSeasonRows,
  runsText,
} from '../lib/recordEras';
import { useTaskState } from '../../../shared/routing/taskMemory';
import s from '../../../shared/ui/styles/App.module.css';
import t from './ClubTrends.module.css';

/**
 * The owner's own seasons (→OWNER-17): at each close his fortune, the season's business result,
 * living costs, injections, dividend and 팬 민심, in the money of that season. Absent in a founded
 * career, which has no owner.
 */
export function OwnerSeasons({ w }: { w: World }) {
  useTextLocale();
  if (!w.owner) return null;
  const code = clubOf(w).country,
    records = ownerSeasonRows(w.owner);
  const money = (value: string, year: number) => <Money value={value} code={code} year={year} />;
  return (
    <Panel
      title={displayMessage('copy.OwnerEras.76c06e6015')}
      note={sourceMessage('copy.BallonDorView.3585c2642b', { p0: records.length })}
    >
      <div className={s.tableWrap}>
        <table
          className={t.seasonHistory}
          role="table"
          aria-label={displayMessage('copy.OwnerEras.76c06e6015')}
        >
          <thead>
            <tr>
              <th scope="col">{richMessage('copy.ClubTrends.a3142392a3')}</th>
              <th scope="col">{richMessage('shell.fortune')}</th>
              <th scope="col">{richMessage('copy.OwnerEras.7b3733aab2')}</th>
              <th scope="col">{richMessage('copy.OwnerEras.ef04fe60f2')}</th>
              <th scope="col">{richMessage('copy.OwnerEras.64a6c964ab')}</th>
              <th scope="col">{richMessage('copy.OwnerEras.176494aa44')}</th>
              <th scope="col">{richMessage('copy.ClubOverview.27bdec9180')}</th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              records.map((record) => (
                <tr key={record.year}>
                  <td>{localizeValue(seasonName(record.year))}</td>
                  <td data-label={sourceMessage('shell.fortune')}>
                    {localizeValue(money(record.fortune, record.year))}
                  </td>
                  <td data-label={sourceMessage('copy.OwnerEras.7b3733aab2')}>
                    {localizeValue(businessSign(record))}
                    {localizeValue(money(record.business, record.year))}
                  </td>
                  <td data-label={sourceMessage('copy.OwnerEras.ef04fe60f2')}>
                    {localizeValue(money(record.living, record.year))}
                  </td>
                  <td data-label={sourceMessage('copy.OwnerEras.64a6c964ab')}>
                    {localizeValue(money(record.injected, record.year))}
                  </td>
                  <td data-label={sourceMessage('copy.OwnerEras.176494aa44')}>
                    {localizeValue(money(record.dividend, record.year))}
                  </td>
                  <td data-label={sourceMessage('copy.ClubOverview.27bdec9180')}>
                    {localizeValue(Math.round(record.fanMood))}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {localizeValue(
          !records.length && (
            <div className={s.empty}>{richMessage('copy.OwnerEras.ae6682df32')}</div>
          ),
        )}
      </div>
    </Panel>
  );
}

/**
 * The bought club's history before the owner (→HIST-21): each season the world archived before
 * the takeover, with its league finish and cup runs, under the honours it won then. Its seasons
 * open no club-season review: the club's own figures start at the takeover. A club bought in the
 * world's first season has no such history, and the panel stays away.
 */
export function SeasonsBeforeOwner({ w, seasons }: { w: World; seasons?: PreOwnerSeason[] }) {
  useTextLocale();
  const [limit, setLimit] = useTaskState(w.id, 'record-pre-owner-limit', 49);
  if (!w.owner || !seasons?.length) return null;
  const code = clubOf(w).country,
    rows = newestFirst(seasons);
  return (
    <Panel
      title={displayMessage('copy.OwnerEras.d3613d5fcd')}
      note={sourceMessage('copy.OwnerEras.d5f96aea11', {
        p0: seasons.length,
        p1: honoursText(honoursBeforeOwner(seasons)),
      })}
    >
      <div className={s.tableWrap}>
        <table
          className={t.seasonHistory}
          role="table"
          aria-label={displayMessage('copy.OwnerEras.58165e1a55')}
        >
          <thead>
            <tr>
              <th scope="col">{richMessage('copy.ClubTrends.a3142392a3')}</th>
              <th scope="col">{richMessage('navigation.league')}</th>
              <th scope="col">{richMessage('copy.ClubTrends.cf5a6ab3e0')}</th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              rows.slice(0, limit).map((season) => (
                <tr key={season.year}>
                  <td>{localizeValue(seasonName(season.year))}</td>
                  <td data-label={sourceMessage('navigation.league')}>
                    <span className={t.cellText}>{localizeValue(finishText(code, season))}</span>
                  </td>
                  <td data-label={sourceMessage('copy.ClubTrends.cf5a6ab3e0')}>
                    <span className={t.cellText}>{localizeValue(runsText(season.runs))}</span>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {localizeValue(
          rows.length > limit && (
            <button type="button" onClick={() => setLimit(limit + 50)}>
              {richMessage('copy.ClubTrends.fbea915f3f', { p0: rows.length - limit })}
            </button>
          ),
        )}
      </div>
    </Panel>
  );
}
