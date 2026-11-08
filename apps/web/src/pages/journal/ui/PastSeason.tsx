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
import { country } from '../../../../../../packages/catalogs/src/index';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { ClubLink } from '../../../entities/club';
import { Dialog } from '../../../shared/ui/Dialog';
import { MatchReport } from '../../../features/match-viewer/ui/MatchReport';
import { TabList } from '../../../shared/ui/PageTabs';
import {
  RankChart,
  RankHistoryGraph,
  rankAxis,
  ZoneLegend,
} from '../../../widgets/league-insights/ui/LeagueInsights';
import { seasonName, signed } from '../../../presentation/format';
import {
  divisionName,
  finalZones,
  sameLeague,
  type LeagueChoice,
} from '../../../entities/league/lib/league';
import { LeaguePicker } from '../../../entities/league/ui/LeaguePicker';
import { CompetitionHeader } from '../../../shared/ui/CompetitionTabs';
import { selectReviewWorld } from '../../../shared/lib/liveState';
import {
  finalRows,
  leagueRows,
  seasonRecords,
  seasonSnapshots,
  useSeasonFiles,
  type FinalRow,
  type SeasonRecord,
} from '../../../entities/league/lib/seasonArchive';
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
function FinalTable({
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
  if (!rows)
    return read?.files ? (
      <p className={r.loading}>{richMessage('copy.PastSeason.9be7046661')}</p>
    ) : (
      <Pending read={read} />
    );
  const code = league?.code ?? clubOf(w).country,
    tier = league?.tier ?? season.tier,
    group = league?.group ?? season.group,
    { zones } = finalZones(code, tier, rows.length);
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
              <th scope="col">#</th>
              <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
              <th scope="col">{richMessage('copy.ClubTrends.e8fd75919a')}</th>
              {localizeValue(
                records && (
                  <>
                    <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
                    <th scope="col">{richMessage('result.win')}</th>
                    <th scope="col">{richMessage('result.draw')}</th>
                    <th scope="col">{richMessage('result.loss')}</th>
                  </>
                ),
              )}
              <th scope="col">{richMessage('copy.LeagueInsights.f0e336df20')}</th>
              <th scope="col">{richMessage('copy.LeagueInsights.2b47482006')}</th>
              <th scope="col">{richMessage('copy.CupsView.24734975b3')}</th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              rows.map(([club, points, gf, ga], i) => {
                const id = w.clubs[club]?.id,
                  zone = zones[i],
                  record = records?.get(club);
                return (
                  <tr
                    key={club}
                    data-own={id === w.playerClub || undefined}
                    className={`${id === w.playerClub ? r.own : ''} ${zone ? l[zone] : ''}`}
                  >
                    <td>{localizeValue(i + 1)}</td>
                    <td>
                      {localizeValue(id ? <ClubLink w={w} id={id} crest={14} /> : '—')}
                      {localizeValue(
                        i === 0 && (
                          <span className={r.champion}>
                            {richMessage('copy.CupHistory.31e52393f3')}
                          </span>
                        ),
                      )}
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
                    <td className={r.points}>{localizeValue(points)}</td>
                    {localizeValue(
                      records && (
                        <>
                          <td>{localizeValue(record ? record[0] + record[1] + record[2] : '—')}</td>
                          <td>{localizeValue(record?.[0] ?? '—')}</td>
                          <td>{localizeValue(record?.[1] ?? '—')}</td>
                          <td>{localizeValue(record?.[2] ?? '—')}</td>
                        </>
                      ),
                    )}
                    <td>{localizeValue(gf)}</td>
                    <td>{localizeValue(ga)}</td>
                    <td>{localizeValue(signed(gf - ga))}</td>
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
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const results = games.map((m) => {
    const home = m.home === w.playerClub,
      own = home ? m.score.home : m.score.away,
      other = home ? m.score.away : m.score.home;
    return { m, home, own, other, mark: markOf(own, other) };
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
          <ul className={r.games}>
            {localizeValue(
              results.map(({ m, home, own, other, mark }) => {
                const opponent = home ? m.away : m.home;
                return (
                  <li key={m.id}>
                    <b
                      className={
                        mark === sourceMessage('result.win')
                          ? l.win
                          : mark === sourceMessage('result.loss')
                            ? l.loss
                            : l.draw
                      }
                    >
                      {localizeValue(mark)}
                    </b>
                    <span className={r.gameText}>
                      <small>
                        {richMessage('copy.PastSeason.9006ce531e', {
                          p0: m.round,
                          p1: home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
                        })}
                      </small>
                      <ClubLink w={w} id={opponent} crest={14} />
                    </span>
                    <em
                      aria-label={displayMessage('copy.LeagueInsights.dcb919d17b', {
                        p0: own,
                        p1: other,
                      })}
                    >
                      {localizeValue(own)}–{localizeValue(other)}
                    </em>
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
                  </li>
                );
              }),
            )}
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

/**
 * Our position by round: the live graph while the season's snapshots are kept (about ten
 * seasons), else the ranks archived at the close (rules 1.12.0+) on the same axis.
 */
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
  useTextLocale();
  if (seasonSnapshots(w, season).length) return <RankHistoryGraph w={w} year={season.year} />;
  const ranks = season.ranks,
    code = clubOf(w).country,
    name = clubOf(w).name;
  // The league's size comes with the archived standings.
  if (ranks?.length && !read?.files) return <Pending read={read} />;
  const places = Math.max(clubs ?? 0, ...(ranks ?? [])),
    axis = rankAxis(ranks?.length ?? 0, places);
  return (
    <section
      data-surface="panel"
      className={l.panel}
      aria-label={displayMessage('copy.LeagueInsights.9cfb907bbd')}
    >
      <div className={l.panelHead}>
        <div>
          <h3>{richMessage('copy.LeagueInsights.9cfb907bbd')}</h3>
          <span>
            {richMessage('copy.PastSeason.5535ee5cdd', {
              p0: seasonName(season.year),
              p1: divisionName(code, season.tier, season.group),
            })}
          </span>
        </div>
      </div>
      {localizeValue(
        !ranks?.length ? (
          <p className={l.empty}>{richMessage('copy.PastSeason.a4aeea9842')}</p>
        ) : (
          <>
            <figure className={l.chart}>
              <RankChart
                label={displayMessage('copy.LeagueInsights.1dfecabc18', {
                  p0: name,
                  p1: ranks
                    .map((rank, i) =>
                      sourceMessage('copy.LeagueInsights.d92c13468d', { p0: i + 1, p1: rank }),
                    )
                    .join(', '),
                })}
                axis={axis}
                first={1}
                last={ranks.length}
              >
                <polyline
                  points={ranks.map((rank, i) => `${axis.x(i)},${axis.y(rank)}`).join(' ')}
                  fill="none"
                  stroke="#28654b"
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                />
                {localizeValue(
                  ranks.map((rank, i) => (
                    <circle
                      key={i}
                      cx={axis.x(i)}
                      cy={axis.y(rank)}
                      r={ranks.length > 20 ? 2 : 3}
                      fill="#28654b"
                    >
                      <title>
                        {richMessage('copy.PastSeason.d3d33cbe3b', {
                          p0: name,
                          p1: i + 1,
                          p2: rank,
                        })}
                      </title>
                    </circle>
                  )),
                )}
              </RankChart>
              <figcaption>
                <span>
                  <i className={l.primaryDot} />
                  {localizeValue(name)}
                </span>
                <span>
                  {localizeValue(
                    clubs
                      ? sourceMessage('copy.PastSeason.1a03622513', { p0: clubs })
                      : sourceMessage('copy.PastSeason.e7497c42ed'),
                  )}
                </span>
              </figcaption>
            </figure>
            <details data-ui="disclosure" className={l.details}>
              <summary>{richMessage('copy.PastSeason.90b0c0029a')}</summary>
              <div className={l.tableWrap}>
                <table aria-label={displayMessage('copy.LeagueInsights.b46914c413')}>
                  <thead>
                    <tr>
                      <th scope="col">{richMessage('copy.ClubHub.0fcb288d12')}</th>
                      <th scope="col">{localizeValue(name)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localizeValue(
                      ranks.map((rank, i) => (
                        <tr key={i}>
                          <th scope="row">{localizeValue(i + 1)}</th>
                          <td>{richMessage('copy.BallonDorView.5094d45cea', { p0: rank })}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
            <p className={r.panelNote}>{richMessage('copy.PastSeason.4df937d56d')}</p>
          </>
        ),
      )}
    </section>
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
  const rows = season && finalRows(w, season, read?.files?.season?.standings);
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
  const tableRows = other ? leagueRows(w, read?.files?.season?.standings, other) : rows;
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
                    ['table', sourceMessage('copy.LiveSeason.cfb04aa930')],
                    ['rank', sourceMessage('copy.LiveSeason.352637b1e4')],
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
