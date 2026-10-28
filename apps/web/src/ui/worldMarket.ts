import { useCallback, useEffect, useState } from 'react';
import type { WorldMarketQuery, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import { WORLD_MARKET_PAGE_SIZE } from '../../../../packages/contracts/src/schema';
import type { GameClient } from '../runtime/client';

export type MarketQuery = Omit<WorldMarketQuery, 'world'>;
export type MarketDetail = Awaited<ReturnType<GameClient['worldMarketDetail']>>;
export const DEFAULT_MARKET_QUERY: MarketQuery = {
  page: 0,
  pageSize: WORLD_MARKET_PAGE_SIZE,
  sort: 'ovr',
  direction: 'desc',
};

/** The worker owns filtering, ordering, stable tie breaks and page clamping. */
export function changeMarketQuery(current: MarketQuery, patch: Partial<MarketQuery>): MarketQuery {
  const next = { ...current, ...patch };
  if (Object.keys(patch).some((key) => key !== 'page')) next.page = 0;
  if (patch.league) next.team = undefined;
  if ('position' in patch) next.line = undefined;
  if ('line' in patch) next.position = undefined;
  return next;
}

export function toggleMarketComparison(current: WorldMarketTarget[], target: WorldMarketTarget) {
  const retained = current.filter((item) => item.world === target.world);
  return retained.some((item) => item.playerId === target.playerId)
    ? retained.filter((item) => item.playerId !== target.playerId)
    : [...retained.slice(-1), target];
}

export const marketLeagueKey = (league: NonNullable<MarketQuery['league']>) =>
  `${league.country}.${league.tier}.${league.group}`;
export function marketLeagues(clubs: readonly NonNullable<MarketQuery['league']>[]) {
  return [
    ...new Map(
      clubs.map((club) => [
        marketLeagueKey(club),
        {
          country: club.country,
          tier: club.tier,
          group: club.group,
        },
      ]),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));
}

/** Cancelled requests and replies from an obsolete world/revision cannot publish even errors. */
export function readMarket<T extends { world: string; revision: number }>(
  read: () => Promise<T>,
  current: () => { world?: string; revision?: number },
  scope: { world: string; revision: number },
  publish: (result: { value?: T; error?: string }) => void,
) {
  let active = true;
  const fresh = () => {
    const now = current();
    return active && now.world === scope.world && now.revision === scope.revision;
  };
  const done = read().then(
    (value) => {
      if (!fresh()) return;
      if (value.world !== scope.world || value.revision !== scope.revision) {
        publish({ error: '이적시장 정보가 바뀌었어요. 다시 확인해 주세요.' });
      } else publish({ value });
    },
    (error: unknown) => {
      if (fresh())
        publish({ error: error instanceof Error ? error.message : '조회하지 못했어요.' });
    },
  );
  return {
    done,
    cancel: () => {
      active = false;
    },
  };
}

function useMarketRead<T extends { world: string; revision: number }>(
  client: GameClient,
  world: string,
  revision: number,
  key: string,
  load: () => Promise<T> | undefined,
) {
  const [result, setResult] = useState<{ key: string; value?: T; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const pending = load();
    if (!pending) return;
    setResult({ key });
    const request = readMarket(
      () => pending,
      () => ({ world: client.state.view?.world.id, revision: client.state.view?.world.revision }),
      { world, revision },
      (reply) => setResult({ key, ...reply }),
    );
    return request.cancel;
  }, [client, world, revision, key, load, attempt]);
  return {
    value: result?.key === key ? result.value : undefined,
    error: result?.key === key ? result.error : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function useMarketPage(
  client: GameClient,
  world: string,
  revision: number,
  query: MarketQuery,
) {
  const encoded = JSON.stringify(query);
  const load = useCallback(
    () => client.worldMarket(JSON.parse(encoded) as MarketQuery),
    [client, encoded],
  );
  return useMarketRead(client, world, revision, JSON.stringify([world, revision, encoded]), load);
}

export function useMarketDetail(
  client: GameClient,
  world: string,
  revision: number,
  target?: WorldMarketTarget,
  fee?: string,
) {
  const encoded = JSON.stringify(target);
  const load = useCallback(
    () =>
      encoded ? client.worldMarketDetail(JSON.parse(encoded) as WorldMarketTarget, fee) : undefined,
    [client, encoded, fee],
  );
  return useMarketRead(
    client,
    world,
    revision,
    JSON.stringify([world, revision, encoded, fee]),
    load,
  );
}
