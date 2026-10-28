import { useCallback, useEffect, useRef, useState } from 'react';
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

type MarketScope = { world: string; revision: number; snapshot?: boolean };
type MarketReply<T> = { value?: T; error?: string };
type MarketResult<T> = MarketReply<T> & { key: string; verifiedRevision?: number };

/** Display snapshots may age during play; stopped-state previews still require an exact revision. */
export function readMarket<T extends { world: string; revision: number }>(
  read: () => Promise<T>,
  current: () => { world?: string; revision?: number },
  scope: MarketScope,
  publish: (result: MarketReply<T>) => void,
) {
  let active = true;
  const fresh = () => {
    const now = current();
    return (
      active && now.world === scope.world && (scope.snapshot || now.revision === scope.revision)
    );
  };
  const done = read().then(
    (value) => {
      if (!fresh()) return;
      const revision = current().revision;
      if (
        value.world !== scope.world ||
        value.revision < scope.revision ||
        revision === undefined ||
        value.revision > revision
      ) {
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

/** One in-flight read and one latest replacement, retaining only the active query's snapshot. */
export function createMarketReader<T extends { world: string; revision: number }>(
  current: () => { world?: string; revision?: number },
  publish: (result: MarketResult<T>) => void,
) {
  type Request = MarketScope & {
    key: string;
    attempt: number;
    load: () => Promise<T> | undefined;
  };
  let active = true;
  let latest: Request | undefined;
  let token: string | undefined;
  let inFlight: ReturnType<typeof readMarket<T>> | undefined;
  let result: MarketResult<T> | undefined;
  const emit = (next: MarketResult<T>) => {
    result = next;
    publish(next);
  };
  const start = () => {
    const request = latest;
    if (!active || inFlight || !request) return;
    const pending = request.load();
    if (!pending) return;
    inFlight = readMarket(
      () => pending,
      current,
      request,
      (reply) => {
        if (active && latest === request)
          emit({
            key: request.key,
            value: result?.value,
            ...reply,
            ...(reply.value && !request.snapshot ? { verifiedRevision: request.revision } : {}),
          });
      },
    );
    void inFlight.done.then(() => {
      inFlight = undefined;
      if (active && latest !== request) start();
    });
  };
  return {
    update(request: Request) {
      if (!active) return;
      const nextToken = JSON.stringify([
        request.key,
        request.snapshot ? 'running' : request.revision,
        request.attempt,
      ]);
      if (token === nextToken) return;
      token = nextToken;
      latest = request;
      emit({ key: request.key, value: result?.key === request.key ? result.value : undefined });
      start();
    },
    cancel() {
      active = false;
      latest = undefined;
      inFlight?.cancel();
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
  const [result, setResult] = useState<MarketResult<T>>();
  const [attempt, setAttempt] = useState(0);
  const reader = useRef<ReturnType<typeof createMarketReader<T>>>(undefined);
  const snapshot = !!(client.state?.clockRunning || client.state?.processing);
  useEffect(() => {
    const current = createMarketReader<T>(
      () => ({ world: client.state.view?.world.id, revision: client.state.view?.world.revision }),
      setResult,
    );
    reader.current = current;
    return current.cancel;
  }, [client]);
  useEffect(() => {
    reader.current?.update({ world, revision, snapshot, key, load, attempt });
  }, [client, world, revision, snapshot, key, load, attempt]);
  return {
    value: result?.key === key ? result.value : undefined,
    error: result?.key === key ? result.error : undefined,
    current: !snapshot && result?.key === key && result.verifiedRevision === revision,
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
  return useMarketRead(client, world, revision, JSON.stringify([world, encoded]), load);
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
  return useMarketRead(client, world, revision, JSON.stringify([world, encoded, fee]), load);
}
