import { message as sourceMessage } from '../../contracts/src/messages';
import type { ReinforcementPromise, World } from '../../contracts/src/types';
import { careerDate, careerOrdinal } from './person-careers';
import { lineOf } from './player';
import { pushInbox } from './inbox';
import { addEvent } from './events';
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
      ? sourceMessage('copy.promises.ad9da72818', { p0: promise.manager.name })
      : status === 'unfulfilled'
        ? sourceMessage('copy.promises.06ed47b9e4', { p0: promise.manager.name })
        : sourceMessage('copy.promises.3767b80bda', { p0: promise.manager.name });
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
      finish(w, promise, 'cancelled', sourceMessage('copy.promises.c186ff5725'));
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
        sourceMessage('copy.promises.f4600dd0fb', { p0: arrival.name }),
        arrival,
      );
    else {
      const mediation = w.mediations?.find((m) => m.id === promise.mediation);
      finish(
        w,
        promise,
        'unfulfilled',
        sourceMessage('copy.promises.a321414e54', {
          p0: mediation
            ? sourceMessage('copy.promises.f5c0154009', { p0: mediation.directorReason })
            : '',
        }),
      );
    }
  }
}
