import { describe, expect, it } from 'vitest';
import {
  createWorld,
  defaultSettings,
  dailyMarket,
  staffSignings,
  contractTalks,
  activePlayers,
  seasonDayOf,
} from './index';
const world = () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Mixed Authority',
    color: '#224466',
    seed: 'authority-market',
    level: 'normal',
  });
  w.cash = w.income = '999999999999';
  w.round = 23;
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  w.settings = defaultSettings();
  return w;
};
describe('independent player business authority', () => {
  for (const recruitment of ['direct', 'delegated'] as const)
    for (const sales of ['direct', 'delegated'] as const) {
      it(`recruitment ${recruitment}, sales ${sales} use the actual bid direction`, () => {
        const w = world();
        Object.assign(w.settings!.responsibilities, { recruitment, sales });
        const keeper = activePlayers(w).find((p) => p.position === 'GK')!;
        keeper.status = 'sold';
        staffSignings(w);
        const purchases = w.events.filter((e) => e.kind === 'recruit');
        const outgoing = (w.bids ?? []).filter((b) => b.direction === 'out' && b.staff);
        expect(purchases.length + outgoing.length > 0).toBe(recruitment === 'delegated');
        const listed = activePlayers(w).find((p) => p.position !== 'GK' && !p.loanUntil)!;
        for (const key of Object.keys(listed.attrs) as (keyof typeof listed.attrs)[])
          listed.attrs[key] = 60;
        listed.potential = 70;
        listed.stance = 'listed';
        for (
          let day = 0;
          day < 29 && !(w.bids ?? []).some((b) => b.direction === 'in' && b.playerId === listed.id);
          day++
        ) {
          dailyMarket(w);
          w.calendar!.day++;
        }
        const bid = w.bids!.find((b) => b.direction === 'in' && b.playerId === listed.id)!;
        expect(bid).toBeDefined();
        expect(bid.status).toBe(sales === 'delegated' ? 'completed' : 'pending');
        expect(listed.status).toBe(sales === 'delegated' ? 'sold' : 'active');
      });
    }
  for (const contracts of ['direct', 'delegated'] as const) {
    it(`contract talks obey ${contracts} without following recruitment or automatic time`, () => {
      const w = world(),
        p = activePlayers(w)[0];
      w.settings!.responsibilities.contracts = contracts;
      w.settings!.responsibilities.recruitment = contracts === 'direct' ? 'delegated' : 'direct';
      p.until = w.year + 1;
      contractTalks(w);
      expect(!!p.talk).toBe(contracts === 'direct');
      expect(w.settings!.mode).toBe('automatic');
    });
  }
});
