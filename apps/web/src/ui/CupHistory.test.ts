import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { CupHistory } from './CupHistory';

vi.mock('./Bracket', () => ({
  Club: ({ id }: { id: string }) => createElement('span', null, id),
  Bracket: () => createElement('div', null, 'Retained bracket'),
}));
/** Two synthetic finals are enough to distinguish countries without generating a world. */
const world = {
  id: 'archive-scope',
  seed: 'synthetic',
  year: 1951,
  playerClub: 'our-club',
  clubs: [
    { id: 'our-club', country: 'ENG' },
    { id: 'german-winner', country: 'GER' },
  ],
  history: [
    {
      year: 1950,
      champions: [
        { country: 'ENG', club: 'our-club', cup: 'our-club' },
        { country: 'GER', club: 'german-winner', cup: 'german-winner' },
      ],
      europe: [],
      runs: [{ key: 'cup', champion: true, reached: '결승' }],
    },
  ],
} as unknown as World;
describe('archived domestic competition scope', () => {
  it('shows the selected country’s honours and an explicit missing bracket, never our cup run', () => {
    const html = renderToStaticMarkup(
      createElement(CupHistory, {
        w: world,
        client: {} as GameClient,
        competition: 'cup',
        countryCode: 'GER',
        picked: 1950,
        onYear: vi.fn(),
      }),
    );
    expect(html).toContain('독일 컵');
    expect(html).toContain('german-winner');
    expect(html).not.toContain('our-club');
    expect(html).toContain('이 대회의 지난 대진표는 보관하지 않았어요.');
    expect(html).toContain('우리 클럽은 이 시즌 독일 컵에 나서지 않았어요.');
    expect(html).not.toContain('경기 기록을 불러오는 중');
    expect(html).not.toContain('Retained bracket');
  });
});
