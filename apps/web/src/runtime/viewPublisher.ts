import { PUBLISHED_VIEWS, type Reply, type View, type ViewDelta, type ViewPatch } from './protocol';

/** A view part as JSON, to compare with the last one sent; none when it cannot be written so. */
function partText(value: unknown) {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return undefined;
  }
}
/**
 * A changed view part this large is sent as the changes inside it (→ARCH-6), down to `depth`
 * container levels, unless that patch is over `maxShare` of the part: an own match day changes
 * three fields of every club, not 400 KB of them.
 */
export const VIEW_PATCH = { minChars: 8192, depth: 2, maxShare: 0.8 } as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A value JSON leaves out of an object and writes as `null` inside an array. */
const unwritten = (value: unknown) =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol';
/**
 * Whether `now` writes the JSON `before` (parsed JSON) was read from, as comparing their
 * `partText` would answer, without writing either: key order counts as it does in the text, a
 * non-finite number writes `null`, and anything JSON writes by its own rules (`toJSON`, a class
 * instance, a bigint) is compared as text.
 */
function sameJson(before: unknown, now: unknown): boolean {
  switch (typeof now) {
    case 'string':
    case 'boolean':
      return before === now;
    case 'number':
      return Number.isFinite(now) ? before === now : before === null;
    case 'object': {
      if (now === null) return before === null;
      const proto: unknown = Object.getPrototypeOf(now);
      if (
        (proto !== Object.prototype && proto !== Array.prototype && proto !== null) ||
        typeof (now as { toJSON?: unknown }).toJSON === 'function'
      )
        return partText(before) === partText(now);
      if (typeof before !== 'object' || before === null) return false;
      if (Array.isArray(now)) {
        if (!Array.isArray(before) || before.length !== now.length) return false;
        for (let i = 0; i < now.length; i++) {
          const item: unknown = now[i];
          if (unwritten(item) ? before[i] !== null : !sameJson(before[i], item)) return false;
        }
        return true;
      }
      if (Array.isArray(before)) return false;
      const was = before as Record<string, unknown>,
        is = now as Record<string, unknown>,
        keys = Object.keys(was);
      let at = 0;
      for (const key of Object.keys(is)) {
        const value = is[key];
        if (unwritten(value)) continue;
        if (keys[at++] !== key || !sameJson(was[key], value)) return false;
      }
      return at === keys.length;
    }
    default:
      return partText(before) === partText(now);
  }
}
/**
 * The changes from `before` (the base's published JSON, parsed) to `now`, undefined when equal;
 * leaves compare as `partText` does.
 */
function viewPatch(before: unknown, now: unknown, depth: number): ViewPatch | undefined {
  if (depth > 0 && Array.isArray(before) && Array.isArray(now)) {
    const changed: [number, ViewPatch][] = [];
    now.forEach((item, index) => {
      const sub = index < before.length ? viewPatch(before[index], item, depth - 1) : { v: item };
      if (sub) changed.push([index, sub]);
    });
    return changed.length || before.length !== now.length
      ? { a: changed, n: now.length }
      : undefined;
  }
  if (depth > 0 && isRecord(before) && isRecord(now)) {
    const changed: Record<string, ViewPatch> = {};
    let any = false;
    for (const [key, value] of Object.entries(now)) {
      const sub = viewPatch(before[key], value, depth - 1);
      if (sub) [changed[key], any] = [sub, true];
    }
    const removed = Object.keys(before).filter((key) => !(key in now) || now[key] === undefined);
    if (!any && !removed.length) return undefined;
    return removed.length ? { o: changed, d: removed } : { o: changed };
  }
  return sameJson(before, now) ? undefined : { v: now };
}
/** A `ViewPatch` read back from its JSON: `{ v }` of a value JSON leaves out reads `{}`. */
type ParsedPatch = {
  v?: unknown;
  o?: Record<string, ParsedPatch>;
  d?: string[];
  a?: [number, ParsedPatch][];
  n?: number;
};
/** Whether a parsed patch carries anything. */
const written = (patch: ParsedPatch) => 'v' in patch || 'o' in patch || 'a' in patch;
/**
 * Applies `patch` (its parsed JSON) in place to `json`, parsed JSON its caller owns, and gives the
 * parsed JSON of the value the patch describes: the base's parsed part kept current for the next
 * diff at the cost of the patch, not of parsing the part's text again. `order.kept` turns false
 * when an object gains a key, whose place among the unchanged keys the patch does not say.
 */
function patchJson(json: unknown, patch: ParsedPatch, order: { kept: boolean }): unknown {
  if ('v' in patch) return patch.v;
  if (patch.o) {
    const out = json as Record<string, unknown>;
    for (const key of Object.keys(patch.o)) {
      const sub = patch.o[key]!;
      if (!written(sub)) delete out[key];
      else {
        if (!Object.hasOwn(out, key)) order.kept = false;
        out[key] = patchJson(out[key], sub, order);
      }
    }
    for (const key of patch.d ?? []) delete out[key];
    return out;
  }
  const n = patch.n!,
    out = json as unknown[],
    length = out.length;
  out.length = n;
  for (const [index, sub] of patch.a!)
    out[index] = written(sub) ? patchJson(out[index], sub, order) : null;
  // JSON writes an index the patch skipped past the base's end (a hole) as null.
  for (let i = length; i < n; i++) if (!(i in out)) out[i] = null;
  return out;
}
interface Published {
  seq: number;
  worldId: string;
  texts: Map<string, string | undefined>;
  /**
   * The parsed JSON of large parts, kept so the next diff skips parsing their text; each is owned
   * by one published view, and the view diffed on it takes it over.
   */
  parsed: Map<string, unknown>;
}
/**
 * One Host's view publication (→ARCH-6): it numbers the views it publishes, keeps the JSON of each
 * part of the latest `PUBLISHED_VIEWS` with their world, and sends a view whole or only the parts
 * that changed since the base a client names. It reads only the View it is given.
 */
export class ViewPublisher {
  /** The latest published views by sequence, each part's JSON kept to diff the next one against. */
  private published: Published[] = [];
  private viewSeq = 0;
  /**
   * The view for a reply: whole, or only the parts that changed since `base` when the client holds
   * that published view of the same world, so a day step no longer copies the whole career across.
   */
  publish(view: View | undefined, base?: number): Pick<Reply, 'view' | 'viewSeq' | 'viewDelta'> {
    if (!view) return {};
    const { world, ...rest } = view;
    const texts = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(rest)) texts.set(key, partText(value));
    for (const [key, value] of Object.entries(world)) texts.set(`world.${key}`, partText(value));
    const seq = ++this.viewSeq,
      previous = this.published.find((p) => p.seq === base && p.worldId === world.id),
      parsed = new Map<string, unknown>();
    this.published = [
      ...this.published.slice(1 - PUBLISHED_VIEWS),
      { seq, worldId: world.id, texts, parsed },
    ];
    if (base === undefined || !previous) return { view, viewSeq: seq };
    const parts: Record<string, unknown> = {},
      worldParts: Record<string, unknown> = {},
      patches: Record<string, ViewPatch> = {},
      dropped: string[] = [],
      patchTexts: string[] = [];
    for (const [key, text] of texts) {
      const before = previous.texts.get(key);
      if (text !== undefined && before === text) {
        if (previous.parsed.has(key)) {
          parsed.set(key, previous.parsed.get(key));
          previous.parsed.delete(key);
        }
        continue;
      }
      const value = key.startsWith('world.')
        ? world[key.slice(6) as keyof typeof world]
        : rest[key as keyof typeof rest];
      // Compared with the base's JSON, never with live objects a later step mutates.
      if (text !== undefined && before !== undefined && text.length >= VIEW_PATCH.minChars) {
        const was: unknown = previous.parsed.has(key)
          ? previous.parsed.get(key)
          : JSON.parse(before);
        // This view owns it now; a later diff on `previous` reads the text again.
        previous.parsed.delete(key);
        const patch = viewPatch(was, value, VIEW_PATCH.depth),
          patchText = patch && partText(patch);
        if (patch && (patchText?.length ?? Infinity) <= text.length * VIEW_PATCH.maxShare) {
          patches[key] = patch;
          patchTexts.push(`${JSON.stringify(key)}:${patchText}`);
          const order = { kept: true },
            now = patchJson(was, JSON.parse(patchText!) as ParsedPatch, order);
          if (order.kept) parsed.set(key, now);
          continue;
        }
      }
      if (key.startsWith('world.')) worldParts[key.slice(6)] = value;
      else parts[key] = value;
    }
    for (const key of previous.texts.keys()) if (!texts.has(key)) dropped.push(key);
    const viewDelta: ViewDelta = {
      base,
      parts,
      world: worldParts,
      dropped,
      ...(Object.keys(patches).length ? { patches } : {}),
    };
    if (patchTexts.length) PATCH_TEXTS.set(viewDelta, `{${patchTexts.join(',')}}`);
    return { viewSeq: seq, viewDelta };
  }
}
/** The JSON of each published delta's patches, written once while sizing them. */
const PATCH_TEXTS = new WeakMap<ViewDelta, string>();
/**
 * A reply as a worker posts it: a delta's patches go as the JSON already written for them
 * (`ViewDelta.patchText`), which `applyViewDelta` reads back.
 */
export function forPosting<R extends Pick<Reply, 'viewDelta'>>(reply: R): R {
  const delta = reply.viewDelta,
    patchText = delta && PATCH_TEXTS.get(delta);
  if (!delta || patchText === undefined) return reply;
  const { patches: _patches, ...rest } = delta;
  void _patches;
  return { ...reply, viewDelta: { ...rest, patchText } };
}
