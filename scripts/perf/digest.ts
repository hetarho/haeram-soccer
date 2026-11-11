import { canonical } from '../../packages/contracts/src/index';

/** Diagnostic output only: retain non-finite kinds in old presentation data, never in a save. */
export function diagnosticCanonical(value: unknown): string {
  const tagged = (v: unknown): unknown => {
    if (typeof v === 'number' && !Number.isFinite(v)) return { nonFiniteNumber: String(v) };
    if (Array.isArray(v)) return v.map(tagged);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([key, child]) => [key, tagged(child)]));
    return v;
  };
  return canonical(tagged(value));
}
