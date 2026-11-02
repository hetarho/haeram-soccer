import type { GameSettings, ResponsibilityKey, World } from '../../contracts/src/types';

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
/**
 * A world built without settings — every career is founded with them (→SAVE-17), tools and tests
 * build worlds by hand — leaves every decision to the owner and stops at both observations.
 */
function ownerSettings(): GameSettings {
  const settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) settings.responsibilities[key] = 'direct';
  settings.observations = { matchEve: true, windowOpen: true };
  return settings;
}
export function settingsOf(w: Pick<World, 'settings'>): GameSettings {
  return w.settings ?? ownerSettings();
}
export function isDelegated(w: Pick<World, 'settings'>, key: ResponsibilityKey) {
  return settingsOf(w).responsibilities[key] === 'delegated';
}
export function changedResponsibilities(w: World, settings: GameSettings) {
  return RESPONSIBILITY_KEYS.filter(
    (key) => settingsOf(w).responsibilities[key] !== settings.responsibilities[key],
  );
}
