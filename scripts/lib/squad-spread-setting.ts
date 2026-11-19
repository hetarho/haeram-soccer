/**
 * Accept the historical `--setting spread` measurement argument. WORLD-6's spread is always in
 * force; no measurement option can restore flat generated squads.
 */
export type SquadSpread = 'spread';
export const SQUAD_SPREAD_CHOICES: readonly SquadSpread[] = ['spread'];

/** Whether `value` names a squad spread. */
export function isSquadSpread(value: string): value is SquadSpread {
  return (SQUAD_SPREAD_CHOICES as readonly string[]).includes(value);
}

/**
 * Accepts `--setting spread` from `args` and returns the arguments a forked worker repeats to
 * live on the same squads (none when the run reads the default).
 */
export function squadSpreadSetting(args: readonly string[]): string[] {
  const index = args.indexOf('--setting');
  if (index < 0) return [];
  const value = args[index + 1] ?? '';
  if (!isSquadSpread(value))
    throw new Error(`--setting takes ${SQUAD_SPREAD_CHOICES.join(' or ')}, not ${value}`);
  return ['--setting', value];
}
