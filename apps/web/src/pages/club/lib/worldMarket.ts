import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { currency } from '../../../../../../packages/catalogs/src/index';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  World,
  WorldMarketQuery,
  WorldMarketTarget,
} from '../../../../../../packages/contracts/src/types';
import { WORLD_MARKET_PAGE_SIZE } from '../../../../../../packages/contracts/src/schema';
import type { GameClient } from '../../../runtime/client';

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

/**
 * A free agent signed leaves the pool (→CLUB-49) and is our club's player from then on, so a
 * target still naming him as a free agent reads him with us, where his card reports the signing
 * as complete; every other target is kept.
 */
export function signedFreeAgentTarget<T extends WorldMarketTarget | undefined>(
  target: T,
  signed: WorldMarketTarget,
  club: string,
): T | WorldMarketTarget {
  return target?.kind === 'offer' &&
    signed.kind === 'offer' &&
    target.world === signed.world &&
    target.playerId === signed.playerId
    ? { world: target.world, kind: 'club', clubId: club, playerId: target.playerId }
    : target;
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

/** UI-only provenance of nominal money; never a worker payload or a conversion. */
export type MarketMoney = { code: string; year: number };
export function marketMoneyContext(
  w?: Pick<World, 'clubs' | 'playerClub' | 'year'>,
): MarketMoney | undefined {
  const club = w?.clubs.find((club) => club.id === w.playerClub);
  return club && w ? { code: club.country, year: w.year } : undefined;
}
export function sameMarketMoney(a?: MarketMoney | null, b?: MarketMoney | null): boolean {
  if (!a || !b) return false;
  const first = currency(a.code, a.year),
    second = currency(b.code, b.year);
  return first.code === second.code && first.units === second.units;
}
type MarketScope = { world: string; revision: number; snapshot?: boolean; money?: MarketMoney };
type MarketReply<T> = { value?: T; error?: string; money?: MarketMoney | null };
type CurrentMarket = { world?: string; revision?: number; money?: MarketMoney };

/** Exact endpoints establish a unit; an intermediate revision across a boundary does not. */
function replyMoney(revision: number, request: MarketScope, current: CurrentMarket) {
  if (revision === request.revision) return request.money ?? null;
  if (revision === current.revision) return current.money ?? null;
  return sameMarketMoney(request.money, current.money) ? request.money! : null;
}
type MarketResult<T> = MarketReply<T> & { key: string; verifiedRevision?: number };

/** Display snapshots may age during play; stopped-state previews still require an exact revision. */
export function readMarket<T extends { world: string; revision: number }>(
  read: () => Promise<T>,
  current: () => CurrentMarket,
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
      const now = current();
      const revision = now.revision;
      if (
        value.world !== scope.world ||
        value.revision < scope.revision ||
        revision === undefined ||
        value.revision > revision
      ) {
        publish({ error: sourceMessage('copy.worldMarket.bb1ebbe595') });
      } else {
        publish({
          value,
          ...(scope.money || now.money ? { money: replyMoney(value.revision, scope, now) } : {}),
        });
      }
    },
    (error: unknown) => {
      if (fresh())
        publish({
          error:
            error instanceof Error ? error.message : sourceMessage('copy.worldMarket.5347beb02e'),
        });
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
  current: () => CurrentMarket,
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
            ...(result?.money !== undefined ? { money: reply.value ? null : result.money } : {}),
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
      emit({
        key: request.key,
        value: result?.key === request.key ? result.value : undefined,
        ...(result?.key === request.key && result.money !== undefined
          ? { money: result.money }
          : {}),
      });
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
      () => ({
        world: client.state.view?.world.id,
        revision: client.state.view?.world.revision,
        money: marketMoneyContext(client.state.view?.world),
      }),
      setResult,
    );
    reader.current = current;
    return current.cancel;
  }, [client]);
  useEffect(() => {
    const shown = client.state.view?.world;
    const money =
      shown?.id === world && shown.revision === revision ? marketMoneyContext(shown) : undefined;
    reader.current?.update({ world, revision, snapshot, key, load, attempt, money });
  }, [client, world, revision, snapshot, key, load, attempt]);
  return {
    value: result?.key === key ? result.value : undefined,
    error: result?.key === key ? result.error : undefined,
    money: result?.key === key ? (result.money ?? null) : null,
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
