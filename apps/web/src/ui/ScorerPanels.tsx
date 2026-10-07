import { memo, useState } from 'react';
import type { GoalScorer, World } from '../../../../packages/contracts/src/types';
import { seasonName } from './format';
import { rankedScorers, scorerTrend } from './scorers';
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
  const since = w.scorerSeason?.trackedSinceRound;
  return since && since > 1 ? (
    <p className={s.note}>
      이전 저장은 {since}라운드부터 기록합니다. 그 전 경기의 선수별 득점은 포함되지 않습니다.
    </p>
  ) : !w.scorerSeason && w.round > 0 ? (
    <p className={s.note}>이전 저장의 선수별 득점 기록은 다음 리그 경기부터 시작합니다.</p>
  ) : null;
}

const clubName = (w: World, id: string) => w.clubs.find((club) => club.id === id)?.name || id;
const playerLabel = (w: World, player: GoalScorer) =>
  `${player.name} · ${w.clubs.find((club) => club.id === player.club)?.short || player.club}`;
const roundLabel = (round: number) => (round === 0 ? '개막 전' : `${round}라운드`);

export const ScorerStandings = memo(function ScorerStandings({ w }: Props) {
  const players = w.scorerSeason?.year === w.year ? w.scorerSeason.players : [];
  const ranked = rankedScorers(players);
  const own = ranked.find((player) => player.club === w.playerClub);
  const ownRank = own ? ranked.indexOf(own) + 1 : undefined;
  return (
    <section className={s.panel} aria-label="리그 득점왕 순위">
      <div className={s.head}>
        <div>
          <h3>득점왕 경쟁</h3>
          <p>{seasonName(w.year)} · 우리 팀 리그의 모든 선수 · 상위 20명</p>
        </div>
        {ranked.length > 0 && <span className={s.tag}>선두 {ranked[0].goals}골</span>}
      </div>
      <TrackingNote w={w} />
      {!ranked.length ? (
        <p className={s.empty}>
          아직 기록된 리그 득점이 없습니다. 골이 나오면 득점왕 경쟁이 시작됩니다.
        </p>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.standings} aria-label="리그 득점 순위표">
              <thead>
                <tr>
                  <th scope="col">순위</th>
                  <th scope="col">선수</th>
                  <th scope="col">클럽</th>
                  <th scope="col">포지션</th>
                  <th scope="col">출전</th>
                  <th scope="col">득점</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 20).map((player, i) => (
                  <tr key={player.id} className={player.club === w.playerClub ? s.own : ''}>
                    <td>{i + 1}</td>
                    <th scope="row" className={s.player}>
                      {player.name}
                      {player.club === w.playerClub && <span className={s.ownBadge}>우리 팀</span>}
                    </th>
                    <td className={s.club}>{clubName(w, player.club)}</td>
                    <td>{player.role}</td>
                    <td>{player.appearances}</td>
                    <td className={s.goals}>{player.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {own && ownRank && ownRank > 20 && (
            <p className={s.ownSummary}>
              우리 팀 최고 득점자 <b>{own.name}</b> · {ownRank}위 · {own.goals}골 · 선두와{' '}
              {ranked[0].goals - own.goals}골 차
            </p>
          )}
          <p className={s.note}>리그 득점만 집계합니다. 동률: 적은 출전 수 → 선수 ID.</p>
        </>
      )}
    </section>
  );
}, sameScorerState);

export const ScorerHistory = memo(function ScorerHistory({ w }: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState('own');
  const [selectedComparison, setSelectedComparison] = useState('rival');
  const [metric, setMetric] = useState<'goals' | 'rank'>('goals');
  const season = w.scorerSeason?.year === w.year ? w.scorerSeason : undefined;
  const players = season?.players || [];
  const ranked = rankedScorers(players);
  const ownPlayers = players.filter((player) => player.club === w.playerClub);
  const ownLead =
    ranked.find((player) => player.club === w.playerClub) ||
    ownPlayers.find((player) => player.role === 'FWD') ||
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
    <section className={s.panel} aria-label="득점왕 추이">
      <div className={s.head}>
        <div>
          <h3>득점왕 추이</h3>
          <p>
            {seasonName(w.year)} · 라운드별 {metric === 'goals' ? '누적 득점' : '득점 순위'}
          </p>
        </div>
        <div className={s.metric} role="group" aria-label="득점왕 추이 지표">
          <button aria-pressed={metric === 'goals'} onClick={() => setMetric('goals')}>
            누적 득점
          </button>
          <button aria-pressed={metric === 'rank'} onClick={() => setMetric('rank')}>
            득점 순위
          </button>
        </div>
      </div>
      <TrackingNote w={w} />
      {!timeline.length || !primary ? (
        <p className={s.empty}>
          첫 리그 라운드가 끝나면 선수별 누적 득점과 득점 순위를 함께 기록합니다.
        </p>
      ) : (
        <>
          <div className={s.filters}>
            <label>
              주목 선수
              <select
                aria-label="득점 추이 선수 선택"
                value={choice}
                onChange={(event) => setSelectedPlayer(event.target.value)}
              >
                <option value="own">우리 팀 최고 득점자</option>
                <option value="leader">현재 득점 선두</option>
                <optgroup label="우리 팀">
                  {available
                    .filter((player) => player.club === w.playerClub)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name} · {player.goals}골
                      </option>
                    ))}
                </optgroup>
                <optgroup label="다른 팀">
                  {available
                    .filter((player) => player.club !== w.playerClub)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {playerLabel(w, player)} · {player.goals}골
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <label>
              비교 선수
              <select
                aria-label="득점 추이 비교 선수 선택"
                value={comparisonChoice}
                onChange={(event) => setSelectedComparison(event.target.value)}
              >
                <option value="rival">가까운 득점 경쟁자</option>
                <option value="leader">현재 득점 선두</option>
                <option value="none">한 선수만 보기</option>
                {available
                  .filter((player) => player.id !== primary.id)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {playerLabel(w, player)} · {player.goals}골
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <figure className={s.chart}>
            <svg
              viewBox="0 0 650 210"
              role="img"
              aria-label={`${primary.name} ${metric === 'goals' ? '누적 득점' : '득점 순위'} 추이. 아래 표에서 라운드별 수치를 확인할 수 있습니다.`}
            >
              {ticks.map((value) => (
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
                    {value}
                    {metric === 'goals' ? '골' : '위'}
                  </text>
                </g>
              ))}
              {[...series].reverse().map((player) => {
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
                    {points.map((point) => (
                      <circle
                        key={point.round}
                        cx={x(point.round)}
                        cy={y(point.value)}
                        r={timeline.length > 20 ? 2 : 3}
                        fill={color}
                      >
                        <title>
                          {player.name} · {roundLabel(point.round)} · {point.value}
                          {metric === 'goals' ? '골' : '위'}
                        </title>
                      </circle>
                    ))}
                  </g>
                );
              })}
              <text x="46" y="200">
                {roundLabel(startRound)}
              </text>
              {lastRound !== startRound && (
                <text x="610" y="200" textAnchor="end">
                  {roundLabel(lastRound)}
                </text>
              )}
            </svg>
            <figcaption>
              {series.map((player, i) => (
                <span key={player.id}>
                  <i className={i === 0 ? s.primaryDot : s.comparisonDot} />
                  {playerLabel(w, player)} · {player.goals}골
                </span>
              ))}
            </figcaption>
          </figure>
          {metric === 'rank' && (
            <p className={s.note}>
              위로 올라갈수록 높은 순위입니다. 무득점 선수는 득점 순위가 없습니다.
            </p>
          )}
          <details className={s.details}>
            <summary>라운드별 득점과 순위 보기</summary>
            <div className={s.tableWrap}>
              <table aria-label="라운드별 선수 득점 기록">
                <thead>
                  <tr>
                    <th scope="col">라운드</th>
                    {series.map((player) => (
                      <th key={player.id} scope="col">
                        {player.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((round) => (
                    <tr key={round.round}>
                      <th scope="row">{roundLabel(round.round)}</th>
                      {round.players.map((player) => (
                        <td key={player.id}>
                          {player.goals}골 · {player.rank ? `${player.rank}위` : '득점 없음'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}, sameScorerState);
