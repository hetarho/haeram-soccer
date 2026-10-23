import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameClient } from '../runtime/client';
import type { ManagerHistoryProps } from './ManagerHistory';
import {
  acceptManagerPage,
  beginManagerRead,
  MANAGER_RECORDS,
  managerRecords,
  readManagerPages,
  updateManagerRecords,
  type ManagerRecords,
} from './state';
import { useTaskState } from './taskMemory';

/** Which read is in flight or failed last: the first page(s) again, or the next page. */
type Read = 'first' | 'more';

/**
 * The records room's 감독 이력 (→HIST-18/19, WEB-92): T305's props from the worker's paged read.
 * Pages are read only while the tab shows them and kept in the career's task memory with the
 * view's `managerHistoryKey` they were read at, so the way back from a season they name shows them
 * at once. A new key (a settled match, a closed season, an appointment, a cup final) reads the
 * same number of rows again while the old ones stay on screen, never on the date alone; a reply
 * superseded meanwhile, or for another career, is dropped. Reading changes no game fact.
 */
export function useManagerHistory(
  client: GameClient,
  world: string,
  key: string | undefined,
  onOpenSeason: ManagerHistoryProps['onOpenSeason'],
): ManagerHistoryProps {
  const [records] = useTaskState<ManagerRecords>(world, MANAGER_RECORDS, {});
  const [status, setStatus] = useState<{ world: string; loading?: Read; failed?: Read }>();
  // Only the latest request reports loading or failure; an earlier one's outcome is no news.
  const latest = useRef(0);
  const stale = !records.page || records.key !== key;
  const reload = useCallback(() => {
    const request = ++latest.current;
    beginManagerRead(world, key);
    setStatus({ world, loading: 'first' });
    // The rows on screen stay on screen through a refresh.
    const rows = managerRecords(world).page?.rows.length ?? 0;
    readManagerPages((cursor) => client.managerHistory(cursor), rows).then(
      (page) => {
        acceptManagerPage(world, key, page);
        if (request === latest.current) setStatus({ world });
      },
      () => {
        if (request === latest.current) setStatus({ world, failed: 'first' });
      },
    );
  }, [client, world, key]);
  // Read again for another career or key only; the stored page itself is no reason to.
  useEffect(() => {
    if (!stale) return;
    reload();
    return () => {
      latest.current++;
    };
  }, [reload, stale]);
  const loadMore = (cursor: string) => {
    const request = ++latest.current;
    setStatus({ world, loading: 'more' });
    client.managerHistory(cursor).then(
      (page) => {
        acceptManagerPage(world, key, page, cursor);
        if (request === latest.current) setStatus({ world });
      },
      () => {
        if (request === latest.current) setStatus({ world, failed: 'more' });
      },
    );
  };
  const shown = status?.world === world ? status : undefined,
    page = records.page;
  const failed = page ? shown?.failed === 'more' : !!shown?.failed;
  return {
    ...(page ? { page } : {}),
    // With rows on screen only a next page is news; a refresh keeps them until it lands.
    loading: page ? shown?.loading === 'more' : !failed && (!!shown?.loading || stale),
    ...(failed ? { error: '' } : {}),
    ...(records.inspected ? { inspected: records.inspected } : {}),
    onInspect: (row) => updateManagerRecords(world, (kept) => ({ ...kept, inspected: row })),
    onOpenSeason,
    onLoadMore: loadMore,
    onRetry: () => (page?.nextCursor && failed ? loadMore(page.nextCursor) : reload()),
  };
}
