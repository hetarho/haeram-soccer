import type {
  GameSettings,
  InterventionLevel,
  ResponsibilityKey,
  World,
} from '../../contracts/src/types';
import { gameSettingsSchema } from '../../contracts/src/schema';

export const RESPONSIBILITY_KEYS: readonly ResponsibilityKey[] = [
  'manager',
  'staff',
  'contracts',
  'recruitment',
  'sales',
  'academy',
  'sponsors',
];
export function defaultSettings(): GameSettings {
  return {
    responsibilities: {
      manager: 'direct',
      staff: 'delegated',
      contracts: 'direct',
      recruitment: 'direct',
      sales: 'direct',
      academy: 'delegated',
      sponsors: 'delegated',
    },
    mode: 'automatic',
    observations: { matchEve: true, windowOpen: false },
  };
}
/** Compatibility only: old careers/commands keep their old authority until the release boundary. */
export function legacySettings(level: InterventionLevel = 1): GameSettings {
  const settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS)
    settings.responsibilities[key] =
      level === 4 ||
      (level >= 3 && key !== 'recruitment' && key !== 'sales') ||
      (level === 2 && (key === 'academy' || key === 'contracts'))
        ? 'delegated'
        : 'direct';
  settings.observations = { matchEve: level <= 2, windowOpen: level <= 3 };
  return settings;
}
export function settingsOf(w: Pick<World, 'settings' | 'intervention'>): GameSettings {
  return w.settings ?? legacySettings(w.intervention);
}
export function isDelegated(w: Pick<World, 'settings' | 'intervention'>, key: ResponsibilityKey) {
  return settingsOf(w).responsibilities[key] === 'delegated';
}
export function changedResponsibilities(w: World, settings: GameSettings) {
  return RESPONSIBILITY_KEYS.filter(
    (key) => settingsOf(w).responsibilities[key] !== settings.responsibilities[key],
  );
}
export function validateSettings(settings: GameSettings): GameSettings {
  const result = gameSettingsSchema.safeParse(settings);
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(' · '));
  return result.data;
}
export function applySettings(w: World, settings: GameSettings) {
  w.settings = validateSettings(settings);
}
