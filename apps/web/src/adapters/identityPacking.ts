import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { canonical } from '../../../../packages/contracts/src/index';
import type { MatchAppearance } from '../../../../packages/contracts/src/identity';
import {
  assertAppearanceFormatVersion,
  matchAppearanceSchema,
} from '../../../../packages/contracts/src/identitySchema';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';

/**
 * The own records' appearance snapshots (KIT-12, SAVE-22) beside the compact match columns
 * (spec/ssot/KIT.md and spec/ssot/SAVE.md): each distinct snapshot once, in the
 * order it first occurs, and one ref per record — 0 absent, n the n-th snapshot. The stream's own
 * version stays 1; each snapshot keeps its recorded version (1 shirts only, 2 whole kits) and is
 * never rewritten to another.
 */
export interface PackedAppearances {
  version: 1;
  values: MatchAppearance[];
  refs: number[];
}

/** Own records the world schema allows; no stream is larger. */
const MAX_RECORDS = 100000;
const corrupt = (detail: string) =>
  new Error(sourceMessage('copy.identityPacking.6620457dd6', { p0: detail }));
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stream for `matches`, or nothing when no record has an appearance. */
export function packAppearances(matches: readonly MatchRecord[]): PackedAppearances | undefined {
  if (matches.every((m) => m.appearance === undefined)) return undefined;
  const values: MatchAppearance[] = [];
  const refs = new Map<string, number>();
  return {
    version: 1,
    values,
    refs: matches.map((m) => {
      if (m.appearance === undefined) return 0;
      const key = canonical(m.appearance);
      let ref = refs.get(key);
      if (ref === undefined) {
        values.push(m.appearance);
        ref = values.length;
        refs.set(key, ref);
      }
      return ref;
    }),
  };
}

/**
 * Attaches the stream's snapshots to `records`, rebuilt from the columns in their original order.
 * Every count, ref and future version marker (a stream above 1, a snapshot above the current
 * appearance version) is checked before anything is expanded; each record gets its own copy, and a
 * record whose ref is 0 keeps no appearance at all.
 */
export function readAppearances(stream: unknown, records: MatchRecord[]) {
  if (stream === undefined) return;
  if (!isObject(stream)) throw corrupt(sourceMessage('copy.identityPacking.d1a42ea591'));
  const { version, values, refs } = stream;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 1)
    throw new SaveCompatibilityError();
  if (version !== 1) throw corrupt(sourceMessage('copy.identityPacking.002f73c32e'));
  if (!Array.isArray(values) || values.length > MAX_RECORDS)
    throw corrupt(sourceMessage('copy.identityPacking.01626539f2'));
  for (const value of values) assertAppearanceFormatVersion(value);
  if (!Array.isArray(refs) || refs.length !== records.length || values.length > records.length)
    throw corrupt(sourceMessage('copy.identityPacking.4925030203'));
  // Refs introduce the snapshots in order, so every snapshot is used and none is skipped.
  let introduced = 0;
  for (const ref of refs) {
    if (!Number.isSafeInteger(ref) || ref < 0 || ref > introduced + 1)
      throw corrupt(sourceMessage('copy.identityPacking.fbc8ad581f'));
    if (ref > introduced) introduced = ref;
  }
  if (introduced !== values.length) throw corrupt(sourceMessage('copy.identityPacking.5af1416408'));
  const parsed = values.map((value) => {
    const result = matchAppearanceSchema.safeParse(value);
    if (!result.success) throw corrupt(sourceMessage('copy.identityPacking.fa972d6c5c'));
    return result.data;
  });
  if (new Set(parsed.map((value) => canonical(value))).size !== parsed.length)
    throw corrupt(sourceMessage('copy.identityPacking.4c04246e2c'));
  records.forEach((record, i) => {
    const ref = refs[i] as number;
    if (ref === 0) return;
    const appearance = parsed[ref - 1];
    if (appearance.sides[0].club !== record.home || appearance.sides[1].club !== record.away)
      throw corrupt(sourceMessage('copy.identityPacking.3c3d98d5de'));
    record.appearance = structuredClone(appearance);
  });
}
