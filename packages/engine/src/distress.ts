/** The shared financial distress ladder; no random draws or presentation preferences. */
import type { DistressState } from '../../contracts/src/owner';
import type { Player, World } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
import { SQUAD_MINIMUM } from './squad-size';
import { compareIds } from './primitives';
import { emptyTable, groupKey } from './league-fixtures';
import { seasonAfter } from './wartime';
import { addEvent } from './events';
import { pushInbox } from './inbox';

export const DISTRESS = {
  warning: 0.25,
  forcedSales: 0.5,
  administration: 1,
  saleRounds: 8,
  saleShare: 0.7,
  points: 10,
  writeOff: 0.5,
};
export interface DistressFact {
  readonly club: string;
  readonly stage?: 1 | 2 | 3;
  readonly pointsDeducted?: number;
}
/** Passive receipts contain only scalar facts, never mutable game objects. */
export const DISTRESS_FLOW: { observe?: (fact: Readonly<DistressFact>) => void } = {};
export const distressStage = (state?: DistressState) => state?.stage;
const above = (debt: bigint, annual: bigint, share: number) =>
  debt * 1000n > annual * BigInt(Math.round(share * 1000));
const below = (debt: bigint, annual: bigint, share: number) =>
  debt * 1000n < annual * BigInt(Math.round(share * 1000));

/** One settled league round; a close can release stage 3 but never counts another round. */
export function stepDistress(
  previous: DistressState | undefined,
  debt: bigint,
  annual: bigint,
  date: { year: number; round: number },
  closed = false,
): DistressState | undefined {
  if (!closed && previous?.lastRound?.year === date.year && previous.lastRound.round === date.round)
    return previous;
  let stage = previous?.stage;
  let rounds = previous?.overHalfRounds ?? 0;
  if (!closed) rounds = above(debt, annual, DISTRESS.forcedSales) ? rounds + 1 : 0;
  if (stage === 3) {
    if (closed && below(debt, annual, DISTRESS.forcedSales))
      stage = debt <= 0n ? undefined : below(debt, annual, DISTRESS.warning) ? 1 : 2;
  } else if (stage === 2 && below(debt, annual, DISTRESS.warning)) {
    stage = debt <= 0n ? undefined : 1;
  } else if (stage === 1 && debt <= 0n) stage = undefined;
  if (!closed) {
    if (above(debt, annual, DISTRESS.administration)) stage = 3;
    else if (stage !== 3 && rounds >= DISTRESS.saleRounds) stage = 2;
    else if (!stage && above(debt, annual, DISTRESS.warning)) stage = 1;
  }
  // Preserve absence in unaffected old worlds. A counted round is retained for idempotence.
  if (!previous && !stage && !rounds) return undefined;
  return {
    ...previous,
    stage,
    overHalfRounds: rounds,
    ...(!closed ? { lastRound: { ...date } } : {}),
  };
}

/** Reports an upward stage entry once; exits have no entry receipt or inbox item. */
export function reportDistress(
  w: World,
  club: string,
  before?: DistressState,
  after?: DistressState,
  debt = BigInt(w.cash) < 0n ? -BigInt(w.cash) : 0n,
) {
  if (!after?.stage || after.stage <= (before?.stage ?? 0)) return;
  const writtenOff =
    after.stage === 3 ? (debt * BigInt(Math.round(DISTRESS.writeOff * 1000))) / 1000n : undefined;
  const pointsDeducted = after.stage === 3 ? administrationDeduction(w, club, after) : undefined;
  if (club === w.playerClub && writtenOff !== undefined) {
    // Administrative relief changes debt, never income or operating profit.
    w.cash = (BigInt(w.cash) + writtenOff).toString();
    addEvent(
      w,
      'debt-write-off',
      message('finance.distress.writeOff'),
      message('finance.distress.writeOffDetail'),
      writtenOff.toString(),
    );
  }
  DISTRESS_FLOW.observe?.(
    Object.freeze({ club, stage: after.stage, ...(pointsDeducted ? { pointsDeducted } : {}) }),
  );
  if (club === w.playerClub) {
    const title = message(`finance.distress.stage${after.stage}`);
    const detail = message('finance.distress.entry', { stage: title });
    addEvent(w, 'distress-entry', title, detail);
    pushInbox(w, { kind: 'finance', title, detail, attention: false });
  }
  return writtenOff;
}

/** An injection can clear stages 1/2 immediately; stage 3 still requires its season close. */
export function repayDistress(w: World) {
  if (!w.distress || BigInt(w.cash) < 0n) return;
  w.distress = { ...w.distress, overHalfRounds: 0, stage: w.distress.stage === 3 ? 3 : undefined };
}

/** Stage 2 and administration share the assigned market sanctions. */
export const forcedSales = (state?: DistressState) => (state?.stage ?? 0) >= 2;

/** A free signing may only restore the minimum or a missing keeper (→CLUB-5). */
export function distressFreeNeed(
  players: readonly Pick<Player, 'id' | 'position'>[],
  player: Pick<Player, 'position'>,
) {
  return (
    players.length < SQUAD_MINIMUM ||
    (player.position === 'GK' && !players.some((p) => p.position === 'GK'))
  );
}
/** Open owner and delegated bids both reserve future squad places; never count an ID twice. */
export function distressSigningReason(
  w: World,
  player: Player,
  free: boolean,
  loan = false,
  replacingBid?: string,
) {
  if (!forcedSales(w.distress)) return undefined;
  if (!free || loan) return message('finance.distress.noSigning');
  const players = new Map(w.players.filter((p) => p.status === 'active').map((p) => [p.id, p]));
  for (const bid of w.bids ?? [])
    if (
      bid.id !== replacingBid &&
      bid.direction === 'out' &&
      bid.year === w.year &&
      (bid.status === 'pending' || bid.status === 'countered') &&
      bid.offer
    )
      players.set(bid.playerId, bid.offer.player);
  return distressFreeNeed([...players.values()], player)
    ? undefined
    : message('finance.distress.freeMinimum');
}

/** Most valuable first, at the guaranteed acceptance price, respecting cumulative departure gates. */
export function distressSalePlan(
  players: readonly Player[],
  debt: bigint,
  annual: bigint,
  value: (player: Player) => bigint,
  canSell: (remaining: readonly Player[], player: Player) => boolean,
) {
  const remaining = [...players],
    listed: Player[] = [];
  const rows = players
    .map((p) => ({ p, value: value(p) }))
    .sort((a, b) =>
      a.value === b.value ? compareIds(a.p.id, b.p.id) : a.value > b.value ? -1 : 1,
    );
  for (const row of rows) {
    if (debt * 1000n < annual * BigInt(Math.round(DISTRESS.forcedSales * 1000))) break;
    if (!canSell(remaining, row.p)) continue;
    listed.push(row.p);
    remaining.splice(remaining.indexOf(row.p), 1);
    debt -= distressSaleFee(row.value);
  }
  return listed;
}
export const distressSaleFee = (value: bigint) =>
  (value * BigInt(Math.round(DISTRESS.saleShare * 1000)) + 999n) / 1000n;

/** Apply a due deduction to the new table once, without fabricating fields in old saves. */
export function applyPendingDeductions(w: World) {
  for (const club of w.clubs) {
    const state = club.id === w.playerClub ? w.distress : club.books?.distress;
    const pending = state?.pendingDeduction;
    if (!state || !pending || pending.season !== w.year) continue;
    const row = (w.tables[club.id] ??= emptyTable());
    if (row.deductionReason === 'administration') {
      delete state.pendingDeduction;
      continue;
    }
    row.deducted = (row.deducted ?? 0) + pending.points;
    row.deductionReason = 'administration';
    delete state.pendingDeduction;
    DISTRESS_FLOW.observe?.(Object.freeze({ club: club.id, pointsDeducted: pending.points }));
  }
}
/** Entries after the league's last settled round affect its following season, even before the close. */
function administrationDeduction(w: World, clubId: string, state: DistressState) {
  const club = w.clubs.find((c) => c.id === clubId)!;
  const fixtures = w.fixtures.filter(
    (f) => f.kind === 'league' && f.year === w.year && f.groupKey === groupKey(club),
  );
  const ended = fixtures.length > 0 && fixtures.every((f) => !!f.score);
  const season = ended ? seasonAfter(w.year) : w.year;
  if (state.deductionSeason === w.year) return undefined;
  state.deductionSeason = w.year;
  if (ended) {
    state.pendingDeduction = { season, points: DISTRESS.points };
    return undefined;
  }
  const row = (w.tables[clubId] ??= emptyTable());
  // A retained table receipt also protects a save whose optional distress season marker is absent.
  if (row.deductionReason === 'administration') return undefined;
  row.deducted = (row.deducted ?? 0) + DISTRESS.points;
  row.deductionReason = 'administration';
  return DISTRESS.points;
}
