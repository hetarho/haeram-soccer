/** The shared financial distress ladder; no random draws or presentation preferences. */
import type { DistressState } from '../../contracts/src/owner';
import type { World } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
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
) {
  if (!after?.stage || after.stage <= (before?.stage ?? 0)) return;
  DISTRESS_FLOW.observe?.(Object.freeze({ club, stage: after.stage }));
  if (club !== w.playerClub) return;
  const title = message(`finance.distress.stage${after.stage}`);
  const detail = message('finance.distress.entry', { stage: title });
  addEvent(w, 'distress-entry', title, detail);
  pushInbox(w, { kind: 'finance', title, detail, attention: false });
}

/** An injection can clear stages 1/2 immediately; stage 3 still requires its season close. */
export function repayDistress(w: World) {
  if (!w.distress || BigInt(w.cash) < 0n) return;
  w.distress = { ...w.distress, overHalfRounds: 0, stage: w.distress.stage === 3 ? 3 : undefined };
}
