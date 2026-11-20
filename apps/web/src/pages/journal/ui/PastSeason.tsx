import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { CompetitionRecords, UnavailableLeagueRecord } from './CompetitionRecords';
import { Segments } from '../../../shared/ui/Segments';
import { memo, useMemo, useState } from 'react';
import type {
  MatchRecord,
  SeasonArchive,
  World,
} from '../../../../../../packages/contracts/src/types';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { fixtureDay } from '../../../../../../packages/engine/src/calendar';
import { archivedClubOvr } from '../../../../../../packages/engine/src/archives';
import { country } from '../../../../../../packages/catalogs/src/index';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { ClubLink } from '../../../entities/club';
import { ovrTier } from '../../../entities/player';
import { Dialog } from '../../../shared/ui/Dialog';
import { MatchReport } from '../../../features/match-viewer';
import { TabList } from '../../../shared/ui/PageTabs';
import {
  FixtureResultRow,
  RankHistoryGraph,
  sortStandings,
  StandingsHeader,
  useStandingsSort,
  ZoneLegend,
} from '../../../widgets/league-insights';
import { number, seasonName, signed } from '../../../presentation/format';
import { divisionName, finalZones, sameLeague, type LeagueChoice } from '../../../entities/league';
import { LeaguePicker } from '../../../entities/league';
import { CompetitionHeader } from '../../../shared/ui/CompetitionTabs';
import { selectReviewWorld } from '../../../shared/lib/liveState';
import {
  finalRows,
  PointsDeduction,
  leagueRows,
  seasonRecords,
  seasonSnapshots,
  useSeasonFiles,
  type FinalRow,
  type SeasonRecord,
} from '../../../entities/league';
import s from '../../../shared/ui/styles/App.module.css';
import t from '../../../shared/ui/styles/LiveSeason.module.css';
import l from '../../../shared/ui/styles/LeagueInsights.module.css';
import r from '../../../shared/ui/styles/SeasonReview.module.css';
import c from './Scorers.module.css';

import { openClubSeason, PAST_TABS, type PastTab } from '../../../shared/routing/state';
export { PAST_TABS, type PastTab };

type Read = ReturnType<typeof useSeasonFiles>;
/** What a tab says while the season's archive loads or after reading it failed. */
function Pending({ read }: { read: Read }) {
  useTextLocale();
  return (
    <p className={r.loading} role={read?.failed ? 'alert' : 'status'}>
      {localizeValue(
        read?.failed
          ? sourceMessage('copy.PastSeason.5edf6161ac')
          : sourceMessage('copy.PastSeason.5ae912ceaf'),
      )}
    </p>
  );
}
const markOf = (own: number, other: number) =>
  own > other
    ? sourceMessage('result.win')
    : own < other
      ? sourceMessage('result.loss')
      : sourceMessage('result.draw');

/**
 * A league's final table under the rules of the division it was played in: ours, or `league`
 * (→WEB-65). Only points and goals survive for every club; wins, draws and losses only for ours.
 */
export function FinalTable({
  w,
  season,
  rows,
  read,
  league,
  records,
}: {
  w: World;
  season: SeasonArchive;
  rows?: FinalRow[];
  read: Read;
  league?: LeagueChoice;
  /** Every club's won/drawn/lost, where the season's snapshots give them back. */
  records?: Map<number, SeasonRecord>;
}) {
  useTextLocale();
  const order = useStandingsSort();
  if (!read?.files) return <Pending read={read} />;
  if (!rows)
    return read?.files ? (
      <p className={r.loading}>{richMessage('copy.PastSeason.9be7046661')}</p>
    ) : (
      <Pending read={read} />
    );
  const deductions =
    (!league && seasonSnapshots(w, season).at(-1)?.leagueDeductions) ||
    (read?.files?.season ?? season).leagueDeductions;
  const code = league?.code ?? clubOf(w).country,
    tier = league?.tier ?? season.tier,
    group = league?.group ?? season.group,
    { zones } = finalZones(code, tier, rows.length);
  const archive = read.files.season;
  const standings = rows.map(([club, points, gf, ga], i) => {
    const id = w.clubs[club]?.id;
    const record = records?.get(club);
    return {
      club,
      id,
      rank: i + 1,
      zone: zones[i],
      ovr:
        id && archive?.closingClubOvr && 'clubs' in archive.closingClubOvr
          ? archivedClubOvr(archive, id)
          : undefined,
      points,
      played: record ? record[0] + record[1] + record[2] : undefined,
      won: record?.[0],
      drawn: record?.[1],
      lost: record?.[2],
      gf,
      ga,
      difference: gf - ga,
    };
  });
  const showOvr = true;
  return (
    <section
      data-surface="sheet"
      className={r.table}
      aria-label={displayMessage('copy.PastSeason.a0b4a42470')}
    >
      <h3>{richMessage('copy.PastSeason.a0b4a42470')}</h3>
      <p className={r.tableMeta}>
        {richMessage('copy.PastSeason.7085c5380c', {
          p0: seasonName(season.year),
          p1: league && `${country(code).name} `,
          p2: divisionName(code, tier, group),
          p3: rows.length,
        })}
      </p>
      <div className={r.tableScroll}>
        <table className={records ? r.full : undefined}>
          <thead>
            <tr>
              <StandingsHeader column="rank" controls={order}>
                #
              </StandingsHeader>
              <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
              {showOvr && (
                <StandingsHeader column="ovr" controls={order}>
                  {richMessage('team.column.ovr')}
                </StandingsHeader>
              )}
              <StandingsHeader column="points" controls={order}>
                {richMessage('copy.ClubTrends.e8fd75919a')}
              </StandingsHeader>
              {records && (
                <>
                  <StandingsHeader column="played" controls={order}>
                    {richMessage('copy.LabPage.e56314e9a1')}
                  </StandingsHeader>
                  <StandingsHeader column="won" controls={order}>
                    {richMessage('result.win')}
                  </StandingsHeader>
                  <StandingsHeader column="drawn" controls={order}>
                    {richMessage('result.draw')}
                  </StandingsHeader>
                  <StandingsHeader column="lost" controls={order}>
                    {richMessage('result.loss')}
                  </StandingsHeader>
                </>
              )}
              <StandingsHeader column="gf" controls={order}>
                {richMessage('copy.LeagueInsights.f0e336df20')}
              </StandingsHeader>
              <StandingsHeader column="ga" controls={order}>
                {richMessage('copy.LeagueInsights.2b47482006')}
              </StandingsHeader>
              <StandingsHeader column="difference" controls={order}>
                {richMessage('copy.CupsView.24734975b3')}
              </StandingsHeader>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              sortStandings(standings, order.sort).map((row) => {
                const {
                  club,
                  id,
                  rank,
                  zone,
                  ovr,
                  points,
                  played,
                  won,
                  drawn,
                  lost,
                  gf,
                  ga,
                  difference,
                } = row;
                return (
                  <tr
                    key={club}
                    data-own={id === w.playerClub || undefined}
                    data-champion={rank === 1 || undefined}
                    aria-label={
                      rank === 1 ? displayMessage('copy.CupHistory.31e52393f3') : undefined
                    }
                    className={`${id === w.playerClub ? r.own : ''} ${zone ? l[zone] : ''}`}
                  >
                    <td>{localizeValue(number(rank))}</td>
                    <td>
                      {localizeValue(id ? <ClubLink w={w} id={id} crest={14} /> : '—')}
                      {localizeValue(
                        !records && id === w.playerClub && (
                          <small className={r.record}>
                            {richMessage('copy.LeagueInsights.9f2c790122', {
                              p0: season.won,
                              p1: season.drawn,
                              p2: season.lost,
                            })}
                          </small>
                        ),
                      )}
                    </td>
                    {showOvr && (
                      <td>
                        {ovr === undefined ? (
                          '—'
                        ) : (
                          <span className={l.teamOvr} data-tier={ovrTier(ovr)}>
                            {number(ovr)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className={r.points}>
                      {localizeValue(number(points))}{' '}
                      <PointsDeduction row={id ? deductions?.[id] : undefined} />
                    </td>
                    {localizeValue(
                      records && (
                        <>
                          <td>{localizeValue(played ?? '—')}</td>
                          <td>{localizeValue(won ?? '—')}</td>
                          <td>{localizeValue(drawn ?? '—')}</td>
                          <td>{localizeValue(lost ?? '—')}</td>
                        </>
                      ),
                    )}
                    <td>{localizeValue(gf)}</td>
                    <td>{localizeValue(ga)}</td>
                    <td>{localizeValue(signed(difference))}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <ZoneLegend zones={zones} closed className={r.zones} />
      <p className={r.footnote}>
        {richMessage('copy.PastSeason.78244fe6fc', {
          p0: !records && sourceMessage('copy.PastSeason.3ad2d3bb48'),
        })}
      </p>
    </section>
  );
}

/** Our league games of the season in round order, each opening its match report. */
function OwnMatches({ w, season, read }: { w: World; season: SeasonArchive; read: Read }) {
  useTextLocale();
  const [report, setReport] = useState<MatchRecord>();
  if (!read?.files) return <Pending read={read} />;
  const games = read.files.matches
    .filter((m) => m.kind === 'league')
    .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id));
  const results = games.map((m) => {
    const home = m.home === w.playerClub,
      own = home ? m.score.home : m.score.away,
      other = home ? m.score.away : m.score.home;
    return { m, home, mark: markOf(own, other) };
  });
  const count = (mark: string) => results.filter((result) => result.mark === mark).length;
  return (
    <section
      data-surface="panel"
      className={l.panel}
      aria-label={displayMessage('copy.PastSeason.3e07185367')}
    >
      <div className={l.panelHead}>
        <div>
          <h3>{richMessage('copy.PastSeason.3e07185367')}</h3>
          <span>
            {richMessage('copy.PastSeason.7a96817f80', {
              p0: seasonName(season.year),
              p1: games.length,
              p2: count(sourceMessage('result.win')),
              p3: count(sourceMessage('result.draw')),
              p4: ' ',
              p5: count(sourceMessage('result.loss')),
            })}
          </span>
        </div>
      </div>
      {localizeValue(
        results.length ? (
          <ul className={`${l.results} ${l.seasonResults}`}>
            {results.map(({ m, home }) => {
              const opponent = home ? m.away : m.home;
              return (
                <FixtureResultRow
                  key={m.id}
                  w={w}
                  fixture={m}
                  meta={richMessage('copy.PastSeason.9006ce531e', {
                    p0: m.round,
                    p1: home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
                  })}
                  actions={
                    <button
                      type="button"
                      aria-label={displayMessage('copy.PastSeason.a0a049d2de', {
                        p0: m.round,
                        p1: w.clubs.find((club) => club.id === opponent)?.name ?? '',
                      })}
                      onClick={() => setReport(m)}
                    >
                      {richMessage('copy.PastSeason.077829edb1')}
                    </button>
                  }
                />
              );
            })}
          </ul>
        ) : (
          <p className={l.empty}>{richMessage('copy.PastSeason.1ec6718884')}</p>
        ),
      )}
      <p className={r.panelNote}>{richMessage('copy.PastSeason.886856e5f1')}</p>
      {localizeValue(
        report && (
          <Dialog
            label={displayMessage('copy.PastSeason.077829edb1')}
            onClose={() => setReport(undefined)}
            wide
          >
            <MatchReport record={report} w={w} />
          </Dialog>
        ),
      )}
    </section>
  );
}

/** Prefer league-wide snapshots and fall back to the archived own-club series. */
function SeasonRanks({
  w,
  season,
  clubs,
  read,
}: {
  w: World;
  season: SeasonArchive;
  clubs?: number;
  read: Read;
}) {
  if (!clubs && season.ranks?.length && !read?.files && !seasonSnapshots(w, season).length)
    return <Pending read={read} />;
  return (
    <RankHistoryGraph
      w={w}
      year={season.year}
      archive={{
        ranks: season.ranks,
        places: clubs,
        code: clubOf(w).country,
        tier: season.tier,
        group: season.group,
      }}
    />
  );
}

/** The league's ten leading scorers as archived at the close (rules 1.12.0+). */
function SeasonScorers({ w, season, read }: { w: World; season: SeasonArchive; read: Read }) {
  useTextLocale();
  if (!read?.files) return <Pending read={read} />;
  const scorers = read.files.season?.scorers,
    top = scorers?.[0];
  return (
    <section
      data-surface="panel"
      className={c.panel}
      aria-label={displayMessage('copy.PastSeason.234092e175')}
    >
      <div className={c.head}>
        <div>
          <h3>{richMessage('copy.PastSeason.49afeab19c')}</h3>
          <p>
            {richMessage('copy.PastSeason.7d1d54431f', {
              p0: seasonName(season.year),
              p1: scorers?.length ?? 0,
            })}
          </p>
        </div>
        {localizeValue(
          top && (
            <span className={c.tag}>
              {richMessage('copy.PastSeason.4cf6fd6ff9', { p0: top.name, p1: top.goals })}
            </span>
          ),
        )}
      </div>
      {localizeValue(
        !scorers ? (
          <p className={c.empty}>{richMessage('copy.PastSeason.63fd75b4e1')}</p>
        ) : !top ? (
          <p className={c.empty}>{richMessage('copy.PastSeason.17e3ccce61')}</p>
        ) : (
          <>
            <div className={c.tableWrap}>
              <table
                className={`${c.standings} ${r.scorers}`}
                aria-label={displayMessage('copy.PastSeason.1113fcd54f')}
              >
                <thead>
                  <tr>
                    <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                    <th scope="col">{richMessage('team.column.player')}</th>
                    <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                    <th scope="col">{richMessage('copy.summary.68a6cf8ed8')}</th>
                    <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
                    <th scope="col">{richMessage('copy.PastSeason.9c429f6c95')}</th>
                  </tr>
                </thead>
                <tbody>
                  {localizeValue(
                    scorers.map((player, i) => {
                      const club = w.clubs[player.club],
                        ours = club?.id === w.playerClub,
                        // Goals, then fewer appearances, decide the Golden Boot.
                        king = player.goals === top.goals && player.appearances === top.appearances;
                      return (
                        <tr key={i} className={`${ours ? c.own : ''} ${king ? r.king : ''}`}>
                          <td>{localizeValue(i + 1)}</td>
                          <th scope="row" className={c.player}>
                            {player.name}
                            {localizeValue(
                              (king || ours) && (
                                <span className={r.tags}>
                                  {localizeValue(
                                    king && (
                                      <b className={r.crown}>
                                        {richMessage('copy.PastSeason.dec0c623e1')}
                                      </b>
                                    ),
                                  )}
                                  {localizeValue(
                                    ours && <b>{richMessage('copy.BallonDorView.8434ac1486')}</b>,
                                  )}
                                </span>
                              ),
                            )}
                          </th>
                          <td className={c.club}>
                            {localizeValue(
                              player.clubs ? (
                                player.clubs.map((part) => (
                                  <span key={part.club}>
                                    {richMessage('copy.PastSeason.6e7dd5b718', {
                                      p0: w.clubs[part.club] ? (
                                        <ClubLink w={w} id={w.clubs[part.club].id} crest={14} />
                                      ) : (
                                        '—'
                                      ),
                                      p1: ' ',
                                      p2: part.goals,
                                      p3: part.appearances,
                                      p4: <br />,
                                    })}
                                  </span>
                                ))
                              ) : club ? (
                                <ClubLink w={w} id={club.id} crest={14} />
                              ) : (
                                '—'
                              ),
                            )}
                          </td>
                          <td className={c.goals}>{localizeValue(player.goals)}</td>
                          <td>{localizeValue(player.appearances)}</td>
                          <td>
                            {localizeValue(
                              player.appearances
                                ? (player.goals / player.appearances).toFixed(2)
                                : '—',
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
            <p className={c.note}>{richMessage('copy.PastSeason.7802736a09')}</p>
          </>
        ),
      )}
    </section>
  );
}

/**
 * A closed season in the league page's season list (→WEB-47): its own tab bar over the review,
 * the final table, our matches, our rank by round and the scorers. The season's archive is read
 * once and shared by the tabs; each tab says plainly what the season no longer keeps.
 */
export const ClosedSeason = memo(function ClosedSeason({
  client,
  year,
  tab,
  onTab,
  league,
  onLeague,
  teamPart,
  onTeamPart,
  playerPart,
  onPlayerPart,
  onYear,
}: {
  client: GameClient;
  year: number;
  onYear: (year: number) => void;
  tab: PastTab;
  onTab: (tab: PastTab) => void;
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  teamPart: 'table' | 'rank';
  onTeamPart: (value: 'table' | 'rank') => void;
  playerPart: 'scorers' | 'trend';
  onPlayerPart: (value: 'scorers' | 'trend') => void;
}) {
  useTextLocale();
  const w = useGameState(selectReviewWorld)!;
  const season = w.history.find((h) => h.year === year);
  const read = useSeasonFiles(client, season);
  const rows =
    season && finalRows(w, read?.files?.season ?? season, read?.files?.season?.standings);
  // Another league's table that season; our own that season keeps its round snapshots.
  const ownThen = useMemo(
    () => season && { code: clubOf(w).country, tier: season.tier, group: season.group },
    [w, season],
  );
  const other = ownThen && league && !sameLeague(league, ownThen) ? league : undefined;
  const records = useMemo(
    () => (season && !other ? seasonRecords(w, season) : undefined),
    [w, season, other],
  );
  const tableRows = other
    ? leagueRows(w, read?.files?.season?.standings, other, read?.files?.season ?? season)
    : rows;
  if (!season)
    return (
      <section
        className={`${s.seasonPane} ${t.pane}`}
        aria-label={displayMessage('copy.PastSeason.a9346bea02')}
      >
        <p>{richMessage('copy.PastSeason.c45e01a44c')}</p>
      </section>
    );
  return (
    <>
      {/* Pinned like the live tabs: the same one-row header, then the closed season's tabs. */}
      <div className={t.navigation} data-ui="toolbar">
        <CompetitionHeader page="leagueHistory">
          <b className={s.srOnly}>
            {localizeValue(seasonName(year))} ·{localizeValue(' ')}
            {localizeValue(
              divisionName(
                (league ?? ownThen!).code,
                (league ?? ownThen!).tier,
                (league ?? ownThen!).group,
              ),
            )}
          </b>
          <LeaguePicker
            league={league}
            onLeague={onLeague}
            own={ownThen}
            season={year}
            onSeason={onYear}
          />
        </CompetitionHeader>
        <TabList
          tabs={PAST_TABS}
          value={tab}
          onChange={onTab}
          label={displayMessage('copy.PastSeason.4fb0d89982')}
          idPrefix="past"
          className={`${s.seasonTabs} ${t.tabs}`}
        />
      </div>
      <section
        key={tab}
        id="past-panel"
        role="tabpanel"
        aria-labelledby={`past-tab-${tab}`}
        className={`${s.seasonPane} ${t.pane}`}
      >
        {localizeValue(
          tab === 'table' ? (
            <>
              <FinalTable
                key={`${w.id}:${season.year}:${other?.code}:${other?.tier}:${other?.group}`}
                w={w}
                season={season}
                rows={tableRows}
                read={read}
                league={other}
                records={records}
              />
              <button type="button" className={r.clubSeason} onClick={() => openClubSeason(year)}>
                {richMessage('copy.CupHistory.ec42c28759')}
              </button>
            </>
          ) : tab === 'matches' ? (
            other ? (
              <UnavailableLeagueRecord
                league={other}
                label={displayMessage('copy.PastSeason.e82b36d198')}
                onOwn={() => onLeague(undefined)}
              />
            ) : (
              <OwnMatches w={w} season={season} read={read} />
            )
          ) : tab === 'rank' ? (
            <>
              <Segments
                label={displayMessage('copy.LiveSeason.dd0271790e')}
                options={
                  [
                    ['rank', sourceMessage('copy.LiveSeason.352637b1e4')],
                    ['table', sourceMessage('copy.LiveSeason.cfb04aa930')],
                  ] as const
                }
                value={teamPart}
                onChange={onTeamPart}
              />
              {localizeValue(
                teamPart === 'table' ? (
                  tableRows ? (
                    <CompetitionRecords
                      w={w}
                      rows={tableRows.map(([index, points, gf, ga]) => ({
                        id: w.clubs[index]?.id ?? `missing-${index}`,
                        points,
                        gf,
                        ga,
                      }))}
                    />
                  ) : (
                    <Pending read={read} />
                  )
                ) : other ? (
                  <UnavailableLeagueRecord
                    league={other}
                    label={displayMessage('copy.LiveSeason.72f03b4d8c')}
                    onOwn={() => onLeague(undefined)}
                  />
                ) : (
                  <SeasonRanks w={w} season={season} clubs={rows?.length} read={read} />
                ),
              )}
            </>
          ) : (
            <>
              <Segments
                label={displayMessage('copy.LiveSeason.145050ed3a')}
                options={
                  [
                    ['scorers', sourceMessage('copy.LiveSeason.12543e95b4')],
                    ['trend', sourceMessage('copy.LiveSeason.d332850f5a')],
                  ] as const
                }
                value={playerPart}
                onChange={onPlayerPart}
              />
              {localizeValue(
                other ? (
                  <UnavailableLeagueRecord
                    league={other}
                    label={displayMessage('copy.LiveSeason.446a9e597e')}
                    onOwn={() => onLeague(undefined)}
                  />
                ) : playerPart === 'trend' ? (
                  <p>{richMessage('copy.PastSeason.7edfb67a24')}</p>
                ) : (
                  <SeasonScorers w={w} season={season} read={read} />
                ),
              )}
            </>
          ),
        )}
      </section>
    </>
  );
});
