import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
/**
 * Display labels and actions for the records room's 감독 이력 (→WEB-92, HIST-18/19). Every
 * count, rate, run, credit and coverage value comes already computed from the manager-history
 * query (T304); this module only words them and describes which club-season each one opens.
 */
import {
  managerHistoryDateKey,
  type ManagerDeparture,
} from '../../../../../../packages/contracts/src/manager-history';
import type {
  ManagerHistoryCoverage,
  ManagerHistoryPage,
  ManagerHistoryRow,
  ManagerHonour,
  ManagerLegacyEventRow,
  ManagerMatchSummary,
  ManagerRun,
  ManagerSourceSeason,
  ManagerTenureRow,
  ManagerTenureSummary,
} from '../../../../../../packages/contracts/src/manager-history-view';
import type { CareerDate } from '../../../../../../packages/contracts/src/types';
import { ROUND_INTERVAL_DAYS } from '../../../../../../packages/engine/src/calendar';
import { seasonName } from '../../../presentation/format';

/** Opens one season of our club's records; the row is the tenure to restore on return. */
export interface ManagerSourceAction {
  key: string;
  label: string;
  /** Names the manager and the accomplishment, since several rows share season labels. */
  accessibleLabel: string;
  season: ManagerSourceSeason;
}
export interface ManagerAccomplishmentView {
  key: string;
  label: string;
  season: string;
  /** A shared season or another scope caveat, never a claim of sole causation (→HIST-7). */
  note?: string;
  action: ManagerSourceAction;
}
export interface ManagerRecordView {
  line: string;
  rate?: string;
  scope: string;
  note?: string;
  /** False when the record is unknown: neither zeros nor a win rate are shown then. */
  known: boolean;
}
export interface ManagerRunView {
  label: string;
  value: string;
  range?: string;
  ongoing: boolean;
}
export interface ManagerTenureView {
  kind: 'tenure';
  id: string;
  name: string;
  badges: string[];
  /** The appointment side: an exact appointment, a known earlier service year or unknown. */
  service: string;
  /** Present only when the tracking boundary differs from the appointment. */
  tracking?: string;
  /** Departure details, or the current marker. */
  end?: string;
  coverage?: string;
  honoursLine: string;
  honoursNote?: string;
  honours: ManagerAccomplishmentView[];
  finishesLine: string;
  finishes: ManagerAccomplishmentView[];
  provisional: string[];
  unresolved?: string;
  record: ManagerRecordView;
  runs: ManagerRunView[];
  sources: ManagerSourceAction[];
}
export interface ManagerLegacyView {
  kind: 'legacy';
  id: string;
  when: string;
  title: string;
  detail: string;
  note: string;
}
export type ManagerRowView = ManagerTenureView | ManagerLegacyView;

export type ManagerHistoryFooter =
  | { kind: 'more'; cursor: string; label: string; shown: string }
  | { kind: 'loading-more'; label: string; shown: string }
  | { kind: 'retry-more'; message: string; label: string; shown: string }
  | { kind: 'end'; shown: string };
export type ManagerHistoryListState =
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string; retry: string }
  | { kind: 'empty'; message: string }
  | { kind: 'ready'; rows: ManagerRowView[]; footer: ManagerHistoryFooter };

export const MANAGER_HISTORY_COPY = {
  title: sourceMessage('copy.RecordsRoom.2c80205cf2'),
  scope: sourceMessage('copy.managerHistoryView.f3e5f7149a'),
  loading: sourceMessage('copy.RecordsRoom.0ea24f2ba2'),
  error: sourceMessage('copy.managerHistoryView.137c851f13'),
  retry: sourceMessage('presentation.retry'),
  empty: sourceMessage('copy.managerHistoryView.0b4191402b'),
  more: sourceMessage('copy.managerHistoryView.5e8959d183'),
  loadingMore: sourceMessage('copy.managerHistoryView.32c1420299'),
  moreError: sourceMessage('copy.managerHistoryView.7161a65afb'),
  inspect: sourceMessage('copy.managerHistoryView.a072ebb77d'),
  close: sourceMessage('copy.Bracket.aba0885359'),
} as const;

const DEPARTURE: Record<ManagerDeparture, string> = {
  replaced: sourceMessage('copy.LabPage.084c5a6dd7'),
  resigned: sourceMessage('copy.managerHistoryView.7ad5c80348'),
  retired: sourceMessage('copy.Rich.fc798874df'),
  expired: sourceMessage('copy.managerHistoryView.c279102d18'),
};
const HONOUR_KIND: Record<ManagerHonour['kind'], string> = {
  'league-title': sourceMessage('start.history.champions'),
  'cup-title': sourceMessage('copy.managerHistoryView.5b012994d1'),
  promotion: sourceMessage('copy.AcademyPanel.8e70a8dda1'),
};
const COVERAGE: Record<Exclude<ManagerHistoryCoverage, 'complete'>, string> = {
  partial: sourceMessage('copy.managerHistoryView.db2390ff3e'),
  unavailable: sourceMessage('copy.managerHistoryView.205935d8e7'),
};
/** A shared season, or one whose full-season charge is not recorded (→HIST-19). */
const SHARED_FINISH = sourceMessage('copy.managerHistoryView.820f5e21bc');
const SHARED_HONOUR = sourceMessage('copy.managerHistoryView.6da342daea');

/** The calendar day of a career date; seasons start on August 1 (→CareerDate). */
export const managerDate = (at: CareerDate) =>
  new Date(Date.UTC(at.year, 7, 1) + at.day * 86400000).toISOString().slice(0, 10);

function sourceAction(
  name: string,
  what: string,
  season: ManagerSourceSeason,
  key: string,
  current = false,
): ManagerSourceAction {
  const label = sourceMessage('copy.managerHistoryView.a7b41fb195', {
    p0: seasonName(season.year),
    p1: current ? sourceMessage('copy.managerHistoryView.d319753198') : '',
  });
  return {
    key,
    label,
    accessibleLabel: sourceMessage('copy.managerHistoryView.82abe879aa', {
      p0: name,
      p1: what,
      p2: label,
    }),
    season: { ...season },
  };
}

export function managerHonourLabel(honour: ManagerHonour): string {
  switch (honour.kind) {
    case 'league-title':
    case 'cup-title':
      return sourceMessage('copy.CareerRecordBook.2bfc53c804', { p0: honour.name });
    case 'promotion':
      return sourceMessage('copy.SeasonReview.3128e63b63', {
        p0: honour.fromName,
        p1: honour.toName,
      });
  }
}

function honoursView(name: string, summary: ManagerTenureSummary): ManagerAccomplishmentView[] {
  return summary.honours.map((honour, index) => {
    const label = managerHonourLabel(honour);
    const key = `honour:${index}:${honour.season.year}:${honour.kind}`;
    return {
      key,
      label,
      season: `${seasonName(honour.season.year)} · ${HONOUR_KIND[honour.kind]}`,
      ...(honour.sharedSeason ? { note: SHARED_HONOUR } : {}),
      action: sourceAction(name, label, honour.season, key),
    };
  });
}

/** Grouped by kind for the compact line, e.g. 리그 우승 1 · 컵 우승 2. */
function honoursLine(summary: ManagerTenureSummary | null): {
  line: string;
  note?: string;
} {
  if (!summary || summary.honoursCoverage === 'unavailable')
    return {
      line: sourceMessage('copy.managerHistoryView.48db0e96b7'),
      note: sourceMessage('copy.managerHistoryView.a4d410e744'),
    };
  const kinds = (Object.keys(HONOUR_KIND) as ManagerHonour['kind'][])
    .map((kind) => [kind, summary.honours.filter((honour) => honour.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${HONOUR_KIND[kind]} ${count}`);
  const partial = summary.honoursCoverage === 'partial';
  if (!kinds.length)
    return partial
      ? {
          line: sourceMessage('copy.managerHistoryView.8d30ba963d'),
          note: sourceMessage('copy.managerHistoryView.a3b7e810ae'),
        }
      : { line: sourceMessage('copy.managerHistoryView.77b43f9cdf') };
  return {
    line: kinds.join(' · '),
    ...(partial ? { note: sourceMessage('copy.managerHistoryView.c4e7c2da1f') } : {}),
  };
}

function finishesView(name: string, summary: ManagerTenureSummary): ManagerAccomplishmentView[] {
  return summary.bestFinishes.flatMap((best) =>
    best.finishes.map((finish) => {
      const label = sourceMessage('copy.managerHistoryView.bb4f7b0d9e', {
        p0: best.name,
        p1: best.rank,
      });
      const key = `finish:${finish.season.year}:${best.division.country}:${best.division.tier}:${best.division.group}`;
      return {
        key,
        label,
        season: sourceMessage('copy.managerHistoryView.ab894df26e', {
          p0: seasonName(finish.season.year),
        }),
        ...(finish.sharedSeason ? { note: SHARED_FINISH } : {}),
        action: sourceAction(name, label, finish.season, key),
      };
    }),
  );
}

function finishesLine(summary: ManagerTenureSummary | null): string {
  if (!summary || summary.honoursCoverage === 'unavailable')
    return sourceMessage('copy.managerHistoryView.94316e6d94');
  if (!summary.bestFinishes.length)
    return summary.honoursCoverage === 'partial'
      ? sourceMessage('copy.managerHistoryView.ff1759b4a2')
      : sourceMessage('copy.managerHistoryView.501ac67124');
  return summary.bestFinishes
    .map((best) =>
      sourceMessage('copy.managerHistoryView.322f317dd2', { p0: best.name, p1: best.rank }),
    )
    .join(' · ');
}

export function managerRecordView(record: ManagerMatchSummary | undefined): ManagerRecordView {
  const scope = MANAGER_HISTORY_COPY.scope;
  if (!record || record.coverage === 'unavailable')
    return {
      line: sourceMessage('copy.managerHistoryView.55df1312b1'),
      scope,
      note: sourceMessage('copy.managerHistoryView.a3d00ed21b'),
      known: false,
    };
  const note =
    record.coverage === 'partial' ? sourceMessage('copy.managerHistoryView.1ab45b051b') : undefined;
  if (!record.played)
    return {
      line:
        record.coverage === 'complete'
          ? sourceMessage('copy.managerHistoryView.4f1f61e4e3')
          : sourceMessage('copy.managerHistoryView.c7a834b206'),
      rate: sourceMessage('copy.managerHistoryView.3fb2a269dd'),
      scope,
      ...(note ? { note } : {}),
      known: true,
    };
  return {
    line: sourceMessage('copy.managerHistoryView.0463009cf8', {
      p0: record.played,
      p1: record.won,
      p2: record.drawn,
      p3: record.lost,
    }),
    rate:
      record.winRate === null
        ? sourceMessage('copy.managerHistoryView.3fb2a269dd')
        : sourceMessage('copy.managerHistoryView.72bbd790b4', {
            p0: Math.round(record.winRate * 100),
            p1: record.sampleSize,
          }),
    scope,
    ...(note ? { note } : {}),
    known: true,
  };
}

function runView(label: string, run: ManagerRun | null, record: ManagerRecordView, played = 0) {
  if (!record.known)
    return { label, value: sourceMessage('copy.SeasonReview.852bf68e8e'), ongoing: false };
  if (!run)
    return {
      label,
      value: played ? sourceMessage('copy.BusinessWorkbench.72ea3d64ac') : '—',
      ongoing: false,
    };
  return {
    label,
    value: sourceMessage('copy.managerHistoryView.8afd61210f', {
      p0: run.count,
      p1: run.ongoing ? sourceMessage('copy.LeagueInsights.b2801e8117') : '',
    }),
    range: `${managerDate(run.start.at)} – ${managerDate(run.end.at)}`,
    ongoing: run.ongoing,
  };
}

function periodView(
  row: ManagerTenureRow,
): Pick<ManagerTenureView, 'service' | 'tracking' | 'end'> {
  const tenure = row.tenure;
  if (!tenure)
    return {
      service:
        row.manager.since === undefined
          ? sourceMessage('copy.managerHistoryView.ea985b0d37')
          : sourceMessage('copy.managerHistoryView.08bc5a9ce4', { p0: row.manager.since }),
      tracking: sourceMessage('copy.managerHistoryView.0fae119e75'),
      ...(row.current ? { end: sourceMessage('copy.managerHistoryView.140671325d') } : {}),
    };
  const appointed = tenure.appointed;
  const service = appointed
    ? sourceMessage('copy.managerHistoryView.f0df19b7de', { p0: managerDate(appointed) })
    : tenure.knownSince !== undefined
      ? sourceMessage('copy.managerHistoryView.8dd0e611a3', { p0: tenure.knownSince })
      : sourceMessage('copy.managerHistoryView.b2275b499f');
  const tracked =
    !appointed || managerHistoryDateKey(appointed) !== managerHistoryDateKey(tenure.trackedFrom);
  const end = tenure.ended
    ? sourceMessage('copy.managerHistoryView.712143e9f5', {
        p0: managerDate(tenure.ended),
        p1: tenure.departure ? ` · ${DEPARTURE[tenure.departure]}` : '',
      })
    : row.current
      ? sourceMessage('copy.managerHistoryView.140671325d')
      : undefined;
  return {
    service,
    ...(tracked
      ? {
          tracking: sourceMessage('copy.managerHistoryView.fbb3613d44', {
            p0: managerDate(tenure.trackedFrom),
          }),
        }
      : {}),
    ...(end ? { end } : {}),
  };
}

export function managerTenureView(row: ManagerTenureRow): ManagerTenureView {
  const name = row.manager.name;
  const summary = row.summary;
  const record = managerRecordView(summary?.record);
  const honours = honoursLine(summary);
  const provisionalYears = new Set(summary?.provisionalFinishes.map((f) => f.season.year));
  return {
    kind: 'tenure',
    id: row.id,
    name,
    badges: [
      ...(row.current ? [sourceMessage('copy.managerHistoryView.3b1d85d190')] : []),
      ...(row.manager.interim ? [sourceMessage('copy.managerHistoryView.32899e09ed')] : []),
    ],
    ...periodView(row),
    ...(row.coverage === 'complete' ? {} : { coverage: COVERAGE[row.coverage] }),
    honoursLine: honours.line,
    ...(honours.note ? { honoursNote: honours.note } : {}),
    honours: summary ? honoursView(name, summary) : [],
    finishesLine: finishesLine(summary),
    finishes: summary ? finishesView(name, summary) : [],
    provisional: (summary?.provisionalFinishes ?? []).map((finish) =>
      sourceMessage('copy.managerHistoryView.38476b5fa2', {
        p0: seasonName(finish.season.year),
        p1: finish.name,
        p2: finish.rank,
      }),
    ),
    ...(summary?.unresolvedOutcomes.length
      ? {
          unresolved: sourceMessage('copy.managerHistoryView.ce924f2396', {
            p0: summary.unresolvedOutcomes.length,
          }),
        }
      : {}),
    record,
    runs: [
      runView(
        sourceMessage('copy.RecordsRoom.a23530b619'),
        summary?.winningRun ?? null,
        record,
        summary?.record.played,
      ),
      runView(
        sourceMessage('copy.RecordsRoom.1dcca0d380'),
        summary?.unbeatenRun ?? null,
        record,
        summary?.record.played,
      ),
    ],
    sources: (summary?.sourceSeasons ?? []).map((season) =>
      sourceAction(
        name,
        sourceMessage('copy.managerHistoryView.18c2a5f459'),
        season,
        `season:${season.year}`,
        provisionalYears.has(season.year),
      ),
    ),
  };
}

export function managerLegacyView(row: ManagerLegacyEventRow): ManagerLegacyView {
  const { event, at } = row.event;
  return {
    kind: 'legacy',
    id: row.id,
    // An unrecorded day reads as its calendar week's date, never as a round (→WEB-18).
    when: managerDate(at ?? { year: event.year, day: event.round * ROUND_INTERVAL_DAYS }),
    title: event.title,
    detail: event.detail,
    note: sourceMessage('copy.managerHistoryView.2d0a0bc5a8'),
  };
}

export const managerRowView = (row: ManagerHistoryRow): ManagerRowView =>
  row.kind === 'tenure' ? managerTenureView(row) : managerLegacyView(row);

/**
 * The list's controlled state. `page` holds every row loaded so far with the latest cursor;
 * a failure with rows already shown keeps them and offers a retry of the next page only.
 */
export function managerHistoryListState(input: {
  page?: ManagerHistoryPage;
  loading?: boolean;
  error?: string;
}): ManagerHistoryListState {
  const { page, loading, error } = input;
  if (!page)
    return error !== undefined
      ? {
          kind: 'error',
          message: error || MANAGER_HISTORY_COPY.error,
          retry: MANAGER_HISTORY_COPY.retry,
        }
      : { kind: 'loading', message: MANAGER_HISTORY_COPY.loading };
  if (!page.rows.length && !page.nextCursor)
    return error !== undefined
      ? {
          kind: 'error',
          message: error || MANAGER_HISTORY_COPY.error,
          retry: MANAGER_HISTORY_COPY.retry,
        }
      : { kind: 'empty', message: MANAGER_HISTORY_COPY.empty };
  const shown = sourceMessage('copy.managerHistoryView.a81206c9d6', {
    p0: page.rows.length,
    p1: page.total,
  });
  const footer: ManagerHistoryFooter = !page.nextCursor
    ? { kind: 'end', shown }
    : loading
      ? { kind: 'loading-more', label: MANAGER_HISTORY_COPY.loadingMore, shown }
      : error !== undefined
        ? {
            kind: 'retry-more',
            message: error || MANAGER_HISTORY_COPY.moreError,
            label: MANAGER_HISTORY_COPY.retry,
            shown,
          }
        : { kind: 'more', cursor: page.nextCursor, label: MANAGER_HISTORY_COPY.more, shown };
  return { kind: 'ready', rows: page.rows.map(managerRowView), footer };
}
