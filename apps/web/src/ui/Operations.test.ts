import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { createWorld } from '../../../../packages/engine/src/index';
import { OperationsView } from './Operations';
import korean from '../../public/presentation/locales/ko-KR.json';

vi.mock('./FacilityArt', () => ({ FacilityArt: () => null }));
vi.mock('./OfficeBar', () => ({
  OfficeBar: ({ title }: { title: string }) => createElement('h2', null, title),
}));
// The lobby's room doors read their names from the locale.
vi.mock('../presentation/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presentation/react')>()),
  useLocale: () => ({
    t: (key: string) => korean.messages[key as keyof typeof korean.messages] ?? key,
  }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('owner-office overview navigation', () => {
  it('lands a directly addressed overview on the lobby, where it opens as the modal', () => {
    vi.stubGlobal('location', { search: '?view=office' });
    const world = createWorld({
      name: 'Overview Address',
      country: 'ENG',
      color: '#224466',
      seed: 'overview-address',
      level: 'easy',
    });
    const state = { view: { world, sponsors: [] } } as unknown as ClientState;
    const html = renderToStaticMarkup(
      createElement(OperationsView, {
        state,
        client: {} as GameClient,
        controller: {} as ProgressionController,
        legacy: null,
        journal: null,
        personnel: () => null,
      }),
    );
    expect(html).toContain('data-testid="office-lobby"');
    expect(html).toContain('<h2>구단주 사무실</h2>');
    expect(html).not.toContain('<section aria-label="결재라인 모아보기">');
  });
});
