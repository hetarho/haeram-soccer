import { sourceMessages } from './source-messages';

export type SourceMessageId = keyof typeof sourceMessages;
type SourceText<K extends SourceMessageId> =
  (typeof sourceMessages)[K] extends `${string}{${string}` ? string : (typeof sourceMessages)[K];
const NO_PARAMETERS: Readonly<Record<string, unknown>> = Object.freeze({});

/** Locale-independent source prose. Simulation and saved facts never read browser preferences. */
export function message<K extends SourceMessageId>(
  id: K,
  parameters: Readonly<Record<string, unknown>> = NO_PARAMETERS,
): SourceText<K> {
  if (parameters === NO_PARAMETERS) return sourceMessages[id] as SourceText<K>;
  return sourceMessages[id].replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : token,
  ) as SourceText<K>;
}
