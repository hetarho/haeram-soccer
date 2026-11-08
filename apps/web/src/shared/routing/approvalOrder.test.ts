import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  GameSettings,
  ResponsibilityKey,
  World,
} from '../../../../../packages/contracts/src/types';
import {
  defaultSettings,
  RESPONSIBILITY_KEYS,
} from '../../../../../packages/engine/src/responsibilities';
import type { StopReason } from '../../../../../packages/engine/src/stopping';
import type { GameClient } from '../../runtime/client';
import type { ProgressionController } from '../../runtime/progression';
import { ApprovalQueue } from '../../pages/club/ui/ApprovalQueue';
import {
  approvalGroups,
  orderApprovals,
  requestSubject,
  requestTitle,
  returnFocus,
} from './approvalOrder';
import { useTaskMemory } from './taskMemory';

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
/**
 * A synthetic world holding only what the queue reads: every title direct but the `delegated`
 * ones, and the youth director's post vacant.
 */
const world = (waits?: Record<string, number>, delegated: readonly ResponsibilityKey[] = []) => {
  const settings: GameSettings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS)
    settings.responsibilities[key] = delegated.includes(key) ? 'delegated' : 'direct';
  return {
    id: 'queue-world',
    approvalWaits: waits,
    settings,
    manager: { name: 'Real Manager' },
    staff: [{ role: 'director', name: 'Real Director' }],
    players: [{ id: 'p1', name: 'Real Player' }],
    clubs: [{ id: 'c1', name: 'Bidder FC' }],
    bids: [{ id: 'b1', playerId: 'p1', club: 'c1', direction: 'in' }],
    academy: { players: [{ id: 'y1', name: 'Real Prospect' }] },
  } as unknown as World;
};
const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
const render = (w: World, pending: StopReason[]) =>
  renderToStaticMarkup(
    createElement(ApprovalQueue, {
      w,
      pending,
      client: {} as GameClient,
      controller: {} as ProgressionController,
    }),
  );
const rows = (html: string) =>
  [...html.matchAll(/<li data-request-id="([^"]+)"/g)].map((match) => match[1]);
/** The titles in the order the 결재함 shows them. */
const titles = (html: string) =>
  [...html.matchAll(/<li[^>]*data-title="([^"]+)"/g)].map((match) => match[1]);
/** One title's block, from its item to the next title's. */
const titleBlock = (html: string, title: string) => {
  const start = html.indexOf(`data-title="${title}"`);
  const next = html.indexOf('data-title="', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
};
/** The pressed button of a 직접/위임 group, by its label. */
const pressed = (html: string, group: string) => {
  const start = html.indexOf(`aria-label="${group}"`);
  const block = html.slice(start, html.indexOf('</div>', start));
  return [...block.matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map((match) => match[1]);
};

afterEach(() => {
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

describe('approval queue titles (→WEB-100)', () => {
  it('files a request under its first responsibility, else the work its kind belongs to', () => {
    const joint = request('joint', 'contracts', { responsibilities: ['contracts', 'staff'] });
    expect(requestTitle(joint)).toBe('contracts');
    const bare = (kind: StopReason['kind'], title = 'request') =>
      request('bare', 'staff', { kind, title, responsibility: undefined });
    expect(requestTitle(bare('incoming-bid'))).toBe('sales');
    expect(requestTitle(bare('youth-intake'))).toBe('academy');
    expect(requestTitle(bare('finance', '후원 제안'))).toBe('sponsors');
    expect(requestTitle(bare('finance', '재정 보고'))).toBe('finance');
    expect(requestTitle(bare('match'))).toBe('other');
  });
  it('puts titles with waiting requests first, by their longest wait, then the quiet ones in responsibility order', () => {
    const w = world({ late: 9, near: 5 });
    const groups = approvalGroups(w, [
      request('s1', 'sales'),
      request('near', 'academy'),
      request('late', 'contracts'),
      request('s0', 'sales'),
    ]);
    expect(groups.map((group) => [group.title, ids(group.items)])).toEqual([
      ['contracts', ['late']],
      ['academy', ['near']],
      ['sales', ['s0', 's1']],
      ['manager', []],
      ['staff', []],
      ['recruitment', []],
      ['sponsors', []],
    ]);
    // 재정 and 기타 appear only while something waits there.
    const finance = request('cash', 'staff', {
      kind: 'finance',
      title: '재정 보고',
      responsibility: undefined,
    });
    expect(approvalGroups(w, [finance]).map((group) => group.title)).toEqual([
      'finance',
      'manager',
      'staff',
      'contracts',
      'recruitment',
      'sales',
      'academy',
      'sponsors',
    ]);
  });
});

describe('approval queue view (→WEB-39/100)', () => {
  it('opens on a compact 결재함 of titles over every actual request, with no office menus', () => {
    const w = world({ late: 9, r3: 3 });
    const pending = ['r1', 'r2', 'r3', 'r4', 'r5', 'late'].map((id) =>
      request(id, id === 'late' ? 'manager' : 'contracts'),
    );
    const html = render(w, pending);
    expect(html).toContain('data-testid="approval-queue"');
    expect(html).toMatch(/<h2[^>]*><span>결재함<\/span><\/h2>/);
    // The waiting titles first, each with its requests below; then every quiet title.
    expect(titles(html)).toEqual([
      'manager',
      'contracts',
      'staff',
      'recruitment',
      'sales',
      'academy',
      'sponsors',
    ]);
    // All six rows, overdue first, and no hidden remainder behind a 더 보기.
    expect(rows(html)).toEqual(['late', 'r3', 'r1', 'r2', 'r4', 'r5']);
    expect(titleBlock(html, 'contracts')).toContain('선수 계약<span data-ui="count"');
    expect(rows(titleBlock(html, 'contracts'))).toEqual(['r3', 'r1', 'r2', 'r4', 'r5']);
    expect(html).not.toContain('더 보기');
    expect(html).toContain('대기 <b>6</b>건');
    expect(html).toContain(' · 지연 1건 · 라운드마다 분위기 −1');
    expect(html).toContain('지연 3일');
    expect(html).toContain('D-4');
    expect(html).toContain('late request · 검토하기');
    // The title names the kind, so its rows carry no tag of their own.
    expect(html).not.toContain('data-tagged');
    // The 결재라인 overview opens from the shared controls, not from the 결재함's heading, and
    // there are no filters: the titles are the view.
    expect(html).not.toContain('결재라인 모아보기');
    expect(html).not.toContain('결재함 보기');
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
  it('names whom each title goes to, with its 직접/위임 and 전체 직접/전체 위임 over them all', () => {
    const html = render(world(undefined, ['contracts', 'academy']), []);
    // The delegates of each title: 단장, 감독 and the youth director, a vacant post as 공석.
    expect(titleBlock(html, 'manager')).toContain('위임 대상</span>단장 Real Director');
    expect(titleBlock(html, 'contracts')).toContain(
      '위임 중</span>단장 Real Director · 감독 Real Manager',
    );
    expect(titleBlock(html, 'academy')).toContain('위임 중</span>유스 디렉터 공석');
    expect(pressed(html, '선수 계약 결재 방식')).toEqual(['위임']);
    expect(pressed(html, '감독 인사 결재 방식')).toEqual(['직접']);
    // Neither every title direct nor every one delegated: no whole switch reads as applied.
    expect(pressed(html, '전체 결재 방식')).toEqual([]);
    expect(html).toContain('>전체 직접</button>');
    expect(html).toContain('>전체 위임</button>');
    // A quiet title says what it covers and who handles it meanwhile.
    expect(titleBlock(html, 'contracts')).toContain('위임받은 담당자가 처리하고 결과를 보고해요');
    expect(titleBlock(html, 'manager')).toContain('감독 선임·재계약 · 대기 없음');
    const all = render(world(undefined, RESPONSIBILITY_KEYS), []);
    expect(pressed(all, '전체 결재 방식')).toEqual(['전체 위임']);
    expect(pressed(render(world(), []), '전체 결재 방식')).toEqual(['전체 직접']);
  });
  it('says nothing waits without inventing work, still listing every title to delegate', () => {
    const html = render(world(), []);
    expect(rows(html)).toEqual([]);
    expect(html).toContain('지금 결재할 업무가 없어요');
    expect(html).not.toContain('대기 <b>');
    expect(html).not.toContain('검토');
    expect(titles(html)).toEqual([
      'manager',
      'staff',
      'contracts',
      'recruitment',
      'sales',
      'academy',
      'sponsors',
    ]);
  });
});
