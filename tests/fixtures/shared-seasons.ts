/** Season spans integration files share instead of each playing a private English season. */
import type { World } from '../../packages/contracts/src/types';
import { CAREER } from '../../packages/engine/src/finance.testkit';
import { DISABLED_RELEASE } from './releases';
import { simulatedWorld } from './worlds';

/**
 * A fresh copy of the finance career (England's lowest division) after its first season's 46
 * league rounds, before the close, on the pre-feature path: the span finance, material and every
 * case that only needs some club's season played to its last round share, so a cold run plays it
 * once. A case applies its own tweaks to the copy, which therefore suits only tweaks the close or
 * the step under test reads; a tweak that must act during the season keeps a private season.
 */
export function lastRoundWorld(): World {
  return simulatedWorld(CAREER, { rounds: 46 }, DISABLED_RELEASE);
}
