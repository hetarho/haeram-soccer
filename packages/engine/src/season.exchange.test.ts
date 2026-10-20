import { describe, expect, it } from 'vitest';
import { clubOf } from './index';
import { exchange, lastRound, standAt } from './season.testkit';

describe('amateur exchange (→LEAGUE-6)', () => {
  it('sends the champions up for exactly the bottom two of the last division', () => {
    const w = lastRound('ENG'),
      table = standAt(w, 1);
    const { last, up, down, bottom } = exchange(w);
    expect(down).toHaveLength(2);
    expect(down).toEqual(bottom);
    expect(up).toHaveLength(2);
    expect(up).toContain(w.playerClub);
    // The other place goes to the playoff winner of second to fifth, not the strongest amateurs.
    expect(table.slice(1, 5)).toContain(up.find((id) => id !== w.playerClub));
    expect(w.lower).toBe(false);
    expect(clubOf(w).tier).toBe(last);
    expect(clubOf(w).representative).toBeFalsy();
    expect(w.events.some((e) => e.kind === 'promotion' && e.title === '프로 무대 입성')).toBe(true);
  });

  it('plays the own club third off for the last place', () => {
    const w = lastRound('ENG'),
      year = w.year,
      table = standAt(w, 3);
    const { last, up, down, bottom } = exchange(w);
    expect(down).toEqual(bottom);
    expect(up).toHaveLength(2);
    expect(up).toContain(table[0]);
    const winner = up.find((id) => id !== table[0])!;
    expect(table.slice(1, 5)).toContain(winner);
    // The own ties are archived (→LEAGUE-4).
    expect(w.ownMatches.some((m) => m.id.startsWith(`${year}:lower-promotion:`))).toBe(true);
    expect(w.lower).toBe(winner !== w.playerClub);
    expect(clubOf(w).tier).toBe(winner === w.playerClub ? last : last + 1);
  });
});
