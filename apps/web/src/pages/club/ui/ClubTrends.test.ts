// @vitest-environment happy-dom
import { act, createElement, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { compactMoney, seasonName, setLocaleFormatters } from '../../../presentation/format';
import { setTextLocale } from '../../../presentation/text';
import { useTaskMemory } from '../../../shared/routing/taskMemory';
import * as transfers from '../../../../../../packages/engine/src/transfer-records';
import registryData from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import german from '../../../../public/presentation/locales/de-DE.json';
import arabic from '../../../../public/presentation/locales/ar-SA.json';
import { ClubTrends } from './ClubTrends';

const registry = validateRegistry(registryData, 'locale');
const packs = { 'ko-KR': korean, 'de-DE': german, 'ar-SA': arabic };
function select(id: keyof typeof packs) {
  const locale = createLoadedLocale(registry, packs[id] as LocalePack, korean as LocalePack);
  setLocaleFormatters(locale.formatters);
  setTextLocale(locale);
  return locale;
}
/** Minimal synthetic archived facts: the first season uses ESP, today's figures use EUR. */
function fixture(): World {
  return {
    id: 'growth-locale',
    year: 2001,
    revision: 20,
    playerClub: 'own',
    clubs: [{ id: 'own', name: 'Synthetic Club', country: 'ESP', tier: 0, group: 0, elo: 1500 }],
    history: [
      {
        year: 1998,
        tier: 0,
        group: 0,
        rank: 3,
        points: 60,
        fans: 12345,
        cash: '234567890',
        squadValue: '123456789',
        clubValue: '987654321',
      },
      {
        year: 2000,
        tier: 0,
        group: 0,
        rank: 2,
        points: 65,
        fans: 23456,
        cash: '345678901',
        squadValue: '987654321',
        clubValue: '2345678901',
      },
    ],
  } as unknown as World;
}
const fields = { squad: 'squadValue', club: 'clubValue', cash: 'cash', fans: 'fans' } as const;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  useTaskMemory.setState({ world: undefined, values: {} });
  setTextLocale();
  setLocaleFormatters();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mounted(w: World, metric: keyof typeof fields) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useTaskMemory.setState({ world: w.id, values: { 'growth-metric': metric } });
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const Consumer = memo(ClubTrends);
  const draw = (world = w) => root!.render(createElement(Consumer, { w: world }));
  await act(async () => draw());
  const slider = () => container.querySelector<HTMLElement>('[role="slider"]')!;
  await act(async () =>
    slider().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })),
  );
  return { container, slider, draw };
}

describe('mounted growth-chart locale changes', () => {
  it.each(['squad', 'club', 'cash', 'fans'] as const)(
    'refreshes %s season details with identical world/history references',
    async (metric) => {
      let locale = select('ko-KR');
      const w = fixture(),
        history = w.history,
        before = structuredClone(w);
      const f = await mounted(w, metric);
      const geometry = f.container.querySelector('polyline')!.getAttribute('points');
      const selected = f.container.querySelector('button[aria-pressed="true"]');
      const expected = (index: number) => {
        const season = history[index];
        if (metric === 'fans') return locale.formatters.number(season.fans);
        const amount = season[fields[metric]]!;
        const today = transfers.inTodayMoney(w, amount, season.year);
        return `${seasonName(season.year)} · ${compactMoney(today, 'ESP', w.year)}`;
      };
      const check = () => {
        const text = f.slider().getAttribute('aria-valuetext');
        const bubble = f.container.querySelector('[data-testid="chart-bubble"]')!.textContent;
        if (metric === 'fans') {
          expect(text).toContain(expected(0));
          expect(bubble).toContain(expected(0));
          expect(text).toContain(seasonName(history[0].year));
          expect(bubble).toContain(seasonName(history[0].year));
        } else {
          expect(text).toBe(expected(0));
          expect(bubble).toBe(expected(0));
        }
        expect(f.slider().getAttribute('aria-valuenow')).toBe('0');
        expect(f.container.querySelector('polyline')!.getAttribute('points')).toBe(geometry);
        expect(f.container.querySelector('button[aria-pressed="true"]')).toBe(selected);
        expect(useTaskMemory.getState().values['growth-metric']).toBe(metric);
        expect(w.history).toBe(history);
        expect(w).toEqual(before);
      };
      check();
      for (const id of ['de-DE', 'ar-SA'] as const) {
        await act(async () => {
          locale = select(id);
        });
        check();
      }
    },
  );
  it('reuses numeric series on ordinary revisions while retaining metric and chart selection', async () => {
    select('ko-KR');
    const w = fixture();
    const conversion = vi.spyOn(transfers, 'inTodayMoney');
    const f = await mounted(w, 'cash');
    expect(conversion).toHaveBeenCalled();
    const points = f.container.querySelector('polyline')!.getAttribute('points');
    const detail = f.slider().getAttribute('aria-valuetext');
    conversion.mockClear();
    await act(async () => f.draw({ ...w, revision: w.revision + 1 }));
    expect(conversion).not.toHaveBeenCalled();
    expect(f.slider().getAttribute('aria-valuetext')).toBe(detail);
    expect(f.slider().getAttribute('aria-valuenow')).toBe('0');
    expect(f.container.querySelector('polyline')!.getAttribute('points')).toBe(points);
    expect(useTaskMemory.getState().values['growth-metric']).toBe('cash');
  });
});
