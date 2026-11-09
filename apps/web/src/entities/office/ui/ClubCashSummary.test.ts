import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../../../packages/contracts/src/types';
import { message } from '../../../../../../packages/contracts/src/messages';
import { ClubCashSummary } from './ClubCashSummary';
import o from '../../../shared/ui/styles/OwnerSheet.module.css';

const fixture = vi.hoisted(() => ({
  books: { income: '173456789', expense: '50000000', result: '123456789' },
}));
vi.mock('../../player/@x/office', () => ({
  seasonBooks: () => fixture.books,
  cashState: () => ({ label: 'Synthetic runway', value: '12 weeks', status: 'Stable' }),
  fixedCosts: () => ({
    nextRound: '6500009',
    annual: '300000099',
    kinds: [
      ['Synthetic player wages', '125000075'],
      ['Synthetic staff wages', '175000024'],
    ],
  }),
}));

/** Only identity/currency and cash enter this component; domain reads are supplied above. */
const world = {
  playerClub: 'synthetic',
  clubs: [{ id: 'synthetic', country: 'ENG' }],
  year: 2024,
  cash: '223456789',
} as unknown as World;

describe('cash summary exact money disclosure', () => {
  it.each([
    {
      sign: 'positive',
      books: { income: '173456789', expense: '50000000', result: '123456789' },
      compact: '+£1.23M',
      exact: '£1,234,567.89',
      tone: o.up,
    },
    {
      sign: 'negative',
      books: { income: '50000000', expense: '173456789', result: '-123456789' },
      compact: '−£1.23M',
      exact: '−£1,234,567.89',
      tone: o.down,
    },
  ])('keeps one $sign sign and exact fractional amounts behind the compact facts', (example) => {
    fixture.books = example.books;
    const html = renderToStaticMarkup(createElement(ClubCashSummary, { w: world }));
    const result = html.match(/<span[^>]*data-testid="season-result"[^>]*>(.*?)<\/span>/)?.[1];
    expect(result?.replace(/<[^>]*>/g, '')).toBe(example.compact);
    expect(result).toContain(`title="${example.exact}"`);
    expect(html).toContain(`class="${example.tone}" data-testid="season-result"`);

    // Each monetary fact uses Money's keyboard/tap disclosure and exact hover title.
    expect(html.match(/data-money=""/g)).toHaveLength(8);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(8);
    for (const exact of [
      '£1,734,567.89',
      '£500,000.00',
      example.exact,
      '£2,234,567.89',
      '£65,000.09',
      '£1,250,000.75',
      '£1,750,000.24',
      '£3,000,000.99',
    ])
      expect(html).toContain(`title="${exact}"`);
    expect(html).toContain('>£65,000</button>');
    expect(html).toContain('>£3.00M</button>');
    expect(html).toContain('<small>£2,234,567.89</small>');

    const income = message('copy.ClubCashSummary.f438ea44a0');
    const expense = message('copy.ClubCashSummary.a616282dcf');
    const resultLabel = message('copy.ClubCashSummary.967f1e3a31');
    expect(html.indexOf(`<dt>${income}</dt>`)).toBeLessThan(html.indexOf(`<dt>${expense}</dt>`));
    expect(html.indexOf(`<dt>${expense}</dt>`)).toBeLessThan(
      html.indexOf(`<dt>${resultLabel}</dt>`),
    );
    expect(html).toContain('Synthetic runway');
    expect(html).toContain('12 weeks');
  });
});
