/**
 * T808: a measurement run's choice of WORLD-6's squad spread (`SQUAD_SPREAD`). `--setting flat` or
 * `--setting spread` sets it in this process, as T784's `--setting` names seller-spread.ts's rules;
 * without the flag the run reads the released default. A measurement override, never a game setting.
 */
import { SQUAD_SPREAD } from '../../packages/engine/src/world';

export type SquadSpread = (typeof SQUAD_SPREAD)['inForce'];
export const SQUAD_SPREAD_CHOICES: readonly SquadSpread[] = ['flat', 'spread'];

/** Whether `value` names a squad spread. */
export function isSquadSpread(value: string): value is SquadSpread {
  return (SQUAD_SPREAD_CHOICES as readonly string[]).includes(value);
}

/**
 * Applies `--setting flat|spread` from `args` and returns the arguments a forked worker repeats to
 * live on the same squads (none when the run reads the default).
 */
export function squadSpreadSetting(args: readonly string[]): string[] {
  const index = args.indexOf('--setting');
  if (index < 0) return [];
  const value = args[index + 1] ?? '';
  if (!isSquadSpread(value))
    throw new Error(`--setting takes ${SQUAD_SPREAD_CHOICES.join(' or ')}, not ${value}`);
  SQUAD_SPREAD.inForce = value;
  return ['--setting', value];
}
