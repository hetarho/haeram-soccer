// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  emptyPlayerDetail,
  emptyTeamDetail,
  PD,
  TD,
} from '../../../../../../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type FullStatsRead,
} from '../../../../../../packages/contracts/src/match-model';
import { worldMarketFixture } from '../../../../../../packages/engine/src/world-market.testkit';
import { fullStatsPlayers } from '../../../entities/league';
import { usePlayerDetail } from '../../../entities/player';
import { FullLeaders, LeagueFullStats } from './LeagueFullStats';
import type { ClientState } from '../../../runtime/client';
import { gameStore, initialClientState } from '../../../runtime/store';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setLocaleFormatters } from '../../../presentation/format';
import { setTextLocale } from '../../../presentation/text';
import registryData from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import german from '../../../../public/presentation/locales/de-DE.json';
import arabic from '../../../../public/presentation/locales/ar-SA.json';

const registry = validateRegistry(registryData, 'locale');
const packs = { 'ko-KR': korean, 'de-DE': german, 'ar-SA': arabic };
function selectLocale(id: keyof typeof packs) {
  const locale = createLoadedLocale(registry, packs[id] as LocalePack, korean as LocalePack);
  setLocaleFormatters(locale.formatters);
  setTextLocale(locale);
}

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
  gameStore.publish(initialClientState);
  setTextLocale();
  setLocaleFormatters();
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

it('updates mounted table counts with default/German/Arabic digits without new reads or lexical sorting', async () => {
  const sample = syntheticRead();
  const club = (id: string, goals: number, xg: number) => {
    const metrics = Array<number>(12).fill(0),
      detail = emptyTeamDetail();
    metrics[0] = goals;
    metrics[2] = 12345;
    metrics[3] = 10000;
    metrics[4] = 1234;
    metrics[5] = 567;
    detail[TD.bigChances] = 34;
    return { club: id, matches: 12, metrics, detail, xg, xga: 1000 };
  };
  sample.competition.clubs = [club('own', 20, 1450), club('foreign', 9, 3000)];
  const primary = sample.competition.players[0]!;
  primary.clubs = [primary.clubs[0]!];
  primary.clubs[0]!.metrics[0] = 20;
  primary.clubs[0]!.metrics[10] = 1234;
  primary.clubs[0]!.detail[PD.xg] = 145;
  primary.clubs[0]!.appearances = 23;
  primary.clubs[0]!.starts = 20;
  w.clubs[1]!.country = 'ENG';
  w.clubs[2]!.country = 'ENG';
  gameStore.publish({
    ...initialClientState,
    view: { world: w } as unknown as ClientState['view'],
  });
  const before = structuredClone(sample),
    pending: ((value: FullStatsRead) => void)[] = [];
  const client = {
    fullStats: vi.fn(() => new Promise<FullStatsRead>((resolve) => pending.push(resolve))),
  };
  await act(async () => {
    selectLocale(registry.defaultId as keyof typeof packs);
    root.render(
      createElement(
        Fragment,
        {},
        createElement(LeagueFullStats, { client, lens: 'teams' }),
        createElement(LeagueFullStats, { client, lens: 'players' }),
      ),
    );
  });
  expect(client.fullStats).toHaveBeenCalledTimes(2);
  await act(async () => pending.forEach((resolve) => resolve(sample)));
  const teams = container.querySelector('[data-testid="full-stats-teams"]')!,
    players = container.querySelector('[data-testid="full-stats-players"]')!;
  const names = () => [...teams.querySelectorAll('tbody th')].map((th) => th.textContent);
  expect(names()).toEqual(['foreign', 'own', 'representative']);
  await act(async () =>
    (teams.querySelectorAll('[role="group"] button')[1] as HTMLButtonElement).click(),
  );
  expect(names()).toEqual(['own', 'foreign', 'representative']); // numeric 20 > 9
  const expectations = [
    {
      id: registry.defaultId as keyof typeof packs,
      matches: '12',
      goals: '20',
      shots: '1,234 (567)',
      passes: '10,000/12,345',
      big: '34',
      xg: '14.50',
      share: '81%',
      rank: '1',
      apps: '23',
      total: '20',
      rate: '1.46',
      sample: '1,234',
      zero: '0',
    },
    {
      id: 'de-DE' as const,
      matches: '12',
      goals: '20',
      shots: '1.234 (567)',
      passes: '10.000/12.345',
      big: '34',
      xg: '14,50',
      share: '81%',
      rank: '1',
      apps: '23',
      total: '20',
      rate: '1,46',
      sample: '1.234',
      zero: '0',
    },
    {
      id: 'ar-SA' as const,
      matches: '١٢',
      goals: '٢٠',
      shots: '١٬٢٣٤ (٥٦٧)',
      passes: '١٠٬٠٠٠/١٢٬٣٤٥',
      big: '٣٤',
      xg: '١٤٫٥٠',
      share: '٨١%',
      rank: '١',
      apps: '٢٣',
      total: '٢٠',
      rate: '١٫٤٦',
      sample: '١٬٢٣٤',
      zero: '٠',
    },
  ];
  for (const expected of expectations) {
    await act(async () => selectLocale(expected.id));
    expect(names()).toEqual(['own', 'foreign', 'representative']);
    const team = teams.querySelector('tbody tr')!.querySelectorAll('td');
    expect(team[0]?.textContent).toBe(expected.matches);
    expect(team[1]?.textContent).toBe(expected.goals);
    expect(team[2]?.textContent).toBe(expected.xg);
    expect(team[5]?.textContent).toBe(expected.shots);
    expect(team[6]?.textContent).toContain(expected.share);
    expect(team[6]?.textContent).toContain(expected.passes);
    expect(team[7]?.textContent).toBe(expected.big);
    const leader = players.querySelector('tbody tr')!.querySelectorAll('td');
    expect(leader[0]?.textContent).toBe(expected.rank);
    expect(leader[1]?.textContent).toContain(expected.apps);
    expect(leader[2]?.textContent).toBe(expected.total);
    expect(leader[3]?.textContent).toContain(expected.rate);
    expect(leader[3]?.textContent).toContain(expected.sample);
    const unplayed = teams.querySelectorAll('tbody tr')[2]!.querySelectorAll('td');
    expect(unplayed[0]?.textContent).toBe(expected.zero);
    expect(unplayed[4]?.textContent).toBe('—');
    expect(unplayed[6]?.textContent).toContain('—');
    expect(client.fullStats).toHaveBeenCalledTimes(2);
  }
  expect(sample).toEqual(before);
});
