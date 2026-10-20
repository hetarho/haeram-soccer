import { legacySettings } from './responsibilities';
import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { activePlayers, clubOf, divisionStrength, marketWageAt, overall, rating } from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { closedSeason, founded, toLastRound } from './season.testkit';

describe('closed season archive', () => {
  it('renews no contract by itself: unrenewed players leave at the close (→CLUB-26, CLUB-28)', () => {
    const { w, year, contracts } = cachedWorld('unrenewed-last-round', () => {
      const w = founded();
      // Unanswered talks stay open: nobody signs for the owner.
      w.intervention = 1;
      w.settings = legacySettings(1);
      for (const p of w.players) p.until = w.year + 1;
      const year = w.year,
        contracts = w.players.map((p) => [p.id, { wage: p.wage, until: p.until }] as const);
      return { w: toLastRound(w), year, contracts };
    });
    const before = new Map(contracts);
    closedSeason(w);
    const founders = w.players.filter((p) => before.has(p.id)),
      left = founders.filter((p) => p.status === 'sold');
    // Each asked to renew on 1 January instead, and left unrenewed; one who announced his
    // retirement in spring needed no renewal.
    const asked = new Set(
      (w.inbox || []).filter((item) => item.kind === 'contract-talk').map((item) => item.ref),
    );
    expect(left.length).toBeGreaterThan(0);
    for (const p of founders) {
      expect(asked.has(p.id)).toBe(true);
      expect(p.status === 'sold' || p.retiring === year).toBe(true);
      expect({ wage: p.wage, until: p.until }).toEqual(before.get(p.id));
      expect(p.talk).toBeUndefined();
    }
    expect(w.events.some((e) => e.kind === 'contract')).toBe(false);
    // Before 1996 every departure brings his new club's compensation; youth fill the squad.
    const paid = w.events.filter(
      (e) => e.year === year + 1 && e.kind === 'free-transfer-compensation',
    );
    expect(paid).toHaveLength(left.length);
    expect(w.players.filter((p) => p.status === 'active')).toHaveLength(20);
  });

  it('refills a squad its expiring contracts emptied at its division’s level and wage (→CLUB-3, CLUB-25, CLUB-28)', () => {
    const w = cachedWorld('expiring-xi-last-round', () => {
      const w = founded();
      w.intervention = 1;
      w.settings = legacySettings(1);
      // An XI far above the amateur league and the division it goes up to.
      for (const p of w.players) {
        p.until = w.year + 1;
        for (const a of ATTRIBUTES) p.attrs[a] = 90;
      }
      return toLastRound(w);
    });
    const { live } = closedSeason(w);
    const own = clubOf(w),
      xi = rating(live, clubOf(live)),
      level = divisionStrength(w),
      youths = activePlayers(w).filter((p) => p.id.startsWith(`${w.playerClub}:youth:`));
    // The champions go up: the division they will play in is the professional one above.
    expect(own.tier).toBeLessThan(live.clubs.find((c) => c.id === own.id)!.tier);
    expect(xi).toBeGreaterThan(level + 30);
    // Nobody who played the season stays: expiry and retirement emptied the squad.
    expect(activePlayers(w).filter((p) => live.players.some((x) => x.id === p.id))).toEqual([]);
    expect(youths.length).toBeGreaterThanOrEqual(11);
    // Each comes in about five below the division (±9 per attribute), not against the old XI.
    for (const p of youths) {
      expect(overall(p)).toBeGreaterThanOrEqual(level - 5 - 9);
      expect(overall(p)).toBeLessThan(xi - 15);
      expect(p.born).toBe(w.year - 18);
      // On the market wage of the division he joins.
      expect(p.wage).toBe(marketWageAt(own.country, w.year, own.tier, p));
    }
    const mean = youths.reduce((sum, p) => sum + overall(p), 0) / youths.length;
    expect(mean).toBeGreaterThan(level - 8);
    expect(mean).toBeLessThan(level + 2);
  });
});
