// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyPlayerDetail } from '../../../../../../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type FullStatsRead,
} from '../../../../../../packages/contracts/src/match-model';
import { worldMarketFixture } from '../../../../../../packages/engine/src/world-market.testkit';
import { fullStatsPlayers } from '../../../entities/league';
import { usePlayerDetail } from '../../../entities/player';
import { FullLeaders } from './LeagueFullStats';

let root: Root, container: HTMLDivElement;
let w: ReturnType<typeof worldMarketFixture>;
function syntheticRead(): FullStatsRead {
  const part = (club: string, goals: number) => {
    const metrics = Array<number>(12).fill(0);
    metrics[0] = goals;
    metrics[10] = goals * 90;
    return { club, appearances: goals, starts: goals, metrics, detail: emptyPlayerDetail() };
  };
  return {
    year: w.year,
    trackedFrom: { year: w.year, day: 0, round: 0 },
    untracked: 0,
    competition: {
      kind: 'league',
      groupKey: 'ENG:0:0',
      clubs: [],
      players: [
        // A-B-A return: the first club holds both A spells; B stays last in the stored set.
        {
          id: w.players[0]!.id,
          name: 'Returning Player',
          position: 'ST',
          clubs: [part('own', 4), part('foreign', 2)],
        },
        {
          id: w.players[1]!.id,
          name: 'Departed Player',
          position: 'ST',
          clubs: [part('foreign', 1), part('own', 2)],
        },
        {
          id: w.players[2]!.id,
          name: 'Just Transferred',
          position: 'ST',
          clubs: [part('foreign', 2)],
        },
        {
          id: 'npc',
          name: 'NPC Contributor',
          position: 'CM',
          clubs: [part('own', 1), part('foreign', 1)],
        },
      ],
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  w = worldMarketFixture();
  w.players[1]!.status = 'sold';
  w.matchModel = {
    revision: MATCH_MODEL_REVISION,
    activated: { year: w.year, day: 0, revision: 0 },
    trackedFrom: { year: w.year, day: 0, round: 0 },
    coverage: 'founding',
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  usePlayerDetail.getState().close();
  vi.unstubAllGlobals();
});
const rowNamed = (name: string) =>
  [...container.querySelectorAll('tbody tr')].find((row) => row.textContent?.includes(name))!;
const profile = (row: Element) => row.querySelector('th button') as HTMLButtonElement;

it('uses actual active own membership for returning and just-transferred players, with known profile hints', async () => {
  const read = syntheticRead(),
    rows = fullStatsPlayers(read, w),
    before = structuredClone(read);
  await act(async () =>
    root.render(createElement(FullLeaders, { w, rows, order: 'goals', onOrder: vi.fn() })),
  );
  for (const name of ['Returning Player', 'Just Transferred']) {
    const row = rowNamed(name);
    expect(row.className).not.toBe('');
    await act(async () => profile(row).click());
    expect(usePlayerDetail.getState()).toMatchObject({
      id: rows.find((p) => p.name === name)!.id,
      club: 'own',
      scope: 'season',
    });
  }
  const returning = rowNamed('Returning Player');
  expect(
    [...returning.querySelectorAll('th button')].slice(1).map((button) => button.textContent),
  ).toEqual(['own', 'foreign']);
  expect(returning.textContent).toContain('own · foreign');
  expect(returning.textContent).not.toContain('→');
  expect(returning.querySelectorAll('td')[2]?.textContent).toBe('6');
  expect(read).toEqual(before);
});
it('keeps departed own routing and every contributing club without an unsupported current-club hint', async () => {
  const rows = fullStatsPlayers(syntheticRead(), w);
  expect(rows.find((p) => p.name === 'Departed Player')?.ours).toBe(true);
  await act(async () =>
    root.render(createElement(FullLeaders, { w, rows, order: 'goals', onOrder: vi.fn() })),
  );
  for (const name of ['Departed Player', 'NPC Contributor']) {
    const row = rowNamed(name);
    expect(row.className).toBe('');
    await act(async () => profile(row).click());
    expect(usePlayerDetail.getState()).toMatchObject({
      id: rows.find((p) => p.name === name)!.id,
      club: undefined,
    });
    expect(row.textContent).not.toContain('→');
  }
  expect(rowNamed('Departed Player').textContent).toContain('foreign · own');
});
