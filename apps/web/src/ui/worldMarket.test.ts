import { describe, expect, it, vi } from 'vitest';
import type { WorldMarketPage, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import {
  DEFAULT_MARKET_QUERY,
  changeMarketQuery,
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
    expect(changeMarketQuery(current, { league: undefined }).team).toBeUndefined();
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
