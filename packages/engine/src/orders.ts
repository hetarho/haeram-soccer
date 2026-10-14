import type { TrainingCoach, World } from '../../contracts/src/types';

/** Settled rounds a focus the owner had a coach take holds (→STAFF-19). */
export const ORDER_ROUNDS = 4;

/** Drops the training orders once nothing is left in them. */
export function tidyOrders(w: World) {
  const orders = w.trainingOrders;
  if (
    orders &&
    !orders.assistant &&
    !orders.youth &&
    !orders.players &&
    !orders.asked &&
    orders.hardStreak === undefined
  )
    delete w.trainingOrders;
}

/** One settled round of a coach's order passes; it ends after its last round. */
export function countDownOrder(w: World, coach: TrainingCoach) {
  const orders = w.trainingOrders,
    order = orders?.[coach];
  if (!orders || !order) return;
  if (order.rounds > 1) order.rounds -= 1;
  else delete orders[coach];
  tidyOrders(w);
}

/**
 * One settled round of each player's own order passes (→CLUB-11, STAFF-19); a player who left the
 * squad takes his with him. A suggestion's wait ends with the season.
 */
export function countDownPlayerOrders(w: World) {
  const orders = w.trainingOrders;
  if (!orders) return;
  const active = new Set(w.players.filter((p) => p.status === 'active').map((p) => p.id));
  if (orders.players) {
    for (const [id, order] of Object.entries(orders.players)) {
      if (!active.has(id) || order.rounds <= 1) delete orders.players[id];
      else order.rounds -= 1;
    }
    if (!Object.keys(orders.players).length) delete orders.players;
  }
  if (orders.asked) {
    for (const [id, asked] of Object.entries(orders.asked))
      if (!active.has(id) || asked.year !== w.year) delete orders.asked[id];
    if (!Object.keys(orders.asked).length) delete orders.asked;
  }
  tidyOrders(w);
}
