import type { ReinforcementPromise, World } from '../../contracts/src/types';
import { careerDate, careerOrdinal } from './person-careers';
import { lineOf } from './player';
import { pushInbox } from './inbox';
import { addEvent } from './world';
import { compareIds } from './primitives';
function finish(
  w: World,
  promise: ReinforcementPromise,
  status: Exclude<ReinforcementPromise['status'], 'pending'>,
  reason: string,
  arrival?: NonNullable<World['recruitmentArrivals']>[number],
) {
  if (promise.status !== 'pending') return;
  promise.status = status;
  promise.resolved = careerDate(w);
  promise.reason = reason;
  if (arrival) promise.arrival = { player: arrival.player, at: { ...arrival.at } };
  promise.reaction =
    status === 'fulfilled'
      ? `${promise.manager.name} 감독: 약속한 보강 선수가 도착한 것을 확인했어요.`
      : status === 'unfulfilled'
        ? `${promise.manager.name} 감독: 기한까지 보강 약속이 지켜지지 않은 것을 확인했어요.`
        : `${promise.manager.name} 감독의 퇴임으로 보강 약속을 취소했어요. 후임의 성과로 판단하지 않아요.`;
  pushInbox(w, {
    kind: 'staff-report',
    title: promise.reaction,
    detail: reason,
    attention: false,
    ref: promise.id,
  });
  addEvent(w, `promise-${status}`, promise.reaction, reason);
}
/** Actual departure hooks cancel commitments immediately, including before their judgement date. */
export function cancelPromises(w: World, manager: string, reason: string) {
  for (const promise of w.promises ?? [])
    if (promise.manager.id === manager && promise.status === 'pending')
      finish(w, promise, 'cancelled', reason);
}
/** Judgement waits until the day after the fixed deadline; actual deadline-day arrivals count. */
export function judgePromises(w: World) {
  const now = careerOrdinal(careerDate(w));
  for (const promise of w.promises ?? []) {
    if (promise.status !== 'pending') continue;
    if (promise.manager.id !== w.manager.id) {
      finish(w, promise, 'cancelled', '요청한 감독이 떠나 약속을 취소했어요.');
      continue;
    }
    const deadline = careerOrdinal(promise.deadline);
    if (now <= deadline) continue;
    const arrival = (w.recruitmentArrivals ?? [])
      .filter(
        (a) =>
          careerOrdinal(a.at) >= careerOrdinal(promise.created) &&
          careerOrdinal(a.at) <= deadline &&
          (promise.target.position
            ? (a.positions[promise.target.position] ?? 0) >= 2
            : lineOf(a.position) === promise.target.line),
      )
      .sort(
        (a, b) => careerOrdinal(a.at) - careerOrdinal(b.at) || compareIds(a.player, b.player),
      )[0];
    if (arrival)
      finish(
        w,
        promise,
        'fulfilled',
        `${arrival.name} 선수가 약속 기간에 실제로 외부에서 합류했어요.`,
        arrival,
      );
    else {
      const mediation = w.mediations?.find((m) => m.id === promise.mediation);
      finish(
        w,
        promise,
        'unfulfilled',
        `마감일까지 대상에 맞는 실제 외부 영입이 기록되지 않았어요.${mediation ? ` 약속 당시 중재 사유: ${mediation.directorReason}` : ''}`,
      );
    }
  }
}
