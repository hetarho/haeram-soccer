import type { Player, Tactic } from '../../../../packages/contracts/src/types';
import { fatigueCost, tacticalProfile } from '../../../../packages/engine/src/strategy';
import { TACTICS } from '../../../../packages/engine/src/world';

export function compareTactics(players: readonly Player[], applied: Tactic, opponent?: Tactic) {
  const baseline = tacticalProfile(players, applied, opponent);
  return TACTICS.map((tactic) => {
    const profile = tacticalProfile(players, tactic, opponent);
    return {
      tactic,
      fit: profile.fit,
      fatigue: players.length
        ? players.reduce((sum, p) => sum + fatigueCost(p, tactic), 0) / players.length
        : 0,
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
