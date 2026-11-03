import type { World } from '../../../../packages/contracts/src/types';
import type { PreOwnerSeason } from '../../../../packages/contracts/src/owner';
import { honoursBeforeOwner } from '../../../../packages/engine/src/club-past';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { Panel } from './App';
import { seasonName } from './format';
import { Money } from './Money';
import {
  businessSign,
  finishText,
  honoursText,
  newestFirst,
  ownerSeasonRows,
  runsText,
} from './recordEras';
import { useTaskState } from './taskMemory';
import s from './App.module.css';
import t from './ClubTrends.module.css';

/**
 * The owner's own seasons (→OWNER-17): at each close his fortune, the season's business result,
 * living costs, injections, dividend and 팬 민심, in the money of that season. Absent in a founded
 * career, which has no owner.
 */
export function OwnerSeasons({ w }: { w: World }) {
  if (!w.owner) return null;
  const code = clubOf(w).country,
    records = ownerSeasonRows(w.owner);
  const money = (value: string, year: number) => <Money value={value} code={code} year={year} />;
  return (
    <Panel title="구단주 시즌" note={`${records.length}시즌`}>
      <div className={s.tableWrap}>
        <table className={t.seasonHistory} role="table" aria-label="구단주 시즌">
          <thead>
            <tr>
              <th scope="col">시즌</th>
              <th scope="col">구단주 자금</th>
              <th scope="col">사업</th>
              <th scope="col">생활비</th>
              <th scope="col">자금 투입</th>
              <th scope="col">배당</th>
              <th scope="col">팬 민심</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.year}>
                <td>{seasonName(record.year)}</td>
                <td data-label="구단주 자금">{money(record.fortune, record.year)}</td>
                <td data-label="사업">
                  {businessSign(record)}
                  {money(record.business, record.year)}
                </td>
                <td data-label="생활비">{money(record.living, record.year)}</td>
                <td data-label="자금 투입">{money(record.injected, record.year)}</td>
                <td data-label="배당">{money(record.dividend, record.year)}</td>
                <td data-label="팬 민심">{Math.round(record.fanMood)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && (
          <div className={s.empty}>구단주의 첫 시즌이 끝나면 시즌마다 기록이 쌓여요.</div>
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
  const [limit, setLimit] = useTaskState(w.id, 'record-pre-owner-limit', 49);
  if (!w.owner || !seasons?.length) return null;
  const code = clubOf(w).country,
    rows = newestFirst(seasons);
  return (
    <Panel
      title="구단주 이전"
      note={`${seasons.length}시즌 · ${honoursText(honoursBeforeOwner(seasons))}`}
    >
      <div className={s.tableWrap}>
        <table className={t.seasonHistory} role="table" aria-label="구단주 이전 시즌">
          <thead>
            <tr>
              <th scope="col">시즌</th>
              <th scope="col">리그</th>
              <th scope="col">컵 대회</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((season) => (
              <tr key={season.year}>
                <td>{seasonName(season.year)}</td>
                <td data-label="리그">
                  <span className={t.cellText}>{finishText(code, season)}</span>
                </td>
                <td data-label="컵 대회">
                  <span className={t.cellText}>{runsText(season.runs)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <button type="button" onClick={() => setLimit(limit + 50)}>
            이전 시즌 더 보기 · {rows.length - limit}시즌
          </button>
        )}
      </div>
    </Panel>
  );
}
