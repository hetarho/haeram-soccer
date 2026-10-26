import type { Player } from '../../contracts/src/types';
import { fatigueLoad } from './player-state';

export const INJURY = {
  perStarter: 0.018,
  /** Extra chance per point of fatigue beyond match fitness. */
  fatigue: 1 / 25,
  pressing: 1.15,
  bands: [
    { share: 0.6, days: [5, 14], label: ['근육 타박상', '가벼운 발목 염좌', '근육 경련'] },
    { share: 0.25, days: [15, 35], label: ['햄스트링 부상', '종아리 근육 부상', '사타구니 부상'] },
    {
      share: 0.12,
      days: [36, 90],
      label: ['발목 인대 부상', '중족골 골절', '무릎 내측 인대 부상'],
    },
    { share: 0.03, days: [120, 240], label: ['전방 십자인대 파열', '아킬레스건 부상'] },
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
