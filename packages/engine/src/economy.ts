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
    for (const p of w.academy?.players ?? []) p.wage = convert(p.wage);
    w.manager.wage = convert(w.manager.wage);
    for (const member of w.staff ?? []) member.wage = convert(member.wage);
    // Free agents' asking wages are prices on offer; managers at other clubs are derived each read.
    for (const m of w.managerMarket?.free ?? []) m.wage = convert(m.wage);
    // Open negotiations carry on in the new money; settled bids keep the units they closed in.
    for (const bid of w.bids ?? []) {
      if (bid.status !== 'pending' && bid.status !== 'countered') continue;
      bid.fee = convert(bid.fee);
      if (bid.counterFee !== undefined) bid.counterFee = convert(bid.counterFee);
      // The terms an outgoing bid keeps are asked in the money it is answered in.
      if (bid.offer) {
        bid.offer.fee = convert(bid.offer.fee);
        bid.offer.loanFee = convert(bid.offer.loanFee);
        bid.offer.player.wage = convert(bid.offer.player.wage);
      }
    }
    // The sponsor these rules sign, and the contracts a load moved one into (→SAVE-10).
    for (const sponsor of [...(w.sponsor ? [w.sponsor] : []), ...(w.sponsors ?? [])]) {
      sponsor.annual = convert(sponsor.annual);
      sponsor.bonus = convert(sponsor.bonus);
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
      `${before.code} → ${after.code} · 현금·계약·진행 중 입찰·호가 모두 환산 · 과거 장부 보존${before.estimated || after.estimated ? ' · 초기 화폐 단순화 추정' : ''}`,
    );
  }
  w.priceIndex = priceIndex(code, w.year).value;
}
