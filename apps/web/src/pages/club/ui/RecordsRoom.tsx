import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { competitionRoute, COMPETITION_PATHS } from '../../../shared/routing/competitionNavigation';
import { useTaskMemory, useTaskState } from '../../../shared/routing/taskMemory';
import { SeasonReview } from './SeasonReview';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { useEffect, useState, type ReactNode } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import { readBuildTitle } from '../../../../../../packages/engine/src/build';
import { ownSeasons } from '../../../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import type { ClientState, GameClient } from '../../../runtime/client';
import type { ClubRecords, RecordMatch, Run } from '../../../runtime/clubRecords';
import type { Reply } from '../../../runtime/protocol';
import { Panel } from '../../../shared/ui/Panel';
import { AnalysisExport } from './AnalysisExport';
import { CareerRecordBook, ClubLeaders, TrophyCabinet } from './CareerRecordBook';
import { divisionName } from '../../../entities/player';
import { ClubLink } from '../../../entities/club';
import { ClubTrends, SeasonTable } from './ClubTrends';
import { Dialog } from '../../../shared/ui/Dialog';
import { kindLabel, number, seasonName } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { replaceQuery, TabList, useAddressTab } from '../../../shared/ui/PageTabs';
import { Pitch } from '../../../features/match-viewer';
import { PlayerLink } from '../../../entities/player';
import { archivePlayback } from '../../../entities/match';
import { SeasonAnalysis } from './SeasonAnalysis';
import { TransferRecords } from './TransferRecords';
import { BallonDorView } from './BallonDorView';
import { Segments } from '../../../shared/ui/Segments';
import { Select } from '../../../shared/ui/Select';
import {
  openLeagueSeason,
  openCupSeason,
  useRecordRequest,
  leaveManagerSeason,
  managerRecords,
  rememberManagerSeason,
  returnedToManagers,
  RECORD_TABS,
  type RecordTab,
} from '../../../shared/routing/state';
import type { ManagerSourceSeason } from '../../../../../../packages/contracts/src/manager-history-view';
import { ManagerHistory, type ManagerHistoryProps } from './ManagerHistory';
import { useManagerHistory } from '../model/useManagerHistory';
import a from '../../../shared/ui/styles/Analysis.module.css';
import s from '../../../shared/ui/styles/App.module.css';
import t from '../../../shared/ui/styles/LiveSeason.module.css';

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
  return year === w.year || ownSeasons(w).some((season) => season.year === year) ? year : undefined;
}
const scroller = () => document.querySelector<HTMLElement>('[data-testid="view-scroller"]');
function recordScroll(value: number) {
  requestAnimationFrame(() => scroller()?.scrollTo({ top: value }));
}

/**
 * One season's archive with its own matches and events, plus every manager event. It is fetched
 * only while a tab reads it; the season in progress is read again when an own match or an event is
 * added, never on the date alone, since each read first shows the days computed ahead (→WEB-18),
 * while a closed season's archive never changes, so a fast clock never keeps cancelling its read.
 * The last reply for the same world and season stays on screen until the next one lands, so a
 * running clock never blanks it.
 */
function useSeasonArchive(client: GameClient, w: World, year: number, enabled: boolean) {
  const [result, setResult] = useState<ArchiveResult>();
  // Published views keep the references of unchanged parts, so these change only with their facts.
  const current = year === w.year,
    matches = current ? w.ownMatches : undefined,
    events = current ? w.events : undefined;
  useEffect(() => {
    if (!enabled) return;
    let valid = true;
    const failed = sourceMessage('copy.RecordsRoom.2cf51ea64d'),
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
  }, [client, w.id, matches, events, year, enabled]);
  return result?.world === w.id && result.year === year ? result : undefined;
}

/** Club seasons lead to their own analysis; competition tables are explicit contextual visits. */
export function RecordsRoom({ state, client }: Props) {
  useTextLocale();
  const w = state.view!.world;
  // The records tab stays in the page's address, so a reload keeps it.
  const [tab, setTab] = useAddressTab('view', RECORD_TABS, 'seasons', {
    world: w.id,
    key: 'records-tab',
    path: COMPETITION_PATHS.history,
    older: olderRecordTab,
  });
  const [year, setYear] = useTaskState<number | undefined>(w.id, 'records-year', () =>
    savedRecordYear(w),
  );
  const request = useRecordRequest((store) => store.request);
  const openSeason = (picked: number) => {
    if (tab === 'seasons' && year === undefined)
      useTaskMemory.setState((memory) => ({
        scrolls: { ...memory.scrolls, 'record-list': scroller()?.scrollTop ?? 0 },
      }));
    setTab('seasons');
    setYear(picked);
    history.pushState(null, '', `/history?section=club&season=${picked}`);
    recordScroll(0);
  };
  // An accomplishment or a tenure's season opens our season record; the list keeps its place.
  const openManagerSeason = (season: ManagerSourceSeason, row: string) => {
    if (season.club !== w.playerClub) return;
    rememberManagerSeason(w.id, season, row, scroller()?.scrollTop ?? 0);
    openSeason(season.year);
  };
  useEffect(() => {
    if (!request) return;
    useRecordRequest.getState().take();
    leaveManagerSeason(w.id);
    setTab('seasons');
    setYear(request.year);
    recordScroll(0);
  }, [request, setTab, setYear, w.id]);
  useEffect(() => {
    const restore = () => {
      if (competitionRoute(location.pathname, location.search)?.page === 'history')
        setYear(savedRecordYear(w));
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('tasknavigate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('tasknavigate', restore);
    };
  }, [w.id, w.year, setYear]);
  // The managers read every manager event, which only the season in progress keeps current.
  const archive = useSeasonArchive(
    client,
    w,
    tab === 'managers' ? w.year : (year ?? w.year),
    (tab === 'seasons' && year !== undefined) || tab === 'managers',
  );
  useEffect(() => {
    if (competitionRoute(location.pathname, location.search)?.page !== 'history') return;
    replaceQuery((params) => {
      if (tab === 'seasons' && year !== undefined) params.set('season', String(year));
      else for (const param of ['season', 'part', 'competition']) params.delete(param);
    });
  }, [tab, year]);
  const selectTab = (next: RecordTab) => {
    leaveManagerSeason(w.id);
    setTab(next);
    if (next === 'seasons') setYear(undefined);
    recordScroll(0);
  };
  const managerReturn = managerRecords(w.id).opened;
  const returnToList = () => {
    setYear(undefined);
    setTab(managerReturn ? 'managers' : 'seasons');
    history.pushState(
      null,
      '',
      managerReturn ? '/history?section=club&view=managers' : '/history?section=club',
    );
    // ManagerRecords restores its own list; season rows keep their scroll before opening.
    if (!managerReturn) recordScroll(useTaskMemory.getState().scrolls['record-list'] ?? 0);
  };
  // A season opens under the records' tabs; its tab, 시즌별 기록, leads back to the list (→WEB-54).
  const seasonOpen = tab === 'seasons' && year !== undefined;
  return (
    <>
      <h2 className={s.srOnly}>{richMessage('copy.catalog.e123f414e6')}</h2>
      <div className={s.recordsNav} data-ui="toolbar">
        <TabList
          tabs={RECORD_TABS}
          value={tab}
          onChange={selectTab}
          label={displayMessage('copy.RecordsRoom.cb9f9c3bbe')}
          idPrefix="records"
        />
      </div>
      {localizeValue(
        seasonOpen && (
          <div className={s.recordNavigator} data-ui="record-navigator">
            <button
              data-ui="link"
              type="button"
              className={s.navigatorBack}
              aria-label={localizeValue(
                managerReturn
                  ? sourceMessage('copy.RecordsRoom.cc9ddba1a3')
                  : sourceMessage('copy.RecordsRoom.cf6886065f'),
              )}
              onClick={returnToList}
            >
              <PixelIcon name="chevronLeft" size={16} />
              {localizeValue(
                managerReturn
                  ? sourceMessage('copy.RecordsRoom.2c80205cf2')
                  : sourceMessage('copy.ClubTrends.f402b0218e'),
              )}
            </button>
            <h3>
              {richMessage('copy.RecordsRoom.9ca2616c61', {
                p0: seasonName(year),
                p1: year === w.year ? sourceMessage('copy.LeagueInsights.b2801e8117') : '',
              })}
            </h3>
          </div>
        ),
      )}
      <div
        className={s.recordStack}
        {...(seasonOpen
          ? { role: 'region', 'aria-label': sourceMessage('copy.RecordsRoom.460e6c9891') }
          : { id: 'records-panel', role: 'tabpanel', 'aria-labelledby': `records-tab-${tab}` })}
      >
        {localizeValue(
          tab === 'seasons' ? (
            year === undefined ? (
              <SeasonTable w={w} onSeason={openSeason} preOwner={state.view!.preOwner} />
            ) : (
              <>
                <div className={s.recordControls}>
                  <div className={s.recordLinks}>
                    <button
                      data-ui="link"
                      className={s.textButton}
                      type="button"
                      aria-label={displayMessage('copy.RecordsRoom.ec97e1d076')}
                      onClick={() => openLeagueSeason(year, w.year)}
                    >
                      {richMessage('copy.LeagueInsights.7c477b094f')}
                    </button>
                    <button
                      data-ui="link"
                      className={s.textButton}
                      type="button"
                      aria-label={displayMessage('copy.RecordsRoom.0784d5370a')}
                      onClick={() => openCupSeason(year, 'cup', w.year)}
                    >
                      {richMessage('copy.RecordsRoom.228e58565a')}
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
          ) : tab === 'transfers' ? (
            <TransferRecords w={w} ledger={state.view!.transferLedger ?? []} />
          ) : tab === 'ballonDor' ? (
            <BallonDorView w={w} />
          ) : (
            <>
              <ManagerRecords
                client={client}
                world={w.id}
                historyKey={state.view!.managerHistoryKey}
                onOpenSeason={openManagerSeason}
              />
              <ManagerSeasons w={w} archive={archive?.data} error={archive?.error} />
            </>
          ),
        )}
      </div>
    </>
  );
}

/** Honours and career records remain separate from season history and growth. */
const SUMMARY_PARTS = [
  ['trophies', sourceMessage('copy.RecordsRoom.57192ccc74')],
  ['records', sourceMessage('copy.RecordsRoom.7f4b9c3806')],
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
  useTextLocale();
  const [part, setPart] = useTaskState<SummaryPart>(w.id, 'honours-part', () =>
    new URLSearchParams(location.search).get('part') === 'records' ? 'records' : 'trophies',
  );
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label={displayMessage('copy.RecordsRoom.3c92f24df1')}
          options={SUMMARY_PARTS}
          value={part}
          onChange={setPart}
        />
      </div>
      {localizeValue(
        part === 'trophies' ? (
          <TrophyCabinet w={w} />
        ) : (
          <>
            <MatchRecords w={w} client={client} totalMatches={totalMatches} />
            <CareerRecordBook w={w} />
          </>
        ),
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
  useTextLocale();
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
          {localizeValue(m.own)}–{localizeValue(m.other)}
        </b>
        <ClubLink w={w} id={m.opponent} crest={14} />
        <p className={a.note}>
          {richMessage('copy.RecordsRoom.7f4de59e2a', {
            p0: localizeValue(seasonName(m.year)),
            p1: localizeValue(kindLabel[m.kind]),
            p2: localizeValue(m.round),
            p3: localizeValue(
              m.home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
            ),
          })}
        </p>
      </>
    );
  const run = (r: Run, unit: string) =>
    r.length > 0 &&
    r.from &&
    r.to && (
      <>
        <b>
          {localizeValue(r.length)}
          {localizeValue(unit)}
        </b>
        <p className={a.note}>
          {richMessage('copy.RecordsRoom.0e154df1de', {
            p0: localizeValue(seasonName(r.from.year)),
            p1: localizeValue(r.from.round),
            p2: localizeValue(seasonName(r.to.year)),
            p3: localizeValue(r.to.round),
            p4: localizeValue(r.live ? sourceMessage('copy.LeagueInsights.b2801e8117') : ''),
          })}
        </p>
      </>
    );
  const cards: [string, ReactNode][] = records
    ? [
        [sourceMessage('copy.RecordsRoom.6d13947e70'), match(records.biggestWin)],
        [sourceMessage('copy.RecordsRoom.7dea468cef'), match(records.biggestLoss)],
        [sourceMessage('copy.RecordsRoom.59000a3912'), match(records.mostScored)],
        [
          sourceMessage('copy.RecordsRoom.a23530b619'),
          run(records.winning, sourceMessage('copy.RecordsRoom.41d614374c')),
        ],
        [
          sourceMessage('copy.RecordsRoom.1dcca0d380'),
          run(records.unbeaten, sourceMessage('copy.LabPage.e56314e9a1')),
        ],
        [
          sourceMessage('copy.RecordsRoom.bee1020476'),
          run(records.cleanSheets, sourceMessage('copy.LabPage.e56314e9a1')),
        ],
        [
          sourceMessage('copy.RecordsRoom.c3d231fc8a'),
          run(records.losing, sourceMessage('copy.RecordsRoom.87d094d815')),
        ],
        [
          sourceMessage('copy.RecordsRoom.9c3abbc1f7'),
          run(records.winless, sourceMessage('copy.LabPage.e56314e9a1')),
        ],
      ]
    : [];
  return (
    <Panel
      title={displayMessage('copy.RecordsRoom.d161661e3a')}
      note={
        records
          ? sourceMessage('copy.RecordsRoom.9a9c21031b', { p0: number(records.played) })
          : undefined
      }
    >
      <section
        className={`${s.panelBody} ${a.book}`}
        aria-label={displayMessage('copy.RecordsRoom.d161661e3a')}
      >
        {localizeValue(
          !records ? (
            <p className={s.muted} role={read?.failed ? 'alert' : 'status'}>
              {localizeValue(
                read?.failed
                  ? sourceMessage('copy.CupHistory.1886147a5c')
                  : sourceMessage('copy.RecordsRoom.f2c9a60677'),
              )}
            </p>
          ) : records.played ? (
            <div className={a.cards}>
              {localizeValue(
                cards.map(([label, body]) => (
                  <article data-surface="panel" key={label} aria-label={localizeValue(label)}>
                    <h4>{localizeValue(label)}</h4>
                    {localizeValue(
                      body || (
                        <p className={a.note}>{richMessage('copy.RecordsRoom.3cdb4ce9b8')}</p>
                      ),
                    )}
                  </article>
                )),
              )}
            </div>
          ) : (
            <p className={s.muted}>{richMessage('copy.RecordsRoom.9ef90a2673')}</p>
          ),
        )}
        <p className={a.note}>{richMessage('copy.RecordsRoom.d644e9266c')}</p>
      </section>
    </Panel>
  );
}

/**
 * 감독 이력 (→HIST-18/19, WEB-92): every tenure's summary read from the worker, which keeps every
 * own match. Back from a season it opened, the list stands where it was left.
 */
function ManagerRecords({
  client,
  world,
  historyKey,
  onOpenSeason,
}: {
  client: GameClient;
  world: string;
  historyKey?: string;
  onOpenSeason: ManagerHistoryProps['onOpenSeason'];
}) {
  useTextLocale();
  const props = useManagerHistory(client, world, historyKey, onOpenSeason);
  useEffect(() => {
    const scroll = returnedToManagers(world);
    if (scroll !== undefined) recordScroll(scroll);
  }, [world]);
  return <ManagerHistory {...props} />;
}

/** The managers' seasons: every hiring and departure, then the man in charge now. */
function ManagerSeasons({ w, archive, error }: { w: World; archive?: Archive; error?: string }) {
  useTextLocale();
  return (
    <Panel title={displayMessage('copy.RecordsRoom.9c14511562')}>
      <div className={s.panelBody}>
        {localizeValue(
          !archive && (
            <p className={s.muted} role={error ? 'alert' : 'status'}>
              {localizeValue(error || sourceMessage('copy.RecordsRoom.0ea24f2ba2'))}
            </p>
          ),
        )}
        <ul className={s.timeline}>
          {localizeValue(
            archive?.managers
              .filter((e) => e.kind === 'manager-hire' || e.kind === 'manager-departure')
              .map((e, i) => (
                <li key={i}>
                  <small>
                    {richMessage('copy.RecordsRoom.a8324f9843', {
                      p0: localizeValue(e.year),
                      p1: localizeValue(e.round),
                    })}
                  </small>
                  <b>{localizeValue(e.title)}</b>
                  <p>{localizeValue(e.detail)}</p>
                </li>
              )),
          )}
          <li>
            <b>{richMessage('copy.RecordsRoom.deec60c968', { p0: w.manager.name })}</b>
            <p>
              {richMessage('copy.RecordsRoom.325b66c2d7', {
                p0: w.manager.since,
                p1: tacticLabel[w.manager.philosophy],
              })}
            </p>
          </li>
        </ul>
      </div>
    </Panel>
  );
}

const SEASON_PARTS = [
  ['overview', sourceMessage('copy.NewsFeed.45ec3425c8')],
  ['matches', sourceMessage('copy.LabPage.e56314e9a1')],
  ['decisions', sourceMessage('copy.RecordsRoom.3725567246')],
] as const;
/** The competition filter's choices: every competition, then each kind. */
const RECORD_COMPETITIONS = [
  ['all', sourceMessage('copy.FixtureNotebook.4be0674739')],
  ...Object.entries(kindLabel),
] as const;

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
  useTextLocale();
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
  const years = [...ownSeasons(w).map((season) => season.year), w.year],
    at = Math.max(0, years.indexOf(year));
  const f = (n: string, y = year) => <Money value={n} code={c.country} year={y} />;
  const scope =
    filter === 'all' ? sourceMessage('copy.FixtureNotebook.4be0674739') : kindLabel[filter];
  const pending = !archive && (
    <p className={s.muted} role={error ? 'alert' : 'status'}>
      {localizeValue(error || sourceMessage('copy.RecordsRoom.a1f87a2f56'))}
    </p>
  );
  return (
    <>
      <div className={s.recordControls}>
        <div className={s.seasonBar}>
          <div
            className={`${t.seasonPicker} ${s.recordSeason}`}
            data-ui="season-picker"
            role="group"
            aria-label={displayMessage('copy.RecordsRoom.d2731b4598')}
          >
            <button
              data-ui="link"
              type="button"
              className={t.seasonStep}
              aria-label={displayMessage('copy.RecordsRoom.f9daea4a64')}
              disabled={at === 0}
              onClick={() => onYear(years[at - 1])}
            >
              <PixelIcon name="chevronLeft" size={20} />
            </button>
            <Select
              aria-label={displayMessage('copy.RecordsRoom.36bba428f0')}
              className={t.seasonSelect}
              value={year}
              onValueChange={(value) => onYear(Number(value))}
            >
              {localizeValue(
                [...years].reverse().map((y) => (
                  <option key={y} value={y}>
                    {localizeValue(seasonName(y))}
                  </option>
                )),
              )}
            </Select>
            <button
              data-ui="link"
              type="button"
              className={t.seasonStep}
              aria-label={displayMessage('copy.RecordsRoom.935d69c347')}
              disabled={at === years.length - 1}
              onClick={() => onYear(years[at + 1])}
            >
              <PixelIcon name="chevronRight" size={20} />
            </button>
          </div>
          <label className={s.recordScope}>
            <span className={s.srOnly}>{richMessage('copy.RecordsRoom.67a99ac7e3')}</span>
            <Select
              aria-label={displayMessage('copy.RecordsRoom.ba22d30366')}
              value={filter}
              onValueChange={(value) => setFilter(value)}
            >
              {localizeValue(
                RECORD_COMPETITIONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {localizeValue(label)}
                  </option>
                )),
              )}
            </Select>
          </label>
          <span className={s.pill}>
            {richMessage('copy.RecordsRoom.faa6412633', {
              p0: matches.length,
              p1: state.view!.totalMatches,
            })}
          </span>
        </div>
        <Segments
          label={displayMessage('copy.RecordsRoom.8e538dcd32')}
          options={SEASON_PARTS}
          value={part}
          onChange={setPart}
        />
      </div>
      {localizeValue(
        part === 'overview' ? (
          <>
            {localizeValue(
              h && (
                <div className={s.stats}>
                  {localizeValue(
                    (
                      [
                        [
                          sourceMessage('copy.RecordsRoom.d88e556226'),
                          sourceMessage('copy.RecordsRoom.c45f87bb0d', {
                            p0: divisionName(c.country, h.tier, h.group),
                            p1: h.rank,
                            p2: h.points,
                          }),
                        ],
                        [sourceMessage('copy.ClubTrends.2070613ba9'), number(h.fans)],
                        [sourceMessage('copy.RecordsRoom.70b1b5a635'), f(h.cash)],
                        [
                          sourceMessage('copy.RecordsRoom.04e0271ff6'),
                          f((BigInt(h.income) - BigInt(h.expense)).toString()),
                        ],
                      ] as [string, ReactNode][]
                    ).map(([label, value]) => (
                      <div data-surface="inset" className={s.stat} key={label}>
                        <div className={s.label}>{localizeValue(label)}</div>
                        <strong>{localizeValue(value)}</strong>
                      </div>
                    )),
                  )}
                </div>
              ),
            )}
            {localizeValue(
              archive ? (
                <SeasonAnalysis w={w} records={matches} year={year} scope={scope} />
              ) : (
                pending
              ),
            )}
            {localizeValue(
              h && archive && (
                <details data-ui="disclosure" className={s.seasonDeepDive}>
                  <summary>{richMessage('copy.RecordsRoom.f05cfd8eb4')}</summary>
                  <p className={a.note}>{richMessage('copy.RecordsRoom.b683290fc3')}</p>
                  <SeasonReview w={w} year={year} files={archive} />
                </details>
              ),
            )}
            <AnalysisExport w={w} records={matches} year={year} scope={scope} ready={!!archive} />
          </>
        ) : part === 'matches' ? (
          <>
            {localizeValue(pending)}
            <Panel
              title={displayMessage('copy.RecordsRoom.ce5fd530f9')}
              note={`${seasonName(year)} · ${scope}`}
            >
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{richMessage('copy.ClubHub.0fcb288d12')}</th>
                      <th>{richMessage('copy.RecordsRoom.b6c147db1a')}</th>
                      <th>{richMessage('copy.LabPage.109383e344')}</th>
                      <th>{richMessage('copy.RecordsRoom.6135e3a7cb')}</th>
                      <th>{richMessage('copy.matchModelPacking.7255709b1f')}</th>
                      <th>{richMessage('navigation.history')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localizeValue(
                      matches.map((m) => (
                        <tr key={m.id}>
                          <td>{localizeValue(m.round)}</td>
                          <td>
                            <ClubLink w={w} id={m.home} crest={14} />
                          </td>
                          <td>
                            <b>
                              {localizeValue(m.score.home)}–{localizeValue(m.score.away)}
                            </b>
                          </td>
                          <td>
                            <ClubLink w={w} id={m.away} crest={14} />
                          </td>
                          <td>{localizeValue(kindLabel[m.kind])}</td>
                          <td>
                            <button onClick={() => setMatch(m)}>
                              {richMessage('copy.RecordsRoom.acceaac37b')}
                            </button>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                {localizeValue(
                  archive && !matches.length && (
                    <div className={s.empty}>{richMessage('copy.RecordsRoom.8d08e08c9e')}</div>
                  ),
                )}
              </div>
            </Panel>
          </>
        ) : (
          <>
            {localizeValue(pending)}
            <Panel title={displayMessage('copy.RecordsRoom.68b41fe86c')} note={seasonName(year)}>
              <div className={s.panelBody}>
                <ul className={s.timeline}>
                  {localizeValue(
                    archive?.events
                      .filter((e) => e.kind !== 'gate')
                      .map((e, i) => (
                        <li key={i}>
                          <small>
                            {richMessage('copy.RecordsRoom.4754a30b3f', {
                              p0: localizeValue(e.year),
                              p1: localizeValue(e.round),
                              p2: localizeValue(' '),
                              p3: localizeValue(
                                e.amount &&
                                  sourceMessage('copy.RecordsRoom.3440e597a2', {
                                    p0: e.amount,
                                    p1: e.currency,
                                  }),
                              ),
                            })}
                          </small>
                          <b>
                            {localizeValue(e.kind === 'build' ? readBuildTitle(e.title) : e.title)}
                          </b>
                          <p>{localizeValue(e.detail)}</p>
                        </li>
                      )),
                  )}
                </ul>
                {localizeValue(
                  archive && !archive.events.some((e) => e.kind !== 'gate') && (
                    <div className={s.empty}>{richMessage('copy.RecordsRoom.ad9aff9574')}</div>
                  ),
                )}
              </div>
            </Panel>
          </>
        ),
      )}
      {localizeValue(
        match && <MatchSheet w={w} match={match} onClose={() => setMatch(undefined)} />,
      )}
    </>
  );
}

/** A past match replayed from its stored goals, with our players' lines. */
function MatchSheet({ w, match, onClose }: { w: World; match: MatchRecord; onClose: () => void }) {
  useTextLocale();
  return (
    <Dialog label={displayMessage('copy.RecordsRoom.96c6813cd1')} onClose={onClose} wide>
      <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
      <h2>
        {localizeValue(seasonName(match.year))} · {localizeValue(kindLabel[match.kind])}
      </h2>
      <Pitch playback={archivePlayback(match)} summary world={w} />
      <h3>{richMessage('copy.RecordsRoom.2e0357962b')}</h3>
      <div className={s.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{richMessage('copy.summary.eb4e291be3')}</th>
              <th>{richMessage('team.column.player')}</th>
              <th>{richMessage('copy.BallonDorView.8d901cc28d')}</th>
              <th>{richMessage('copy.RecordsRoom.a5cb2717bc')}</th>
              <th>{richMessage('copy.RecordsRoom.3caa569233')}</th>
              <th>{richMessage('copy.Pitch.3f6ba38a9e')}</th>
              <th>{richMessage('copy.RecordsRoom.2a022bd612')}</th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              match.players.map((p) => {
                const player = w.players.find((owned) => owned.id === p.id);
                return (
                  <tr key={p.id}>
                    <td>{localizeValue(p.metrics[0])}</td>
                    <td>
                      {localizeValue(player && <PlayerLink id={player.id} name={player.name} />)}
                    </td>
                    <td>{localizeValue(p.metrics[1])}</td>
                    <td>
                      {localizeValue(p.metrics[3])}/{localizeValue(p.metrics[2])}
                    </td>
                    <td>
                      {localizeValue(p.metrics[4])}/{localizeValue(p.metrics[5])}
                    </td>
                    <td>{localizeValue(p.metrics[6])}</td>
                    <td>{localizeValue(p.metrics[9])}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p className={s.muted}>{richMessage('copy.RecordsRoom.a5b46f2800')}</p>
    </Dialog>
  );
}
