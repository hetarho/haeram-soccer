// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyPlayerDetail, PD } from '../../../../../../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type FullStatsRead,
} from '../../../../../../packages/contracts/src/match-model';
import { worldMarketFixture } from '../../../../../../packages/engine/src/world-market.testkit';
import type { ClientState } from '../../../runtime/client';
import { gameStore, initialClientState } from '../../../runtime/store';
import { displayMessage } from '../../../presentation/text';
import { DisciplineTable } from './ScorerPanels';

let root: Root, container: HTMLDivElement;
let w: ReturnType<typeof worldMarketFixture>;
let requests: { resolve: (r: FullStatsRead | undefined) => void; reject: (e: Error) => void }[];
const client = {
  fullStats: vi.fn(
    () =>
      new Promise<FullStatsRead | undefined>((resolve, reject) =>
        requests.push({ resolve, reject }),
      ),
  ),
};
function publish() {
  gameStore.publish({
    ...initialClientState,
    view: {
      world: w,
      tallies: { leagueReds: { [w.players[0]!.id]: 1 } },
    } as unknown as ClientState['view'],
  });
}
function read(untracked = 0): FullStatsRead {
  const detail = emptyPlayerDetail();
  detail[PD.redCards] = 1;
  const part = (club: string) => ({
    club,
    appearances: 1,
    starts: 1,
    metrics: Array<number>(12).fill(0),
    detail: [...detail],
  });
  return {
    year: w.year,
    trackedFrom: { year: w.year, day: 0, round: 0 },
    untracked,
    competition: {
      kind: 'league',
      groupKey: 'ENG:0:0',
      clubs: [
        { club: 'own', matches: 1, metrics: [], detail: [], xg: 0, xga: 0 },
        { club: 'foreign', matches: 1, metrics: [], detail: [], xg: 0, xga: 0 },
      ],
      players: [
        { id: 'departed', name: 'Retained NPC Red', position: 'CB', clubs: [part('foreign')] },
        { id: w.players[0]!.id, name: w.players[0]!.name, position: 'ST', clubs: [part('own')] },
      ],
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  w = worldMarketFixture();
  w.clubs[1]!.country = 'ENG';
  w.matchModel = {
    revision: MATCH_MODEL_REVISION,
    activated: { year: w.year, day: 0, revision: 0 },
    trackedFrom: { year: w.year, day: 0, round: 0 },
    coverage: 'founding',
  };
  w.discipline = {
    year: w.year,
    yellows: { [w.players[0]!.id]: { league: 2 } },
    bans: [],
    out: [],
  };
  requests = [];
  client.fullStats.mockClear();
  publish();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  gameStore.publish(initialClientState);
  vi.unstubAllGlobals();
});
const mount = async () => act(async () => root.render(createElement(DisciplineTable, { client })));
const rows = () => [...container.querySelectorAll('tbody tr')];
const red = (row: Element) => row.querySelectorAll('td')[2]?.textContent;
const note = () => container.querySelector('[data-testid="league-red-coverage"]')?.textContent;

it('keeps yellow information during loading then shows retained NPC reds after a ban expires', async () => {
  await mount();
  expect(rows()).toHaveLength(1);
  expect(red(rows()[0]!)).toBe('—');
  expect(rows()[0]!.textContent).toContain('2');
  expect(note()).toContain(displayMessage('copy.LeagueFullStats.3cb5c68f5c'));
  await act(async () => requests[0]!.resolve(read()));
  expect(rows()).toHaveLength(2);
  expect(rows().find((r) => r.textContent?.includes('Retained NPC Red'))).toBeDefined();
  expect(rows().map(red)).toEqual(['1', '1']); // own-match legacy count was not added
  expect(note()).toContain(displayMessage('copy.LabPage.68e69c7b9c'));
  expect(note()).toContain('시즌 전체 기록');
});
it('names partial red coverage and never calls an untracked sample no cards', async () => {
  w.discipline!.yellows = {};
  publish();
  await mount();
  const sample = read(4);
  sample.competition.players = [];
  await act(async () => requests[0]!.resolve(sample));
  expect(note()).toContain('그 전 4경기는 기록 없음');
  expect(container.textContent).not.toContain(displayMessage('copy.ScorerPanels.37400b7127'));
  expect(rows()).toHaveLength(0);
});
it('keeps failed and unavailable reds neutral with retry while retaining a current ban', async () => {
  w.discipline!.bans.push({
    player: w.players[0]!.id,
    club: 'own',
    matches: 2,
    scope: 'league',
    reason: 'yellows',
  });
  publish();
  await mount();
  await act(async () => requests[0]!.reject(new Error('synthetic read failure')));
  expect(red(rows()[0]!)).toBe('—');
  expect(rows()[0]!.textContent).toContain('출장 정지');
  expect(note()).toContain(displayMessage('copy.fullStatsView.543d84eb22'));
  await act(async () =>
    (
      container.querySelector('[data-testid="league-red-coverage"] button') as HTMLButtonElement
    ).click(),
  );
  expect(note()).toContain(displayMessage('copy.LeagueFullStats.3cb5c68f5c'));
  await act(async () => requests[1]!.resolve(undefined));
  expect(red(rows()[0]!)).toBe('—');
  expect(note()).toContain(displayMessage('copy.fullStatsView.bacdff45b0'));
  expect(container.textContent).not.toContain(displayMessage('copy.ScorerPanels.37400b7127'));
});
it('clears a held red row on round change and rejects old league replies without daily churn', async () => {
  await mount();
  await act(async () => requests[0]!.resolve(read()));
  await act(async () => {
    w = { ...w, revision: w.revision + 1 };
    publish();
  });
  expect(requests).toHaveLength(1);
  await act(async () => {
    w = { ...w, round: 1, revision: w.revision + 1 };
    publish();
  });
  expect(requests).toHaveLength(2);
  expect(container.textContent).not.toContain('Retained NPC Red');
  expect(red(rows()[0]!)).toBe('—');
  const foreign = { code: 'ESP', tier: 0, group: 0 };
  await act(async () => root.render(createElement(DisciplineTable, { client, league: foreign })));
  await act(async () => requests[1]!.resolve(read()));
  expect(container.textContent).not.toContain('Retained NPC Red');
  const selected = read();
  selected.competition.groupKey = 'ESP:0:0';
  selected.competition.players = [];
  await act(async () => requests[2]!.resolve(selected));
  expect(rows()).toHaveLength(0);
});

it('only shows the no-cards state for an available whole sample', async () => {
  w.discipline!.yellows = {};
  publish();
  await mount();
  expect(container.textContent).not.toContain(displayMessage('copy.ScorerPanels.37400b7127'));
  const empty = read();
  empty.competition.players = [];
  await act(async () => requests[0]!.resolve(empty));
  expect(container.textContent).toContain(displayMessage('copy.ScorerPanels.37400b7127'));
});
it('retains multi-club red contributions as a neutral set without claiming a latest club', async () => {
  await mount();
  const sample = read(),
    player = sample.competition.players[0]!;
  player.clubs.push({ ...player.clubs[0]!, club: 'own' });
  await act(async () => requests[0]!.resolve(sample));
  const row = rows().find((r) => r.textContent?.includes('Retained NPC Red'))!;
  expect(row.querySelector('td')?.textContent).toBe('foreign · own');
  expect(row.textContent).not.toContain('→');
  expect(red(row)).toBe('2');
});
