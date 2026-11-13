import { expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { pack, unpack } from './packing';

it('preserves funded and historical books in a compact round trip', () => {
  const books = {
    cash: '0',
    debt: '25',
    seasons: [
      {
        year: 1931,
        income: '10',
        incomeComponents: { distribution: '1', gate: '2', commercial: '3', competitions: '4' },
        ownerCapital: '900719925474099312345',
        wages: '30',
        costs: '5',
        result: '-25',
      },
      { year: 1930, income: '10', wages: '20', costs: '5', result: '-15' },
    ],
  };
  const world = {
    clubs: [{ id: 'club', books }],
    playerClub: 'club',
    seed: 'books',
    ownMatches: [],
    fixtures: [],
    events: [],
    history: [],
    rankHistory: [],
  } as unknown as World;
  const restored = unpack(JSON.parse(JSON.stringify(pack(world))));
  expect(restored.clubs[0].books).toEqual(books);
  expect(restored.clubs[0].books!.seasons[1]).not.toHaveProperty('ownerCapital');
  expect(restored.clubs[0].books!.seasons[1]).not.toHaveProperty('incomeComponents');
});
