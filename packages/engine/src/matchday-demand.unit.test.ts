import { describe, expect, it } from 'vitest';
import type { MatchRecord, World } from '../../contracts/src/types';
import { fanFollowing } from './fans';
import { FINANCE_CONFIG, gateProjection } from './finance';
import { TICKET_PRESETS } from './presets';
import { gate, readGateDetail } from './settlement';
import { stadiumCapacity } from './facilities';
import { withOwner } from './testing';
import { worldMarketFixture } from './world-market.testkit';

/** The owned club at a reputation and ground: step 9 holds 105,000 seats, step 8 90,000, step 5 40,000. */
function fixture(reputation: number, stadium: number, owned = true) {
  const w = worldMarketFixture();
  const club = w.clubs[0]!;
  club.reputation = reputation;
  club.fans = fanFollowing(reputation);
  w.stadium = stadium;
  if (owned) withOwner(w);
  return w;
}

describe('a popular owned club’s matchday demand (→ECON-9)', () => {
  it.each(TICKET_PRESETS)(
    'fills every seat of 90,000 at preset %s with a following of 80',
    (ticket) => {
      const w = fixture(80, 8);
      w.ticket = ticket;
      const projection = gateProjection(w);
      expect(projection.capacity).toBe(90_000);
      expect(projection.travellingSupporters).toBeGreaterThan(0);
      expect(projection.attendanceLow).toBe(90_000);
      expect(projection.attendanceHigh).toBe(90_000);
    },
  );

  it.each(TICKET_PRESETS)(
    'fills every seat of the 105,000-seat rebuild at preset %s with a following of 80 (→ECON-29)',
    (ticket) => {
      const w = fixture(80, 9);
      w.ticket = ticket;
      const projection = gateProjection(w);
      expect(projection.capacity).toBe(105_000);
      expect(projection.attendanceLow).toBe(105_000);
      expect(projection.attendanceHigh).toBe(105_000);
    },
  );

  it('settles a home match at the top preset as a real sellout', () => {
    const w = fixture(80, 8);
    w.ticket = 0.12;
    w.tables[w.playerClub] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
    const match = {
      id: 'sellout:1',
      kind: 'league',
      home: w.playerClub,
      away: 'foreign',
      year: w.year,
      score: { home: 1, away: 0 },
    } as unknown as MatchRecord;
    gate(w, match);
    const event = w.events.find((e) => e.kind === 'gate')!;
    expect(readGateDetail(event.detail)).toEqual({ attendance: 90_000, matchId: 'sellout:1' });
  });

  it('keeps an ordinary reputation-50 club below its 40,000 seats, near the catchment-only gate', () => {
    const owned = fixture(50, 5),
      baseline = fixture(50, 5, false);
    owned.ticket = baseline.ticket = 0.12;
    expect(stadiumCapacity(owned)).toBe(40_000);
    const projection = gateProjection(owned);
    expect(projection.travellingSupporters).toBe(0);
    expect(projection.attendanceHigh).toBeLessThan(40_000);
    expect(projection.attendanceHigh).toBeCloseTo(gateProjection(baseline).attendanceHigh, -2);
    expect(projection.attendanceLow).toBeCloseTo(gateProjection(baseline).attendanceLow, -2);
  });

  it('adds only the travelling share of followers outside the catchment', () => {
    const w = fixture(80, 8),
      projection = gateProjection(w);
    const outside = w.clubs[0]!.fans - projection.supporters;
    expect(projection.travellingSupporters).toBeCloseTo(
      outside * FINANCE_CONFIG.travellingShare,
      5,
    );
  });

  it('still moves a gate with seats empty by opponent and fan mood', () => {
    const w = fixture(50, 5);
    w.ticket = 0.12;
    const opponent = (reputation: number) => {
      const copy = structuredClone(w);
      copy.clubs[1]!.reputation = reputation;
      return gateProjection(copy, undefined, 'foreign').attendanceHigh;
    };
    expect(opponent(90)).toBeGreaterThan(opponent(1));
    const mood = (fanMood: number) => {
      const copy = structuredClone(w);
      copy.owner!.fanMood = fanMood;
      return gateProjection(copy).attendanceHigh;
    };
    expect(mood(100)).toBeGreaterThan(mood(20));
    expect(mood(100)).toBeLessThan(40_000);
  });

  it('leaves another club’s view on the catchment even holding the real owner', () => {
    const w = fixture(80, 8) as World;
    const other = structuredClone(w);
    other.playerClub = 'foreign';
    other.clubs[1]!.fans = fanFollowing(80);
    const ownerless = structuredClone(other);
    delete ownerless.owner;
    other.ticket = ownerless.ticket = 0.12;
    const view = gateProjection(other);
    expect(view.travellingSupporters).toBe(0);
    expect(view).toEqual(gateProjection(ownerless));
  });
});
