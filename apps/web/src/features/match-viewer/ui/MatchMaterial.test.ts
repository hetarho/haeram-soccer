// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { setLocaleFormatters } from '../../../presentation/format';
import { validateRegistry } from '../../../presentation/registry';
import { displayMessage, setTextLocale } from '../../../presentation/text';
import registry from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import arabic from '../../../../public/presentation/locales/ar-SA.json';
import { MatchMaterial } from './MatchMaterial';

const loaded = (pack: typeof korean | typeof english | typeof arabic) =>
  createLoadedLocale(
    validateRegistry(registry, 'locale'),
    pack as LocalePack,
    korean as LocalePack,
  );
const ko = loaded(korean),
  en = loaded(english),
  ar = loaded(arabic);
const players = ['우리 팀', 'Tom Brown', 'Luis Ruiz', 'Jan Berg', 'Ali Said', 'Ken Ito'].map(
  (name, i) => ({ id: `p${i}`, name }),
);
const world = { playerClub: 'A', players } as World;
/** A six-player material sample; every field is prepared, with no simulation or storage. */
const record = {
  id: 'sample',
  home: 'H',
  away: 'A',
  players: players.map(({ id }) => ({ id, metrics: [] })),
  lineCounts: [0, 6],
  appearance: {
    version: 1,
    warnings: [],
    sides: ['H', 'A'].map((club) => ({
      club,
      role: 'home',
      crest: { shape: 'shield', pattern: 'plain', emblem: 'ball', primary: '#123456' },
      shirt: { pattern: 'plain', primary: club === 'A' ? '#7a7a7a' : '#c8102e' },
      goalkeeper: '#f5e663',
    })),
  },
  material: {
    heat: Array(8 * 40).fill(0),
    shots: [],
    report: [],
    network: [
      ...players.flatMap((_, i) => [150 + i * 130, 200 + (i % 2) * 220, 20]),
      0,
      1,
      2,
      1,
      0,
      1,
      1,
      2,
      4,
      3,
      2,
      5,
      0,
      3,
      6,
      0,
      4,
      7,
      0,
      5,
      8,
      4,
      5,
      9,
    ],
  },
} as unknown as MatchRecord;
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setTextLocale(ko);
  setLocaleFormatters(ko.formatters);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setTextLocale();
  setLocaleFormatters();
  vi.unstubAllGlobals();
});
async function network() {
  await act(async () => root.render(createElement(MatchMaterial, { record, w: world })));
  await act(async () =>
    container.querySelector<HTMLElement>('[role="tab"][id$="-network"]')!.click(),
  );
  return container.querySelector<SVGSVGElement>('svg[role="group"]')!;
}
const key = async (target: Element, value: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
    );
  });

describe('pass network tab', () => {
  it('exposes numbered circles, ordered lines and exactly the directions played as buttons', async () => {
    const pitch = await network();
    expect(pitch.getAttribute('aria-label')).toBe('패스 연결망: 우리 선수 6명, 연결 7개');
    expect(pitch.querySelectorAll('[data-network-node][role="button"]')).toHaveLength(6);
    expect(pitch.querySelectorAll('[data-network-link][role="button"]')).toHaveLength(7);
    expect(
      [...pitch.querySelectorAll('[data-network-node] text')].map((n) => n.textContent),
    ).toEqual(['1', '2', '3', '4', '5', '6']);
    const lines = [...pitch.querySelectorAll('[data-network-link] line:first-of-type')];
    const widths = lines.map((line) => Number(line.getAttribute('stroke-width')));
    expect(widths).toEqual(widths.toSorted((a, b) => a - b));
    expect(lines[0]!.hasAttribute('marker-start')).toBe(true);
    expect(lines[0]!.hasAttribute('marker-end')).toBe(true);
    expect(lines[1]!.hasAttribute('marker-start')).toBe(false);
    expect(lines[1]!.hasAttribute('marker-end')).toBe(true);
    expect(lines[2]!.hasAttribute('marker-start')).toBe(true);
    expect(lines[2]!.hasAttribute('marker-end')).toBe(false);
    const ids = lines.map((line) => line.getAttribute('marker-end')).filter(Boolean);
    expect(pitch.querySelector('marker')!.id).toBe(ids[0]!.slice(5, -1));
    // The away side's recorded mid-grey shirt uses the scoreboard's corrected black ink.
    const style = pitch.querySelector<SVGGElement>('g[style]')!.style;
    expect(style.getPropertyValue('--network-shirt')).toBe('#7a7a7a');
    expect(style.getPropertyValue('--network-ink')).toBe('#000000');
  });

  it('names player passes and both pair directions on touch, Enter and Space', async () => {
    const pitch = await network();
    const node = pitch.querySelector('[data-network-node]')!;
    await act(async () =>
      node.querySelector('circle')!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(container.querySelector('figcaption')!.textContent).toBe(
      node.getAttribute('aria-label'),
    );
    expect(container.querySelector('figcaption')!.textContent).toContain('성공 패스 23번');
    const pair = pitch.querySelector('[data-network-link]')!;
    await key(pair, ' ');
    expect(container.querySelector('figcaption')!.textContent).toBe(
      pair.getAttribute('aria-label'),
    );
    expect(container.querySelector('figcaption')!.textContent).toContain('성공 패스 2번');
    expect(container.querySelector('figcaption')!.textContent).toContain('성공 패스 1번');
    await key(node, 'Enter');
    expect(container.querySelector('figcaption')!.textContent).toBe(
      node.getAttribute('aria-label'),
    );
  });

  it('lists the five busiest pairs and refreshes a selected label on locale changes without translating names', async () => {
    const pitch = await network();
    const list = container.querySelector('ol[aria-label]')!;
    expect(list.children).toHaveLength(5);
    expect(list.children[0]!.textContent).toContain('9번');
    expect(list.children[4]!.textContent).toContain('5번');
    const node = pitch.querySelector('[data-network-node]')!;
    await key(node, 'Enter');
    await act(async () => {
      setTextLocale(en);
      setLocaleFormatters(en.formatters);
    });
    expect(container.querySelector('figcaption')!.textContent).toBe(
      '우리 팀 · Shirt 1 · Completed passes: 23 · Touches: 20',
    );
    expect(node.getAttribute('aria-label')).toBe(
      container.querySelector('figcaption')!.textContent,
    );
    expect(list.getAttribute('aria-label')).toBe('Busiest passing pairs (up to 5)');
    await act(async () => {
      setTextLocale(ar);
      setLocaleFormatters(ar.formatters);
    });
    expect(node.getAttribute('aria-label')).toBe(
      displayMessage('copy.materialView.38aeab08e9', {
        player: '우리 팀',
        number: ar.formatters.number(1),
        passes: ar.formatters.number(23),
        touches: ar.formatters.number(20),
      }),
    );
    expect(container.querySelector('figcaption')!.textContent).toBe(
      node.getAttribute('aria-label'),
    );
  });
});
