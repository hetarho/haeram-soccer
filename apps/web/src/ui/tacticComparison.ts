import type { Player, Tactic, World } from '../../../../packages/contracts/src/types';
import { fatigueCost, ownTacticalProfile } from '../../../../packages/engine/src/strategy';
import { TACTICS } from '../../../../packages/engine/src/world';

/**
 * The four tactics over one lineup, read from the profile the engine plays for the own club:
 * the tactic's tradeoffs plus the manager's style and active synergies (→MATCH-9). Each modifier
 * is shown as it plays (`modifiers`) and against the applied tactic.
 */
export function compareTactics(
  w: World,
  players: readonly Player[],
  applied: Tactic,
  opponent?: Tactic,
) {
  const baseline = ownTacticalProfile(w, players, applied, opponent);
  return TACTICS.map((tactic) => {
    const profile = ownTacticalProfile(w, players, tactic, opponent);
    return {
      tactic,
      fit: profile.fit,
      fatigue: players.length
        ? players.reduce((sum, p) => sum + fatigueCost(p, tactic), 0) / players.length
        : 0,
      modifiers: {
        possession: profile.possession,
        pass: profile.pass,
        shot: profile.shot,
        defense: profile.defense,
      },
      possession: profile.possession - baseline.possession,
      pass: profile.pass - baseline.pass,
      shot: profile.shot - baseline.shot,
      defense: profile.defense - baseline.defense,
    };
  });
}

export function signedPoint(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}
