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

function firstDifference(expected: unknown, received: unknown, path = '$'): Difference | undefined {
  if (expected === received) return;
  if (Array.isArray(expected) && Array.isArray(received)) {
    for (let index = 0; index < Math.max(expected.length, received.length); index++) {
      const difference = firstDifference(expected[index], received[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return;
  }
  if (
    expected !== null &&
    received !== null &&
    typeof expected === 'object' &&
    typeof received === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(received)
  ) {
    const left = expected as Record<string, unknown>;
    const right = received as Record<string, unknown>;
    // Match canonical's key order, including numeric-looking keys and keys missing on either side.
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const child = /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${path}.${key}`
        : `${path}[${JSON.stringify(key)}]`;
      const difference = firstDifference(
        Object.hasOwn(left, key) ? left[key] : undefined,
        Object.hasOwn(right, key) ? right[key] : undefined,
        child,
      );
      if (difference) return difference;
    }
    return;
  }
  return { path, expected, received };
}

/** Diagnostic only: callers still assert exact equality of the original canonical strings. */
export function portableDifference(
  scenario: string,
  expectedCanonical: string,
  receivedCanonical: string,
): string | undefined {
  if (expectedCanonical === receivedCanonical) return;
  const difference = firstDifference(JSON.parse(expectedCanonical), JSON.parse(receivedCanonical));
  const name = bounded(JSON.stringify(scenario), SCENARIO_LIMIT);
  if (!difference)
    return `${name}: canonical strings differ at $ (parsed values match); expected ${preview(expectedCanonical)}; received ${preview(receivedCanonical)}`;
  return `${name}: first difference at ${bounded(difference.path, PATH_LIMIT)}; expected ${preview(difference.expected)}; received ${preview(difference.received)}`;
}
