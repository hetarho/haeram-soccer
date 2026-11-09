// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { worldMarketFixture } from '../../../../../packages/engine/src/world-market.testkit';
import type { GameClient, ClientState } from '../../runtime/client';
import type { Tallies, PlayerTally } from '../../runtime/playerTallies';
import { gameStore, initialClientState } from '../../runtime/store';
import { ClubLeaders } from '../../pages/club';
import { PlayerDetailHost } from '../../widgets/player-detail';
import { usePlayerDetail } from '../../entities/player';
import { displayMessage } from '../../presentation/text';

let root: Root, container: HTMLDivElement, w: ReturnType<typeof worldMarketFixture>;
let counts: Tallies['players'];
const client = { playerProfile: vi.fn() } as unknown as GameClient;
const tally = (apps: number, sub = 0): PlayerTally => ({
  apps: [apps, apps],
  sub: [sub, sub],
  yellow: [0, 0],
  red: [0, 0],
});
function publish(players: Tallies['players'] | undefined) {
  gameStore.publish({
    ...initialClientState,
    busy: false,
    processing: false,
    readonly: false,
    view: { world: w, tallies: { players, leagueReds: {} } } as unknown as ClientState['view'],
  });
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Prepared synthetic identities/attributes only; no career progression or match simulation.
  w = worldMarketFixture();
  const [short, long, tied] = w.players;
  Object.assign(short!, { id: 'a-short', name: 'Synthetic Short Substitute', status: 'active' });
  Object.assign(long!, { id: 'long', name: 'Synthetic Retired Starter', status: 'retired' });
  Object.assign(tied!, { id: 'z-tie', name: 'Synthetic Sold Player', status: 'sold' });
  short!.career[10] = 200;
  short!.career[0] = 2;
  long!.career[10] = 1800;
  tied!.career[10] = 900;
  w.players = [long!, tied!, short!, ...w.players.slice(3)];
  counts = { 'a-short': tally(30, 30), long: tally(20), 'z-tie': tally(30) };
  publish(counts);
  usePlayerDetail.getState().close();
  vi.mocked(client.playerProfile).mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  // Warm the real lazy boundary without changing its implementation or replacing the DOM.
  await import('../../widgets/player-detail/ui/OpenPlayerDetail');
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  usePlayerDetail.getState().close();
  gameStore.publish(initialClientState);
  vi.unstubAllGlobals();
});
const mount = async () =>
  act(async () =>
    root.render(
      createElement(
        Fragment,
        {},
        createElement(ClubLeaders, { w }),
        createElement(PlayerDetailHost, { client }),
      ),
    ),
  );
const rows = () => [...container.querySelectorAll('tbody tr')];
const rowNamed = (name: string) => rows().find((row) => row.textContent?.includes(name))!;
const sheet = () =>
  document.querySelector(
    `[role="dialog"] [data-surface="sheet"][aria-label="${displayMessage('copy.AnalysisExport.05b05e1b81')}"]`,
  )!;
const appsRank = (rank: number, shared = false) =>
  displayMessage('copy.OwnPlayerSheet.74aa1eed75', {
    p0: displayMessage('copy.BallonDorView.b849877c07'),
    p1: shared ? displayMessage('copy.OwnPlayerSheet.44c4823a61') : '',
    p2: rank,
  });
const openRow = async (name: string) =>
  act(async () => (rowNamed(name).querySelector('button') as HTMLButtonElement).click());

it('agrees between the actual board and own sheet, including rival-only tally updates and stable tied IDs', async () => {
  await mount();
  expect(rows().map((r) => r.querySelector('button')?.textContent)).toEqual([
    'Synthetic Short Substitute',
    'Synthetic Sold Player',
    'Synthetic Retired Starter',
  ]);
  expect(rows().map((r) => r.querySelector('td')?.textContent)).toEqual(['1', '1', '3']);
  expect(rows().map((r) => r.querySelectorAll('td')[3]?.textContent)).toEqual(['30', '30', '20']);
  expect(rowNamed('Synthetic Short Substitute').querySelectorAll('td')[4]?.textContent).toContain(
    '200',
  );
  expect(
    rowNamed('Synthetic Short Substitute').querySelector('[data-status="active"]'),
  ).not.toBeNull();
  await openRow('Synthetic Short Substitute');
  expect(usePlayerDetail.getState().id).toBe('a-short');
  expect(sheet().textContent).toContain('30경기');
  expect(sheet().textContent).toContain(appsRank(1, true));
  const before = gameStore.getState().view!;
  await act(async () => {
    counts = { ...counts, long: tally(40) };
    publish(counts);
  });
  const after = gameStore.getState().view!;
  expect(after.world).toBe(before.world);
  expect(after.tallies.players['a-short']).toBe(before.tallies.players['a-short']);
  expect(rows().map((r) => r.querySelector('td')?.textContent)).toEqual(['1', '2', '2']);
  expect(sheet().textContent).toContain(appsRank(2, true));
  expect(sheet().textContent).not.toContain(appsRank(1, true));
  expect(client.playerProfile).not.toHaveBeenCalled();
});
it('retains sold and retired identities and their actual shared or skipped career places', async () => {
  await mount();
  await openRow('Synthetic Sold Player');
  expect(usePlayerDetail.getState().id).toBe('z-tie');
  expect(sheet().textContent).toContain(appsRank(1, true));
  expect(sheet().querySelector('[data-status="sold"]')).not.toBeNull();
  await openRow('Synthetic Retired Starter');
  expect(usePlayerDetail.getState().id).toBe('long');
  expect(sheet().textContent).toContain(appsRank(3));
  expect(sheet().textContent).toContain('20경기');
  expect(sheet().querySelector('[data-status="retired"]')).not.toBeNull();
});
it('distinguishes an unavailable full map from an available map with zero recorded appearances', async () => {
  publish(undefined); // explicit missing map, with the known world still available
  await mount();
  const unavailable = displayMessage('copy.fullStatsView.bacdff45b0');
  expect(rows()).toHaveLength(0);
  expect(container.textContent).toContain(unavailable);
  expect(container.textContent).not.toContain(displayMessage('copy.CareerRecordBook.49093e1fb3'));
  await act(async () => usePlayerDetail.getState().open({ id: 'a-short', scope: 'career' }));
  expect(sheet().textContent).toContain(unavailable);
  expect(sheet().textContent).not.toContain('0경기');
  expect(sheet().textContent).not.toContain(appsRank(1));
  await act(async () => publish({}));
  expect(rows()).toHaveLength(0);
  expect(container.textContent).toContain(displayMessage('copy.CareerRecordBook.49093e1fb3'));
  expect(sheet().textContent).not.toContain(unavailable);
  expect(sheet().textContent).toContain('0경기');
  expect(sheet().textContent).not.toContain(appsRank(1));
  // A different board retains its goals, minute denominator, rate and stable identity.
  await act(async () =>
    (container.querySelectorAll('[role="group"] button')[1] as HTMLButtonElement).click(),
  );
  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.querySelectorAll('td')[3]?.textContent).toBe('0');
  expect(rows()[0]!.querySelectorAll('td')[4]?.textContent).toBe('2');
  expect(rows()[0]!.querySelectorAll('td')[5]?.textContent).toBe('0.90');
});
it('keeps appearance pagination at ten and resets it when switching boards', async () => {
  const base = w.players[2]!;
  w.players = Array.from({ length: 12 }, (_, i) => ({
    ...base,
    id: `p${String(i).padStart(2, '0')}`,
    name: `Synthetic ${i}`,
    career: [20 - i, ...Array<number>(9).fill(0), 90 * (i + 1), 0],
  }));
  counts = Object.fromEntries(w.players.map((p, i) => [p.id, tally(20 - i)]));
  publish(counts);
  await mount();
  expect(rows()).toHaveLength(10);
  const more = [...container.querySelectorAll('button')].find(
    (button) =>
      button.textContent === displayMessage('copy.CareerRecordBook.c263a34471', { p0: 11, p1: 12 }),
  )!;
  await act(async () => more.click());
  expect(rows()).toHaveLength(12);
  await act(async () =>
    (container.querySelectorAll('[role="group"] button')[1] as HTMLButtonElement).click(),
  );
  expect(rows()).toHaveLength(10);
  await act(async () =>
    (container.querySelectorAll('[role="group"] button')[0] as HTMLButtonElement).click(),
  );
  expect(rows()).toHaveLength(10);
});
