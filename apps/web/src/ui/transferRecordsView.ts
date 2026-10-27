import type { TransferFact, World } from '../../../../packages/contracts/src/types';
import {
  transferRanking,
  type TransferLedgerEntry,
} from '../../../../packages/engine/src/transfer-records';
import { LEADER_LIMIT, nextLeaderCount } from './careerRecords';

/** 이적 기록's two boards (→WEB-54). */
export const TRANSFER_BOARDS = [
  ['in', '영입'],
  ['out', '매각'],
] as const;
export type TransferBoard = TransferFact['direction'];

/** The fields the boards read; the older career's ledger comes with the view (→HIST-20). */
export type TransferWorld = Pick<
  World,
  'transfers' | 'events' | 'players' | 'clubs' | 'year' | 'playerClub'
>;

/** One ranked fee as the board shows it. */
export interface TransferRecordRow {
  key: string;
  rank: number;
  /** His name, or an older career's entry as it was recorded. */
  label: string;
  /** The player whose sheet the name opens, when he is retained (→WEB-59). */
  player?: string;
  /** The other club's team sheet, when known (→WEB-58). */
  club?: string;
  year: number;
  /** 이적 or 임대; an older ledger entry says neither. */
  kind?: '이적' | '임대';
  /** Minor units in today's money, and as paid in that season's money. */
  today: string;
  fee: string;
}

/** Seasons with any recorded fee, newest first: the season selector's choices after 전체. */
export function transferSeasons(w: TransferWorld, ledger: readonly TransferLedgerEntry[]) {
  const years = new Set([
    ...ledger.map((entry) => entry.event.year),
    ...(w.transfers?.facts ?? []).map((fact) => fact.year),
  ]);
  return [...years].sort((a, b) => b - a);
}

/**
 * One board's first `shown` rows, ranked by the fee in today's money (→HIST-20), and how many
 * 더 보기 would show next: ten more up to 100, as on 선수 통산 (→WEB-54).
 */
export function transferRecordsView(
  w: TransferWorld,
  ledger: readonly TransferLedgerEntry[],
  { direction, year, shown }: { direction: TransferBoard; year?: number; shown: number },
) {
  const ranked = transferRanking(w, { direction, year }, ledger).slice(0, LEADER_LIMIT);
  const rows = ranked.slice(0, shown).map((row, i): TransferRecordRow => {
    if (row.source === 'ledger')
      return {
        key: `ledger:${row.index}`,
        rank: i + 1,
        label: row.event.title,
        year: row.event.year,
        today: row.today,
        fee: row.event.amount!,
      };
    const { fact } = row;
    return {
      key: `fact:${i}:${fact.player}:${fact.year}:${fact.day}`,
      rank: i + 1,
      label: fact.name,
      ...(w.players.some((p) => p.id === fact.player) ? { player: fact.player } : {}),
      ...(fact.club && w.clubs.some((c) => c.id === fact.club) ? { club: fact.club } : {}),
      year: fact.year,
      kind: fact.loan ? '임대' : '이적',
      today: row.today,
      fee: fact.fee,
    };
  });
  return { rows, total: ranked.length, next: nextLeaderCount(shown, ranked.length) };
}
