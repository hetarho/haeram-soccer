import { expect, it } from 'vitest';
import { applyViewDelta, PUBLISHED_VIEWS, type View, type ViewDelta } from './protocol';
import { VIEW_PATCH, ViewPublisher } from './viewPublisher';

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
