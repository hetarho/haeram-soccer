import { useMemo, useState, type ReactNode } from 'react';
import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  Fixture,
  LeagueDeduction,
  World,
} from '../../../../../../packages/contracts/src/types';
import {
  archivedTimeline,
  divisionName,
  leagueTimeline,
  orderIds,
  ownLeagueIds,
  PointsDeduction,
} from '../../../entities/league';
import { number, seasonName } from '../../../presentation/format';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { useTaskState } from '../../../shared/routing/taskMemory';
import s from '../../../shared/ui/styles/LeagueInsights.module.css';

/** The rank chart's frame for `rounds` points and `clubs` places: first place on top. */
function rankAxis(rounds: number, clubs: number) {
  return {
    x: (i: number) => 42 + (i / Math.max(1, rounds - 1)) * 572,
    y: (rank: number) => 22 + ((rank - 1) / Math.max(1, clubs - 1)) * 150,
    ticks: [...new Set([1, Math.ceil(clubs / 2), clubs])],
  };
}
/** Rank grid lines and the first and last round under the series drawn as children. */
function RankChart({
  label,
  axis,
  first,
  last,
  children,
}: {
  label: string;
  axis: ReturnType<typeof rankAxis>;
  first: number;
  last: number;
  children: ReactNode;
}) {
  useTextLocale();
  return (
    <svg viewBox="0 0 650 205" role="img" aria-label={localizeValue(label)}>
      {localizeValue(
        axis.ticks.map((rank) => (
          <g key={rank}>
            <line
              x1="42"
              x2="614"
              y1={axis.y(rank)}
              y2={axis.y(rank)}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
            <text x="30" y={axis.y(rank) + 4} textAnchor="end">
              {richMessage('copy.BallonDorView.5094d45cea', { p0: rank })}
            </text>
          </g>
        )),
      )}
      {localizeValue(children)}
      <text x="42" y="198">
        {richMessage('copy.BusinessWorkbench.fcefde4602', { p0: first })}
      </text>
      <text x="614" y="198" textAnchor="end">
        {richMessage('copy.BusinessWorkbench.fcefde4602', { p0: last })}
      </text>
    </svg>
  );
}

type RankRow = { id: string; rank: number; points?: number } & Partial<LeagueDeduction>;
type RankRound = { round: number; rows: RankRow[] };
type RankArchive = {
  ranks?: readonly number[];
  places?: number;
  code: string;
  tier: number;
  group: number;
};

function RankLine({
  name,
  rows,
  axis,
  stroke,
  own,
}: {
  name: string;
  rows: (RankRow | undefined)[];
  axis: ReturnType<typeof rankAxis>;
  stroke: string;
  own: boolean;
}) {
  const { x, y } = axis;
  const path = rows
    .map((row, i) => (row ? `${rows[i - 1] ? 'L' : 'M'}${x(i)},${y(row.rank)}` : ''))
    .join(' ');
  return (
    <g>
      <title>{name}</title>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={own ? 3 : 1.6}
        strokeLinejoin="round"
      />
      {rows.map((row, i) =>
        row && !rows[i - 1] && !rows[i + 1] ? (
          <circle key={i} cx={x(i)} cy={y(row.rank)} r={2.5} fill={stroke} />
        ) : null,
      )}
    </g>
  );
}

export function RankHistoryGraph({
  w,
  ids: shown,
  year,
  fixtures,
  archive,
}: {
  w: World;
  ids?: string[];
  year: number;
  fixtures?: Fixture[];
  archive?: RankArchive;
}) {
  useTextLocale();
  const ids = useMemo(() => shown ?? ownLeagueIds(w), [w, shown]);
  const { timeline, graphIds, onlyOwn } = useMemo(() => {
    if (!archive)
      return {
        timeline: leagueTimeline(w, ids, fixtures),
        graphIds: orderIds(ids, w.tables),
        onlyOwn: false,
      };
    const rounds = archivedTimeline(w, year).filter(
      (round) => round.tier === archive.tier && round.group === archive.group,
    );
    if (rounds.length)
      return {
        timeline: rounds,
        graphIds: [...new Set(rounds.flatMap((round) => round.rows.map((row) => row.id)))],
        onlyOwn: false,
      };
    const timeline: RankRound[] = (archive.ranks ?? []).map((rank, i) => ({
      round: i + 1,
      rows: [{ id: w.playerClub, rank }],
    }));
    return {
      timeline,
      graphIds: timeline.length ? [w.playerClub] : [],
      onlyOwn: timeline.length > 0,
    };
  }, [w, ids, year, archive, fixtures]);
  const stableIds = [...graphIds].sort();
  const scope = archive ? `${archive.code}:${archive.tier}:${archive.group}` : stableIds.join(',');
  const [hidden, setHidden] = useTaskState<string[]>(w.id, `rank-teams:${year}:${scope}`, []);
  const [showRows, setShowRows] = useState(false);
  const selected = graphIds.filter((id) => !hidden.includes(id));
  const names = new Map(w.clubs.map((club) => [club.id, club.name]));
  const name = (id: string) => names.get(id) ?? id;
  const colors = new Map(
    stableIds.map((id, i) => [
      id,
      id === w.playerClub ? 'var(--accent-text)' : `oklch(58% 0.15 ${(i * 137.5) % 360})`,
    ]),
  );
  const axis = rankAxis(
    timeline.length,
    Math.max(1, graphIds.length, archive?.places ?? 0, ...(onlyOwn ? (archive?.ranks ?? []) : [])),
  );
  const byRound = useMemo(
    () => timeline.map((round) => new Map(round.rows.map((row) => [row.id, row]))),
    [timeline],
  );
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.LeagueInsights.9cfb907bbd')}
    >
      <div className={s.panelHead}>
        <div>
          <h3>{richMessage('copy.LeagueInsights.9cfb907bbd')}</h3>
          <span>
            {archive
              ? richMessage('copy.PastSeason.5535ee5cdd', {
                  p0: seasonName(year),
                  p1: divisionName(archive.code, archive.tier, archive.group),
                })
              : richMessage('copy.LeagueInsights.205acf650d', {
                  p0: seasonName(year),
                  p1: '',
                  p2: ' ',
                })}
          </span>
        </div>
      </div>
      {timeline.length && selected.length ? (
        <figure className={s.chart}>
          <RankChart
            label={displayMessage('copy.LeagueInsights.9cfb907bbd')}
            axis={axis}
            first={1}
            last={timeline.length}
          >
            {selected.map((id) => (
              <RankLine
                key={id}
                name={name(id)}
                rows={byRound.map((round) => round.get(id))}
                axis={axis}
                stroke={colors.get(id)!}
                own={id === w.playerClub}
              />
            ))}
          </RankChart>
        </figure>
      ) : (
        <p className={s.empty} role="status">
          {!timeline.length
            ? richMessage(archive ? 'copy.PastSeason.a4aeea9842' : 'copy.LeagueInsights.a628e05416')
            : richMessage('league.rank.emptySelection')}
        </p>
      )}
      {graphIds.length > 0 && (
        <fieldset className={s.rankTeams}>
          <legend>{richMessage('league.rank.clubSelection')}</legend>
          <div>
            {graphIds.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(id)}
                  onChange={() =>
                    setHidden((previous) =>
                      previous.includes(id)
                        ? previous.filter((club) => club !== id)
                        : [...previous, id],
                    )
                  }
                />
                <span
                  aria-hidden="true"
                  className={s.seriesSwatch}
                  style={{ backgroundColor: colors.get(id) }}
                />
                <span>{name(id)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {onlyOwn && <p className={s.rankCoverage}>{richMessage('copy.PastSeason.4df937d56d')}</p>}
      {timeline.length > 0 && selected.length > 0 && (
        <details
          data-ui="disclosure"
          className={s.details}
          onToggle={(event) => setShowRows(event.currentTarget.open)}
        >
          <summary>
            {richMessage(onlyOwn ? 'copy.PastSeason.90b0c0029a' : 'copy.LeagueInsights.5b3a45a930')}
          </summary>
          {showRows && (
            <div className={s.tableWrap}>
              <table aria-label={displayMessage('copy.LeagueInsights.b46914c413')}>
                <thead>
                  <tr>
                    <th scope="col">{richMessage('copy.ClubHub.0fcb288d12')}</th>
                    {selected.map((id) => (
                      <th key={id} scope="col">
                        {name(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((round, i) => (
                    <tr key={round.round}>
                      <th scope="row">{localizeValue(number(i + 1))}</th>
                      {selected.map((id) => {
                        const row = byRound[i].get(id);
                        return (
                          <td key={id}>
                            {localizeValue(
                              !row
                                ? '—'
                                : row.points === undefined
                                  ? sourceMessage('copy.BallonDorView.5094d45cea', { p0: row.rank })
                                  : sourceMessage('copy.LeagueInsights.73769a8d11', {
                                      p0: row.rank,
                                      p1: number(row.points),
                                    }),
                            )}
                            <PointsDeduction row={row} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </section>
  );
}
