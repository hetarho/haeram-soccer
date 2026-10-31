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
  A: '즉시 주전',
  B: '주전 보강',
  C: '경쟁 보강',
  D: '백업',
  E: '보강 효과 없음',
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
    picked && '감독이 고른 선수',
    met && `감독 요청 충족 · ${requestLabel(met)}`,
    short && `부족한 ${LINE_NAME[line]} 채움`,
    room >= c.growthRoom && age <= c.prospectAge && `성장 여지 +${room} · ${age}세`,
    offer.freeAgent && '자유계약 · 이적료 없음',
    fit.fitDelta > 0 && `전술 적합도 +${fit.fitDelta}`,
  ].filter((reason): reason is string => !!reason);
  const cons = [
    slot.settled - slot.arrival >= c.adaptationDrop &&
      `적응 전 ${slot.arrival} · 적응 후 ${slot.settled}`,
    age >= c.declineAge && `${age}세 · 속도·체력이 해마다 떨어지는 나이`,
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
