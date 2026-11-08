interface Difference {
  path: string;
  expected: unknown;
  received: unknown;
}

const VALUE_LIMIT = 160;
const PATH_LIMIT = 240;
const SCENARIO_LIMIT = 100;
const bounded = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
const preview = (value: unknown) => bounded(JSON.stringify(value) ?? '<missing>', VALUE_LIMIT);
// Every differing top-level fact's first path: tells a match-engine divergence (matches, players)
// from one only in the books (cash, events) when a platform run differs (T713).
const LIST_COUNT = 12;
const LIST_PATH_LIMIT = 60;
const LIST_LIMIT = 420;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const childPath = (path: string, key: string) =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
// Match canonical's key order, including numeric-looking keys and keys missing on either side.
const keysOf = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
const own = (record: Record<string, unknown>, key: string) =>
  Object.hasOwn(record, key) ? record[key] : undefined;

function firstDifference(expected: unknown, received: unknown, path = '$'): Difference | undefined {
  if (expected === received) return;
  if (Array.isArray(expected) && Array.isArray(received)) {
    for (let index = 0; index < Math.max(expected.length, received.length); index++) {
      const difference = firstDifference(expected[index], received[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return;
  }
  if (isRecord(expected) && isRecord(received)) {
    for (const key of keysOf(expected, received)) {
      const difference = firstDifference(
        own(expected, key),
        own(received, key),
        childPath(path, key),
      );
      if (difference) return difference;
    }
    return;
  }
  return { path, expected, received };
}

function differingFacts(expected: unknown, received: unknown): string[] {
  if (!isRecord(expected) || !isRecord(received)) return [];
  return keysOf(expected, received).flatMap((key) => {
    const difference = firstDifference(own(expected, key), own(received, key), childPath('$', key));
    return difference ? [bounded(difference.path, LIST_PATH_LIMIT)] : [];
  });
}

/** Diagnostic only: callers still assert exact equality of the original canonical strings. */
export function portableDifference(
  scenario: string,
  expectedCanonical: string,
  receivedCanonical: string,
): string | undefined {
  if (expectedCanonical === receivedCanonical) return;
  const expected: unknown = JSON.parse(expectedCanonical);
  const received: unknown = JSON.parse(receivedCanonical);
  const difference = firstDifference(expected, received);
  const name = bounded(JSON.stringify(scenario), SCENARIO_LIMIT);
  if (!difference)
    return `${name}: canonical strings differ at $ (parsed values match); expected ${preview(expectedCanonical)}; received ${preview(receivedCanonical)}`;
  const facts = differingFacts(expected, received);
  const listed = facts.slice(0, LIST_COUNT).join(', ') + (facts.length > LIST_COUNT ? ', …' : '');
  const others =
    facts.length > 1 ? `; differing facts (${facts.length}): ${bounded(listed, LIST_LIMIT)}` : '';
  return `${name}: first difference at ${bounded(difference.path, PATH_LIMIT)}; expected ${preview(difference.expected)}; received ${preview(difference.received)}${others}`;
}
