import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { Select } from '../../../shared/ui/Select';
import { ClubLink } from '../../../entities/club';
import { PlayerLink } from '../../../entities/player';
import { memo, useMemo, useState } from 'react';
import type { GoalScorer, World } from '../../../../../../packages/contracts/src/types';
import { useGameState } from '../../../runtime/store';
import { banText, leagueDiscipline } from '../../../entities/player';
import { seasonName } from '../../../presentation/format';
import { leagueIds, type LeagueChoice } from '../../../entities/league';
import { worldSelector } from '../../../shared/lib/liveState';
import { rankedScorers, scorerTrend } from '../lib/scorers';
import s from './Scorers.module.css';

type Props = { w: World };

function sameScorerState({ w: a }: Props, { w: b }: Props) {
  return (
    a.year === b.year &&
    a.playerClub === b.playerClub &&
    a.clubs === b.clubs &&
    a.scorerSeason === b.scorerSeason
  );
}

function TrackingNote({ w }: Props) {
  useTextLocale();
  const since = w.scorerSeason?.trackedSinceRound;
  return since && since > 1 ? (
    <p className={s.note}>{richMessage('copy.ScorerPanels.18f8efb3d9', { p0: since })}</p>
  ) : !w.scorerSeason && w.round > 0 ? (
    <p className={s.note}>{richMessage('copy.ScorerPanels.ffb704b74a')}</p>
  ) : null;
}

const playerLabel = (w: World, player: GoalScorer) =>
  `${player.name} · ${(player.clubs?.map((part) => part.club) ?? [player.club]).map((id) => w.clubs.find((club) => club.id === id)?.short || id).join(' → ')}`;
const roundLabel = (round: number) =>
  round === 0
    ? sourceMessage('copy.LeagueInsights.df47c98b9c')
    : sourceMessage('copy.BusinessWorkbench.fcefde4602', { p0: round });

export const ScorerStandings = memo(function ScorerStandings({ w }: Props) {
  useTextLocale();
  const players = w.scorerSeason?.year === w.year ? w.scorerSeason.players : [];
  const ranked = rankedScorers(players);
  const own = ranked.find((player) => player.club === w.playerClub);
  const ownRank = own ? ranked.indexOf(own) + 1 : undefined;
  // Every scorer opens his detail: ours from the view, another club's from his club (→WEB-59).
  const name = (player: GoalScorer) => (
    <PlayerLink id={player.id} name={player.name} scope="season" club={player.club} />
  );
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.ScorerPanels.74c32e83f7')}
    >
      <div className={s.head}>
        <div>
          <h3>{richMessage('copy.ScorerPanels.29a86f509f')}</h3>
          <p>{richMessage('copy.ScorerPanels.8d7a55a4a7', { p0: seasonName(w.year) })}</p>
        </div>
        {localizeValue(
          ranked.length > 0 && (
            <span className={s.tag}>
              {richMessage('copy.ScorerPanels.e2b6c4d46d', { p0: ranked[0].goals })}
            </span>
          ),
        )}
      </div>
      <TrackingNote w={w} />
      {localizeValue(
        !ranked.length ? (
          <p className={s.empty}>{richMessage('copy.ScorerPanels.31278ae48b')}</p>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table
                className={s.standings}
                aria-label={displayMessage('copy.ScorerPanels.2e24003221')}
              >
                <thead>
                  <tr>
                    <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                    <th scope="col">{richMessage('team.column.player')}</th>
                    <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                    <th scope="col">{richMessage('copy.BallonDorView.cb34c0f691')}</th>
                    <th scope="col">{richMessage('copy.BallonDorView.b849877c07')}</th>
                    <th scope="col">{richMessage('copy.summary.eb4e291be3')}</th>
                  </tr>
                </thead>
                <tbody>
                  {localizeValue(
                    ranked.slice(0, 20).map((player, i) => (
                      <tr key={player.id} className={player.club === w.playerClub ? s.own : ''}>
                        <td>{localizeValue(i + 1)}</td>
                        <th scope="row" className={s.player}>
                          {localizeValue(name(player))}
                          {localizeValue(
                            player.club === w.playerClub && (
                              <span className={s.ownBadge}>
                                {richMessage('copy.BallonDorView.8434ac1486')}
                              </span>
                            ),
                          )}
                        </th>
                        <td className={s.club}>
                          {localizeValue(
                            player.clubs ? (
                              player.clubs.map((part) => (
                                <span key={part.club}>
                                  {richMessage('copy.ScorerPanels.3d497bca55', {
                                    p0: <ClubLink w={w} id={part.club} crest={14} />,
                                    p1: part.goals,
                                    p2: ' ',
                                    p3: part.appearances,
                                    p4: <br />,
                                  })}
                                </span>
                              ))
                            ) : (
                              <ClubLink w={w} id={player.club} crest={14} />
                            ),
                          )}
                        </td>
                        <td>{localizeValue(player.position)}</td>
                        <td>{localizeValue(player.appearances)}</td>
                        <td className={s.goals}>{localizeValue(player.goals)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {localizeValue(
              own && ownRank && ownRank > 20 && (
                <p className={s.ownSummary}>
                  {richMessage('copy.ScorerPanels.7b03aaba50', {
                    p0: <b>{localizeValue(name(own))}</b>,
                    p1: ownRank,
                    p2: own.goals,
                    p3: ' ',
                    p4: ranked[0].goals - own.goals,
                  })}
                </p>
              ),
            )}
            <p className={s.note}>{richMessage('copy.ScorerPanels.b3147306d1')}</p>
          </>
        ),
      )}
    </section>
  );
}, sameScorerState);

export const ScorerHistory = memo(function ScorerHistory({ w }: Props) {
  useTextLocale();
  const [selectedPlayer, setSelectedPlayer] = useState('own');
  const [selectedComparison, setSelectedComparison] = useState('rival');
  const [metric, setMetric] = useState<'goals' | 'rank'>('goals');
  const season = w.scorerSeason?.year === w.year ? w.scorerSeason : undefined;
  const players = season?.players || [];
  const ranked = rankedScorers(players);
  const ownPlayers = players.filter((player) => player.club === w.playerClub);
  const ownLead =
    ranked.find((player) => player.club === w.playerClub) ||
    ownPlayers.find((player) => player.position === 'ST') ||
    ownPlayers[0];
  const leader = ranked[0] || ownLead;
  const choice =
    selectedPlayer === 'own' ||
    selectedPlayer === 'leader' ||
    players.some((player) => player.id === selectedPlayer)
      ? selectedPlayer
      : 'own';
  const primary =
    choice === 'own'
      ? ownLead || leader
      : choice === 'leader'
        ? leader
        : players.find((player) => player.id === choice);
  const primaryRank = primary ? ranked.findIndex((player) => player.id === primary.id) : -1;
  const nearest =
    primaryRank >= 0
      ? ranked[primaryRank > 0 ? primaryRank - 1 : 1]
      : ranked.find((player) => player.id !== primary?.id);
  const comparisonChoice =
    ['none', 'rival', 'leader'].includes(selectedComparison) ||
    players.some((player) => player.id === selectedComparison && player.id !== primary?.id)
      ? selectedComparison
      : 'rival';
  const comparison =
    comparisonChoice === 'rival'
      ? nearest
      : comparisonChoice === 'leader'
        ? leader
        : players.find((player) => player.id === comparisonChoice);
  const series = [primary, comparison].filter(
    (player, i, all): player is GoalScorer =>
      !!player && all.findIndex((candidate) => candidate?.id === player.id) === i,
  );
  const timeline = season
    ? scorerTrend(
        season,
        series.map((player) => player.id),
      )
    : [];
  const max = Math.max(
    1,
    ...timeline.flatMap((round) =>
      round.players.map((player) => (metric === 'goals' ? player.goals : player.rank || 1)),
    ),
  );
  const startRound = timeline[0]?.round || 1;
  const lastRound = timeline.at(-1)?.round || startRound;
  const x = (round: number) =>
    46 + ((round - startRound) / Math.max(1, lastRound - startRound)) * 564;
  const y = (value: number) =>
    metric === 'goals'
      ? 174 - (value / max) * 148
      : 26 + ((value - 1) / Math.max(1, max - 1)) * 148;
  const ticks =
    metric === 'goals'
      ? [...new Set([0, Math.ceil(max / 2), max])]
      : [...new Set([1, Math.ceil(max / 2), max])];
  const available = [...ranked, ...players.filter((player) => !player.goals)];
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.LiveSeason.d332850f5a')}
    >
      <div className={s.head}>
        <div>
          <h3>{richMessage('copy.LiveSeason.d332850f5a')}</h3>
          <p>
            {richMessage('copy.ScorerPanels.f1132fb64c', {
              p0: seasonName(w.year),
              p1:
                metric === 'goals'
                  ? sourceMessage('copy.ScorerPanels.97cbaa56ce')
                  : sourceMessage('copy.LiveSeason.12543e95b4'),
            })}
          </p>
        </div>
        <div
          data-surface="sheet"
          className={s.metric}
          role="group"
          aria-label={displayMessage('copy.ScorerPanels.147ba41a04')}
        >
          <button aria-pressed={metric === 'goals'} onClick={() => setMetric('goals')}>
            {richMessage('copy.ScorerPanels.97cbaa56ce')}
          </button>
          <button aria-pressed={metric === 'rank'} onClick={() => setMetric('rank')}>
            {richMessage('copy.LiveSeason.12543e95b4')}
          </button>
        </div>
      </div>
      <TrackingNote w={w} />
      {localizeValue(
        !timeline.length || !primary ? (
          <p className={s.empty}>{richMessage('copy.ScorerPanels.929d56bb43')}</p>
        ) : (
          <>
            <div className={s.filters}>
              <label>
                {richMessage('copy.ScorerPanels.dfcd4deb00', {
                  p0: (
                    <Select
                      aria-label={displayMessage('copy.ScorerPanels.80b9b3bc51')}
                      value={choice}
                      onValueChange={(value) => setSelectedPlayer(value)}
                    >
                      <option value="own">{richMessage('copy.ScorerPanels.db8a4ec49c')}</option>
                      <option value="leader">{richMessage('copy.ScorerPanels.987e949982')}</option>
                      <optgroup label={displayMessage('copy.BallonDorView.8434ac1486')}>
                        {localizeValue(
                          available
                            .filter((player) => player.club === w.playerClub)
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                {richMessage('copy.ScorerPanels.5d8cd2bdc9', {
                                  p0: player.name,
                                  p1: player.goals,
                                })}
                              </option>
                            )),
                        )}
                      </optgroup>
                      <optgroup label={displayMessage('copy.ScorerPanels.ede488d3e0')}>
                        {localizeValue(
                          available
                            .filter((player) => player.club !== w.playerClub)
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                {richMessage('copy.ScorerPanels.5d8cd2bdc9', {
                                  p0: playerLabel(w, player),
                                  p1: player.goals,
                                })}
                              </option>
                            )),
                        )}
                      </optgroup>
                    </Select>
                  ),
                })}
              </label>
              <label>
                {richMessage('copy.ScorerPanels.99c971f4c2', {
                  p0: (
                    <Select
                      aria-label={displayMessage('copy.ScorerPanels.f1362b19f1')}
                      value={comparisonChoice}
                      onValueChange={(value) => setSelectedComparison(value)}
                    >
                      <option value="rival">{richMessage('copy.ScorerPanels.f9ac7d2c69')}</option>
                      <option value="leader">{richMessage('copy.ScorerPanels.987e949982')}</option>
                      <option value="none">{richMessage('copy.ScorerPanels.061d6adcf1')}</option>
                      {localizeValue(
                        available
                          .filter((player) => player.id !== primary.id)
                          .map((player) => (
                            <option key={player.id} value={player.id}>
                              {richMessage('copy.ScorerPanels.5d8cd2bdc9', {
                                p0: playerLabel(w, player),
                                p1: player.goals,
                              })}
                            </option>
                          )),
                      )}
                    </Select>
                  ),
                })}
              </label>
            </div>
            <figure className={s.chart}>
              <svg
                viewBox="0 0 650 210"
                role="img"
                aria-label={displayMessage('copy.ScorerPanels.89164d9c77', {
                  p0: primary.name,
                  p1:
                    metric === 'goals'
                      ? sourceMessage('copy.ScorerPanels.97cbaa56ce')
                      : sourceMessage('copy.LiveSeason.12543e95b4'),
                })}
              >
                {localizeValue(
                  ticks.map((value) => (
                    <g key={value}>
                      <line
                        x1="46"
                        x2="610"
                        y1={y(value)}
                        y2={y(value)}
                        stroke="#dce2d5"
                        strokeDasharray="3 5"
                      />
                      <text x="36" y={y(value) + 4} textAnchor="end">
                        {localizeValue(value)}
                        {localizeValue(
                          metric === 'goals'
                            ? sourceMessage('copy.summary.68a6cf8ed8')
                            : sourceMessage('copy.ScorerPanels.e0bebb354d'),
                        )}
                      </text>
                    </g>
                  )),
                )}
                {localizeValue(
                  [...series].reverse().map((player) => {
                    const points = timeline.flatMap((round) => {
                      const data = round.players.find((row) => row.id === player.id);
                      const value = metric === 'goals' ? data?.goals : data?.rank;
                      return value === undefined ? [] : [{ round: round.round, value }];
                    });
                    const color = player.id === primary.id ? '#28654b' : '#b57f54';
                    return (
                      <g key={player.id}>
                        <polyline
                          points={points
                            .map((point) => `${x(point.round)},${y(point.value)}`)
                            .join(' ')}
                          fill="none"
                          stroke={color}
                          strokeWidth={player.id === primary.id ? 3 : 2}
                          strokeLinejoin="round"
                        />
                        {localizeValue(
                          points.map((point) => (
                            <circle
                              key={point.round}
                              cx={x(point.round)}
                              cy={y(point.value)}
                              r={timeline.length > 20 ? 2 : 3}
                              fill={color}
                            >
                              <title>
                                {player.name} · {localizeValue(roundLabel(point.round))} ·{' '}
                                {localizeValue(point.value)}
                                {localizeValue(
                                  metric === 'goals'
                                    ? sourceMessage('copy.summary.68a6cf8ed8')
                                    : sourceMessage('copy.ScorerPanels.e0bebb354d'),
                                )}
                              </title>
                            </circle>
                          )),
                        )}
                      </g>
                    );
                  }),
                )}
                <text x="46" y="200">
                  {localizeValue(roundLabel(startRound))}
                </text>
                {localizeValue(
                  lastRound !== startRound && (
                    <text x="610" y="200" textAnchor="end">
                      {localizeValue(roundLabel(lastRound))}
                    </text>
                  ),
                )}
              </svg>
              <figcaption>
                {localizeValue(
                  series.map((player, i) => (
                    <span key={player.id}>
                      {richMessage('copy.ScorerPanels.898f8fa7a5', {
                        p0: <i className={i === 0 ? s.primaryDot : s.comparisonDot} />,
                        p1: playerLabel(w, player),
                        p2: player.goals,
                      })}
                    </span>
                  )),
                )}
              </figcaption>
            </figure>
            {localizeValue(
              metric === 'rank' && (
                <p className={s.note}>{richMessage('copy.ScorerPanels.7d9bde4ba4')}</p>
              ),
            )}
            <details data-ui="disclosure" className={s.details}>
              <summary>{richMessage('copy.ScorerPanels.db5e25a51d')}</summary>
              <div className={s.tableWrap}>
                <table aria-label={displayMessage('copy.ScorerPanels.480d58e7f1')}>
                  <thead>
                    <tr>
                      <th scope="col">{richMessage('copy.ClubHub.0fcb288d12')}</th>
                      {localizeValue(
                        series.map((player) => (
                          <th key={player.id} scope="col">
                            {player.name}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {localizeValue(
                      timeline.map((round) => (
                        <tr key={round.round}>
                          <th scope="row">{localizeValue(roundLabel(round.round))}</th>
                          {localizeValue(
                            round.players.map((player) => (
                              <td key={player.id}>
                                {richMessage('copy.ScorerPanels.7a411f145c', {
                                  p0: player.goals,
                                  p1: player.rank
                                    ? sourceMessage('copy.BallonDorView.5094d45cea', {
                                        p0: player.rank,
                                      })
                                    : sourceMessage('copy.ScorerPanels.e8fcc30a98'),
                                })}
                              </td>
                            )),
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ),
      )}
    </section>
  );
}, sameScorerState);

const selectDisciplineWorld = worldSelector([
  'clubs',
  'scorerSeason',
  'year',
  'playerClub',
  'discipline',
  'players',
  'seed',
]);
/**
 * The selected league's 징계 table for the season in progress (→WEB-40, LEAGUE-15): league yellows
 * and current bans from the discipline state, league reds from this season's records.
 */
export function DisciplineTable({ league }: { league?: LeagueChoice }) {
  useTextLocale();
  const w = useGameState(selectDisciplineWorld)!;
  const reds = useGameState((state) => state.view?.tallies.leagueReds);
  const rows = useMemo(
    () => leagueDiscipline(w, leagueIds(w, league), reds ?? {}),
    [w, league, reds],
  );
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.ScorerPanels.d5224cfdfe')}
      data-testid="league-discipline"
    >
      <div className={s.head}>
        <div>
          <h3>{richMessage('copy.ScorerPanels.5b16495c71')}</h3>
          <p>{richMessage('copy.ScorerPanels.957903df3a', { p0: seasonName(w.year) })}</p>
        </div>
      </div>
      {localizeValue(
        rows.length ? (
          <div className={s.tableWrap}>
            <table
              className={s.standings}
              aria-label={displayMessage('copy.ScorerPanels.2913b18cd3')}
            >
              <thead>
                <tr>
                  <th scope="col">{richMessage('team.column.player')}</th>
                  <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                  <th scope="col">{richMessage('copy.LabPage.6c0f751064')}</th>
                  <th scope="col">{richMessage('copy.LabPage.68e69c7b9c')}</th>
                  <th scope="col">{richMessage('copy.ScorerPanels.5bd265a724')}</th>
                </tr>
              </thead>
              <tbody>
                {localizeValue(
                  rows.map((row) => (
                    <tr key={row.id} className={row.club === w.playerClub ? s.own : ''}>
                      <th scope="row" className={s.player}>
                        {localizeValue(
                          row.club === w.playerClub ? (
                            <PlayerLink id={row.id} name={row.name} scope="season" />
                          ) : (
                            row.name
                          ),
                        )}
                      </th>
                      <td className={s.club}>
                        <ClubLink w={w} id={row.club} crest={14} />
                      </td>
                      <td>{localizeValue(row.yellows)}</td>
                      <td>{localizeValue(row.reds)}</td>
                      <td>{localizeValue(row.bans.map(banText).join(' · ') || '—')}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={s.empty}>{richMessage('copy.ScorerPanels.37400b7127')}</p>
        ),
      )}
    </section>
  );
}
