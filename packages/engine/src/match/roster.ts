/** Each side's matchday roster before kick-off (→MATCH-19, MATCH-20, LEAGUE-15, CLUB-6). */
import type { Club, Fixture, Player, World } from '../../../contracts/src/types';
import type { Prepared } from '../match';
import { FORMATIONS } from '../player';
import { slotOvr } from '../player-state';
import { isUnavailable } from '../discipline';
import { squad } from '../world';
import { ownBench } from './bench';
import type { EraRules } from './rules';

/**
 * The named substitutes. The own club picks among its active, fit, available players (`ownBench`);
 * another club names squad places behind its XI in order (→CLUB-6).
 */
export function benchFor(
  w: World,
  club: Club,
  xi: readonly Player[],
  era: EraRules,
  unavailable: (p: Player) => boolean = () => false,
): Player[] {
  if (era.named === 0) return [];
  if (club.id !== w.playerClub) {
    const taken = new Set(xi);
    return squad(w, club)
      .filter((p) => !taken.has(p) && !unavailable(p))
      .slice(0, era.named);
  }
  return ownBench(w, xi, era, unavailable);
}

/**
 * Each side's matchday roster (→MATCH-19, MATCH-20, LEAGUE-15): the prepared XI in slot order, then
 * the era's named substitutes, nobody injured or banned for this fixture among them. The XI already
 * leaves out whoever it can; with `replace`, the one rule of both candidate paths, a starter it had
 * to keep while unavailable is replaced by the best available substitute for his slot. The
 * pre-feature grid keeps him (`replace` false), as its settled matches always have.
 */
export function fixtureRosters(
  w: World,
  f: Fixture,
  prepared: Pick<Prepared, 'teams' | 'squads' | 'tactics'>,
  era: EraRules,
  replace = true,
): [Player[], Player[]] {
  return ([0, 1] as const).map((side) => {
    const club = prepared.teams[side];
    const out = (p: Player) => isUnavailable(w, p, club.id, f);
    const xi = [...prepared.squads[side]];
    const bench = benchFor(w, club, xi, era, out);
    if (replace) {
      const slots = FORMATIONS[prepared.tactics[side]].slots;
      xi.forEach((p, slot) => {
        if (!out(p) || bench.length === 0) return;
        let best = 0;
        for (let i = 1; i < bench.length; i++)
          if (slotOvr(bench[i]!, slots[slot]!) > slotOvr(bench[best]!, slots[slot]!)) best = i;
        xi[slot] = bench.splice(best, 1)[0]!;
      });
    }
    return [...xi, ...bench];
  }) as [Player[], Player[]];
}
