import type { TrainingCoach, World } from '../../contracts/src/types';

/** Settled rounds a focus the owner had a coach take holds (→STAFF-19). */
export const ORDER_ROUNDS = 4;

/** One settled round of a coach's order passes; it ends after its last round. */
export function countDownOrder(w: World, coach: TrainingCoach) {
  const orders = w.trainingOrders,
    order = orders?.[coach];
  if (!orders || !order) return;
  if (order.rounds > 1) order.rounds -= 1;
  else delete orders[coach];
  if (!orders.assistant && !orders.youth) delete w.trainingOrders;
}
