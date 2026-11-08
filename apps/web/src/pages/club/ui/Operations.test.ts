import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientState, GameClient } from '../../../runtime/client';
import type { ProgressionController } from '../../../runtime/progression';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { officeRead } from '../../../runtime/officeRead';
import { gameStore, initialClientState } from '../../../runtime/store';
import type { View } from '../../../runtime/protocol';
import { OperationsView } from './Operations';

vi.mock('../../../runtime/store', async (original) => ({
  ...(await original<typeof import('../../../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('./OfficeBar', () => ({
  OfficeBar: ({ title }: { title: string }) => createElement('h2', null, title),
}));
// The artwork adapter resolves theme resources; a room scene would show as a figure here.
vi.mock('./FacilityOverview', () => ({
  FacilityOverview: ({ kind, title }: { kind: string; title: string }) =>
    createElement('figure', { 'data-scene': kind, 'aria-label': title }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  gameStore.setState(initialClientState, true);
});

const world = careerWorld({ country: 'ENG', seed: 'overview-address' });
const office = () => {
  gameStore.setState({ view: { world, office: officeRead(world) } as View });
  return renderToStaticMarkup(
    createElement(OperationsView, {
      state: { view: { world, sponsors: [] } } as unknown as ClientState,
      client: {} as GameClient,
      controller: {} as ProgressionController,
      personnel: () => null,
    }),
  );
};

describe('owner-office overview compatibility', () => {
  it('renders the read-only overview behind a legacy settings address without embedding the inbox', () => {
    vi.stubGlobal('location', { search: '?view=office' });
    const html = office();
    expect(html).toContain('aria-label="우리 팀 오버뷰"');
    expect(html).not.toContain('data-testid="approval-queue"');
    expect(html).not.toContain('club-section-tab');
    vi.stubGlobal('location', { search: '?view=investment' });
    expect(office()).toBe('');
  });
  it('shows a single live team summary, with no old room scene or embedded queue', () => {
    vi.stubGlobal('location', { search: '' });
    const html = office();
    expect(html).not.toMatch(/<figure[^>]*data-scene/);
    expect(html).toContain('팀 OVR');
    expect(html.match(/aria-label="우리 팀 오버뷰"/g)).toHaveLength(1);
    expect(html).not.toContain('data-testid="approval-queue"');
    expect(html).not.toContain('data-desk-icon');
  });
});
