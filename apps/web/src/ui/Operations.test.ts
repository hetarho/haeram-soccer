import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientState, GameClient } from '../runtime/client';
import { createWorld } from '../../../../packages/engine/src/index';
import { OperationsView } from './Operations';

vi.mock('./OfficeBar', () => ({
  OfficeBar: ({ title }: { title: string }) => createElement('h2', null, title),
}));
// The artwork adapter resolves theme resources; the office only places its room scene.
vi.mock('./FacilityOverview', () => ({
  FacilityOverview: ({ kind, title }: { kind: string; title: string }) =>
    createElement('figure', { 'data-scene': kind, 'aria-label': title }),
}));

afterEach(() => vi.unstubAllGlobals());

const world = createWorld({
  name: 'Overview Address',
  country: 'ENG',
  color: '#224466',
  seed: 'overview-address',
  level: 'easy',
});
const office = () =>
  renderToStaticMarkup(
    createElement(OperationsView, {
      state: { view: { world, sponsors: [] } } as unknown as ClientState,
      client: {} as GameClient,
      personnel: () => null,
    }),
  );

describe('owner-office overview navigation', () => {
  it('lands a directly addressed overview on the 결재함, where it opens as the modal', () => {
    vi.stubGlobal('location', { search: '?view=office' });
    const html = office();
    expect(html).toContain('data-testid="approval-queue"');
    expect(html).toContain('<h2>결재함</h2>');
    expect(html).not.toContain('<section aria-label="결재라인 모아보기">');
    // The club's section bar is the shell's one shared copy over the office (→WEB-10); the
    // office renders none of its own.
    expect(html).not.toContain('club-section-tab');
    // An unselected desk is no office place any more: it renders nothing while it leaves for the
    // club section that holds its work (→WEB-39/110).
    vi.stubGlobal('location', { search: '?view=investment' });
    expect(office()).toBe('');
  });
});

describe('owner-office overview (→WEB-39/44/107)', () => {
  it('heads the live queue with the manager room, then one club summary and quick actions', () => {
    vi.stubGlobal('location', { search: '' });
    const html = office();
    expect(html.match(/<figure[^>]*>/g)).toEqual([
      '<figure data-scene="manager" aria-label="구단주 사무실">',
    ]);
    const scene = html.indexOf('data-scene="manager"'),
      queue = html.indexOf('data-testid="approval-queue"'),
      team = html.indexOf('aria-label="팀 현황"'),
      situation = html.indexOf('data-testid="club-situation"'),
      quick = html.indexOf('data-testid="quick-actions"');
    // An illustrated header, the queue first, then the supporting team content.
    expect(scene).toBeGreaterThan(-1);
    expect(scene).toBeLessThan(queue);
    expect(queue).toBeLessThan(team);
    expect(team).toBeLessThan(situation);
    expect(situation).toBeLessThan(quick);
    for (const id of ['approval-queue', 'club-situation', 'quick-actions'])
      expect(html.match(new RegExp(`data-testid="${id}"`, 'g')), id).toHaveLength(1);
    // The actual world's facts and the three topic controls, not a copy of desk launchers.
    expect(html).toContain('data-fact="strength"');
    expect(html.match(/data-quick="[^"]+"/g)).toEqual([
      'data-quick="morale"',
      'data-quick="fatigue"',
      'data-quick="development"',
    ]);
    expect(html).not.toContain('data-desk-icon');
  });
});
