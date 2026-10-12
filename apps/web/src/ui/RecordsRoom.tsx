import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { tacticLabel } from '../../../../packages/engine/src/world';
import type { ClientState, GameClient } from '../runtime/client';
import type { Reply } from '../runtime/protocol';
import { Panel } from './App';
import { AnalysisExport } from './AnalysisExport';
import { CareerRecordBook, ClubLeaders, TrophyCabinet } from './CareerRecordBook';
import { divisionName } from './careerRecords';
import { ClubLink } from './ClubLink';
import { ClubTrends, EloStanding, SeasonTable, useEloStanding } from './ClubTrends';
import { Dialog } from './Dialog';
import { kindLabel, number, seasonName } from './format';
import { Money } from './Money';
import { Pitch } from './Pitch';
import { PlayerLink } from './PlayerSheet';
import { archivePlayback } from './replay';
import { SeasonAnalysis } from './SeasonAnalysis';
import { Select } from './Select';
import { RECORD_TABS, type RecordTab } from './state';
import s from './App.module.css';

type Props = { state: ClientState; client: GameClient };
type Archive = NonNullable<Reply['archive']>;
type ArchiveResult = { world: string; year: number; data?: Archive; error?: string };

/** The records tab in the page's address, so a reload keeps it. */
function savedRecordTab() {
  const saved = new URLSearchParams(location.search).get('view');
  return RECORD_TABS.find(([id]) => id === saved)?.[0];
}

/**
 * One season's archive with its own matches and events, plus every manager event. It is fetched
 * only while a tab reads it and again whenever the world moves on; the last reply for the same
 * world and season stays on screen until the next one lands, so a running clock never blanks it.
 */
function useSeasonArchive(client: GameClient, w: World, year: number, enabled: boolean) {
  const [result, setResult] = useState<ArchiveResult>();
  useEffect(() => {
    if (!enabled) return;
    let valid = true;
    const failed = '시즌 기록을 읽지 못했어요. 시즌을 다시 선택해보세요.',
      world = w.id;
    void client
      .archive(year)
      .then((data) => {
        if (valid) setResult({ world, year, data, error: data ? undefined : failed });
      })
      .catch(() => {
        if (valid) setResult({ world, year, error: failed });
      });
    return () => {
      valid = false;
    };
  }, [client, w.id, w.revision, year, enabled]);
  return result?.world === w.id && result.year === year ? result : undefined;
}

/**
 * The club records room as one tab bar instead of a long scroll: the trophy cabinet, Elo and
 * records first, then the trend charts, the all-time player boards, one season at a time and the
 * managers. The tab stays in the address (?view=, left out for the first tab).
 */
export function RecordsRoom({ state, client }: Props) {
  const w = state.view!.world;
  const [tab, setTab] = useState<RecordTab>(() => savedRecordTab() ?? 'summary');
  const [year, setYear] = useState(w.year);
  const archive = useSeasonArchive(client, w, year, tab === 'season' || tab === 'managers');
  useEffect(() => {
    const url = new URL(location.href);
    if (tab === 'summary') url.searchParams.delete('view');
    else url.searchParams.set('view', tab);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? RECORD_TABS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + RECORD_TABS.length) %
            RECORD_TABS.length;
    setTab(RECORD_TABS[next][0]);
    document.getElementById(`records-tab-${RECORD_TABS[next][0]}`)?.focus();
  };
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <div className={s.eyebrow}>ARCHIVE</div>
          <h2>클럽 기록실</h2>
          <p>시즌과 선수, 경기와 장부. 그때의 숫자를 그대로 펼쳐봐요.</p>
        </div>
      </div>
      <div
        className={`${s.seasonTabs} ${s.operationsTabs}`}
        role="tablist"
        aria-label="기록실 보기"
      >
        {RECORD_TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`records-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="records-panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => keyboard(event, index)}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="records-panel"
        className={s.recordStack}
        role="tabpanel"
        aria-labelledby={`records-tab-${tab}`}
      >
        {tab === 'summary' ? (
          <Summary
            w={w}
            onSeason={(season) => {
              setYear(season);
              setTab('season');
              document.getElementById('records-tab-season')?.scrollIntoView({ block: 'nearest' });
            }}
          />
        ) : tab === 'trends' ? (
          <ClubTrends w={w} />
        ) : tab === 'players' ? (
          <ClubLeaders w={w} />
        ) : tab === 'season' ? (
          <SeasonRecords
            state={state}
            year={year}
            onYear={setYear}
            archive={archive?.data}
            error={archive?.error}
          />
        ) : (
          <ManagerSeasons w={w} archive={archive?.data} error={archive?.error} />
        )}
      </div>
    </>
  );
}

/**
 * The front of the records room: honours, where our Elo stands, the record book and the seasons;
 * a season's row opens it in 시즌 기록.
 */
function Summary({ w, onSeason }: { w: World; onSeason: (year: number) => void }) {
  const standing = useEloStanding(w);
  return (
    <>
      <TrophyCabinet w={w} />
      <Panel title="클럽 Elo 위치" note={`${number(standing.total)}개 클럽 기준 · 지금`}>
        <div className={s.panelBody}>
          <EloStanding w={w} standing={standing} />
        </div>
      </Panel>
      <CareerRecordBook w={w} />
      <SeasonTable w={w} onSeason={onSeason} />
    </>
  );
}

/** The managers' seasons: every hiring and departure, then the man in charge now. */
function ManagerSeasons({ w, archive, error }: { w: World; archive?: Archive; error?: string }) {
  return (
    <Panel title="감독들이 남긴 계절">
      <div className={s.panelBody}>
        {!archive && (
          <p className={s.muted} role={error ? 'alert' : 'status'}>
            {error || '감독 기록을 펼치는 중…'}
          </p>
        )}
        <ul className={s.timeline}>
          {archive?.managers
            .filter((e) => e.kind === 'manager-hire' || e.kind === 'manager-departure')
            .map((e, i) => (
              <li key={i}>
                <small>
                  {e.year} · ROUND {e.round}
                </small>
                <b>{e.title}</b>
                <p>{e.detail}</p>
              </li>
            ))}
          <li>
            <b>{w.manager.name} · 현재</b>
            <p>
              {w.manager.since}년부터 · {tacticLabel[w.manager.philosophy]}
            </p>
          </li>
        </ul>
      </div>
    </Panel>
  );
}

/**
 * Everything one season kept: its stats and analysis, the matches, continental honours, every
 * country's league that year and the club's decisions.
 */
function SeasonRecords({
  state,
  year,
  onYear,
  archive,
  error,
}: {
  state: ClientState;
  year: number;
  onYear: (year: number) => void;
  archive?: Archive;
  error?: string;
}) {
  const w = state.view!.world,
    c = w.clubs.find((club) => club.id === w.playerClub)!,
    [match, setMatch] = useState<MatchRecord>(),
    [filter, setFilter] = useState('all'),
    [historicalCode, setHistoricalCode] = useState(c.country),
    [tier, setTier] = useState(0),
    [historicalGroup, setHistoricalGroup] = useState(0);
  const matches = archive?.matches.filter((m) => filter === 'all' || m.kind === filter) || [],
    h = archive?.season;
  const rows =
    h?.standings
      .filter(
        (row) =>
          w.clubs[row[0]].country === historicalCode &&
          row[1] === tier &&
          row[2] === historicalGroup,
      )
      .sort((a, b) => b[3] - a[3] || b[4] - b[5] - (a[4] - a[5]) || b[4] - a[4] || a[0] - b[0]) ||
    [];
  const f = (n: string, y = year) => <Money value={n} code={c.country} year={y} />;
  const scope = filter === 'all' ? '모든 대회' : kindLabel[filter];
  return (
    <>
      <div className={s.filters}>
        <label>
          시즌{' '}
          <Select
            aria-label="기록 시즌"
            value={year}
            onValueChange={(value) => onYear(Number(value))}
          >
            {[...w.history.map((h) => h.year), w.year].reverse().map((y) => (
              <option key={y} value={y}>
                {seasonName(y)}
                {y === w.year ? ' 진행 중' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label>
          대회 범위{' '}
          <Select
            aria-label="기록 대회 범위"
            value={filter}
            onValueChange={(value) => setFilter(value)}
          >
            <option value="all">모든 대회</option>
            {Object.entries(kindLabel).map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        <span className={s.pill}>
          {matches.length}경기 · 전체 {state.view!.totalMatches}경기 보존
        </span>
      </div>
      {h && (
        <div className={s.stats}>
          {(
            [
              [
                '리그 성적',
                `${divisionName(c.country, h.tier, h.group)} ${h.rank}위 · ${h.points}pts`,
              ],
              ['서포터', number(h.fans)],
              ['당시 자금', f(h.cash)],
              ['당시 손익', f((BigInt(h.income) - BigInt(h.expense)).toString())],
            ] as [string, ReactNode][]
          ).map(([label, value]) => (
            <div className={s.stat} key={label}>
              <div className={s.label}>{label}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {archive ? (
        <SeasonAnalysis records={matches} club={w.playerClub} year={year} scope={scope} />
      ) : (
        <p className={s.muted} role={error ? 'alert' : 'status'}>
          {error || '선택한 시즌 기록을 펼치는 중…'}
        </p>
      )}
      <AnalysisExport w={w} records={matches} year={year} scope={scope} ready={!!archive} />
      <Panel title="경기의 페이지" note={seasonName(year)}>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>라운드</th>
                <th>홈 클럽</th>
                <th>결과</th>
                <th>원정 클럽</th>
                <th>대회</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>{m.round}</td>
                  <td>
                    <ClubLink w={w} id={m.home} crest={14} />
                  </td>
                  <td>
                    <b>
                      {m.score.home}–{m.score.away}
                    </b>
                  </td>
                  <td>
                    <ClubLink w={w} id={m.away} crest={14} />
                  </td>
                  <td>{kindLabel[m.kind]}</td>
                  <td>
                    <button onClick={() => setMatch(m)}>경기 기록 보기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {archive && !matches.length && (
            <div className={s.empty}>아직 기록된 경기가 없습니다.</div>
          )}
        </div>
      </Panel>
      {h && (
        <>
          <Panel title="클럽대항전 우승과 순위" note="HISTORICAL HONORS">
            <div className={s.panelBody}>
              {h.europe.length ? (
                h.europe.map((e) => (
                  <details key={e.kind} style={{ marginBottom: 14 }}>
                    <summary>
                      <b>{e.name}</b> · {w.clubs.find((c) => c.id === e.winner)?.name} 우승 ·{' '}
                      {e.field}팀
                    </summary>
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>참가 클럽</th>
                            <th>경기</th>
                            <th>승점</th>
                            <th>득점</th>
                            <th>실점</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.standings?.map((row) => (
                            <tr key={row[0]}>
                              <td>{row[1]}</td>
                              <td>
                                <ClubLink w={w} id={w.clubs[row[0]].id} crest={14} />
                              </td>
                              <td>{row[2]}</td>
                              <td>{row[3]}</td>
                              <td>{row[4]}</td>
                              <td>{row[5]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {e.secondStandings && (
                      <p className={s.muted}>
                        2차 조별 단계 {e.secondStandings.length}개 클럽 기록도 저장되어 있습니다.
                      </p>
                    )}
                  </details>
                ))
              ) : (
                <p className={s.muted}>아직 클럽대항전 창설 이전의 시즌입니다.</p>
              )}
            </div>
          </Panel>
          <Panel title="그해의 각국 리그">
            <div className={s.panelBody}>
              <div className={s.filters}>
                <label>
                  국가{' '}
                  <Select
                    aria-label="과거 국가"
                    value={historicalCode}
                    onValueChange={(value) => {
                      setHistoricalCode(value);
                      setTier(0);
                      setHistoricalGroup(0);
                    }}
                  >
                    {h.champions.map((ch) => (
                      <option key={ch.country} value={ch.country}>
                        {country(ch.country).name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  디비전{' '}
                  <Select
                    aria-label="과거 디비전"
                    value={tier}
                    onValueChange={(value) => {
                      setTier(Number(value));
                      setHistoricalGroup(0);
                    }}
                  >
                    {country(historicalCode).groups.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}부
                      </option>
                    ))}
                  </Select>
                </label>
                {country(historicalCode).groups[tier].length > 1 && (
                  <label>
                    지역 그룹{' '}
                    <Select
                      aria-label="과거 지역 그룹"
                      value={historicalGroup}
                      onValueChange={(value) => setHistoricalGroup(Number(value))}
                    >
                      {country(historicalCode).groups[tier].map((_, i) => (
                        <option key={i} value={i}>
                          {String.fromCharCode(65 + i)}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <p className={s.muted}>
                리그 우승{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.club,
                  )?.name
                }{' '}
                · 국내 컵{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.cup,
                  )?.name
                }
              </p>
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>클럽</th>
                      <th>그룹</th>
                      <th>승점</th>
                      <th>득점</th>
                      <th>실점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row[0]}
                        className={w.clubs[row[0]].id === w.playerClub ? s.own : undefined}
                      >
                        <td>{i + 1}</td>
                        <td>
                          <ClubLink w={w} id={w.clubs[row[0]].id} crest={14} />
                        </td>
                        <td>{String.fromCharCode(65 + row[2])}</td>
                        <td>{row[3]}</td>
                        <td>{row[4]}</td>
                        <td>{row[5]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </>
      )}
      <Panel title="그해의 결정들">
        <div className={s.panelBody}>
          <ul className={s.timeline}>
            {archive?.events
              .filter((e) => e.kind !== 'gate')
              .map((e, i) => (
                <li key={i}>
                  <small>
                    {e.year} · ROUND {e.round}{' '}
                    {e.amount && `· ${e.amount} ${e.currency} (원래 최소 단위)`}
                  </small>
                  <b>{e.title}</b>
                  <p>{e.detail}</p>
                </li>
              ))}
          </ul>
        </div>
      </Panel>
      {match && <MatchSheet w={w} match={match} onClose={() => setMatch(undefined)} />}
    </>
  );
}

/** A past match replayed from its stored goals, with our players' lines. */
function MatchSheet({ w, match, onClose }: { w: World; match: MatchRecord; onClose: () => void }) {
  return (
    <Dialog label="지난 경기 상세" onClose={onClose} wide>
      <button onClick={onClose}>닫기</button>
      <h2>
        {seasonName(match.year)} · {kindLabel[match.kind]}
      </h2>
      <Pitch playback={archivePlayback(match)} summary world={w} />
      <h3>선수별 기록 · 우리 클럽</h3>
      <div className={s.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>득점</th>
              <th>선수</th>
              <th>도움</th>
              <th>패스 성공/시도</th>
              <th>슈팅/유효</th>
              <th>태클</th>
              <th>선방</th>
            </tr>
          </thead>
          <tbody>
            {match.players.map((p) => {
              const player = w.players.find((owned) => owned.id === p.id);
              return (
                <tr key={p.id}>
                  <td>{p.metrics[0]}</td>
                  <td>{player && <PlayerLink id={player.id} name={player.name} />}</td>
                  <td>{p.metrics[1]}</td>
                  <td>
                    {p.metrics[3]}/{p.metrics[2]}
                  </td>
                  <td>
                    {p.metrics[4]}/{p.metrics[5]}
                  </td>
                  <td>{p.metrics[6]}</td>
                  <td>{p.metrics[9]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.muted}>
        전체 경기 기록은 보존됩니다. 과거 관전에서는 저장된 골 이벤트를 재생하며, 상세 분 단위
        패스와 이동 경로는 저장하지 않습니다.
      </p>
    </Dialog>
  );
}
