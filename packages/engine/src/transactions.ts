import type { World } from '../../contracts/src/types';
import { operatingCosts } from './finance';

export function operatingCost(w: World) {
  return operatingCosts(w).annual;
}
export function credit(w: World, amount: string) {
  if (BigInt(amount) < 0) throw new Error('음수 수입');
  w.cash = (BigInt(w.cash) + BigInt(amount)).toString();
  w.income = (BigInt(w.income) + BigInt(amount)).toString();
}
export function debit(w: World, amount: string, mandatory = false) {
  if (BigInt(amount) < 0) throw new Error('음수 지출');
  if (!mandatory && BigInt(w.cash) < BigInt(amount)) throw new Error('보유 자금이 부족합니다.');
  w.cash = (BigInt(w.cash) - BigInt(amount)).toString();
  w.expense = (BigInt(w.expense) + BigInt(amount)).toString();
}
