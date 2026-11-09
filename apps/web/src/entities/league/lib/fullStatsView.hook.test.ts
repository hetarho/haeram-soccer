// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  type FullStatsRead,
  type FullStatsScope,
} from '../../../../../../packages/contracts/src/match-model';
import type { World } from '../../../../../../packages/contracts/src/types';
import { useFullStats, type FullStatsState } from './fullStatsView';

const scope: FullStatsScope = { kind: 'league', groupKey: 'ENG:0:0' };
const model = {
  revision: MATCH_MODEL_REVISION,
  activated: { year: 2024, day: 0, revision: 0 },
  trackedFrom: { year: 2024, day: 0, round: 0 },
  coverage: 'founding' as const,
};
const world = () => ({ id: 'synthetic', year: 2024, round: 1, revision: 10, matchModel: model });
const read = (year = 2024, chosen = scope): FullStatsRead => ({
  year,
  trackedFrom: { year, day: 0, round: 0 },
  untracked: 0,
  competition: { ...chosen, clubs: [], players: [] },
});
function deferred() {
  let resolve!: (value: FullStatsRead | undefined) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<FullStatsRead | undefined>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let root: Root, state: FullStatsState;
let requests: ReturnType<typeof deferred>[];
const client = {
  fullStats: vi.fn(() => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  }),
};
function Probe({
  w,
  chosen = scope,
  strict = true,
}: {
  w: Pick<World, 'id' | 'year' | 'round' | 'revision' | 'matchModel'>;
  chosen?: FullStatsScope;
  strict?: boolean;
}) {
  state = useFullStats(client, w, chosen, { keepPrevious: !strict });
  return createElement('span', {}, state.status);
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requests = [];
  client.fullStats.mockClear();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
const render = async (
  w: Pick<World, 'id' | 'year' | 'round' | 'revision' | 'matchModel'> = world(),
  strict = true,
  chosen = scope,
) => act(async () => root.render(createElement(Probe, { w, strict, chosen })));
const answer = async (i: number, value = read()) => act(async () => requests[i]!.resolve(value));

it('strict reads hide held values synchronously on a round change, but ignore daily revisions', async () => {
  await render();
  await answer(0);
  expect(state).toMatchObject({ status: 'ready', read: read() });
  await render({ ...world(), revision: 11 });
  expect(requests).toHaveLength(1);
  await render({ ...world(), round: 2, revision: 20 });
  expect(state.status).toBe('loading');
  expect(requests).toHaveLength(2);
  await answer(1);
  expect(state.status).toBe('ready');
});
it('default previous-read behavior survives round refreshes', async () => {
  await render(world(), false);
  await answer(0);
  const before = state;
  await render({ ...world(), round: 2 }, false);
  expect(state).toEqual(before);
  expect(requests).toHaveLength(2);
});
it.each(['round', 'year', 'world', 'league'] as const)(
  'discards an old pending %s reply',
  async (change) => {
    await render();
    const w = {
      ...world(),
      ...(change === 'round'
        ? { round: 2 }
        : change === 'year'
          ? { year: 2025 }
          : change === 'world'
            ? { id: 'other' }
            : {}),
    };
    const chosen = change === 'league' ? { ...scope, groupKey: 'GER:0:0' } : scope;
    await render(w, true, chosen);
    await answer(0);
    expect(state.status).toBe('loading');
    await answer(1, read(w.year, chosen));
    expect(state).toMatchObject({ status: 'ready', read: read(w.year, chosen) });
  },
);
it.each(['year', 'kind', 'group'] as const)(
  'rejects mismatched read %s and permits retry',
  async (change) => {
    await render();
    const wrong = read(change === 'year' ? 2023 : 2024, {
      kind: change === 'kind' ? 'cup' : 'league',
      groupKey: change === 'group' ? 'GER:0:0' : scope.groupKey,
    });
    await answer(0, wrong);
    expect(state.status).toBe('failed');
    await act(async () => {
      if (state.status === 'failed') state.retry();
    });
    expect(state.status).toBe('loading');
    await answer(1);
    expect(state.status).toBe('ready');
  },
);
it('keeps failure separate from unavailable and retries without changing scope', async () => {
  await render();
  await act(async () => requests[0]!.reject(new Error('synthetic failure')));
  expect(state.status).toBe('failed');
  await act(async () => {
    if (state.status === 'failed') state.retry();
  });
  await act(async () => requests[1]!.resolve(undefined));
  expect(state).toEqual({ status: 'ready', read: undefined });
  expect(client.fullStats.mock.calls).toEqual([[scope], [scope]]);
});
it('does not request data in a legacy world', async () => {
  await render({ ...world(), matchModel: undefined });
  expect(state.status).toBe('off');
  expect(requests).toHaveLength(0);
});
