import { describe, expect, it } from 'vitest';
import { BUILD_PRESETS } from '../../../../packages/engine/src/build';
import { KIT_ROLES } from '../../../../packages/contracts/src/identity';
import { createIdentityDraft } from '../../../../packages/engine/src/club-identity';
import { DIRECTION_INFO, DIRECTION_KEYS } from '../../../../packages/engine/src/direction';
import { MATCH_MODEL_REVISION } from '../../../../packages/contracts/src/match-model';
import type { World } from '../../../../packages/contracts/src/types';
import { isSaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import {
  applyViewDelta,
  applyViewPatch,
  requestSchema,
  worldMetadataOf,
  type View,
  type ViewPatch,
} from './protocol';
import { shareValue } from './store';
import { forPosting, ViewPublisher } from './viewPublisher';

const request = (body: unknown) => ({
  protocol: 1,
  session: 's',
  requestId: 'r',
  expectedRevision: 0,
  generation: 1,
  parentGeneration: 0,
  body,
});

describe('the worker protocol (→ECON-25, WEB-15)', () => {
  it('accepts a command for every direction row and option the board can draft', () => {
    for (const key of DIRECTION_KEYS)
      for (const option of DIRECTION_INFO[key].options)
        expect(
          requestSchema.safeParse(
            request({ type: 'command', command: { type: 'direction', key, option: option.id } }),
          ).success,
          `${key}:${option.id}`,
        ).toBe(true);
    expect(
      requestSchema.safeParse(
        request({ type: 'command', command: { type: 'direction', key: 'mood', option: 'x' } }),
      ).success,
    ).toBe(false);
  });

  it('founds with any preset as the direction, or none', () => {
    const found = (preset?: string) =>
      requestSchema.safeParse(
        request({
          type: 'found',
          input: {
            country: 'ENG',
            name: 'Club',
            color: '#224466',
            seed: 'seed',
            level: 'easy' as const,
            ...(preset !== undefined ? { preset } : {}),
          },
        }),
      ).success;
    expect(found()).toBe(true);
    for (const preset of BUILD_PRESETS) expect(found(preset.id)).toBe(true);
    expect(found('')).toBe(false);
  });
});

it('accepts only a complete own-club design and no club target (→KIT-9)', () => {
  const identity = createIdentityDraft({ country: 'ENG', seed: 'design', color: '#3A7bC2' });
  const accepts = (command: unknown) =>
    requestSchema.safeParse(request({ type: 'command', command })).success;
  const body = { type: 'command', command: { type: 'club-identity', identity } };
  expect(requestSchema.parse(request(body)).body).toEqual(body);
  for (const target of [{ club: 'ENG:rival' }, { clubId: 'ENG:rival' }, { target: 'ENG:rival' }])
    expect(accepts({ type: 'club-identity', identity, ...target }), JSON.stringify(target)).toBe(
      false,
    );
  for (const colour of ['red', '#12345', '#1234567', '#12345g', 'url(#x)'])
    for (const malformed of [
      { ...identity, colours: [colour] },
      { ...identity, crest: { ...identity.crest, primary: colour } },
      { ...identity, kits: { ...identity.kits, away: { pattern: 'plain', primary: colour } } },
    ])
      expect(accepts({ type: 'club-identity', identity: malformed }), colour).toBe(false);
  expect(accepts({ type: 'club-identity', identity: { ...identity, version: 2 } })).toBe(false);
  expect(accepts({ type: 'club-identity' })).toBe(false);
});

it('takes a next-fixture kit role in the engine vocabulary or null, nothing else (→KIT-6)', () => {
  const accepts = (command: unknown) =>
    requestSchema.safeParse(request({ type: 'command', command })).success;
  for (const role of [...KIT_ROLES, null]) {
    const body = { type: 'command', command: { type: 'match-kit', fixtureId: 'f:1', role } };
    expect(requestSchema.parse(request(body)).body).toEqual(body);
  }
  for (const role of ['', 'fourth', 'goalkeeper', 'Home', undefined, 0])
    expect(accepts({ type: 'match-kit', fixtureId: 'f:1', role }), String(role)).toBe(false);
  expect(accepts({ type: 'match-kit', fixtureId: 'f:1' })).toBe(false);
  for (const fixtureId of ['', 'x'.repeat(101), 7, undefined])
    expect(accepts({ type: 'match-kit', fixtureId, role: 'home' })).toBe(false);
  expect(accepts({ type: 'match-kit', fixtureId: 'f:1', role: 'home', club: 'ENG:rival' })).toBe(
    false,
  );
});

it('carries supported match-model metadata and refuses a future one, changing nothing (→SAVE-23)', () => {
  const matchModel = {
    revision: MATCH_MODEL_REVISION,
    activated: { year: 1990, day: 12, revision: 40 },
    trackedFrom: { year: 1990, day: 13, round: 2 },
    coverage: 'activation' as const,
  };
  const world = (extra: object) =>
    ({ id: 'world', revision: 41, engine: '0.7.0', ownMatches: [], ...extra }) as unknown as World;
  expect(worldMetadataOf(world({}))).toEqual({ id: 'world', revision: 41 });

  const activated = world({ matchModel });
  const before = structuredClone(activated);
  const metadata = worldMetadataOf(activated);
  expect(metadata).toEqual({ id: 'world', revision: 41, matchModel });
  metadata.matchModel!.trackedFrom.round = 9;
  expect(activated).toEqual(before);

  for (const future of [
    world({ matchModel: { ...matchModel, revision: 'continuous-aggregate-7' } }),
    world({ ownMatches: [{ id: 'f:1', model: 'continuous-aggregate-7' }] }),
  ]) {
    const unchanged = structuredClone(future);
    let error: unknown;
    try {
      worldMetadataOf(future);
    } catch (e) {
      error = e;
    }
    expect(isSaveCompatibilityError(error)).toBe(true);
    expect(future).toEqual(unchanged);
  }
});

it('reads one competition of complete statistics on request, never a playoff scope (→WEB-89)', () => {
  const accepts = (body: unknown) => requestSchema.safeParse(request(body)).success;
  for (const kind of ['league', 'lower', 'cup', 'europe']) {
    const body = { type: 'full-stats', kind, groupKey: 'ENG:0:0' };
    expect(requestSchema.parse(request(body)).body).toEqual(body);
  }
  // Every country's barrage shares one key and settles at the close: no view reads it.
  expect(accepts({ type: 'full-stats', kind: 'playoff', groupKey: 'promotion' })).toBe(false);
  expect(accepts({ type: 'full-stats', kind: 'league', groupKey: '' })).toBe(false);
  expect(accepts({ type: 'full-stats', kind: 'league' })).toBe(false);
  expect(accepts({ type: 'full-stats', kind: 'league', groupKey: 'ENG:0:0', year: 1990 })).toBe(
    false,
  );
});

it('reads a manager-history page from the start or a cursor, for one named career (→HIST-18)', () => {
  const accepts = (body: unknown) => requestSchema.safeParse(request(body)).success;
  const cursor = 'manager-history:1:' + encodeURIComponent(JSON.stringify(['ENG:club', 'x']));
  for (const body of [
    { type: 'manager-history' },
    { type: 'manager-history', cursor },
    { type: 'manager-history', cursor, world: 'world:abc' },
  ])
    expect(requestSchema.parse(request(body)).body).toEqual(body);
  // The query owns its cursor's meaning; the protocol bounds only its shape.
  for (const malformed of [
    { type: 'manager-history', cursor: '' },
    { type: 'manager-history', cursor: 'x'.repeat(2001) },
    { type: 'manager-history', cursor: 7 },
    { type: 'manager-history', world: '' },
    { type: 'manager-history', year: 1990 },
    { type: 'manager-history', page: 2 },
  ])
    expect(accepts(malformed), JSON.stringify(malformed)).toBe(false);
});

it('preserves stable retained-coach identities beyond the original candidate slots', () => {
  const body = {
    type: 'command',
    command: {
      type: 'hire-staff',
      role: 'assistant',
      candidate: 42,
      candidateId: 'person:retained',
      term: 2,
    },
  };
  expect(requestSchema.parse(request(body)).body).toEqual(body);
});

it('validates the two combined playing-coach command boundaries', () => {
  for (const command of [
    { type: 'propose-playing-coach', player: 'person:one', years: 2, term: 3 },
    { type: 'answer-playing-coach', player: 'person:one', accept: true },
  ])
    expect(requestSchema.parse(request({ type: 'command', command })).body).toEqual({
      type: 'command',
      command,
    });
  expect(
    requestSchema.safeParse(
      request({
        type: 'command',
        command: { type: 'propose-playing-coach', player: 'person:one', years: 3, term: 3 },
      }),
    ).success,
  ).toBe(false);
});

describe('view patches (→ARCH-6)', () => {
  it('a patch of an id-keyed array changes only the changed fields', () => {
    const base = [
      { id: 'a', elo: 1500, name: 'A' },
      { id: 'b', elo: 1400, name: 'B' },
    ];
    const next = applyViewPatch(base, {
      a: [[1, { o: { elo: { v: 1410 } } }]],
      n: 2,
    }) as typeof base;
    expect(next).toEqual([base[0], { id: 'b', elo: 1410, name: 'B' }]);
    expect(base[1]!.elo).toBe(1400);
  });
  it('an appended array entry and a removed object key round-trip', () => {
    const base = { year: 1950, out: [1, 2], yellows: { p1: 1, p2: 2 } };
    const next = applyViewPatch(base, {
      o: { out: { a: [[2, { v: 3 }]], n: 3 }, yellows: { o: { p3: { v: 1 } }, d: ['p1'] } },
    });
    expect(next).toEqual({ year: 1950, out: [1, 2, 3], yellows: { p2: 2, p3: 1 } });
  });
  it('unchanged sub-objects keep their identity', () => {
    const base = { kept: { x: 1 }, changed: { y: 1 } };
    const next = applyViewPatch(base, { o: { changed: { o: { y: { v: 2 } } } } }) as typeof base;
    expect(next.kept).toBe(base.kept);
    expect(next).not.toBe(base);
    expect(next.changed).toEqual({ y: 2 });
  });
});

describe('view deltas posted as patchText (→ARCH-6)', () => {
  const view = (clubs: unknown[], round: number) =>
    ({ totalMatches: round, world: { id: 'w1', round, clubs } }) as unknown as View;
  const clubs = (points: (i: number) => number) =>
    Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      name: `Club ${i}`.padEnd(240, '.'),
      points: points(i),
      ...(i === 5 && points(0) === 0 ? { note: 'n' } : {}),
    }));
  it('rebuilds the same view from patchText as from the patch objects', () => {
    const publisher = new ViewPublisher(),
      first = view(
        clubs(() => 0),
        1,
      );
    publisher.publish(first);
    const second = view(
      clubs((i) => (i % 4 ? 0 : 3)),
      2,
    );
    const reply = publisher.publish(second, 1),
      posted = forPosting(reply).viewDelta!;
    expect(posted.patches).toBeUndefined();
    expect(JSON.parse(posted.patchText!)).toEqual(
      JSON.parse(JSON.stringify(reply.viewDelta!.patches)),
    );
    const fromText = applyViewDelta(structuredClone(first), structuredClone(posted));
    expect(fromText).toStrictEqual(second);
    expect(fromText).toStrictEqual(applyViewDelta(structuredClone(first), reply.viewDelta!));
  });
  it('reads a value JSON left out back as a removed key or an empty array slot', () => {
    const base = { kept: 1, gone: 2, list: [1, 2] };
    const patches = { o: { gone: {}, list: { a: [[1, {}]], n: 2 } }, d: ['gone'] };
    expect(applyViewPatch(base, patches as unknown as ViewPatch)).toStrictEqual({
      kept: 1,
      list: [1, undefined],
    });
  });
  it('rebuilds a later view on an older base the client still names', () => {
    const publisher = new ViewPublisher(),
      first = view(
        clubs(() => 0),
        1,
      );
    publisher.publish(first);
    // A view the client never takes is diffed on the first and takes over its kept JSON.
    const skipped = view(
      clubs((i) => (i === 2 ? 1 : 0)),
      2,
    );
    expect(publisher.publish(skipped, 1).viewDelta!.base).toBe(1);
    const third = view(
      clubs((i) => (i % 3 ? 0 : 3)),
      3,
    );
    const posted = structuredClone(forPosting(publisher.publish(third, 1))).viewDelta!;
    expect(posted.base).toBe(1);
    expect(posted.patchText).toBeDefined();
    expect(applyViewDelta(structuredClone(first), posted)).toStrictEqual(third);
    // And the newest view diffs on the third's JSON kept from that rebuild.
    const fourth = view(
      clubs((i) => (i % 3 ? 1 : 3)),
      4,
    );
    const latest = structuredClone(forPosting(publisher.publish(fourth, 3))).viewDelta!;
    expect(applyViewDelta(structuredClone(third), latest)).toStrictEqual(fourth);
  });
  it('shares the base references and gives the base itself for an empty delta', () => {
    const base = view(
      clubs(() => 0),
      1,
    );
    const empty = { base: 1, parts: {}, world: {}, dropped: [] };
    expect(applyViewDelta(base, empty, shareValue)).toBe(base);
    expect(applyViewDelta(base, empty)).not.toBe(base);
    const delta = {
      ...empty,
      world: { clubs: structuredClone(base.world.clubs) },
      patchText: JSON.stringify({
        'world.clubs': { a: [[1, { o: { points: { v: 3 } } }]], n: 40 },
      }),
    };
    const rebuilt = applyViewDelta(base, delta, shareValue);
    const before = base.world.clubs as unknown[],
      after = rebuilt.world.clubs as unknown as { points: number }[];
    expect(after[0]).toBe(before[0]);
    expect(after[1]!.points).toBe(3);
  });
});
