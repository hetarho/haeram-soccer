/**
 * Display labels and actions for the records room's 감독 이력 (→WEB-92, HIST-18/19). Every
 * count, rate, run, credit and coverage value comes already computed from the manager-history
 * query (T304); this module only words them and describes which club-season each one opens.
 */
import {
  managerHistoryDateKey,
  type ManagerDeparture,
} from '../../../../packages/contracts/src/manager-history';
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
} from '../../../../packages/contracts/src/manager-history-view';
import type { CareerDate } from '../../../../packages/contracts/src/types';
import { ROUND_INTERVAL_DAYS } from '../../../../packages/engine/src/calendar';
import { seasonName } from './format';

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
  title: '감독 이력',
  scope: '모든 공식전 · 정규 90분 결과',
  loading: '감독 기록을 펼치는 중…',
  error: '감독 기록을 읽지 못했어요.',
  retry: '다시 시도',
  empty: '아직 남은 감독 기록이 없어요.',
  more: '더 보기',
  loadingMore: '감독 기록을 더 불러오는 중…',
  moreError: '다음 감독 기록을 읽지 못했어요.',
  inspect: '자세히',
  close: '접기',
} as const;

const DEPARTURE: Record<ManagerDeparture, string> = {
  replaced: '교체',
  resigned: '사임',
  retired: '은퇴',
  expired: '계약 만료',
};
const HONOUR_KIND: Record<ManagerHonour['kind'], string> = {
  'league-title': '리그 우승',
  'cup-title': '컵 우승',
  promotion: '승격',
};
const COVERAGE: Record<Exclude<ManagerHistoryCoverage, 'complete'>, string> = {
  partial: '일부 기간만 기록됐어요. 수치는 기록된 기간에 한정되고 통산 전체가 아니에요.',
  unavailable: '이 재임의 성과 기록은 남아 있지 않아요. 기록이 없다고 성과가 없던 것은 아니에요.',
};
/** A shared season, or one whose full-season charge is not recorded (→HIST-19). */
const SHARED_FINISH =
  '시즌 전체를 맡았다고 확인되지 않은 시즌 · 재임 중 확정된 최종 순위이며 이 감독의 시즌 전체 승무패가 아니에요.';
const SHARED_HONOUR = '시즌 전체를 맡았다고 확인되지 않은 시즌 · 재임 중 확정된 결과예요.';

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
  const label = `${seasonName(season.year)} 시즌 기록${current ? ' (진행 중)' : ''}`;
  return {
    key,
    label,
    accessibleLabel: `${name} · ${what} · ${label} 열기`,
    season: { ...season },
  };
}

export function managerHonourLabel(honour: ManagerHonour): string {
  switch (honour.kind) {
    case 'league-title':
    case 'cup-title':
      return `${honour.name} 우승`;
    case 'promotion':
      return `승격 · ${honour.fromName} → ${honour.toName}`;
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
    return { line: '성과 기록 없음', note: '이 기간의 우승·승격 기록은 확인할 수 없어요.' };
  const kinds = (Object.keys(HONOUR_KIND) as ManagerHonour['kind'][])
    .map((kind) => [kind, summary.honours.filter((honour) => honour.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${HONOUR_KIND[kind]} ${count}`);
  const partial = summary.honoursCoverage === 'partial';
  if (!kinds.length)
    return partial
      ? {
          line: '기록된 기간에는 우승·승격 없음',
          note: '기록 이전의 성과는 확인할 수 없어요.',
        }
      : { line: '우승·승격 없음' };
  return {
    line: kinds.join(' · '),
    ...(partial ? { note: '기록된 기간의 성과만 담았어요.' } : {}),
  };
}

function finishesView(name: string, summary: ManagerTenureSummary): ManagerAccomplishmentView[] {
  return summary.bestFinishes.flatMap((best) =>
    best.finishes.map((finish) => {
      const label = `${best.name} 최종 ${best.rank}위`;
      const key = `finish:${finish.season.year}:${best.division.country}:${best.division.tier}:${best.division.group}`;
      return {
        key,
        label,
        season: `${seasonName(finish.season.year)} · 최고 최종 순위`,
        ...(finish.sharedSeason ? { note: SHARED_FINISH } : {}),
        action: sourceAction(name, label, finish.season, key),
      };
    }),
  );
}

function finishesLine(summary: ManagerTenureSummary | null): string {
  if (!summary || summary.honoursCoverage === 'unavailable') return '최종 순위 기록 없음';
  if (!summary.bestFinishes.length)
    return summary.honoursCoverage === 'partial'
      ? '기록된 기간에 확정된 최종 순위 없음'
      : '확정된 리그 최종 순위 없음';
  return summary.bestFinishes.map((best) => `${best.name} 최고 ${best.rank}위`).join(' · ');
}

export function managerRecordView(record: ManagerMatchSummary | undefined): ManagerRecordView {
  const scope = MANAGER_HISTORY_COPY.scope;
  if (!record || record.coverage === 'unavailable')
    return {
      line: '경기 기록 없음',
      scope,
      note: '기록이 남아 있지 않아 승무패를 알 수 없어요.',
      known: false,
    };
  const note = record.coverage === 'partial' ? '기록된 기간의 경기만 · 통산 전체 아님' : undefined;
  if (!record.played)
    return {
      line: record.coverage === 'complete' ? '지휘한 공식전 없음' : '기록된 공식전 없음',
      rate: '승률 —',
      scope,
      ...(note ? { note } : {}),
      known: true,
    };
  return {
    line: `${record.played}경기 ${record.won}승 ${record.drawn}무 ${record.lost}패`,
    rate:
      record.winRate === null
        ? '승률 —'
        : `승률 ${Math.round(record.winRate * 100)}% · ${record.sampleSize}경기 기준`,
    scope,
    ...(note ? { note } : {}),
    known: true,
  };
}

function runView(label: string, run: ManagerRun | null, record: ManagerRecordView, played = 0) {
  if (!record.known) return { label, value: '기록 없음', ongoing: false };
  if (!run) return { label, value: played ? '없음' : '—', ongoing: false };
  return {
    label,
    value: `${run.count}경기${run.ongoing ? ' · 진행 중' : ''}`,
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
        row.manager.since === undefined ? '선임 시기 미상' : `${row.manager.since}년부터 재임`,
      tracking: '성과 기록 시작 전',
      ...(row.current ? { end: '현재 재임 중' } : {}),
    };
  const appointed = tenure.appointed;
  const service = appointed
    ? `선임 ${managerDate(appointed)}`
    : tenure.knownSince !== undefined
      ? `${tenure.knownSince}년부터 재임 (기록 이전)`
      : '선임일 미상';
  const tracked =
    !appointed || managerHistoryDateKey(appointed) !== managerHistoryDateKey(tenure.trackedFrom);
  const end = tenure.ended
    ? `떠남 ${managerDate(tenure.ended)}${tenure.departure ? ` · ${DEPARTURE[tenure.departure]}` : ''}`
    : row.current
      ? '현재 재임 중'
      : undefined;
  return {
    service,
    ...(tracked ? { tracking: `성과 기록 ${managerDate(tenure.trackedFrom)}부터` } : {}),
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
    badges: [...(row.current ? ['현재 감독'] : []), ...(row.manager.interim ? ['감독대행'] : [])],
    ...periodView(row),
    ...(row.coverage === 'complete' ? {} : { coverage: COVERAGE[row.coverage] }),
    honoursLine: honours.line,
    ...(honours.note ? { honoursNote: honours.note } : {}),
    honours: summary ? honoursView(name, summary) : [],
    finishesLine: finishesLine(summary),
    finishes: summary ? finishesView(name, summary) : [],
    provisional: (summary?.provisionalFinishes ?? []).map(
      (finish) =>
        `${seasonName(finish.season.year)} ${finish.name} 현재 ${finish.rank}위 · 진행 중이라 확정 전`,
    ),
    ...(summary?.unresolvedOutcomes.length
      ? { unresolved: `결과 세부를 읽지 못한 성과 ${summary.unresolvedOutcomes.length}건` }
      : {}),
    record,
    runs: [
      runView('최다 연승', summary?.winningRun ?? null, record, summary?.record.played),
      runView('최장 무패', summary?.unbeatenRun ?? null, record, summary?.record.played),
    ],
    sources: (summary?.sourceSeasons ?? []).map((season) =>
      sourceAction(
        name,
        '재임 시즌',
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
    note: '옛 기록 · 감독별 성과와 연결되지 않아요',
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
  const shown = `${page.rows.length} / ${page.total}건`;
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
