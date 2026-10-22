import { useTaskMemory, useTaskState } from './taskMemory';
import { SeasonReview } from './SeasonReview';
import { PixelIcon } from './PixelIcon';
import { useEffect, useState, type ReactNode } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { readBuildTitle } from '../../../../packages/engine/src/build';
import { tacticLabel } from '../../../../packages/engine/src/world';
import type { ClientState, GameClient } from '../runtime/client';
import type { ClubRecords, RecordMatch, Run } from '../runtime/clubRecords';
import type { Reply } from '../runtime/protocol';
import { Panel } from './App';
import { AnalysisExport } from './AnalysisExport';
import { CareerRecordBook, ClubLeaders, TrophyCabinet } from './CareerRecordBook';
import { divisionName } from './careerRecords';
import { ClubLink } from './ClubLink';
import { ClubTrends, SeasonTable } from './ClubTrends';
import { Dialog } from './Dialog';
import { kindLabel, number, seasonName } from './format';
import { Money } from './Money';
import { replaceQuery, TabList, useAddressTab } from './PageTabs';
import { Pitch } from './Pitch';
import { PlayerLink } from './PlayerSheet';
import { archivePlayback } from './replay';
import { SeasonAnalysis } from './SeasonAnalysis';
import { Segments } from './Segments';
import { Select } from './Select';
import {
  openLeagueSeason,
  openCupSeason,
  useRecordRequest,
  RECORD_TABS,
  type RecordTab,
} from './state';
import a from './Analysis.module.css';
import s from './App.module.css';
import t from './LiveSeason.module.css';

type Props = { state: ClientState; client: GameClient };
type Archive = NonNullable<Reply['archive']>;
type ArchiveResult = { world: string; year: number; data?: Archive; error?: string };

/** The records tab an older address asks for: ?view=summary by its part, ?view=season. */
function olderRecordTab(params: URLSearchParams): RecordTab | undefined {
  const saved = params.get('view');
  if (saved === 'summary')
    return params.get('part') === 'elo'
      ? 'trends'
      : params.get('part') === 'seasons'
        ? 'seasons'
        : 'honours';
  return saved === 'season' ? 'seasons' : undefined;
}
function savedRecordYear(w: World) {
  const params = new URLSearchParams(location.search),
    raw = params.get('season');
  const year = raw ? Number(raw) : params.get('view') === 'season' ? w.year : undefined;
  return year === w.year || w.history.some((season) => season.year === year) ? year : undefined;
}
function recordScroll(value: number) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[data-testid="view-scroller"]')?.scrollTo(0, value),
  );
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

/** Club seasons lead to their own analysis; competition tables are explicit contextual visits. */
export function RecordsRoom({ state, client }: Props) {
  const w = state.view!.world;
  // The records tab stays in the page's address, so a reload keeps it.
  const [tab, setTab] = useAddressTab('view', RECORD_TABS, 'seasons', {
    world: w.id,
    key: 'records-tab',
    older: olderRecordTab,
  });
  const [year, setYear] = useTaskState<number | undefined>(w.id, 'records-year', () =>
    savedRecordYear(w),
  );
  const request = useRecordRequest((store) => store.request);
  const openSeason = (picked: number) => {
    const root = document.querySelector<HTMLElement>('[data-testid="view-scroller"]');
    if (year === undefined)
      useTaskMemory.setState((memory) => ({
        scrolls: { ...memory.scrolls, 'record-list': root?.scrollTop ?? 0 },
      }));
    setTab('seasons');
    setYear(picked);
    history.pushState(null, '', `/history?season=${picked}`);
    recordScroll(0);
  };
  useEffect(() => {
    if (!request) return;
    useRecordRequest.getState().take();
    setTab('seasons');
    setYear(request.year);
    recordScroll(0);
  }, [request, setTab, setYear]);
  useEffect(() => {
    const restore = () => setYear(savedRecordYear(w));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [w.id, w.year, setYear]);
  // The managers read every manager event, which only the season in progress keeps current.
  const archive = useSeasonArchive(
    client,
    w,
    tab === 'managers' ? w.year : (year ?? w.year),
    (tab === 'seasons' && year !== undefined) || tab === 'managers',
  );
  useEffect(
    () =>
      replaceQuery((params) => {
        if (tab === 'seasons' && year !== undefined) params.set('season', String(year));
        else for (const param of ['season', 'part', 'competition']) params.delete(param);
      }),
    [tab, year],
  );
  const selectTab = (next: RecordTab) => {
    setTab(next);
    if (next === 'seasons') setYear(undefined);
    recordScroll(0);
  };
  return (
    <>
      <h2 className={s.srOnly}>클럽 기록실</h2>
      <div className={s.recordsNav}>
        <TabList
          tabs={RECORD_TABS}
          value={tab}
          onChange={selectTab}
          label="기록실 보기"
          idPrefix="records"
        />
      </div>
      <div
        id="records-panel"
        className={s.recordStack}
        role="tabpanel"
        aria-labelledby={`records-tab-${tab}`}
      >
        {tab === 'seasons' ? (
          year === undefined ? (
            <SeasonTable w={w} onSeason={openSeason} />
          ) : (
            <>
              <div className={s.recordControls}>
                <button
                  type="button"
                  onClick={() => {
                    setYear(undefined);
                    history.pushState(null, '', '/history');
                    recordScroll(useTaskMemory.getState().scrolls['record-list'] ?? 0);
                  }}
                >
                  ← 시즌 목록으로
                </button>
                <h3>
                  {seasonName(year)} · 구단 시즌 기록{year === w.year ? ' · 진행 중' : ''}
                </h3>
                <div className={s.playerActions}>
                  <button type="button" onClick={() => openLeagueSeason(year)}>
                    이 시즌 리그 순위표
                  </button>
                  <button type="button" onClick={() => openCupSeason(year)}>
                    이 시즌 컵 대회 기록
                  </button>
                </div>
              </div>
              <SeasonRecords
                key={year}
                state={state}
                year={year}
                onYear={setYear}
                archive={archive?.data}
                error={archive?.error}
              />
            </>
          )
        ) : tab === 'honours' ? (
          <Summary w={w} client={client} totalMatches={state.view!.totalMatches} />
        ) : tab === 'trends' ? (
          <ClubTrends w={w} />
        ) : tab === 'players' ? (
          <ClubLeaders w={w} />
        ) : (
          <ManagerSeasons w={w} archive={archive?.data} error={archive?.error} />
        )}
      </div>
    </>
  );
}

/** Honours and career records remain separate from season history and growth. */
const SUMMARY_PARTS = [
  ['trophies', '트로피'],
  ['records', '기타 기록'],
] as const;
type SummaryPart = (typeof SUMMARY_PARTS)[number][0];

/** Honours first, with all-time match records and the record book in a second view. */
function Summary({
  w,
  client,
  totalMatches,
}: {
  w: World;
  client: GameClient;
  totalMatches: number;
}) {
  const [part, setPart] = useTaskState<SummaryPart>(w.id, 'honours-part', () =>
    new URLSearchParams(location.search).get('part') === 'records' ? 'records' : 'trophies',
  );
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label="명예·최고기록 보기"
          options={SUMMARY_PARTS}
          value={part}
          onChange={setPart}
        />
      </div>
      {part === 'trophies' ? (
        <TrophyCabinet w={w} />
      ) : (
        <>
          <MatchRecords w={w} client={client} totalMatches={totalMatches} />
          <CareerRecordBook w={w} />
        </>
      )}
    </>
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
  ['overview', '분석'],
  ['matches', '경기'],
  ['decisions', '결정'],
] as const;
/** The competition filter's choices: every competition, then each kind. */
const RECORD_COMPETITIONS = [['all', '모든 대회'], ...Object.entries(kindLabel)] as const;

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
    [part, setPart] = useAddressTab('part', SEASON_PARTS, 'overview', {
      world: w.id,
      key: `record-part-${year}`,
    }),
    [filter, setFilter] = useAddressTab('competition', RECORD_COMPETITIONS, 'all', {
      world: w.id,
      key: `record-filter-${year}`,
    });
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
              <PixelIcon name="chevronLeft" size={20} />
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
              <PixelIcon name="chevronRight" size={20} />
            </button>
          </div>
          <label>
            대회 범위{' '}
            <Select
              aria-label="기록 대회 범위"
              value={filter}
              onValueChange={(value) => setFilter(value)}
            >
              {RECORD_COMPETITIONS.map(([id, label]) => (
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
          {h && archive && (
            <details className={s.seasonDeepDive}>
              <summary>리그 심층 분석·구단 재정 결산</summary>
              <p className={a.note}>
                리그 경기의 xG·기대 승점·선수 기록과 구단의 시즌 결산이에요. 위 대회 범위별 분석과
                집계 범위가 달라요.
              </p>
              <SeasonReview w={w} year={year} files={archive} />
            </details>
          )}
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
                      <b>{e.kind === 'build' ? readBuildTitle(e.title) : e.title}</b>
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
