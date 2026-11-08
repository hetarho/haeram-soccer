import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useMemo, useState } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { hundredths, share } from '../../../entities/match';
import { ClubLink } from '../../../entities/club';
import {
  CLUB_ORDERS,
  FULL_STATS_FAILED,
  fullStatsAppearances,
  fullStatsClubs,
  fullStatsCoverage,
  fullStatsPlayers,
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
} from '../../../entities/league';
import { leagueIds, type LeagueChoice } from '../../../entities/league';
import { worldSelector } from '../../../shared/lib/liveState';
import { PlayerLink } from '../../../entities/player';
import { Segments } from '../../../shared/ui/Segments';
import { Term } from '../../../shared/ui/Term';
import s from '../../../shared/ui/styles/LeagueInsights.module.css';

const selectFullStatsWorld = worldSelector([
  'clubs',
  'fixtures',
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
  useTextLocale();
  const w = useGameState(selectFullStatsWorld)! as World;
  const scope = useMemo(() => leagueStatsScope(w, league), [w, league]);
  const full = useFullStats(client, w, scope);
  const [clubOrder, setClubOrder] = useState<ClubOrder>('xgd');
  const [leader, setLeader] = useState<LeaderKey>('goals');
  if (full.status === 'off') return null;
  const title =
    lens === 'teams'
      ? sourceMessage('copy.LeagueFullStats.a96d5c9054')
      : sourceMessage('copy.LeagueFullStats.b64f7893d8');
  const read = full.status === 'ready' ? full.read : undefined;
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={localizeValue(title)}
      data-testid={`full-stats-${lens}`}
    >
      <div className={s.panelHead}>
        <div>
          <h3>{localizeValue(title)}</h3>
          <span data-testid="full-stats-coverage">
            {localizeValue(
              full.status === 'loading'
                ? sourceMessage('copy.LeagueFullStats.3cb5c68f5c')
                : full.status === 'failed'
                  ? FULL_STATS_FAILED
                  : fullStatsCoverage(read, w.year).text,
            )}
          </span>
        </div>
        {localizeValue(
          full.status === 'failed' && (
            <button type="button" onClick={full.retry}>
              {richMessage('copy.ConstantsPage.9cee01b433')}
            </button>
          ),
        )}
      </div>
      {localizeValue(
        !read ? null : lens === 'teams' ? (
          <FullClubTable
            w={w}
            rows={orderClubs(fullStatsClubs(read, leagueIds(w, league)), clubOrder)}
            order={clubOrder}
            onOrder={setClubOrder}
          />
        ) : (
          <FullLeaders w={w} rows={fullStatsPlayers(read, w)} order={leader} onOrder={setLeader} />
        ),
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
  useTextLocale();
  return (
    <>
      <div className={s.coverage}>
        <Segments
          label={displayMessage('copy.LeagueFullStats.970952f90d')}
          options={CLUB_ORDERS}
          value={order}
          onChange={onOrder}
        />
      </div>
      <div className={s.tableWrap}>
        <table
          className={s.standings}
          aria-label={displayMessage('copy.LeagueFullStats.be290a24d8')}
        >
          <thead>
            <tr>
              <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
              <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
              <th scope="col">{richMessage('copy.summary.eb4e291be3')}</th>
              <th scope="col">
                <Term id="xg">{richMessage('copy.LeagueFullStats.aa1170db7a')}</Term>
              </th>
              <th scope="col">{richMessage('copy.LeagueFullStats.94fffa4f8d')}</th>
              <th scope="col" className={s.optional}>
                {richMessage('copy.LeagueFullStats.96062becdf')}
              </th>
              <th scope="col" className={s.optional}>
                {richMessage('copy.LeagueFullStats.0927c60a4f')}
              </th>
              <th scope="col" className={s.optional}>
                {richMessage('copy.summary.5101559c4e')}
              </th>
              <th scope="col" className={s.optional}>
                <Term id="big-chance">{richMessage('copy.LeagueFullStats.233a5dfe38')}</Term>
              </th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              rows.map((row) => (
                <tr
                  key={row.club}
                  data-own={row.club === w.playerClub || undefined}
                  className={row.club === w.playerClub ? s.own : ''}
                >
                  <th scope="row" className={s.club}>
                    <ClubLink w={w} id={row.club} crest={14} />
                  </th>
                  <td>{localizeValue(row.matches)}</td>
                  <td>{localizeValue(row.goals)}</td>
                  <td>{localizeValue(hundredths(row.xg))}</td>
                  <td>{localizeValue(hundredths(row.xga))}</td>
                  <td className={s.optional}>
                    {localizeValue(perMatch((row.xg - row.xga) / 100, row.matches))}
                  </td>
                  <td className={s.optional}>
                    {localizeValue(row.shots)} ({localizeValue(row.onTarget)})
                  </td>
                  <td className={s.optional}>
                    {localizeValue(share(row.completed, row.passes))}
                    {localizeValue(' ')}
                    <small>
                      {localizeValue(row.completed)}/{localizeValue(row.passes)}
                    </small>
                  </td>
                  <td className={s.optional}>{localizeValue(row.bigChances)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className={s.coverage}>{richMessage('copy.LeagueFullStats.41d3e07e6e')}</p>
    </>
  );
}
/**
 * The leaders of one counter. Every row keeps its sample on every width: the 90분당 cell carries
 * the minutes it divides, while the appearances column folds away on phones (→HIST-6).
 */
export function FullLeaders({
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
  useTextLocale();
  const leader = LEADERS.find((entry) => entry.key === order)!;
  const ranked = leaders(rows, order);
  return (
    <>
      <div className={s.coverage}>
        <Segments
          label={displayMessage('copy.LeagueFullStats.ca12485495')}
          options={LEADERS.map((entry) => [entry.key, entry.label] as const)}
          value={order}
          onChange={onOrder}
          wrap
        />
      </div>
      {localizeValue(
        ranked.length ? (
          <div className={s.tableWrap}>
            <table
              className={s.standings}
              aria-label={displayMessage('copy.CupsView.a12851cbff', { p0: leader.label })}
            >
              <thead>
                <tr>
                  <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                  <th scope="col">{richMessage('team.column.player')}</th>
                  <th scope="col" className={s.optional}>
                    {richMessage('copy.BallonDorView.b849877c07')}
                  </th>
                  <th scope="col">
                    {localizeValue(
                      leader.term ? (
                        <Term id={leader.term}>{localizeValue(leader.label)}</Term>
                      ) : (
                        leader.label
                      ),
                    )}
                  </th>
                  <th scope="col">{richMessage('copy.CareerRecordBook.77d4f682b4')}</th>
                </tr>
              </thead>
              <tbody>
                {localizeValue(
                  ranked.map(({ player, total, rate, sample }, i) => (
                    <tr
                      key={player.id}
                      className={player.clubs.at(-1) === w.playerClub ? s.own : ''}
                    >
                      <td>{localizeValue(i + 1)}</td>
                      <th scope="row" className={s.club}>
                        {/* Every player opens his detail, found at his latest club (→WEB-59). */}
                        <PlayerLink
                          id={player.id}
                          name={player.name}
                          scope="season"
                          club={player.clubs.at(-1)}
                        />
                        {localizeValue(' ')}· {localizeValue(player.position)}
                        <br />
                        {/* Every contributing club, the latest last (→HIST-13). */}
                        {localizeValue(
                          player.clubs.map((club, n) => (
                            <span key={club}>
                              {localizeValue(n > 0 && ' → ')}
                              <ClubLink w={w} id={club} crest={14} />
                            </span>
                          )),
                        )}
                      </th>
                      <td className={s.optional}>{localizeValue(fullStatsAppearances(player))}</td>
                      <td className={s.points}>{localizeValue(total)}</td>
                      <td>
                        {localizeValue(rate)}
                        <small> · {localizeValue(sample)}</small>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={s.empty}>
            {richMessage('copy.LeagueFullStats.6b928a8c3c', { p0: leader.label })}
          </p>
        ),
      )}
    </>
  );
}
