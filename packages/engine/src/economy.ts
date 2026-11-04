import { message as sourceMessage } from '../../contracts/src/messages';
import type { World } from '../../contracts/src/types';
import { currency, priceIndex } from '../../catalogs/src/index';
import { ratio } from './primitives';
import { addEvent } from './events';
import { clubOf } from './player-state';
export function advanceEconomy(w: World, previousYear: number) {
  const code = clubOf(w).country,
    before = currency(code, previousYear),
    after = currency(code, w.year);
  if (w.currency !== after.code) {
    if (w.currency !== before.code) throw new Error(sourceMessage('copy.economy.34beff4028'));
    const convert = (amount: string) =>
      ratio(
        amount,
        after.num * before.den * BigInt(after.units),
        after.den * before.num * BigInt(before.units),
      );
    w.cash = convert(w.cash);
    w.income = convert(w.income);
    w.expense = convert(w.expense);
    for (const p of w.players) {
      p.wage = convert(p.wage);
      // An open contract talk is a price on offer: its demand and floor go on in the new money.
      if (p.talk) {
        p.talk.demand = convert(p.talk.demand);
        p.talk.floor = convert(p.talk.floor);
      }
    }
    for (const p of w.academy?.players ?? []) p.wage = convert(p.wage);
    w.manager.wage = convert(w.manager.wage);
    for (const member of w.staff ?? []) member.wage = convert(member.wage);
    for (const person of Object.values(w.people || {}))
      for (const job of person.employment) {
        if (job.to || !job.wage || job.currency !== before.code) continue;
        job.wage = convert(job.wage);
        job.currency = after.code;
      }
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
    // The owner's fortune and the FFP window's injections, and the takeover loan, go on in the
    // club's new money (→OWNER-1, ECON-38); the takeover's facts and season records keep theirs.
    if (w.owner) {
      w.owner.fortune = convert(w.owner.fortune);
      for (const injection of w.owner.ffpInjections) injection.amount = convert(injection.amount);
    }
    if (w.loan) {
      w.loan.balance = convert(w.loan.balance);
      w.loan.installment = convert(w.loan.installment);
    }
    w.currency = after.code;
    addEvent(
      w,
      'currency',
      sourceMessage('copy.economy.69414b9830'),
      sourceMessage('copy.economy.f8dff8e027', {
        p0: before.code,
        p1: after.code,
        p2: before.estimated || after.estimated ? sourceMessage('copy.economy.bb1964ac72') : '',
      }),
    );
  }
  w.priceIndex = priceIndex(code, w.year).value;
}
