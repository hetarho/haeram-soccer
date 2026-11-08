import type { World } from '../../../../../packages/contracts/src/types';
import {
  RESPONSIBILITY_KEYS,
  settingsOf,
} from '../../../../../packages/engine/src/responsibilities';

/** The two observations the office reports on, beside the seven business responsibilities. */
export const OBSERVATION_KEYS = ['matchEve', 'windowOpen'] as const;

/** How many of the office's nine report rows the owner has handed to staff (→WEB-79). */
export function delegationCounts(w: World) {
  const settings = settingsOf(w);
  const delegated =
    RESPONSIBILITY_KEYS.filter((key) => settings.responsibilities[key] === 'delegated').length +
    OBSERVATION_KEYS.filter((key) => !settings.observations[key]).length;
  const total = RESPONSIBILITY_KEYS.length + OBSERVATION_KEYS.length;
  return { delegated, direct: total - delegated, total };
}
