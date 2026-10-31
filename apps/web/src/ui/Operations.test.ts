import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientState, GameClient } from '../runtime/client';
import { createWorld } from '../../../../packages/engine/src/index';
import { OperationsView } from './Operations';

vi.mock('./OfficeBar', () => ({
  OfficeBar: ({ title }: { title: string }) => createElement('h2', null, title),
}));

afterEach(() => vi.unstubAllGlobals());

describe('owner-office overview navigation', () => {
  it('lands a directly addressed overview on the 결재함, where it opens as the modal', () => {
    vi.stubGlobal('location', { search: '?view=office' });
    const world = createWorld({
      name: 'Overview Address',
      country: 'ENG',
      color: '#224466',
      seed: 'overview-address',
      level: 'easy',
    });
    const state = { view: { world, sponsors: [] } } as unknown as ClientState;
    const office = () =>
      renderToStaticMarkup(
        createElement(OperationsView, {
          state,
          client: {} as GameClient,
          personnel: () => null,
        }),
      );
    const html = office();
    expect(html).toContain('data-testid="approval-queue"');
    expect(html).toContain('<h2>결재함</h2>');
    expect(html).not.toContain('<section aria-label="결재라인 모아보기">');
    // The office carries no copy of the club's section bar (→WEB-10).
    expect(html).not.toContain('club-section-tab');
    // An unselected desk is no office place any more: it renders nothing while it leaves for the
    // club section that holds its work (→WEB-39/110).
    vi.stubGlobal('location', { search: '?view=investment' });
    expect(office()).toBe('');
  });
});
