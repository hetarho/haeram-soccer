import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { tacticLabel } from '../../../../packages/engine/src/world';
import type { ClientState, GameClient } from '../runtime/client';
import type { ClubRecords, RecordMatch, Run } from '../runtime/clubRecords';
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
import { Segments } from './Segments';
import { Select } from './Select';
import { openLeagueSeason, RECORD_TABS, type RecordTab } from './state';
import a from './Analysis.module.css';
import s from './App.module.css';
import t from './LiveSeason.module.css';

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
 * only while a tab reads it; the season in progress is read again whenever the world moves on,
 * while a closed season's archive never changes, so a fast clock never keeps cancelling its read.
 * The last reply for the same world and season stays on screen until the next one lands, so a
 * running clock never blanks it.
 */
function useSeasonArchive(client: GameClient, w: World, year: number, enabled: boolean) {
  const [result, setResult] = useState<ArchiveResult>();
  const revision = year === w.year ? w.revision : undefined;
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
  }, [client, w.id, revision, year, enabled]);
  return result?.world === w.id && result.year === year ? result : undefined;
}

/**
 * The club records room (→WEB-54): only our club's records, one view at a time under a pinned tab
 * bar — honours, Elo and the record book; one trend chart and the season table; one all-time
 * board; one season of ours; the managers. The tab stays in the address (?view=, left out for the
 * first tab). A season row opens that season on the league page.
 */
export function RecordsRoom({ state, client }: Props) {
  const w = state.view!.world;
  const [tab, setTab] = useState<RecordTab>(() => savedRecordTab() ?? 'summary');
  const [year, setYear] = useState(w.year);
  // The managers read every manager event, which only the season in progress keeps current.
  const archive = useSeasonArchive(
    client,
    w,
    tab === 'managers' ? w.year : year,
    tab === 'season' || tab === 'managers',
  );
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
          <p>우리 클럽의 시즌과 선수, 경기와 결정. 그때의 숫자를 그대로 펼쳐봐요.</p>
        </div>
      </div>
      <div className={s.recordsNav}>
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
      </div>
      <div
        id="records-panel"
        className={s.recordStack}
        role="tabpanel"
        aria-labelledby={`records-tab-${tab}`}
      >
        {tab === 'summary' ? (
          <Summary w={w} client={client} totalMatches={state.view!.totalMatches} />
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

/** The front of the records room: honours beside where our Elo stands, then the record book. */
const SUMMARY_PARTS = [
  ['trophies', '트로피'],
  ['elo', 'Elo'],
  ['seasons', '시즌별 기록'],
  ['records', '기타 기록'],
] as const;
type SummaryPart = (typeof SUMMARY_PARTS)[number][0];

/**
 * The front of the records room (→WEB-54), one part at a time: the trophy cabinet, where our Elo
 * stands, the season table (a row opens that season on the league page) and the other records.
 */
function Summary({
  w,
  client,
  totalMatches,
}: {
  w: World;
  client: GameClient;
  totalMatches: number;
}) {
  const [part, setPart] = useState<SummaryPart>('trophies');
  return (
    <>
      <div className={s.recordControls}>
        <Segments label="요약 보기" options={SUMMARY_PARTS} value={part} onChange={setPart} />
      </div>
      {part === 'trophies' ? (
        <TrophyCabinet w={w} />
      ) : part === 'elo' ? (
        <EloPanel w={w} />
      ) : part === 'seasons' ? (
        <SeasonTable w={w} onSeason={openLeagueSeason} />
      ) : (
        <>
          <MatchRecords w={w} client={client} totalMatches={totalMatches} />
          <CareerRecordBook w={w} />
        </>
      )}
    </>
  );
}

function EloPanel({ w }: { w: World }) {
  const standing = useEloStanding(w);
  return (
    <Panel title="클럽 Elo 위치" note={`${number(standing.total)}개 클럽 기준 · 지금`}>
      <div className={s.panelBody}>
        <EloStanding w={w} standing={standing} />
      </div>
    </Panel>
  );
}

/**
 * Our match records over every own match (→WEB-54), read from the worker, which keeps every
 * match; read again whenever another match is played.
 */
function MatchRecords({
  w,
  client,
  totalMatches,
}: {
  w: World;
  client: GameClient;
  totalMatches: number;
}) {
  const [read, setRead] = useState<{ world: string; records?: ClubRecords; failed?: boolean }>();
  useEffect(() => {
    let valid = true;
    const world = w.id;
    client.clubRecords().then(
      (records) => valid && setRead({ world, records }),
      () => valid && setRead({ world, failed: true }),
    );
    return () => {
      valid = false;
    };
  }, [client, w.id, totalMatches]);
  const records = read?.world === w.id ? read.records : undefined;
  const match = (m?: RecordMatch) =>
    m && (
      <>
        <b>
          {m.own}–{m.other}
        </b>
        <ClubLink w={w} id={m.opponent} crest={14} />
        <p className={a.note}>
          {seasonName(m.year)} · {kindLabel[m.kind]} R{m.round} · {m.home ? '홈' : '원정'}
        </p>
      </>
    );
  const run = (r: Run, unit: string) =>
    r.length > 0 &&
    r.from &&
    r.to && (
      <>
        <b>
          {r.length}
          {unit}
        </b>
        <p className={a.note}>
          {seasonName(r.from.year)} R{r.from.round} → {seasonName(r.to.year)} R{r.to.round}
          {r.live ? ' · 진행 중' : ''}
        </p>
      </>
    );
  const cards: [string, ReactNode][] = records
    ? [
        ['최다 골차 승리', match(records.biggestWin)],
        ['최다 골차 패배', match(records.biggestLoss)],
        ['한 경기 최다 득점', match(records.mostScored)],
        ['최다 연승', run(records.winning, '연승')],
        ['최장 무패', run(records.unbeaten, '경기')],
        ['최다 연속 무실점', run(records.cleanSheets, '경기')],
        ['최다 연패', run(records.losing, '연패')],
        ['최장 무승', run(records.winless, '경기')],
      ]
    : [];
  return (
    <Panel title="경기 기록" note={records ? `공식전 ${number(records.played)}경기` : undefined}>
      <section className={`${s.panelBody} ${a.book}`} aria-label="경기 기록">
        {!records ? (
          <p className={s.muted} role={read?.failed ? 'alert' : 'status'}>
            {read?.failed ? '경기 기록을 읽지 못했어요.' : '경기 기록을 모으는 중…'}
          </p>
        ) : records.played ? (
          <div className={a.cards}>
            {cards.map(([label, body]) => (
              <article key={label} aria-label={label}>
                <h4>{label}</h4>
                {body || <p className={a.note}>아직 없어요.</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className={s.muted}>첫 공식전이 끝나면 경기 기록이 시작돼요.</p>
        )}
        <p className={a.note}>
          모든 대회의 정규 90분 결과예요. 승부차기로 가린 경기는 무승부로 세고, 연속 기록은 시즌을
          넘어 이어져요.
        </p>
      </section>
    </Panel>
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

const SEASON_PARTS = [
  ['overview', '개요'],
  ['matches', '경기'],
  ['decisions', '결정'],
] as const;
type SeasonPart = (typeof SEASON_PARTS)[number][0];

/**
 * One season of ours (→WEB-54): arrows around the season list and the competition filter, then
 * one part at a time — the season's figures, analysis and export; our matches; the club's
 * decisions. Other clubs' tables live on the league page and in the cups history.
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
    [part, setPart] = useState<SeasonPart>('overview');
  const matches = archive?.matches.filter((m) => filter === 'all' || m.kind === filter) || [],
    h = archive?.season;
  // Oldest first; the season in progress is the last stop.
  const years = [...w.history.map((season) => season.year), w.year],
    at = Math.max(0, years.indexOf(year));
  const f = (n: string, y = year) => <Money value={n} code={c.country} year={y} />;
  const scope = filter === 'all' ? '모든 대회' : kindLabel[filter];
  const pending = !archive && (
    <p className={s.muted} role={error ? 'alert' : 'status'}>
      {error || '선택한 시즌 기록을 펼치는 중…'}
    </p>
  );
  return (
    <>
      <div className={s.recordControls}>
        <div className={s.seasonBar}>
          <div
            className={`${t.seasonPicker} ${s.recordSeason}`}
            role="group"
            aria-label="기록 시즌 선택"
          >
            <button
              type="button"
              className={t.seasonStep}
              aria-label="이전 기록 시즌"
              disabled={at === 0}
              onClick={() => onYear(years[at - 1])}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <Select
              aria-label="기록 시즌"
              className={t.seasonSelect}
              value={year}
              onValueChange={(value) => onYear(Number(value))}
            >
              {[...years].reverse().map((y) => (
                <option key={y} value={y}>
                  {seasonName(y)}
                  {y === w.year ? ' 진행 중' : ''}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className={t.seasonStep}
              aria-label="다음 기록 시즌"
              disabled={at === years.length - 1}
              onClick={() => onYear(years[at + 1])}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          <label>
            대회 범위{' '}
            <Select
              aria-label="기록 대회 범위"
              value={filter}
              onValueChange={(value) => setFilter(value)}
            >
              <option value="all">모든 대회</option>
              {Object.entries(kindLabel).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <span className={s.pill}>
            {matches.length}경기 · 전체 {state.view!.totalMatches}경기 보존
          </span>
        </div>
        <Segments label="시즌 기록 보기" options={SEASON_PARTS} value={part} onChange={setPart} />
      </div>
      {part === 'overview' ? (
        <>
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
          {archive ? <SeasonAnalysis w={w} records={matches} year={year} scope={scope} /> : pending}
          <AnalysisExport w={w} records={matches} year={year} scope={scope} ready={!!archive} />
        </>
      ) : part === 'matches' ? (
        <>
          {pending}
          <Panel title="경기의 페이지" note={`${seasonName(year)} · ${scope}`}>
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
        </>
      ) : (
        <>
          {pending}
          <Panel title="그해의 결정들" note={seasonName(year)}>
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
              {archive && !archive.events.some((e) => e.kind !== 'gate') && (
                <div className={s.empty}>이 시즌에 기록된 결정이 없어요.</div>
              )}
            </div>
          </Panel>
        </>
      )}
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
