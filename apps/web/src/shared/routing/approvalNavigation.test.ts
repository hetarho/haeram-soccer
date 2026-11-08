import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StopReason } from '../../../../../packages/engine/src/stopping';
import {
  approvalId,
  activateTaskWorld,
  openApprovalRequest,
  returnApprovalHome,
  routeOf,
  useNavigation,
} from './state';
import { useTaskMemory } from './taskMemory';
import { QUEUE_RETURN } from './approvalOrder';

const first: StopReason = {
  id: 'decision:sales:first',
  attention: true,
  ref: 'first',
  kind: 'incoming-bid',
  responsibility: 'sales',
  title: 'First synthetic bid',
  detail: 'Bid facts',
  year: 1950,
  day: 0,
};
const second = { ...first, id: 'decision:sales:second', ref: 'second', title: 'Second bid' };
let serial = 0;
beforeEach(() => {
  vi.stubGlobal('location', new URL('https://example.test/journal'));
  const navigate = (_state: unknown, _unused: string, url: string) =>
    vi.stubGlobal('location', new URL(url, location.href));
  vi.stubGlobal('history', { pushState: vi.fn(navigate), replaceState: vi.fn(navigate) });
  vi.stubGlobal('document', { querySelector: () => undefined });
  useTaskMemory.getState().activate(`reset-${++serial}`);
  useNavigation.setState({ page: 'dashboard' });
});
afterEach(() => vi.unstubAllGlobals());
describe('world-scoped approval navigation', () => {
  it('sends unselected work tabs to their workflow and keeps a request with its work', () => {
    expect(routeOf('/direction', '?view=players&work=sales')).toEqual({
      page: 'firstTeam',
      view: 'players',
      address: '/first-team?view=players',
    });
    expect(routeOf('/business', '?view=players&work=recruitment')).toMatchObject({
      page: 'firstTeam',
      view: 'market',
      address: '/first-team?view=market',
    });
    expect(routeOf('/direction', '?view=staff&work=coaches')).toEqual({
      page: 'staff',
      view: 'coaches',
      address: '/staff?view=coaches',
    });
    expect(
      routeOf('/business', '?view=players&work=recruitment&request=r1&requestWorld=w1'),
    ).toEqual({
      page: 'business',
      view: 'players',
      address: '/direction?view=players&work=recruitment&request=r1&requestWorld=w1',
    });
  });
  it('opens a world-scoped review over the current page and returns to the inbox without navigation', () => {
    openApprovalRequest('world', first);
    expect(location.pathname).toBe('/journal');
    expect(approvalId()).toBe(first.id);
    expect(useTaskMemory.getState().approvalRequests[first.id].item).toEqual(first);
    expect(history.pushState).not.toHaveBeenCalled();
    expect(useTaskMemory.getState().returning).toBeUndefined();
    returnApprovalHome(useTaskMemory.getState().approvalRequests[first.id]);
    expect(location.pathname + location.search).toBe('/journal');
    expect(useNavigation.getState().page).toBe('dashboard');
    expect(approvalId()).toBeUndefined();
    expect(useTaskMemory.getState().values[QUEUE_RETURN]).toEqual({
      id: first.id,
      index: 0,
      back: true,
    });
    expect(useTaskMemory.getState().approvalRequests[first.id].item).toEqual(first);
  });

  it('returns a review opened from the queue to its place there, without a detour', () => {
    history.pushState(null, '', '/direction');
    useNavigation.setState({ page: 'business' });
    // The queue records which row a review left from (→ApprovalQueue).
    useTaskMemory.getState().activate('world');
    useTaskMemory.setState({ values: { [QUEUE_RETURN]: { id: second.id, index: 2 } } });
    openApprovalRequest('world', second);
    expect(useTaskMemory.getState().returning).toBeUndefined();
    expect(approvalId()).toBe(second.id);
    returnApprovalHome();
    expect(location.pathname + location.search).toBe('/direction');
    expect(useTaskMemory.getState().values[QUEUE_RETURN]).toEqual({
      id: second.id,
      index: 2,
      back: true,
    });
  });
  it('does not let the previous request return a later one home', () => {
    openApprovalRequest('world', first);
    const old = useTaskMemory.getState().approvalRequests[first.id];
    returnApprovalHome(old);
    openApprovalRequest('world', second);
    returnApprovalHome(old);
    expect(approvalId()).toBe(second.id);
    expect(Object.keys(useTaskMemory.getState().approvalRequests)).toEqual([first.id, second.id]);
  });
  it('clears the request route, snapshots and return state when changing worlds', () => {
    openApprovalRequest('world', first);
    const oldAddress = location.href;
    const old = useTaskMemory.getState().approvalRequests[first.id];
    useTaskMemory.setState({
      returning: { page: 'dashboard', target: 'business', address: '/journal', label: 'Home' },
    });
    activateTaskWorld('another-world');
    expect(useTaskMemory.getState().approvalRequests).toEqual({});
    expect(useTaskMemory.getState().returning).toBeUndefined();
    expect(location.pathname).toBe('/journal');
    returnApprovalHome(old);
    expect(useTaskMemory.getState().world).toBe('another-world');
    expect(approvalId()).toBeUndefined();
    // A copied/reloaded request address also names its world after session memory was cleared.
    history.pushState(null, '', oldAddress);
    useNavigation.setState({ page: 'business' });
    activateTaskWorld('another-world');
    expect(location.pathname).toBe('/journal');
    expect(approvalId()).toBeUndefined();
  });
});
