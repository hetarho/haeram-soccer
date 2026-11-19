import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeaguePoints } from './PointsDeduction';

describe('league point display', () => {
  it('shows the net points with the recorded deduction and administration reason', () => {
    const row = { points: 30, deducted: 10, deductionReason: 'administration' as const };
    const html = renderToStaticMarkup(createElement(LeaguePoints, { row }));
    expect(html).toMatch(/^20 /);
    expect(html).toContain('−10점 · 법정관리');
    expect(row.points).toBe(30);
  });
  it('keeps old rows without deductions unchanged', () => {
    const html = renderToStaticMarkup(createElement(LeaguePoints, { row: { points: 30 } }));
    expect(html).toContain('30');
    expect(html).not.toContain('points-deduction');
  });
});
