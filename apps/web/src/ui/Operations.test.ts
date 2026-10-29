import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { OperationsView } from './Operations';

vi.mock('./OfficeBar', () => ({
  OfficeBar: ({ title }: { title: string }) => createElement('h2', null, title),
}));

afterEach(() => vi.unstubAllGlobals());

describe('owner-office overview navigation', () => {
  it('renders a directly addressed responsibility overview as ordinary content without a modal', () => {
    vi.stubGlobal('location', { search: '?view=office' });
    const state = { view: { world: { id: 'inline-overview' } } } as ClientState;
    const html = renderToStaticMarkup(
      createElement(OperationsView, {
        state,
        client: {} as GameClient,
        controller: {} as ProgressionController,
        legacy: null,
        personnel: () => null,
      }),
    );
    expect(html).toContain('<section aria-label="결재라인 모아보기">');
    expect(html).toContain('<h2>결재라인 모아보기</h2>');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('data-testid="office-lobby"');
  });
});
