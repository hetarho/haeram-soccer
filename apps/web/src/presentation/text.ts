import { useSyncExternalStore } from 'react';
import { sourceMessages } from '../../../../packages/contracts/src/source-messages';
import { message, type SourceMessageId } from '../../../../packages/contracts/src/messages';
import { verbatimParameters } from '../../../../packages/contracts/src/message-parameters';
import type { LoadedLocale } from './locale';

let selected: LoadedLocale | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => selected;

/** Called by the shared presentation bootstrap, before it publishes a locale change. */
export function setTextLocale(locale?: LoadedLocale) {
  selected = locale;
  for (const listener of listeners) listener();
}

/** Also refreshes memoized screens and labels held in module-level source data. */
export function useTextLocale() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Locale for device timestamps; game-calendar dates still use the UTC game formatter. */
export const displayLocale = () => selected?.id;
export const currentTextLocale = () => selected;

const exact = new Map<string, string>();
interface Pattern {
  id: string;
  regex: RegExp;
  names: string[];
  weight: number;
  anchor: string;
}
const patterns: Pattern[] = [];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [id, source] of Object.entries(sourceMessages)) {
  const names: string[] = [];
  let previous = 0;
  let regex = '^';
  const literals: string[] = [];
  for (const match of source.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const literal = source.slice(previous, match.index);
    literals.push(literal);
    regex += escape(literal) + '([\\s\\S]*?)';
    names.push(match[1]);
    previous = match.index + match[0].length;
  }
  if (!names.length) exact.set(source, id);
  else {
    const last = source.slice(previous);
    literals.push(last);
    regex += escape(last) + '$';
    const anchor = literals.toSorted((a, b) => b.length - a.length)[0];
    // Source-only identity templates have no text to translate.
    if (anchor)
      patterns.push({
        id,
        regex: new RegExp(regex),
        names,
        weight: literals.join('').length,
        anchor,
      });
  }
}
patterns.sort((a, b) => b.weight - a.weight);

/** Resolve source labels and historical/generated prose without rewriting saved strings. */
export function localizeText(source: string, depth = 0): string {
  if (!selected || selected.id === selected.defaultPack.id || depth > 8) return source;
  const id = exact.get(source);
  if (id) return selected.t(id);
  const trimmed = source.trim();
  const trimmedId = trimmed === source ? undefined : exact.get(trimmed);
  if (trimmedId)
    return (
      source.slice(0, source.indexOf(trimmed)) +
      selected.t(trimmedId) +
      source.slice(source.indexOf(trimmed) + trimmed.length)
    );
  if (!/[가-힣]/.test(source)) return source;
  for (const pattern of patterns) {
    if (!source.includes(pattern.anchor)) continue;
    const match = pattern.regex.exec(source);
    if (!match) continue;
    const parameters: Record<string, string> = {};
    let consistent = true;
    pattern.names.forEach((name, index) => {
      const value = match[index + 1];
      if (Object.hasOwn(parameters, name) && parameters[name] !== value) consistent = false;
      parameters[name] = value;
    });
    if (!consistent) continue;
    for (const name of Object.keys(parameters))
      if (!verbatimParameters[pattern.id]?.includes(name))
        parameters[name] = localizeText(parameters[name], depth + 1);
    return selected.t(pattern.id, parameters);
  }
  return source;
}

/** Translate text leaves only; React elements, IDs, numeric values and game objects stay intact. */
export function localizeValue<T>(value: T): T {
  if (typeof value === 'string') return localizeText(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => localizeValue(item)) as T;
  return value;
}

/** Prefer IDs when authored display copy and its parameters are available at the call site. */
export function displayMessage(
  id: SourceMessageId,
  parameters: Readonly<Record<string, unknown>> = {},
) {
  if (!selected) return message(id, parameters);
  const values = Object.fromEntries(
    Object.entries(parameters).map(([name, value]) => [
      name,
      typeof value === 'number'
        ? value
        : String(verbatimParameters[id]?.includes(name) ? value : localizeValue(value)),
    ]),
  );
  return selected.t(id, values);
}
