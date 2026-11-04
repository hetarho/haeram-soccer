import { message as sourceMessage } from '../../contracts/src/messages';
/** The scout's verdict on a market candidate (→CLUB-47): a grade A–E and the facts behind it. */
import type { World } from '../../contracts/src/types';
import { LINE_NAME, requestLabel } from './player';
import { lineOfPlayer, overall } from './player-state';
import {
  meetsRequest,
  shortLines,
  signingRequests,
  signingVerdict,
  SIGNING_CONFIG,
} from './signings';
import type { recruitmentFit, TransferOffer } from './recruitment';

export type ScoutGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * The grade's thresholds on the slot gap, read from CLUB-33's measures: A at twice the request
 * margin, B at the request margin, C at 공격적's upgrade margin (the smallest the 단장 acts on).
 */
export const VERDICT_CONFIG = {
  starter: SIGNING_CONFIG.requestMargin * 2,
  upgrade: SIGNING_CONFIG.requestMargin,
  compete: 2,
  /** D holds while the gap stays above minus the request margin. */
  backup: -SIGNING_CONFIG.requestMargin,
  /** A prospect: this age or under, potential this far above the starter at his main position. */
  prospectAge: 23,
  prospectMargin: 5,
  /** Growth room worth naming at the prospect age or under. */
  growthRoom: 5,
  /** An arrival this far below settled is worth naming (→PLAYER-11). */
  adaptationDrop: 3,
  /** Pace and stamina fall each season from this age (→PLAYER-17). */
  declineAge: 29,
  reasons: 2,
};

export const GRADE_LABEL: Readonly<Record<ScoutGrade, string>> = {
  A: sourceMessage('copy.scout_verdict.2d1ec1ec21'),
  B: sourceMessage('copy.scout_verdict.f775780c2e'),
  C: sourceMessage('copy.scout_verdict.2047341e52'),
  D: sourceMessage('copy.scout_verdict.5948d5a94d'),
  E: sourceMessage('copy.scout_verdict.d3966ffecc'),
};

type Fit = ReturnType<typeof recruitmentFit>;

/**
 * The verdict for a candidate who is not ours (→CLUB-47), from the fit his detail already reads.
 * It reads the world only: the money check restores everything it tries.
 */
export function scoutVerdict(w: World, offer: TransferOffer & { own?: boolean }, fit: Fit) {
  if (offer.own) return undefined;
  const c = VERDICT_CONFIG,
    player = offer.player,
    age = w.year - player.born,
    line = lineOfPlayer(player),
    { slot } = fit,
    gap = slot.value - slot.starter.value;
  const short = shortLines(w).some((need) => need.line === line);
  const prospect =
    age <= c.prospectAge &&
    slot.position === player.position &&
    player.potential >= slot.starter.value + c.prospectMargin;
  const grade: ScoutGrade =
    gap >= c.starter
      ? 'A'
      : gap >= c.upgrade
        ? 'B'
        : gap >= c.compete || short || prospect
          ? 'C'
          : gap > c.backup
            ? 'D'
            : 'E';
  const requests = signingRequests(w),
    picked = requests.some((request) => request.pick === player.id),
    met = requests.find((request) => meetsRequest(request, player)),
    room = Math.round(player.potential) - overall(player),
    money = signingVerdict(w, player, offer.fee);
  const pros = [
    picked && sourceMessage('copy.scout_verdict.a4a3073d56'),
    met && sourceMessage('copy.scout_verdict.2f44de7c6d', { p0: requestLabel(met) }),
    short && sourceMessage('copy.scout_verdict.faae6c2da0', { p0: LINE_NAME[line] }),
    room >= c.growthRoom &&
      age <= c.prospectAge &&
      sourceMessage('copy.scout_verdict.cebb4afdcc', { p0: room, p1: age }),
    offer.freeAgent && sourceMessage('copy.RecruitmentDesk.6bf42e22d3'),
    fit.fitDelta > 0 && sourceMessage('copy.scout_verdict.d8545ab5e6', { p0: fit.fitDelta }),
  ].filter((reason): reason is string => !!reason);
  const cons = [
    slot.settled - slot.arrival >= c.adaptationDrop &&
      sourceMessage('copy.scout_verdict.995377e3ed', { p0: slot.arrival, p1: slot.settled }),
    age >= c.declineAge && sourceMessage('copy.scout_verdict.535d69bbd6', { p0: age }),
    !money.ok && money.reason,
  ].filter((reason): reason is string => !!reason);
  return {
    grade,
    label: GRADE_LABEL[grade],
    gap,
    slot: { position: slot.position, role: slot.role, value: slot.value },
    starter: slot.starter,
    pros: pros.slice(0, c.reasons),
    cons: cons.slice(0, c.reasons),
  };
}
export type ScoutVerdict = NonNullable<ReturnType<typeof scoutVerdict>>;
