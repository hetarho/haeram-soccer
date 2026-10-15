import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { ClubLink } from './ClubLink';
import { Segments } from './Segments';
import type { LeagueChoice } from './league';
import { leagueName } from './LeaguePicker';
import s from './App.module.css';

export type CompetitionRow = { id: string; points: number; gf: number; ga: number };
/** Only table facts retained for the selected competition; no invented historical W-D-L. */
export function CompetitionRecords({ w, rows }: { w: World; rows: CompetitionRow[] }) {
  const [metric, setMetric] = useState<'points' | 'gf' | 'ga' | 'gd'>('points');
  const value = (row: CompetitionRow) => (metric === 'gd' ? row.gf - row.ga : row[metric]);
  const sorted = [...rows].sort(
    (a, b) =>
      (metric === 'ga' ? value(a) - value(b) : value(b) - value(a)) || a.id.localeCompare(b.id),
  );
  return (
    <section className={s.panel} aria-label="리그 팀 기록">
      <div className={s.panelHeading}>
        <h3>팀 성적 기록</h3>
      </div>
      <div className={s.panelBody}>
        <Segments
          label="팀 기록 정렬"
          options={
            [
              ['points', '승점'],
              ['gf', '득점'],
              ['ga', '최소 실점'],
              ['gd', '득실차'],
            ] as const
          }
          value={metric}
          onChange={setMetric}
        />
      </div>
      <div className={s.tableWrap}>
        <table aria-label="리그 팀 기록표">
          <thead>
            <tr>
              <th>클럽</th>
              <th>승점</th>
              <th>득점</th>
              <th>실점</th>
              <th>득실차</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                <td>
                  {w.clubs.some((club) => club.id === row.id) ? (
                    <ClubLink w={w} id={row.id} crest={14} />
                  ) : (
                    '—'
                  )}
                </td>
                <td>{row.points}</td>
                <td>{row.gf}</td>
                <td>{row.ga}</td>
                <td>{row.gf - row.ga}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.panelBody}>선택한 리그 순위표에 남아 있는 승점과 득실 기록이에요.</p>
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
  return (
    <section className={s.panel} aria-label="선택 리그 기록 안내">
      <div className={s.panelBody}>
        <h3>
          {leagueName(league)} · {label}
        </h3>
        <p>선택한 리그의 {label}은 보관되어 있지 않아요.</p>
        <button type="button" onClick={onOwn}>
          우리 리그 기록 보기
        </button>
      </div>
    </section>
  );
}
