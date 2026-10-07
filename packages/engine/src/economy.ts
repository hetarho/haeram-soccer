import type { World } from '../../contracts/src/types';
import { currency, priceIndex } from '../../catalogs/src/index';
import { ratio } from './primitives';
import { addEvent, clubOf } from './world';
export function advanceEconomy(w: World, previousYear: number) {
  const code = clubOf(w).country,
    before = currency(code, previousYear),
    after = currency(code, w.year);
  if (w.currency !== after.code) {
    if (w.currency !== before.code) throw new Error('화폐 전환의 원본 단위가 일치하지 않습니다.');
    const convert = (amount: string) =>
      ratio(
        amount,
        after.num * before.den * BigInt(after.units),
        after.den * before.num * BigInt(before.units),
      );
    w.cash = convert(w.cash);
    w.income = convert(w.income);
    w.expense = convert(w.expense);
    for (const p of w.players) p.wage = convert(p.wage);
    w.manager.wage = convert(w.manager.wage);
    if (w.sponsor) {
      w.sponsor.annual = convert(w.sponsor.annual);
      w.sponsor.bonus = convert(w.sponsor.bonus);
    }
    for (const c of w.campaigns) {
      c.cost = convert(c.cost);
      c.income = convert(c.income);
    }
    w.currency = after.code;
    addEvent(
      w,
      'currency',
      '새로운 화폐의 시대',
      `${before.code} → ${after.code} · 명목 잔고와 미지급 계약만 환산 · 과거 장부 보존${before.estimated || after.estimated ? ' · 초기 화폐 단순화 추정' : ''}`,
    );
  }
  w.priceIndex = priceIndex(code, w.year).value;
}
