// @vitest-environment happy-dom
import { act, createElement, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalePack } from '../../presentation/contracts';
import { createLoadedLocale } from '../../presentation/locale';
import { validateRegistry } from '../../presentation/registry';
import { setLocaleFormatters } from '../../presentation/format';
import { setTextLocale } from '../../presentation/text';
import { PlayerPerformance } from '../../entities/player';
import registryData from '../../../public/presentation/locales/index.json';
import korean from '../../../public/presentation/locales/ko-KR.json';
import german from '../../../public/presentation/locales/de-DE.json';
import arabic from '../../../public/presentation/locales/ar-SA.json';

const registry = validateRegistry(registryData, 'locale'),
  packs = { 'ko-KR': korean, 'de-DE': german, 'ar-SA': arabic };
const select = (id: keyof typeof packs) => {
  const locale = createLoadedLocale(registry, packs[id] as LocalePack, korean as LocalePack);
  setLocaleFormatters(locale.formatters);
  setTextLocale(locale);
};
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  setTextLocale();
  setLocaleFormatters();
  vi.unstubAllGlobals();
});

describe('mounted football-statistic locale changes', () => {
  it('refreshes a subscribed memoized consumer without replacing props or changing facts', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'),
      stats = Array<number>(12).fill(0);
    stats[0] = 1;
    stats[2] = 3;
    stats[3] = 1;
    stats[10] = 200;
    const before = [...stats];
    document.body.append(container);
    root = createRoot(container);
    const Consumer = memo(PlayerPerformance);
    await act(async () => {
      select('ko-KR');
      root!.render(createElement(Consumer, { stats, title: 'Synthetic fixture' }));
    });
    const rate = () => container.querySelector('dd')?.firstChild?.textContent,
      pass = () => container.querySelector('dl > div:last-child dd')?.firstChild?.textContent;
    expect(rate()).toBe('0.45');
    expect(pass()).toBe('33.3%');
    await act(async () => select('de-DE'));
    expect(rate()).toBe('0,45');
    expect(pass()).toBe('33,3%');
    await act(async () => select('ar-SA'));
    expect(rate()).toBe('٠٫٤٥');
    expect(pass()).toBe('٣٣٫٣%');
    expect(container.textContent).toContain('٢٠٠');
    expect(stats).toEqual(before);
  });
});
