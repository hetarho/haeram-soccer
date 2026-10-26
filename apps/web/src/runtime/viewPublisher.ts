import { PUBLISHED_VIEWS, type Reply, type View, type ViewPatch } from './protocol';

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
  return partText(before) === partText(now) ? undefined : { v: now };
}
/**
 * One Host's view publication (→ARCH-6): it numbers the views it publishes, keeps the JSON of each
 * part of the latest `PUBLISHED_VIEWS` with their world, and sends a view whole or only the parts
 * that changed since the base a client names. It reads only the View it is given.
 */
export class ViewPublisher {
  /** The latest published views by sequence, each part's JSON kept to diff the next one against. */
  private published: { seq: number; worldId: string; texts: Map<string, string | undefined> }[] =
    [];
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
      previous = this.published.find((p) => p.seq === base && p.worldId === world.id);
    this.published = [
      ...this.published.slice(1 - PUBLISHED_VIEWS),
      { seq, worldId: world.id, texts },
    ];
    if (base === undefined || !previous) return { view, viewSeq: seq };
    const parts: Record<string, unknown> = {},
      worldParts: Record<string, unknown> = {},
      patches: Record<string, ViewPatch> = {},
      dropped: string[] = [];
    for (const [key, text] of texts) {
      const before = previous.texts.get(key);
      if (text !== undefined && before === text) continue;
      const value = key.startsWith('world.')
        ? world[key.slice(6) as keyof typeof world]
        : rest[key as keyof typeof rest];
      // Compared with the base's text, never with live objects a later step mutates.
      if (text !== undefined && before !== undefined && text.length >= VIEW_PATCH.minChars) {
        const patch = viewPatch(JSON.parse(before), value, VIEW_PATCH.depth);
        if (patch && (partText(patch)?.length ?? Infinity) <= text.length * VIEW_PATCH.maxShare) {
          patches[key] = patch;
          continue;
        }
      }
      if (key.startsWith('world.')) worldParts[key.slice(6)] = value;
      else parts[key] = value;
    }
    for (const key of previous.texts.keys()) if (!texts.has(key)) dropped.push(key);
    return {
      viewSeq: seq,
      viewDelta: {
        base,
        parts,
        world: worldParts,
        dropped,
        ...(Object.keys(patches).length ? { patches } : {}),
      },
    };
  }
}
