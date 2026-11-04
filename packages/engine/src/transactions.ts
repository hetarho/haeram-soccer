import { message as sourceMessage } from '../../contracts/src/messages';
import type { World } from '../../contracts/src/types';
import { operatingCosts } from './finance';

export function operatingCost(w: World) {
  return operatingCosts(w).annual;
}
export function credit(w: World, amount: string) {
  if (BigInt(amount) < 0) throw new Error(sourceMessage('copy.transactions.4afdf017e9'));
  w.cash = (BigInt(w.cash) + BigInt(amount)).toString();
  w.income = (BigInt(w.income) + BigInt(amount)).toString();
}
export function debit(w: World, amount: string, mandatory = false) {
  if (BigInt(amount) < 0) throw new Error(sourceMessage('copy.transactions.f9995b6e0b'));
  if (!mandatory && BigInt(w.cash) < BigInt(amount))
    throw new Error(sourceMessage('copy.playing_coach.8791d586e5'));
  w.cash = (BigInt(w.cash) - BigInt(amount)).toString();
  w.expense = (BigInt(w.expense) + BigInt(amount)).toString();
}
