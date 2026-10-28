import { describe, expect, it, vi } from 'vitest';
import type { WorldMarketPage, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import {
  DEFAULT_MARKET_QUERY,
  changeMarketQuery,
  createMarketReader,
  marketLeagueKey,
  marketLeagues,
  readMarket,
  toggleMarketComparison,
} from './worldMarket';

const target = (playerId: string, world = 'one'): WorldMarketTarget => ({
  world,
  kind: 'club',
  clubId: 'seller',
  playerId,
});
const scope = { world: 'one', revision: 3 };
const page: WorldMarketPage = { ...scope, page: 0, pageSize: 50, total: 0, items: [] };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('market query and stable selection transformations', () => {
  it('defaults to the whole world in bounded pages without a scout-only restriction', () => {
    expect(DEFAULT_MARKET_QUERY).toEqual({ page: 0, pageSize: 50, sort: 'ovr', direction: 'desc' });
  });
  it.each([
    { name: 'Ada' },
    { recommendedOnly: true },
    { league: { country: 'ESP', tier: 0, group: 0 } },
    { team: 'other' },
    { position: 'LWB' as const },
    { line: 'DF' as const },
    { fit: 'improves' as const },
    ...(['name', 'age', 'ovr', 'potential', 'fee', 'wage'] as const).flatMap((sort) => [
      { sort, direction: 'asc' as const },
      { sort, direction: 'desc' as const },
    ]),
  ])('resets pages for filter/sort changes: %j', (patch) => {
    const original = { ...DEFAULT_MARKET_QUERY, page: 8 };
    expect(changeMarketQuery(original, patch)).toMatchObject({ ...patch, page: 0 });
    expect(original.page).toBe(8);
  });
  it('keeps filters on page changes and clears dependent team/position/line choices', () => {
    const current = { ...DEFAULT_MARKET_QUERY, name: 'Ada', team: 'old', line: 'DF' as const };
    expect(changeMarketQuery(current, { page: 2 })).toEqual({ ...current, page: 2 });
    expect(changeMarketQuery(current, { league: undefined }).team).toBe('old');
    expect(
      changeMarketQuery(current, { league: { country: 'ESP', tier: 0, group: 0 } }).team,
    ).toBeUndefined();
    expect(changeMarketQuery(current, { position: 'RWB' }).line).toBeUndefined();
    expect(
      changeMarketQuery({ ...current, position: 'CB' }, { line: 'MF' }).position,
    ).toBeUndefined();
  });
  it('keeps two distinct actual targets across pages and clears other-world selections', () => {
    let selected = toggleMarketComparison([], target('a'));
    selected = toggleMarketComparison(selected, target('b'));
    expect(selected).toEqual([target('a'), target('b')]);
    expect(toggleMarketComparison(selected, target('c'))).toEqual([target('b'), target('c')]);
    expect(toggleMarketComparison(selected, target('a'))).toEqual([target('b')]);
    expect(toggleMarketComparison(selected, target('a', 'two'))).toEqual([target('a', 'two')]);
  });
  it('derives unique represented league identities without reading any roster', () => {
    const clubs = [
      { country: 'ESP', tier: 0, group: 0 },
      { country: 'ENG', tier: 1, group: 0 },
      { country: 'ESP', tier: 0, group: 0 },
      { country: 'ENG', tier: 1, group: 1 },
    ];
    expect(marketLeagues(clubs).map(([key]) => key)).toEqual(['ENG.1.0', 'ENG.1.1', 'ESP.0.0']);
    expect(marketLeagueKey(clubs[0])).toBe('ESP.0.0');
  });
});

describe('asynchronous market replies', () => {
  it('publishes only the latest query when an earlier response arrives last', async () => {
    const first = deferred<WorldMarketPage>(),
      second = deferred<WorldMarketPage>();
    const publish = vi.fn();
    const old = readMarket(
      () => first.promise,
      () => scope,
      scope,
      publish,
    );
    old.cancel();
    const latest = readMarket(
      () => second.promise,
      () => scope,
      scope,
      publish,
    );
    second.resolve({ ...page, page: 1 });
    await latest.done;
    first.resolve(page);
    await old.done;
    expect(publish).toHaveBeenCalledExactlyOnceWith({ value: { ...page, page: 1 } });
  });
  it.each([
    { world: 'two', revision: 3 },
    { world: 'one', revision: 4 },
  ])('discards obsolete game/revision responses and errors: %j', async (current) => {
    const publish = vi.fn();
    await readMarket(
      async () => page,
      () => current,
      scope,
      publish,
    ).done;
    await readMarket(
      async () => {
        throw new Error('obsolete failure');
      },
      () => current,
      scope,
      publish,
    ).done;
    expect(publish).not.toHaveBeenCalled();
  });
  it('exposes a retryable matching error but refuses a mismatched response envelope', async () => {
    const publish = vi.fn();
    await readMarket(
      async () => {
        throw new Error('try again');
      },
      () => scope,
      scope,
      publish,
    ).done;
    expect(publish).toHaveBeenLastCalledWith({ error: 'try again' });
    await readMarket(
      async () => ({ ...page, world: 'two' }),
      () => scope,
      scope,
      publish,
    ).done;
    expect(publish.mock.lastCall?.[0]).toHaveProperty('error');
  });
  it('cannot replace a newer selected-player preview with an old error', async () => {
    const pending = deferred<typeof page>();
    const publish = vi.fn();
    const request = readMarket(
      () => pending.promise,
      () => scope,
      scope,
      publish,
    );
    request.cancel();
    pending.reject(new Error('old selected player'));
    await request.done;
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('coalesced market snapshots', () => {
  function fixture() {
    let current = { ...scope };
    const publish = vi.fn();
    const reader = createMarketReader<WorldMarketPage>(() => current, publish);
    const pending: ReturnType<typeof deferred<WorldMarketPage>>[] = [];
    const load = vi.fn(() => {
      const request = deferred<WorldMarketPage>();
      pending.push(request);
      return request.promise;
    });
    const update = (key = 'one:page-0', snapshot = true, attempt = 0) =>
      reader.update({ ...current, key, snapshot, attempt, load });
    const move = (revision: number, world = scope.world) => {
      current = { world, revision };
    };
    const settle = async (index: number, value = { ...page, ...current }) => {
      pending[index].resolve(value);
      // Flush the reply and the serial reader's completion, without timers or a worker.
      await pending[index].promise;
      await Promise.resolve();
    };
    return { publish, reader, pending, load, update, move, settle };
  }

  it('finishes an in-flight page across repeated revisions and retains it through further play', async () => {
    const f = fixture();
    f.update();
    for (let revision = 4; revision <= 12; revision++) {
      f.move(revision);
      f.update();
    }
    expect(f.load).toHaveBeenCalledOnce();
    const accepted = { ...page, revision: 8, total: 1 };
    await f.settle(0, accepted);
    expect(f.publish).toHaveBeenLastCalledWith({ key: 'one:page-0', value: accepted });
    f.move(13);
    f.update();
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.publish).toHaveBeenCalledTimes(2);
  });

  it.each(['query', 'filter', 'page', 'selection', 'fee', 'game'])(
    'coalesces superseding %s requests into only the latest and ignores obsolete replies',
    async (change) => {
      const f = fixture();
      f.update();
      if (change === 'game') f.move(1, 'two');
      for (let i = 1; i <= 8; i++) f.update(`${change}:${i}`);
      expect(f.load).toHaveBeenCalledOnce();
      expect(f.publish.mock.lastCall?.[0].value).toBeUndefined();
      await f.settle(0, page);
      expect(f.load).toHaveBeenCalledTimes(2);
      expect(f.publish.mock.calls.some(([result]) => result.value === page)).toBe(false);
      const latest = {
        ...page,
        world: change === 'game' ? 'two' : 'one',
        revision: change === 'game' ? 1 : scope.revision,
      };
      await f.settle(1, latest);
      expect(f.publish).toHaveBeenLastCalledWith({ key: `${change}:8`, value: latest });
    },
  );

  it('retains the snapshot while stopping but refreshes exact-revision conditions before use', async () => {
    const f = fixture();
    f.update();
    await f.settle(0, page);
    f.move(5);
    f.update('one:page-0', false);
    expect(f.publish).toHaveBeenLastCalledWith({ key: 'one:page-0', value: page });
    expect(f.load).toHaveBeenCalledTimes(2);
    f.move(6);
    f.update('one:page-0', false);
    await f.settle(1, { ...page, revision: 5 });
    expect(f.load).toHaveBeenCalledTimes(3);
    expect(f.publish.mock.calls.some(([result]) => result.value?.revision === 5)).toBe(false);
    await f.settle(2);
    expect(f.publish.mock.lastCall?.[0].value.revision).toBe(6);
    expect(f.publish.mock.lastCall?.[0].verifiedRevision).toBe(6);
  });

  it('waits for a read started during play before sending its stopped-state replacement', async () => {
    const f = fixture();
    f.update();
    f.move(7);
    f.update('one:page-0', false);
    expect(f.load).toHaveBeenCalledOnce();
    await f.settle(0, { ...page, revision: 4 });
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.publish.mock.lastCall?.[0].value).toBeUndefined();
    await f.settle(1);
    expect(f.publish.mock.lastCall?.[0].value.revision).toBe(7);
  });

  it('retains a snapshot on refresh failure and allows one explicit retry', async () => {
    const f = fixture();
    f.update();
    await f.settle(0);
    f.move(5);
    f.update('one:page-0', false);
    f.pending[1].reject(new Error('retry conditions'));
    await f.pending[1].promise.catch(() => undefined);
    await Promise.resolve();
    expect(f.publish).toHaveBeenLastCalledWith({
      key: 'one:page-0',
      value: page,
      error: 'retry conditions',
    });
    f.update('one:page-0', false, 1);
    expect(f.load).toHaveBeenCalledTimes(3);
    await f.settle(2);
    expect(f.publish.mock.lastCall?.[0].error).toBeUndefined();
  });

  it('clears a closed detail, drops its late error and never starts work after unmount', async () => {
    const f = fixture();
    f.update('selected');
    f.reader.update({ ...scope, key: 'closed', snapshot: true, attempt: 0, load: () => undefined });
    f.pending[0].reject(new Error('obsolete selected player'));
    await f.pending[0].promise.catch(() => undefined);
    await Promise.resolve();
    expect(f.publish).toHaveBeenLastCalledWith({ key: 'closed', value: undefined });
    f.update('next');
    f.update('queued');
    f.reader.cancel();
    const calls = f.publish.mock.calls.length;
    await f.settle(1);
    f.update('unmounted');
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.publish).toHaveBeenCalledTimes(calls);
  });

  it.each([2, 8])(
    'rejects an older or future envelope (revision %s) even during play',
    async (revision) => {
      const f = fixture();
      f.update();
      f.move(7);
      await f.settle(0, { ...page, revision });
      expect(f.publish.mock.lastCall?.[0]).toHaveProperty('error');
      expect(f.publish.mock.lastCall?.[0].value).toBeUndefined();
    },
  );
});
