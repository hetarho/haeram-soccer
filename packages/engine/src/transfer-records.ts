/**
 * Our club's fee transfers (→HIST-20): the facts the writers record as a signing, sale or loan
 * completes, and their ranking in today's money. A read leaf: the records room imports it.
 */
import type { Event, Player, TransferFact, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { clubOf } from './player-state';
import { ratio } from './primitives';
import { quote } from './quotes';

/** A past amount in today's money, in minor units: price index and currency change applied. */
export function inTodayMoney(
  w: Pick<World, 'clubs' | 'playerClub' | 'year'>,
  amount: string,
  year: number,
) {
  const code = clubOf(w).country;
  return ratio(amount, BigInt(quote(code, w.year, 10000)), BigInt(quote(code, year, 10000)));
}

/** What a writer knows of a completed move; the date, currency and person link are read here. */
export interface TransferMove {
  direction: TransferFact['direction'];
  loan: boolean;
  player: Pick<Player, 'id' | 'name'>;
  club?: string;
  fee: string;
}

/**
 * Keeps one fact for a completed fee move, just before its ledger entry is added. A free move
 * keeps none. The first fact marks where the older career's ledger ends, so no hook at founding
 * or load is needed: a career that never recorded one ranks all its ledger entries.
 */
export function recordTransfer(w: World, fact: TransferMove) {
  if (BigInt(fact.fee) <= 0n) return;
  const records = (w.transfers ??= { ledgerBefore: w.events.length, facts: [] });
  records.facts.push({
    direction: fact.direction,
    loan: fact.loan,
    player: fact.player.id,
    ...(w.people?.[fact.player.id] ? { person: fact.player.id } : {}),
    name: fact.player.name,
    ...(fact.club ? { club: fact.club } : {}),
    fee: fact.fee,
    currency: w.currency,
    year: w.year,
    day: currentDay(w),
  });
}

/** An older career's fee entry: its ledger line and its place in `w.events`. */
export interface TransferLedgerEntry {
  event: Event;
  index: number;
}

/**
 * The older career's fee entries (→HIST-20, SAVE-24): transfer-in and transfer-out lines with an
 * amount before the first recorded fact, all of them while none is. They keep only their own text.
 */
export function transferLedger(w: Pick<World, 'transfers' | 'events'>): TransferLedgerEntry[] {
  const entries: TransferLedgerEntry[] = [],
    end = Math.min(w.transfers?.ledgerBefore ?? w.events.length, w.events.length);
  for (let index = 0; index < end; index++) {
    const event = w.events[index]!;
    if (
      (event.kind === 'transfer-in' || event.kind === 'transfer-out') &&
      event.amount &&
      BigInt(event.amount) > 0n
    )
      entries.push({ event, index });
  }
  return entries;
}

/** One ranked fee: a recorded fact, or an older career's ledger entry with only its own text. */
export type TransferRow = (
  { source: 'fact'; fact: TransferFact } | ({ source: 'ledger' } & TransferLedgerEntry)
) & {
  /** The fee in today's money, minor units. */
  today: string;
};

const LEDGER_KIND = { in: 'transfer-in', out: 'transfer-out' } as const;

/**
 * Our fees in one direction, all seasons or `year`'s, highest in today's money first; equal fees
 * keep the earlier move first (rows are built in date order and the sort is stable). A reader
 * whose world keeps only recent events passes the full career's `ledger`.
 */
export function transferRanking(
  w: Pick<World, 'transfers' | 'events' | 'clubs' | 'playerClub' | 'year'>,
  { direction, year }: { direction: TransferFact['direction']; year?: number },
  ledger: readonly TransferLedgerEntry[] = transferLedger(w),
): TransferRow[] {
  const rows: TransferRow[] = [],
    kind = LEDGER_KIND[direction];
  for (const { event, index } of ledger) {
    if (event.kind !== kind || (year !== undefined && event.year !== year)) continue;
    rows.push({
      source: 'ledger',
      event,
      index,
      today: inTodayMoney(w, event.amount!, event.year),
    });
  }
  for (const fact of w.transfers?.facts ?? []) {
    if (fact.direction !== direction || (year !== undefined && fact.year !== year)) continue;
    rows.push({ source: 'fact', fact, today: inTodayMoney(w, fact.fee, fact.year) });
  }
  return rows.sort((a, b) => {
    const x = BigInt(a.today),
      y = BigInt(b.today);
    return x === y ? 0 : x > y ? -1 : 1;
  });
}
