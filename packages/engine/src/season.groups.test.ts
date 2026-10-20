import { describe, expect, it } from 'vitest';
import { country } from '../../catalogs/src/index';
import { exchange, lastRound, standAt } from './season.testkit';

describe('amateur exchange (→LEAGUE-6)', () => {
  it.each([
    ['ITA', 'ITA:1:0:2'],
    ['GER', 'GER:1:0:15'],
  ] as const)(
    '%s exchanges two clubs a last-division group, and %s, relegated into it, stays there',
    (code, fallen) => {
      const w = lastRound(code),
        table = standAt(w, 1);
      // The worst record of the division above, below every last-division club once it falls.
      Object.assign(w.tables[fallen], { points: 0, gf: 0, ga: 99 });
      const { last, up, down, bottom } = exchange(w);
      const places = country(code).groups[last].length * 2;
      expect(down).toEqual(bottom);
      expect(up).toHaveLength(places);
      expect(up).toEqual(expect.arrayContaining(table.slice(0, places - 1)));
      expect(table.slice(places - 1, places + 3)).toContain(
        up.find((id) => !table.slice(0, places - 1).includes(id)),
      );
      expect(w.clubs.find((c) => c.id === fallen)).toMatchObject({ tier: last });
      expect(w.clubs.find((c) => c.id === fallen)!.representative).toBeFalsy();
      expect(w.lower).toBe(false);
    },
  );
});
