import { beforeEach, describe, expect, it } from 'vitest';
import type { ManagerHistoryPage } from '../../../../packages/contracts/src/manager-history-view';
import {
  managerFixtureIdentity,
  managerFixtureLegacy,
  managerFixtureQuery,
  managerFixtureSource,
  MANAGER_HISTORY_FIXTURE,
} from '../../../../tests/fixtures/manager-history';
import {
  acceptManagerPage,
  beginManagerRead,
  leaveManagerSeason,
  managerRecords,
  mergeManagerPage,
  readManagerPages,
  rememberManagerSeason,
  returnedToManagers,
  updateManagerRecords,
} from './state';
import { useTaskMemory } from './taskMemory';

/** An untracked synthetic career with `events` older readable hirings: one row more in all. */
const source = (events: number, name = 'Kang Before') =>
  managerFixtureSource({
    currentManager: managerFixtureIdentity('kang', name, { since: 1990 }),
    personnelEvents: Array.from({ length: events }, (_, n) =>
      managerFixtureLegacy(`hire-${n}`, 1950 + n, 3, `감독 ${n} 선임`, '새 감독이 부임했어요.'),
    ),
  });
/** The worker's paged read of `career`, counting the requests it answers. */
function reader(career = source(45)) {
  const read = Object.assign(
    async (cursor?: string) => {
      read.calls.push(cursor);
      return managerFixtureQuery(career, cursor);
    },
    { calls: [] as (string | undefined)[] },
  );
  return read;
}
const season = { year: 1970, club: MANAGER_HISTORY_FIXTURE.club };

beforeEach(() => useTaskMemory.getState().activate('reset'));

describe('the records room keeps its 감독 이력 pages (→WEB-74, WEB-92)', () => {
  it('reads one bounded page, then reads as many rows again on a refresh', async () => {
    const read = reader();
    const first = await readManagerPages(read, 0);
    expect(read.calls).toEqual([undefined]);
    expect(first.rows).toHaveLength(first.pageSize);
    expect(first.total).toBe(46);
    // A second page joins the first; a refresh after it brings both back, then stops.
    const more = mergeManagerPage(first, await read(first.nextCursor!));
    expect(more.rows).toHaveLength(2 * first.pageSize);
    expect(new Set(more.rows.map((row) => row.id)).size).toBe(more.rows.length);
    expect(more.nextCursor).not.toBe(first.nextCursor);
    read.calls.length = 0;
    const again = await readManagerPages(read, more.rows.length);
    expect(again).toEqual(more);
    expect(read.calls).toEqual([undefined, first.nextCursor]);
    // To the end and no further; a page that adds nothing ends the read too.
    const all = await readManagerPages(reader(), 1000);
    expect(all.rows).toHaveLength(46);
    expect(all.nextCursor).toBeNull();
    const stuck = Object.assign(async () => first, {});
    expect(await readManagerPages(stuck, 1000)).toEqual(first);
    // A row read twice is kept once.
    expect(mergeManagerPage(first, first).rows).toEqual(first.rows);
  });

  it('keeps only the latest read of this career, never a superseded or another one', async () => {
    const read = reader();
    const old = await read(),
      next = await read(old.nextCursor!);
    // A refresh for a new key begins while the old one is still out: the old reply is dropped.
    beginManagerRead('w1', 'k1');
    beginManagerRead('w1', 'k2');
    expect(acceptManagerPage('w1', 'k1', old)).toBe(false);
    expect(managerRecords('w1').page).toBeUndefined();
    const fresh = await readManagerPages(reader(source(45, 'Kang After')), 0);
    expect(acceptManagerPage('w1', 'k2', fresh)).toBe(true);
    expect(managerRecords('w1')).toEqual({ key: 'k2', page: fresh });
    // A next page continues only the rows it was read after, at the same key.
    expect(acceptManagerPage('w1', 'k1', next, fresh.nextCursor!)).toBe(false);
    expect(acceptManagerPage('w1', 'k2', next, 'manager-history:1:elsewhere')).toBe(false);
    expect(managerRecords('w1').page).toBe(fresh);
    expect(acceptManagerPage('w1', 'k2', next, fresh.nextCursor!)).toBe(true);
    expect(managerRecords('w1').page!.rows).toHaveLength(2 * fresh.pageSize);
    // Another game active: its reply for the first career is no one's.
    useTaskMemory.getState().activate('w2');
    expect(acceptManagerPage('w1', 'k2', fresh)).toBe(false);
    expect(managerRecords('w2')).toEqual({});
    expect(managerRecords('w1')).toEqual({});
  });

  it('keeps the tenure, pages and scroll through a season visit and returns there once', async () => {
    const page: ManagerHistoryPage = await readManagerPages(reader(), 30);
    beginManagerRead('w1', 'k');
    acceptManagerPage('w1', 'k', page);
    const row = page.rows[25]!.id;
    rememberManagerSeason('w1', season, row, 640);
    // On the season: the tenure stays inspected, every page read stays, the way back is named.
    expect(managerRecords('w1')).toEqual({
      key: 'k',
      page,
      inspected: row,
      scroll: 640,
      opened: { season, row },
    });
    // The named return or the browser's back: the scroll once, the rest kept.
    expect(returnedToManagers('w1')).toBe(640);
    expect(returnedToManagers('w1')).toBeUndefined();
    expect(managerRecords('w1')).toEqual({ key: 'k', page, inspected: row, scroll: 640 });
    // Another records journey drops only the way back.
    rememberManagerSeason('w1', season, row, 10);
    leaveManagerSeason('w1');
    expect(managerRecords('w1').opened).toBeUndefined();
    expect(managerRecords('w1').inspected).toBe(row);
    updateManagerRecords('w1', (records) => ({ ...records, inspected: undefined }));
    expect(managerRecords('w1').inspected).toBeUndefined();
  });

  it('starts empty in another game and never returns to the last one', async () => {
    const page = await readManagerPages(reader(), 0);
    beginManagerRead('w1', 'k');
    acceptManagerPage('w1', 'k', page);
    rememberManagerSeason('w1', season, page.rows[0]!.id, 120);
    useTaskMemory.getState().activate('w2');
    expect(managerRecords('w2')).toEqual({});
    expect(returnedToManagers('w2')).toBeUndefined();
    // Coming back to the first game is a new session of it: nothing carried over.
    useTaskMemory.getState().activate('w1');
    expect(managerRecords('w1')).toEqual({});
  });
});
