import { message as sourceMessage } from '../../contracts/src/messages';
import type { Player } from '../../contracts/src/types';
import { fatigueLoad } from './player-state';

export const INJURY = {
  perStarter: 0.018,
  /** Extra chance per point of fatigue beyond match fitness. */
  fatigue: 1 / 25,
  pressing: 1.15,
  bands: [
    {
      share: 0.6,
      days: [5, 14],
      label: [
        sourceMessage('copy.injury_rules.36409af67b'),
        sourceMessage('copy.injury_rules.3928786c77'),
        sourceMessage('copy.injury_rules.65faa2ce06'),
      ],
    },
    {
      share: 0.25,
      days: [15, 35],
      label: [
        sourceMessage('copy.injury_rules.6609c130b3'),
        sourceMessage('copy.injury_rules.b99e84248b'),
        sourceMessage('copy.injury_rules.bec1a11da6'),
      ],
    },
    {
      share: 0.12,
      days: [36, 90],
      label: [
        sourceMessage('copy.injury_rules.463c33e336'),
        sourceMessage('copy.injury_rules.ad72768f43'),
        sourceMessage('copy.injury_rules.75dff864b6'),
      ],
    },
    {
      share: 0.03,
      days: [120, 240],
      label: [
        sourceMessage('copy.injury_rules.48e2c2d144'),
        sourceMessage('copy.injury_rules.b2a5427a80'),
      ],
    },
  ],
} as const;

export function injuryChance(p: Player, pressing: boolean) {
  return (
    INJURY.perStarter *
    (1 + fatigueLoad(p.fatigue) * INJURY.fatigue) *
    (1 + Math.max(0, 55 - p.attrs.stamina) / 150) *
    (pressing ? INJURY.pressing : 1)
  );
}
