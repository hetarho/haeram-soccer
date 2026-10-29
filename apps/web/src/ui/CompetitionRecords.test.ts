import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { CompetitionRecords } from './CompetitionRecords';

describe('team record metric navigation', () => {
  it('exposes four keyboard tabs controlling the record panel, initially sorted by points', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionRecords, {
        w: { clubs: [] } as unknown as World,
        rows: [
          { id: 'first', points: 3, gf: 10, ga: 4 },
          { id: 'second', points: 6, gf: 2, ga: 1 },
        ],
      }),
    );
    expect(html).toContain('role="tablist" aria-label="팀 기록 정렬"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('role="tabpanel"');
    expect(html).not.toContain('aria-pressed');
    expect(html.indexOf('<td>6</td>')).toBeLessThan(html.indexOf('<td>3</td>'));
  });
});
