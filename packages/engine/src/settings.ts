import type { GameSettings, World } from '../../contracts/src/types';
import { gameSettingsSchema } from '../../contracts/src/schema';
import { changedResponsibilities } from './responsibilities';
import { handoverPendingWork } from './pending-work';
import { applyDelegatePlans } from './delegation';
import { isBudgetResponsibility } from './delegation-info';

export function validateSettings(settings: GameSettings): GameSettings {
  const result = gameSettingsSchema.safeParse(settings);
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(' · '));
  return result.data;
}
export function applySettings(w: World, settings: GameSettings) {
  const validated = validateSettings(settings);
  const changed = changedResponsibilities(w, validated);
  w.settings = validated;
  handoverPendingWork(w, changed);
  // A newly delegated person makes his plan at once (→`applyDelegatePlans`).
  const delegated = changed
    .filter(isBudgetResponsibility)
    .filter((key) => validated.responsibilities[key] === 'delegated');
  if (delegated.length) applyDelegatePlans(w, 'delegated', delegated);
}
