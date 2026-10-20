import { describe, expect, it } from 'vitest';
import type { Fixture, KnockoutTie } from '../../contracts/src/types';
import { createWorld, ownLeagueClubs } from './index';
import { decideTie } from './knockout';
import { simulateMatch } from './match';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Cup Town',
    color: '#552233',
    seed: 'knockout-shootout',
    level: 'normal',
  });
}

describe('knockout ties (→MATCH-6)', () => {
  it('decides a level cup tie by the played shoot-out', () => {
    const w = world();
    const tie: KnockoutTie = { home: 'A', away: 'B' };
    const leg: Fixture = {
      id: 'cup:tie',
      year: w.year,
      round: 5,
      kind: 'cup',
      home: 'A',
      away: 'B',
      country: 'ENG',
      groupKey: 'ENG:cup',
      score: { home: 1, away: 1 },
      shootout: { home: 3, away: 4 },
    };
    expect(decideTie(w, tie, [leg], false)).toBe(true);
    expect(tie).toEqual({ home: 'A', away: 'B', winner: 'B', decided: 'pens' });
    // A level tie with no shoot-out on record cannot be settled by chance any more.
    const unplayed = { ...leg, shootout: undefined };
    expect(() => decideTie(w, { home: 'A', away: 'B' }, [unplayed], false)).toThrow();
  });
  it('keeps the shoot-out highlight for the UI', () => {
    const w = world();
    const league = new Set(ownLeagueClubs(w).map((c) => c.id));
    const base = w.fixtures.find((f) => !league.has(f.home) && !league.has(f.away))!;
    let found = 0;
    for (let i = 0; i < 300 && found < 3; i++) {
      const f: Fixture = { ...base, id: `pens:${i}`, kind: 'cup', groupKey: 'ENG:cup' };
      const { record } = simulateMatch(w, f, false, false, { awayGoals: false });
      if (!record.shootout) continue;
      found++;
      expect(record.regulation).toEqual(record.score);
      expect(record.metrics[0][10]).toBe(120);
      const winner = record.shootout.home > record.shootout.away ? 0 : 1;
      expect(record.highlights.at(-1)).toEqual({
        minute: 120,
        side: winner,
        player: '승부차기',
        action: `승부차기 ${winner === 0 ? '홈' : '원정'} 승리`,
      });
    }
    expect(found).toBe(3);
  });
});
