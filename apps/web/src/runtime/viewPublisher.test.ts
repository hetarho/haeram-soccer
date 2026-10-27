import { expect, it } from 'vitest';
import {
  applyViewDelta,
  PUBLISHED_VIEWS,
  type Reply,
  type View,
  type ViewDelta,
  type ViewPatch,
} from './protocol';
import { shareValue } from './store';
import { forPosting, VIEW_PATCH, ViewPublisher } from './viewPublisher';

/** A prepared view of only the parts a case names, on world `id`. */
const view = (parts: Record<string, unknown>, world: Record<string, unknown> = {}, id = 'w1') =>
  ({ ...parts, world: { id, ...world } }) as unknown as View;
/** The delta publishing `next` on `base` sends; the client's copy of `held` rebuilds `next` from it. */
function deltaOf(publisher: ViewPublisher, held: View, base: number, next: View): ViewDelta {
  const reply = publisher.publish(next, base);
  expect(reply.view).toBeUndefined();
  const delta = reply.viewDelta!;
  expect(delta.base).toBe(base);
  expect(applyViewDelta(structuredClone(held), structuredClone(delta))).toEqual(next);
  return delta;
}
/** `count` clubs whose JSON together passes the patch threshold. */
const clubs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    name: `Club ${i}`.padEnd(240, '.'),
    points: 0,
    form: [0, 0],
  }));

it('publishes a first view whole and numbers each view it publishes', () => {
  const publisher = new ViewPublisher();
  // No world, no view: nothing is published and no number is spent.
  expect(publisher.publish(undefined, 3)).toEqual({});
  const first = view({ totalMatches: 1 });
  const reply = publisher.publish(first);
  expect(reply).toEqual({ view: first, viewSeq: 1 });
  expect(reply.view).toBe(first);
  // Without a base the view goes whole again; each host numbers its own views.
  expect(publisher.publish(first)).toEqual({ view: first, viewSeq: 2 });
  expect(new ViewPublisher().publish(first).viewSeq).toBe(1);
});

it('sends only the changed, new and dropped values since the base', () => {
  const publisher = new ViewPublisher();
  const before = view(
    { totalMatches: 1, supportUsed: 0, finance: { cash: '10' } },
    { year: 1950, round: 3, note: 'x' },
  );
  publisher.publish(before);
  const after = view({ totalMatches: 2, supportUsed: 0, coefficient: 4 }, { year: 1950, round: 4 });
  expect(deltaOf(publisher, before, 1, after)).toEqual({
    base: 1,
    parts: { totalMatches: 2, coefficient: 4 },
    world: { round: 4 },
    dropped: ['finance', 'world.note'],
  });
  // An unchanged view sends nothing but its number.
  expect(deltaOf(publisher, after, 2, after)).toEqual({
    base: 2,
    parts: {},
    world: {},
    dropped: [],
  });
});

it('compares by the JSON published, so in-place changes show and unwritable values always go', () => {
  const publisher = new ViewPublisher();
  const table = { points: 3 };
  const before = view({ odd: 1n }, { table });
  const held = structuredClone(before);
  publisher.publish(before);
  // A later step mutates the live object the published view shared.
  table.points = 9;
  const delta = deltaOf(publisher, held, 1, view({ odd: 1n }, { table }));
  expect(delta).toEqual({
    base: 1,
    parts: { odd: 1n },
    world: { table: { points: 9 } },
    dropped: [],
  });
});

it('patches large parts down to two container levels', () => {
  const publisher = new ViewPublisher();
  const careers = Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`p${i}`, { score: 50, note: 'n'.repeat(240) }]),
  );
  const before = view({ careers }, { clubs: clubs(40) });
  expect(JSON.stringify(careers).length).toBeGreaterThanOrEqual(VIEW_PATCH.minChars);
  expect(JSON.stringify(before.world.clubs).length).toBeGreaterThanOrEqual(VIEW_PATCH.minChars);
  publisher.publish(before);
  const after = structuredClone(before) as unknown as {
    careers: Record<string, { score: number }>;
    world: { clubs: { points: number; form?: number[] }[] };
  };
  after.careers.p7!.score = 51;
  delete after.careers.p9;
  after.world.clubs[3]!.points = 3;
  after.world.clubs[3]!.form = [1, 0];
  delete after.world.clubs[5]!.form;
  const joined = { id: 'c40', name: 'Club 40', points: 0, form: [0, 0] };
  after.world.clubs.push(joined);
  expect(deltaOf(publisher, before, 1, after as unknown as View)).toEqual({
    base: 1,
    parts: {},
    world: {},
    dropped: [],
    patches: {
      careers: { o: { p7: { o: { score: { v: 51 } } } }, d: ['p9'] },
      'world.clubs': {
        a: [
          [3, { o: { points: { v: 3 }, form: { v: [1, 0] } } }],
          [5, { o: {}, d: ['form'] }],
          [40, { v: joined }],
        ],
        n: 41,
      },
    },
  });
  // A shorter array names its new length.
  const shorter = structuredClone(after);
  shorter.world.clubs.length = 39;
  expect(deltaOf(publisher, after as unknown as View, 2, shorter as unknown as View)).toEqual({
    base: 2,
    parts: {},
    world: {},
    dropped: [],
    patches: { 'world.clubs': { a: [], n: 39 } },
  });
});

it('sends a part whole when it is small or its patch is not much smaller', () => {
  const publisher = new ViewPublisher();
  const tags = Array.from({ length: 100 }, (_, i) => `${i}`.padEnd(100, 'a'));
  const before = view({ tags }, { cups: [{ id: 'cup', round: 1 }] });
  expect(JSON.stringify(tags).length).toBeGreaterThanOrEqual(VIEW_PATCH.minChars);
  publisher.publish(before);
  // Every tag changes, so the patch would outgrow its share; the small cups list never patches.
  const retagged = tags.map((tag) => tag.replace(/a/g, 'b'));
  const after = view({ tags: retagged }, { cups: [{ id: 'cup', round: 2 }] });
  expect(deltaOf(publisher, before, 1, after)).toEqual({
    base: 1,
    parts: { tags: retagged },
    world: { cups: [{ id: 'cup', round: 2 }] },
    dropped: [],
  });
});

it('publishes whole on a base it no longer holds or of another world', () => {
  const publisher = new ViewPublisher();
  const first = view({ totalMatches: 1 });
  publisher.publish(first);
  expect(publisher.publish(first, 99)).toEqual({ view: first, viewSeq: 2 });
  for (let i = 2; i < PUBLISHED_VIEWS; i++) publisher.publish(first);
  // The first view is still among the last PUBLISHED_VIEWS, then this publication evicts it.
  expect(publisher.publish(first, 1).viewDelta?.base).toBe(1);
  expect(publisher.publish(first, 1)).toEqual({ view: first, viewSeq: PUBLISHED_VIEWS + 2 });

  const worlds = new ViewPublisher();
  const own = view({ totalMatches: 1 }, {}, 'w1');
  const other = view({ totalMatches: 1 }, {}, 'w2');
  worlds.publish(own);
  // The same number on another world is no base for it; the first world's view still is.
  expect(worlds.publish(other, 1)).toEqual({ view: other, viewSeq: 2 });
  expect(worlds.publish(own, 1).viewDelta).toEqual({ base: 1, parts: {}, world: {}, dropped: [] });
});

/**
 * The publisher before T520, kept as the reference: every leaf compared by its JSON text and the
 * base's text parsed again on every diff. The current one must send the very same bytes.
 */
class TextPublisher {
  private published: { seq: number; worldId: string; texts: Map<string, string | undefined> }[] =
    [];
  private viewSeq = 0;
  publish(view: View, base?: number): Pick<Reply, 'view' | 'viewSeq' | 'viewDelta'> {
    const text = (value: unknown) => {
      try {
        return JSON.stringify(value) ?? 'undefined';
      } catch {
        return undefined;
      }
    };
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const patchOf = (before: unknown, now: unknown, depth: number): ViewPatch | undefined => {
      if (depth > 0 && Array.isArray(before) && Array.isArray(now)) {
        const changed: [number, ViewPatch][] = [];
        now.forEach((item, index) => {
          const sub = index < before.length ? patchOf(before[index], item, depth - 1) : { v: item };
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
          const sub = patchOf(before[key], value, depth - 1);
          if (sub) [changed[key], any] = [sub, true];
        }
        const removed = Object.keys(before).filter(
          (key) => !(key in now) || now[key] === undefined,
        );
        if (!any && !removed.length) return undefined;
        return removed.length ? { o: changed, d: removed } : { o: changed };
      }
      return text(before) === text(now) ? undefined : { v: now };
    };
    const { world, ...rest } = view;
    const texts = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(rest)) texts.set(key, text(value));
    for (const [key, value] of Object.entries(world)) texts.set(`world.${key}`, text(value));
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
    for (const [key, now] of texts) {
      const before = previous.texts.get(key);
      if (now !== undefined && before === now) continue;
      const value = key.startsWith('world.')
        ? world[key.slice(6) as keyof typeof world]
        : rest[key as keyof typeof rest];
      if (now !== undefined && before !== undefined && now.length >= VIEW_PATCH.minChars) {
        const patch = patchOf(JSON.parse(before), value, VIEW_PATCH.depth);
        if (patch && (text(patch)?.length ?? Infinity) <= now.length * VIEW_PATCH.maxShare) {
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

type Club = Record<string, unknown> & { id: string; points: number; form: number[] };
/**
 * A synthetic 49-day run over one live state the host mutates in place, as its world does: points
 * and form move every day, a club gains a field among the others and later loses two, clubs join
 * and leave, careers gain and drop players, and small parts come and go. Only values JSON carries
 * appear (→ARCH-6).
 */
function* fixtureDays(): Generator<View> {
  let seed = 7;
  const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const clubList: Club[] = Array.from({ length: 60 }, (_, i) => ({
    id: `c${i}`,
    name: `Club ${i}`.padEnd(120, '.'),
    points: 0,
    form: [],
    record: { w: 0, d: 0, l: 0 },
  }));
  const careers: Record<string, { apps: number; goals: number }> = Object.fromEntries(
    Array.from({ length: 80 }, (_, i) => [`p${i}`, { apps: 0, goals: 0 }]),
  );
  const discipline: Record<string, number> = {};
  for (let day = 0; day < 49; day++) {
    if (day > 0) {
      for (const club of clubList.slice(0, 20 + random(40))) {
        const result = random(3);
        club.points += [3, 1, 0][result]!;
        club.form = [...club.form, result].slice(-5);
        const record = club.record as Record<string, number> | undefined;
        if (record) record[['w', 'd', 'l'][result]!]!++;
      }
      for (let k = 0; k < 6; k++) careers[`p${random(80)}`]!.goals++;
      const booked = `p${random(80)}`;
      discipline[booked] = (discipline[booked] ?? 0) + 1;
      if (day % 9 === 0) delete discipline[Object.keys(discipline)[0]!];
      // A field placed among the others, then two dropped at once: the order JSON writes them in.
      if (day === 10) {
        const { id, ...rest } = clubList[3]!;
        clubList[3] = { id, captain: 'p1', ...rest } as Club;
      }
      if (day === 12) {
        delete clubList[3]!.captain;
        delete clubList[3]!.record;
      }
      if (day === 20) clubList[8]!.sponsor = 'Ironworks';
      if (day === 24) delete clubList[8]!.sponsor;
      if (day === 30) clubList.push({ id: 'c60', name: 'Club 60', points: 0, form: [] });
      if (day === 35) clubList.splice(17, 1);
      if (day === 40) careers.p200 = { apps: 1, goals: 0 };
      if (day === 41) delete careers.p5;
    }
    yield {
      totalMatches: day,
      careers,
      discipline: { ...discipline },
      ...(day % 5 === 0 ? { notice: `day ${day}` } : {}),
      world: { id: 'w1', day, round: Math.floor(day / 7), clubs: clubList },
    } as unknown as View;
  }
}

it('sends the previous bytes over a 49-day run and rebuilds the host view every day (→ARCH-6)', () => {
  const publisher = new ViewPublisher(),
    reference = new TextPublisher();
  let held: View | undefined, base: number | undefined;
  let days = 0,
    patched = 0,
    older = 0;
  for (const next of fixtureDays()) {
    // Some days another view is published first that the client does not take (an export's),
    // so the client names the older base whose kept JSON went to that view.
    if (days % 7 === 3) {
      const skipped = publisher.publish(next, base);
      expect(JSON.stringify(skipped.viewDelta)).toBe(
        JSON.stringify(reference.publish(next, base).viewDelta),
      );
      older++;
    }
    days++;
    const reply = publisher.publish(next, base),
      expected = reference.publish(next, base);
    expect(reply.viewSeq).toBe(expected.viewSeq);
    expect(reply.view).toBe(expected.view);
    expect(JSON.stringify(reply.viewDelta)).toBe(JSON.stringify(expected.viewDelta));
    const posted = structuredClone(forPosting(reply));
    if (expected.viewDelta?.patches) {
      patched++;
      expect(posted.viewDelta!.patches).toBeUndefined();
      expect(posted.viewDelta!.patchText).toBe(JSON.stringify(expected.viewDelta.patches));
    }
    const rebuilt = posted.view ?? applyViewDelta(held!, posted.viewDelta!, shareValue);
    expect(rebuilt).toStrictEqual(next);
    if (held) {
      // Values the day left alone keep the held view's references, as `shareView` gives them.
      const was = held.world.clubs as unknown[],
        now = rebuilt.world.clubs as unknown[];
      now.forEach((club, i) => {
        if (JSON.stringify(club) === JSON.stringify(was[i])) expect(club).toBe(was[i]);
      });
    }
    // The client keeps its own copy; the host goes on mutating its live state.
    held = structuredClone(rebuilt);
    base = reply.viewSeq;
  }
  expect(days).toBe(49);
  expect(patched).toBeGreaterThan(40);
  expect(older).toBe(7);
});

it('keeps diffing on its own copy of the base and posts patches as their JSON', () => {
  const publisher = new ViewPublisher();
  let held = view({}, { clubs: clubs(40) });
  let base = publisher.publish(held).viewSeq!;
  for (let day = 1; day <= 4; day++) {
    const next = structuredClone(held);
    const list = next.world.clubs as unknown as Record<string, unknown>[];
    list.forEach((club, i) => {
      if (i % 3 === day % 3) club.points = day;
    });
    if (day === 2) delete list[5]!.form;
    if (day === 4) list.pop();
    const reply = publisher.publish(next, base);
    expect(reply.viewDelta!.patches).toBeDefined();
    const posted = structuredClone(forPosting(reply));
    expect(posted.viewDelta!.patches).toBeUndefined();
    // The posted form rebuilds the same view, and so does a later diff on the kept copy.
    expect(applyViewDelta(held, posted.viewDelta!)).toStrictEqual(next);
    [held, base] = [next, reply.viewSeq!];
  }
  // A reply without patches posts as it is.
  const whole = publisher.publish(held);
  expect(forPosting(whole)).toBe(whole);
});
