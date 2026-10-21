import type {
  ManagerAttributedMatch,
  ManagerDivisionRef,
  ManagerHistoryFacts,
  ManagerHistoryIdentity,
  ManagerOutcomeSource,
  ManagerTenure,
} from './manager-history';
import type { CareerDate, Event } from './types';

export type ManagerHistoryCoverage = 'complete' | 'partial' | 'unavailable';
export interface ManagerSourceSeason {
  year: number;
  club: string;
}
export interface ManagerHistoryMatch {
  match: ManagerAttributedMatch;
  at: CareerDate;
  /** Stable settlement order, including fixtures played on the same day. */
  order: number;
  competition: string;
}
/** Explicit authoritative source snapshots, including an optional provisional current table. */
export interface ManagerHistorySeason {
  year: number;
  league?: {
    division: ManagerDivisionRef;
    name: string;
    rank: number;
    final: boolean;
  };
  cups: readonly { competition: string; name: string; winner: string; final: boolean }[];
  promotions: readonly {
    club: string;
    from: ManagerDivisionRef;
    to: ManagerDivisionRef;
    fromName: string;
    toName: string;
    final: boolean;
  }[];
}
export interface ManagerLegacyEvent {
  /** Retained event ID/order supplied by the adapter; never inferred from prose. */
  id: string;
  order: number;
  event: Pick<Event, 'year' | 'round' | 'kind' | 'title' | 'detail'>;
  at?: CareerDate;
}
export interface ManagerHistorySource {
  facts?: ManagerHistoryFacts;
  club: string;
  currentManager?: ManagerHistoryIdentity;
  matches: readonly ManagerHistoryMatch[];
  seasons: readonly ManagerHistorySeason[];
  /** Already selected readable personnel events, kept separate from structured tenures. */
  personnelEvents: readonly ManagerLegacyEvent[];
  /** An adapter with missing source archives must say so rather than claim complete totals. */
  matchesComplete?: boolean;
  outcomesComplete?: boolean;
}
export interface ManagerRunEndpoint {
  match: string;
  at: CareerDate;
  competition: string;
}
export interface ManagerRun {
  count: number;
  start: ManagerRunEndpoint;
  end: ManagerRunEndpoint;
  ongoing: boolean;
}
export interface ManagerMatchSummary {
  scope: 'all-official-own-matches-90-minutes';
  coverage: ManagerHistoryCoverage;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** 0..1; unavailable when the recorded denominator is zero. */
  winRate: number | null;
  sampleSize: number;
}
interface ManagerHonourBase {
  source: ManagerOutcomeSource;
  season: ManagerSourceSeason;
  at: CareerDate;
  sharedSeason: boolean;
}
export type ManagerHonour =
  | (ManagerHonourBase & {
      kind: 'league-title';
      division: ManagerDivisionRef;
      name: string;
    })
  | (ManagerHonourBase & { kind: 'cup-title'; competition: string; name: string })
  | (ManagerHonourBase & {
      kind: 'promotion';
      from: ManagerDivisionRef;
      to: ManagerDivisionRef;
      fromName: string;
      toName: string;
    });
export interface ManagerFinalFinish {
  division: ManagerDivisionRef;
  name: string;
  rank: number;
  season: ManagerSourceSeason;
  sharedSeason: boolean;
}
export interface ManagerBestFinish {
  division: ManagerDivisionRef;
  name: string;
  rank: number;
  /** All seasons tied for this scoped best; each keeps its season-record link. */
  finishes: ManagerFinalFinish[];
}
export interface ManagerTenureSummary {
  coverage: ManagerHistoryCoverage;
  honoursCoverage: ManagerHistoryCoverage;
  honours: ManagerHonour[];
  /** Known attribution whose authoritative result details are not available in this read. */
  unresolvedOutcomes: {
    source: ManagerOutcomeSource;
    season: ManagerSourceSeason;
    at: CareerDate;
  }[];
  bestFinishes: ManagerBestFinish[];
  record: ManagerMatchSummary;
  winningRun: ManagerRun | null;
  unbeatenRun: ManagerRun | null;
  sourceSeasons: ManagerSourceSeason[];
  /** Never included in honours/bestFinishes; relevant only to the current tenure. */
  provisionalFinishes: Omit<ManagerFinalFinish, 'sharedSeason'>[];
}
export interface ManagerTenureRow {
  kind: 'tenure';
  id: string;
  /** Null only for the known current manager before tracking is activated. */
  tenure: ManagerTenure | null;
  manager: ManagerHistoryIdentity;
  current: boolean;
  coverage: ManagerHistoryCoverage;
  /** Null means unknown; a tracked zero is an actual summary with zero counts. */
  summary: ManagerTenureSummary | null;
}
export interface ManagerLegacyEventRow {
  kind: 'legacy-event';
  id: string;
  event: ManagerLegacyEvent;
  coverage: 'unavailable';
}
export type ManagerHistoryRow = ManagerTenureRow | ManagerLegacyEventRow;
export interface ManagerHistoryPage {
  rows: ManagerHistoryRow[];
  nextCursor: string | null;
  total: number;
  pageSize: number;
}
export class ManagerHistoryQueryError extends Error {
  readonly code: 'invalid-cursor' | 'invalid-source';
  constructor(code: ManagerHistoryQueryError['code'], message: string) {
    super(message);
    this.name = 'ManagerHistoryQueryError';
    this.code = code;
  }
}
