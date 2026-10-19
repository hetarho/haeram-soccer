import { CompetitionRecords, UnavailableLeagueRecord } from './CompetitionRecords';
import { Segments } from './Segments';
import { memo, useMemo, useState } from 'react';
import type { MatchRecord, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/world';
import { country } from '../../../../packages/catalogs/src/index';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { ClubLink } from './ClubLink';
import { Dialog } from './Dialog';
import { MatchReport } from './MatchReport';
import { TabList } from './PageTabs';
import { RankChart, RankHistoryGraph, rankAxis, ZoneLegend } from './LeagueInsights';
import { seasonName, signed } from './format';
import { divisionName, sameLeague, type LeagueChoice } from './league';
import { LeaguePicker } from './LeaguePicker';
import { selectReviewWorld } from './liveState';
import {
  finalRows,
  finalZones,
  leagueRows,
  seasonSnapshots,
  useSeasonFiles,
  type FinalRow,
} from './seasonArchive';
import s from './App.module.css';
import t from './LiveSeason.module.css';
import l from './LeagueInsights.module.css';
import r from './SeasonReview.module.css';
import c from './Scorers.module.css';

import { openClubSeason, PAST_TABS, type PastTab } from './state';
export { PAST_TABS, type PastTab };

type Read = ReturnType<typeof useSeasonFiles>;
/** What a tab says while the season's archive loads or after reading it failed. */
function Pending({ read }: { read: Read }) {
  return (
    <p className={r.loading} role={read?.failed ? 'alert' : 'status'}>
      {read?.failed
        ? '경기 기록을 읽지 못했어요. 다시 열어 주세요.'
        : '시즌 경기 기록을 불러오는 중…'}
    </p>
  );
}
const markOf = (own: number, other: number) => (own > other ? '승' : own < other ? '패' : '무');

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
}: {
  w: World;
  season: SeasonArchive;
  rows?: FinalRow[];
  read: Read;
  league?: LeagueChoice;
}) {
  if (!rows)
    return read?.files ? (
      <p className={r.loading}>이 시즌의 최종 순위표는 남아 있지 않아요</p>
    ) : (
      <Pending read={read} />
    );
  const code = league?.code ?? clubOf(w).country,
    tier = league?.tier ?? season.tier,
    group = league?.group ?? season.group,
    { zones, lower } = finalZones(code, tier, rows.length);
  return (
    <section className={r.table} aria-label="최종 순위표">
      <h3>최종 순위표</h3>
      <p className={r.tableMeta}>
        {seasonName(season.year)} · {league && `${country(code).name} `}
        {divisionName(code, tier, group)} · {rows.length}팀
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">클럽</th>
            <th scope="col">승점</th>
            <th scope="col">득</th>
            <th scope="col">실</th>
            <th scope="col">득실</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([club, points, gf, ga], i) => {
            const id = w.clubs[club]?.id,
              zone = zones[i];
            return (
              <tr
                key={club}
                className={`${id === w.playerClub ? r.own : ''} ${zone ? l[zone] : ''}`}
              >
                <td>{i + 1}</td>
                <td>
                  {id ? <ClubLink w={w} id={id} crest={14} /> : '—'}
                  {i === 0 && <span className={r.champion}>우승</span>}
                  {id === w.playerClub && (
                    <small className={r.record}>
                      {season.won}승 {season.drawn}무 {season.lost}패
                    </small>
                  )}
                </td>
                <td>{points}</td>
                <td>{gf}</td>
                <td>{ga}</td>
                <td>{signed(gf - ga)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ZoneLegend zones={zones} lower={lower} closed className={r.zones} />
      <p className={r.footnote}>
        구역은 그 시즌 디비전의 승강 규칙이에요. 승·무·패는 우리 팀만 기록돼요. 다른 클럽은 승점과
        득실만 남아 있어요.
      </p>
    </section>
  );
}

/** Our league games of the season in round order, each opening its match report. */
function OwnMatches({ w, season, read }: { w: World; season: SeasonArchive; read: Read }) {
  const [report, setReport] = useState<MatchRecord>();
  if (!read?.files) return <Pending read={read} />;
  const games = read.files.matches
    .filter((m) => m.kind === 'league' || m.kind === 'lower')
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const results = games.map((m) => {
    const home = m.home === w.playerClub,
      own = home ? m.score.home : m.score.away,
      other = home ? m.score.away : m.score.home;
    return { m, home, own, other, mark: markOf(own, other) };
  });
  const count = (mark: string) => results.filter((result) => result.mark === mark).length;
  return (
    <section className={l.panel} aria-label="우리 리그 경기">
      <div className={l.panelHead}>
        <div>
          <h3>우리 리그 경기</h3>
          <span>
            {seasonName(season.year)} · {games.length}경기 {count('승')}승 {count('무')}무{' '}
            {count('패')}패
          </span>
        </div>
      </div>
      {results.length ? (
        <ul className={r.games}>
          {results.map(({ m, home, own, other, mark }) => {
            const opponent = home ? m.away : m.home;
            return (
              <li key={m.id}>
                <b className={mark === '승' ? l.win : mark === '패' ? l.loss : l.draw}>{mark}</b>
                <span className={r.gameText}>
                  <small>
                    {m.round}라운드 · {home ? '홈' : '원정'}
                  </small>
                  <ClubLink w={w} id={opponent} crest={14} />
                </span>
                <em aria-label={`${own} 대 ${other}`}>
                  {own}–{other}
                </em>
                <button
                  type="button"
                  aria-label={`${m.round}라운드 ${w.clubs.find((club) => club.id === opponent)?.name ?? ''}전 경기 리포트`}
                  onClick={() => setReport(m)}
                >
                  경기 리포트
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={l.empty}>이 시즌에 기록된 우리 리그 경기가 없어요</p>
      )}
      <p className={r.panelNote}>
        우리 경기만 기록돼요. 다른 클럽끼리의 경기 결과는 남아 있지 않아요.
      </p>
      {report && (
        <Dialog label="경기 리포트" onClose={() => setReport(undefined)} wide>
          <MatchReport record={report} w={w} />
        </Dialog>
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
  if (seasonSnapshots(w, season).length) return <RankHistoryGraph w={w} year={season.year} />;
  const ranks = season.ranks,
    code = clubOf(w).country,
    name = clubOf(w).name;
  // The league's size comes with the archived standings; an amateur league never kept one.
  if (ranks?.length && !read?.files) return <Pending read={read} />;
  const places = Math.max(clubs ?? 0, ...(ranks ?? [])),
    axis = rankAxis(ranks?.length ?? 0, places);
  return (
    <section className={l.panel} aria-label="시즌 순위 추이">
      <div className={l.panelHead}>
        <div>
          <h3>시즌 순위 추이</h3>
          <span>
            {seasonName(season.year)} · 당시 {divisionName(code, season.tier, season.group)} · 위로
            올라갈수록 높은 순위
          </span>
        </div>
      </div>
      {!ranks?.length ? (
        <p className={l.empty}>이 시즌의 라운드별 순위는 남아 있지 않아요</p>
      ) : (
        <>
          <figure className={l.chart}>
            <RankChart
              label={`${name} 순위 추이: ${ranks.map((rank, i) => `${i + 1}라운드 ${rank}위`).join(', ')}`}
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
              {ranks.map((rank, i) => (
                <circle
                  key={i}
                  cx={axis.x(i)}
                  cy={axis.y(rank)}
                  r={ranks.length > 20 ? 2 : 3}
                  fill="#28654b"
                >
                  <title>
                    {name} · {i + 1}라운드 {rank}위
                  </title>
                </circle>
              ))}
            </RankChart>
            <figcaption>
              <span>
                <i className={l.primaryDot} />
                {name}
              </span>
              <span>
                {clubs
                  ? `리그 ${clubs}팀`
                  : '리그 규모 기록 없음 · 세로축은 기록된 가장 낮은 순위까지'}
              </span>
            </figcaption>
          </figure>
          <details className={l.details}>
            <summary>라운드별 순위 보기</summary>
            <div className={l.tableWrap}>
              <table aria-label="라운드별 순위 기록">
                <thead>
                  <tr>
                    <th scope="col">라운드</th>
                    <th scope="col">{name}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks.map((rank, i) => (
                    <tr key={i}>
                      <th scope="row">{i + 1}</th>
                      <td>{rank}위</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className={r.panelNote}>
            이 시즌은 라운드마다 우리 순위만 남아 있어요. 다른 클럽의 순위와 승점은 기록되지
            않았어요.
          </p>
        </>
      )}
    </section>
  );
}

/** The league's ten leading scorers as archived at the close (rules 1.12.0+). */
function SeasonScorers({ w, season, read }: { w: World; season: SeasonArchive; read: Read }) {
  if (!read?.files) return <Pending read={read} />;
  const scorers = read.files.season?.scorers,
    top = scorers?.[0];
  return (
    <section className={c.panel} aria-label="지난 시즌 득점왕">
      <div className={c.head}>
        <div>
          <h3>시즌 득점 순위</h3>
          <p>
            {seasonName(season.year)} · 우리 리그 · 상위 {scorers?.length ?? 0}명
          </p>
        </div>
        {top && (
          <span className={c.tag}>
            득점왕 {top.name} · {top.goals}골
          </span>
        )}
      </div>
      {!scorers ? (
        <p className={c.empty}>이 시즌의 득점 순위는 남아 있지 않아요</p>
      ) : !top ? (
        <p className={c.empty}>이 시즌에 기록된 리그 득점이 없어요</p>
      ) : (
        <>
          <div className={c.tableWrap}>
            <table className={`${c.standings} ${r.scorers}`} aria-label="지난 시즌 득점 순위">
              <thead>
                <tr>
                  <th scope="col">순위</th>
                  <th scope="col">선수</th>
                  <th scope="col">클럽</th>
                  <th scope="col">골</th>
                  <th scope="col">경기</th>
                  <th scope="col">경기당</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map((player, i) => {
                  const club = w.clubs[player.club],
                    ours = club?.id === w.playerClub,
                    // Goals, then fewer appearances, decide the Golden Boot.
                    king = player.goals === top.goals && player.appearances === top.appearances;
                  return (
                    <tr key={i} className={`${ours ? c.own : ''} ${king ? r.king : ''}`}>
                      <td>{i + 1}</td>
                      <th scope="row" className={c.player}>
                        {player.name}
                        {(king || ours) && (
                          <span className={r.tags}>
                            {king && <b className={r.crown}>득점왕</b>}
                            {ours && <b>우리 팀</b>}
                          </span>
                        )}
                      </th>
                      <td className={c.club}>
                        {player.clubs ? (
                          player.clubs.map((part) => (
                            <span key={part.club}>
                              {w.clubs[part.club] ? (
                                <ClubLink w={w} id={w.clubs[part.club].id} crest={14} />
                              ) : (
                                '—'
                              )}{' '}
                              {part.goals}골 · {part.appearances}경기
                              <br />
                            </span>
                          ))
                        ) : club ? (
                          <ClubLink w={w} id={club.id} crest={14} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={c.goals}>{player.goals}</td>
                      <td>{player.appearances}</td>
                      <td>
                        {player.appearances ? (player.goals / player.appearances).toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={c.note}>
            리그 득점만 집계해요. 시즌을 마칠 때 상위 10명을 보관해요. 동률: 적은 출전 수 → 선수 ID.
          </p>
        </>
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
}: {
  client: GameClient;
  year: number;
  tab: PastTab;
  onTab: (tab: PastTab) => void;
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  teamPart: 'table' | 'rank';
  onTeamPart: (value: 'table' | 'rank') => void;
  playerPart: 'scorers' | 'trend';
  onPlayerPart: (value: 'scorers' | 'trend') => void;
}) {
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
  const tableRows = other ? leagueRows(w, read?.files?.season?.standings, other) : rows;
  if (!season)
    return (
      <section className={`${s.seasonPane} ${t.pane}`} aria-label="시즌 결산">
        <p>선택한 시즌의 기록이 없어요.</p>
      </section>
    );
  return (
    <>
      <div className={s.competitionScope} aria-label="선택한 리그와 시즌">
        <b>
          {seasonName(year)} ·{' '}
          {divisionName(
            (league ?? ownThen!).code,
            (league ?? ownThen!).tier,
            (league ?? ownThen!).group,
          )}
        </b>
        <LeaguePicker league={league} onLeague={onLeague} own={ownThen} />
        <button type="button" onClick={() => openClubSeason(year)}>
          우리 구단의 이 시즌 기록
        </button>
      </div>
      {/* Pinned like the live tabs; the season list above them scrolls away. */}
      <div className={t.navigation}>
        <TabList
          tabs={PAST_TABS}
          value={tab}
          onChange={onTab}
          label="지난 시즌 보기"
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
        {tab === 'table' ? (
          <FinalTable w={w} season={season} rows={tableRows} read={read} league={other} />
        ) : tab === 'matches' ? (
          other ? (
            <UnavailableLeagueRecord
              league={other}
              label="이전 라운드 경기 결과"
              onOwn={() => onLeague(undefined)}
            />
          ) : (
            <OwnMatches w={w} season={season} read={read} />
          )
        ) : tab === 'rank' ? (
          <>
            <Segments
              label="팀 기록 보기"
              options={
                [
                  ['table', '팀 성적'],
                  ['rank', '순위 추이'],
                ] as const
              }
              value={teamPart}
              onChange={onTeamPart}
            />
            {teamPart === 'table' ? (
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
                label="라운드별 순위 추이"
                onOwn={() => onLeague(undefined)}
              />
            ) : (
              <SeasonRanks w={w} season={season} clubs={rows?.length} read={read} />
            )}
          </>
        ) : (
          <>
            <Segments
              label="선수 기록 보기"
              options={
                [
                  ['scorers', '득점 순위'],
                  ['trend', '득점왕 추이'],
                ] as const
              }
              value={playerPart}
              onChange={onPlayerPart}
            />
            {other ? (
              <UnavailableLeagueRecord
                league={other}
                label="선수별 득점 기록"
                onOwn={() => onLeague(undefined)}
              />
            ) : playerPart === 'trend' ? (
              <p>
                이 시즌의 선수별 라운드 추이는 보관되어 있지 않아요. 득점 순위에서 보관된 최종 상위
                기록을 확인하세요.
              </p>
            ) : (
              <SeasonScorers w={w} season={season} read={read} />
            )}
          </>
        )}
      </section>
    </>
  );
});
