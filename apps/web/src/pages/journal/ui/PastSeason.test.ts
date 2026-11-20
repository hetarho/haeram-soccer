// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SeasonArchive, World } from '../../../../../../packages/contracts/src/types';
import { displayMessage } from '../../../presentation/text';
import { FinalTable } from './PastSeason';

vi.mock('../../../entities/club', () => ({
  ClubLink: ({ id }: { id: string }) => createElement('button', null, id),
}));

it('shows full closing ratings and keeps the official champion marked when sorted', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const w = {
    playerClub: 'own',
    clubs: [{ id: 'own', country: 'ENG' }, { id: 'rival' }, { id: 'missing' }],
    rankHistory: [],
  } as unknown as World;
  const season = {
    year: 1950,
    tier: 0,
    group: 0,
    rating: 65,
    won: 1,
    drawn: 0,
    lost: 0,
    closingClubOvr: { ownClub: 'own', clubs: { rival: 81 } },
  } as unknown as SeasonArchive;
  const rows: [number, number, number, number][] = [
    [0, 9, 5, 1],
    [1, 6, 4, 2],
    [2, 3, 2, 4],
  ];
  const render = async (archive: SeasonArchive) =>
    act(async () =>
      root.render(
        createElement(FinalTable, {
          w,
          season,
          rows,
          read: { files: { season: archive, matches: [], events: [] } },
        }),
      ),
    );
  const bodyRows = () => [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  await render(season);
  expect([...container.querySelectorAll('thead th')][2]?.textContent).toContain(
    displayMessage('team.column.ovr'),
  );
  expect(bodyRows().map((row) => row.cells[2]?.textContent)).toEqual(['65', '81', '—']);
  expect(bodyRows().filter((row) => row.hasAttribute('data-champion'))).toHaveLength(1);
  expect(bodyRows()[0]?.getAttribute('aria-label')).toBe(
    displayMessage('copy.CupHistory.31e52393f3'),
  );
  expect(bodyRows()[0]?.textContent).not.toContain(displayMessage('copy.CupHistory.31e52393f3'));
  await act(async () =>
    (
      container.querySelectorAll('thead th')[2]!.querySelector('button') as HTMLButtonElement
    ).click(),
  );
  expect(bodyRows()[1]?.hasAttribute('data-champion')).toBe(true);
  const earlier = {
    ...season,
    closingClubOvr: { ownClub: 'own', champions: { rival: 75 } },
  } as SeasonArchive;
  await render(earlier);
  // A champions-only snapshot still shows what it recorded: our rating and the champion's.
  expect(bodyRows().map((row) => row.cells[2]?.textContent).sort()).toEqual(['65', '75', '—']);
  await render({ ...season, closingClubOvr: undefined });
  expect(container.querySelector('thead')?.textContent).not.toContain(
    displayMessage('team.column.ovr'),
  );
  expect(bodyRows().filter((row) => row.hasAttribute('data-champion'))).toHaveLength(1);
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
