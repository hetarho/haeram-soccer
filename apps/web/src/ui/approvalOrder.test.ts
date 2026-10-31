import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { ApprovalQueue } from './ApprovalQueue';
import {
  matchesFilter,
  orderApprovals,
  queueFilter,
  queueFilters,
  requestSubject,
  returnFocus,
} from './approvalOrder';
import { useTaskMemory } from './taskMemory';

// Server rendering reads each store's initial state, so the queue is handed its stored filter.
const stored = vi.hoisted(() => ({ filter: undefined as string | undefined }));
vi.mock('./taskMemory', async (original) => ({
  ...(await original<typeof import('./taskMemory')>()),
  useTaskState: <T>(_world: string, _key: string, initial: T) =>
    [(stored.filter ?? initial) as T, vi.fn()] as const,
}));

const request = (id: string, responsibility: ResponsibilityKey, extra: Partial<StopReason> = {}) =>
  ({
    id,
    responsibility,
    kind: 'staff-renewal',
    title: `${id} request`,
    detail: '',
    year: 1950,
    day: 0,
    attention: true,
    ...extra,
  }) as StopReason;
/** A synthetic world holding only what the queue reads. */
const world = (waits?: Record<string, number>) =>
  ({
    id: 'queue-world',
    approvalWaits: waits,
    players: [{ id: 'p1', name: 'Real Player' }],
    clubs: [{ id: 'c1', name: 'Bidder FC' }],
    bids: [{ id: 'b1', playerId: 'p1', club: 'c1', direction: 'in' }],
    academy: { players: [{ id: 'y1', name: 'Real Prospect' }] },
  }) as unknown as World;
const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
const render = (w: World, pending: StopReason[]) =>
  renderToStaticMarkup(createElement(ApprovalQueue, { w, pending, onOverview: vi.fn() }));
const rows = (html: string) =>
  [...html.matchAll(/<li data-request-id="([^"]+)"/g)].map((match) => match[1]);

afterEach(() => {
  stored.filter = undefined;
  useTaskMemory.getState().activate('reset');
});

describe('approval queue order and filters (→WEB-100)', () => {
  it('puts overdue requests first, then the nearest 결재 기한, then the stable request ID', () => {
    const w = world({ late: 9, near: 5, fresh: 1 });
    const items = ['fresh', 'b', 'a', 'near', 'late'].map((id) => request(id, 'staff'));
    const before = ids(items);
    expect(ids(orderApprovals(w, items))).toEqual(['late', 'near', 'fresh', 'a', 'b']);
    expect(ids(items)).toEqual(before);
  });
  it('keeps requests from saves without waiting records in stable ID order', () => {
    const items = ['c', 'a', 'b'].map((id) => request(id, 'contracts'));
    expect(ids(orderApprovals(world(), items))).toEqual(['a', 'b', 'c']);
    // Their labels stay the 결재 기한 a fresh wait has, never an invented date.
    expect(render(world(), items).match(/data-testid="approval-deadline">([^<]+)</g)).toEqual([
      'data-testid="approval-deadline">D-7<',
      'data-testid="approval-deadline">D-7<',
      'data-testid="approval-deadline">D-7<',
    ]);
  });
  it('filters overdue requests and each responsibility a joint request belongs to', () => {
    const late = (id: string) => id === 'late';
    const joint = request('joint', 'contracts', { responsibilities: ['contracts', 'staff'] });
    const sale = request('late', 'sales');
    expect(matchesFilter(late, joint, 'all')).toBe(true);
    expect(matchesFilter(late, joint, 'staff')).toBe(true);
    expect(matchesFilter(late, joint, 'contracts')).toBe(true);
    expect(matchesFilter(late, joint, 'sales')).toBe(false);
    expect(matchesFilter(late, sale, 'overdue')).toBe(true);
    expect(matchesFilter(late, joint, 'overdue')).toBe(false);
  });
  it('offers only filters with actual requests, keeping a selected empty one to clear', () => {
    const items = [request('m', 'manager'), request('s1', 'sales'), request('s2', 'sales')];
    const none = () => false;
    expect(queueFilters(none, items, 'all')).toEqual([
      ['all', '전체 3'],
      ['manager', '감독 인사 1'],
      ['sales', '선수 매각 2'],
    ]);
    expect(queueFilters((id) => id === 's1', items, 'academy')).toEqual([
      ['all', '전체 3'],
      ['overdue', '지연 1'],
      ['manager', '감독 인사 1'],
      ['sales', '선수 매각 2'],
      ['academy', '유소년 승격·방출 0'],
    ]);
    expect(queueFilter('sales')).toBe('sales');
    expect(queueFilter('players')).toBe('all');
    expect(queueFilter(undefined)).toBe('all');
  });
  it('returns focus to the request still waiting, else the one in its place, else the heading', () => {
    const left = [{ id: 'a' }, { id: 'c' }];
    expect(returnFocus(left, { id: 'c', index: 1 })).toBe('c');
    expect(returnFocus(left, { id: 'b', index: 1 })).toBe('c');
    expect(returnFocus(left, { id: 'd', index: 2 })).toBe('c');
    expect(returnFocus([], { id: 'a', index: 0 })).toBeUndefined();
  });
  it('names the subject a title leaves out from the actual world', () => {
    const w = world();
    expect(requestSubject(w, request('bid', 'sales', { kind: 'incoming-bid', ref: 'b1' }))).toBe(
      'Real Player · Bidder FC',
    );
    expect(requestSubject(w, request('youth', 'academy', { ref: 'y1' }))).toBe('Real Prospect');
    expect(requestSubject(w, request('gone', 'sales', { kind: 'incoming-bid', ref: 'x' }))).toBe(
      undefined,
    );
    expect(requestSubject(w, request('coach', 'staff', { ref: 'b1' }))).toBeUndefined();
  });
  it('names the known subject in each review action, so same-kind requests stay apart', () => {
    const html = render(world(), [
      request('bid', 'sales', { kind: 'incoming-bid', ref: 'b1', title: '매각 제안' }),
      request('other', 'sales', { kind: 'incoming-bid', ref: 'x', title: '매각 제안' }),
    ]);
    expect(html).toContain('aria-label="매각 제안 · Real Player · Bidder FC · 검토하기"');
    expect(html).toContain('aria-label="매각 제안 · 검토하기"');
  });
});

describe('approval queue view (→WEB-39/100)', () => {
  it('opens on a compact 결재함 over every actual request, with no office menus', () => {
    const w = world({ late: 9, r3: 3 });
    const pending = ['r1', 'r2', 'r3', 'r4', 'r5', 'late'].map((id) =>
      request(id, id === 'late' ? 'manager' : 'contracts'),
    );
    const html = render(w, pending);
    expect(html).toContain('data-testid="approval-queue"');
    expect(html).toMatch(/<h2[^>]*><span>결재함<\/span><\/h2>/);
    // All six rows, overdue first, and no hidden remainder behind a 더 보기.
    expect(rows(html)).toEqual(['late', 'r3', 'r1', 'r2', 'r4', 'r5']);
    expect(html).not.toContain('더 보기');
    expect(html).toContain('대기 <b>6</b>건');
    expect(html).toContain(' · 지연 1건 · 라운드마다 분위기 −1');
    expect(html).toContain('지연 3일');
    expect(html).toContain('D-4');
    expect(html).toContain('late request · 검토하기');
    expect(html).toContain('결재라인 모아보기');
    // The lobby's scene, desk cards, team state, room doors and journal are gone.
    for (const gone of [
      'data-office-area',
      'data-place',
      'team-state',
      'desk-scene',
      '클럽 소식',
      '사무실 업무',
      '클럽하우스 시설',
    ])
      expect(html).not.toContain(gone);
  });
  it('explains a filtered-empty view and offers to clear it, keeping the waiting total', () => {
    const w = world();
    stored.filter = 'sales';
    const pending = [request('m', 'manager'), request('s', 'sales')];
    expect(rows(render(w, pending))).toEqual(['s']);
    stored.filter = 'academy';
    const empty = render(w, pending);
    expect(rows(empty)).toEqual([]);
    expect(empty).toContain('유소년 승격·방출 결재가 없어요');
    expect(empty).toContain('다른 결재 2건이 기다리고 있어요.');
    expect(empty).toContain('>전체 보기</button>');
    expect(empty).toContain('대기 <b>2</b>건');
  });
  it('says nothing waits without inventing work or showing empty filters', () => {
    const html = render(world(), []);
    expect(rows(html)).toEqual([]);
    expect(html).toContain('지금 결재할 업무가 없어요');
    expect(html).toContain('대기 <b>0</b>건');
    expect(html).not.toContain('결재함 보기');
    expect(html).not.toContain('검토');
  });
});
