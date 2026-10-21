import { useMemo, useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { share } from './advanced';
import { ClubLink } from './ClubLink';
import {
  CLUB_ORDERS,
  fullStatsAppearances,
  fullStatsClubs,
  fullStatsCoverage,
  fullStatsPlayers,
  hundredths,
  LEADERS,
  leaders,
  leagueStatsScope,
  orderClubs,
  perMatch,
  useFullStats,
  type ClubOrder,
  type FullStatsClub,
  type FullStatsPlayer,
  type LeaderKey,
} from './fullStatsView';
import { leagueIds, type LeagueChoice } from './league';
import { worldSelector } from './liveState';
import { PlayerLink } from './PlayerSheet';
import { Segments } from './Segments';
import { Term } from './Term';
import s from './LeagueInsights.module.css';

const selectFullStatsWorld = worldSelector([
  'clubs',
  'fixtures',
  'lower',
  'matchModel',
  'playerClub',
  'players',
  'year',
]);
/**
 * The selected league's complete statistics this season (→WEB-89, HIST-6): every club's totals or
 * its leading players, ours and other clubs' alike in the same units, read from the worker when the
 * lens opens and again as results settle. The coverage line names a partial season's start and
 * sample; a world that tracks nothing new shows nothing here. The league tabs load it as its own
 * chunk, outside the first-play entry (→ARCH-28).
 */
export function LeagueFullStats({
  client,
  league,
  lens,
}: {
  client: Pick<GameClient, 'fullStats'>;
  league?: LeagueChoice;
  lens: 'teams' | 'players';
}) {
  const w = useGameState(selectFullStatsWorld)! as World;
  const scope = useMemo(() => leagueStatsScope(w, league), [w, league]);
  const full = useFullStats(client, w, scope);
  const [clubOrder, setClubOrder] = useState<ClubOrder>('xgd');
  const [leader, setLeader] = useState<LeaderKey>('goals');
  if (full.status === 'off') return null;
  const title = lens === 'teams' ? '팀 세부 기록' : '선수 세부 기록';
  const read = full.status === 'ready' ? full.read : undefined;
  return (
    <section className={s.panel} aria-label={title} data-testid={`full-stats-${lens}`}>
      <div className={s.panelHead}>
        <div>
          <h3>{title}</h3>
          <span data-testid="full-stats-coverage">
            {full.status === 'loading'
              ? '세부 기록을 불러오는 중…'
              : fullStatsCoverage(read, w.year).text}
          </span>
        </div>
      </div>
      {!read ? null : lens === 'teams' ? (
        <FullClubTable
          w={w}
          rows={orderClubs(fullStatsClubs(read, leagueIds(w, league)), clubOrder)}
          order={clubOrder}
          onOrder={setClubOrder}
        />
      ) : (
        <FullLeaders w={w} rows={fullStatsPlayers(read, w)} order={leader} onOrder={setLeader} />
      )}
    </section>
  );
}
function FullClubTable({
  w,
  rows,
  order,
  onOrder,
}: {
  w: World;
  rows: FullStatsClub[];
  order: ClubOrder;
  onOrder: (order: ClubOrder) => void;
}) {
  return (
    <>
      <div className={s.coverage}>
        <Segments
          label="팀 세부 기록 정렬"
          options={CLUB_ORDERS}
          value={order}
          onChange={onOrder}
        />
      </div>
      <div className={s.tableWrap}>
        <table className={s.standings} aria-label="팀 세부 기록표">
          <thead>
            <tr>
              <th scope="col">클럽</th>
              <th scope="col">경기</th>
              <th scope="col">득점</th>
              <th scope="col">
                <Term id="xg">xG</Term>
              </th>
              <th scope="col">xGA</th>
              <th scope="col" className={s.optional}>
                경기당 xG 차
              </th>
              <th scope="col" className={s.optional}>
                슈팅 (유효)
              </th>
              <th scope="col" className={s.optional}>
                패스 성공률
              </th>
              <th scope="col" className={s.optional}>
                <Term id="big-chance">빅찬스</Term>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.club} className={row.club === w.playerClub ? s.own : ''}>
                <th scope="row" className={s.club}>
                  <ClubLink w={w} id={row.club} crest={14} />
                </th>
                <td>{row.matches}</td>
                <td>{row.goals}</td>
                <td>{hundredths(row.xg)}</td>
                <td>{hundredths(row.xga)}</td>
                <td className={s.optional}>{perMatch((row.xg - row.xga) / 100, row.matches)}</td>
                <td className={s.optional}>
                  {row.shots} ({row.onTarget})
                </td>
                <td className={s.optional}>{share(row.completed, row.passes)}</td>
                <td className={s.optional}>{row.bigChances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.coverage}>
        xG·xGA는 합계, xG 차는 경기당이에요. 기록된 경기가 없는 팀은 비율 없이 0경기로 남아요.
      </p>
    </>
  );
}
function FullLeaders({
  w,
  rows,
  order,
  onOrder,
}: {
  w: World;
  rows: FullStatsPlayer[];
  order: LeaderKey;
  onOrder: (order: LeaderKey) => void;
}) {
  const leader = LEADERS.find((entry) => entry.key === order)!;
  const ranked = leaders(rows, order);
  return (
    <>
      <div className={s.coverage}>
        <Segments
          label="선수 세부 기록 지표"
          options={LEADERS.map((entry) => [entry.key, entry.label] as const)}
          value={order}
          onChange={onOrder}
          wrap
        />
      </div>
      {ranked.length ? (
        <div className={s.tableWrap}>
          <table className={s.standings} aria-label={`${leader.label} 순위표`}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">선수</th>
                <th scope="col" className={s.optional}>
                  출전
                </th>
                <th scope="col">
                  {leader.term ? <Term id={leader.term}>{leader.label}</Term> : leader.label}
                </th>
                <th scope="col">90분당</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ player, total, rate }, i) => (
                <tr key={player.id} className={player.clubs.at(-1) === w.playerClub ? s.own : ''}>
                  <td>{i + 1}</td>
                  <th scope="row" className={s.club}>
                    {/* Our players, past or present, open their sheet (→WEB-59). */}
                    {player.ours ? (
                      <PlayerLink id={player.id} name={player.name} scope="season" />
                    ) : (
                      player.name
                    )}{' '}
                    · {player.position}
                    <br />
                    {/* Every contributing club, the latest last (→HIST-13). */}
                    {player.clubs.map((club, n) => (
                      <span key={club}>
                        {n > 0 && ' → '}
                        <ClubLink w={w} id={club} crest={14} />
                      </span>
                    ))}
                  </th>
                  <td className={s.optional}>
                    {fullStatsAppearances(player)} · {player.minutes}분
                  </td>
                  <td className={s.points}>{total}</td>
                  <td>{rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={s.empty}>{leader.label} 기록이 아직 없어요. 기록된 경기에서 0이에요.</p>
      )}
    </>
  );
}
