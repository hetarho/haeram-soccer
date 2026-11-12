import type { Club, ClubBooks, World } from '../../contracts/src/types';
import { MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model-release';
import { historyWorld } from './history';
import { CAREER_YEAR } from './career.testkit';

/**
 * A world nobody owns a club in, on a season's first day (→WORLD-13), as the takeover finds it,
 * made fast for unit tests: a fresh world on `CAREER_YEAR`'s first day with nothing lived before
 * it, so every professional club is for sale, no club keeps books and no season is archived. A
 * world the history runner made (`generateHistory`) is taken over in `takeover.season.test.ts`.
 */
export function ownerlessWorld(
  seed = 'ownerless',
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): World {
  const w = historyWorld(seed, release, CAREER_YEAR);
  // Most value/listing units supply their own books; keep that synthetic baseline empty.
  for (const club of w.clubs) delete club.books;
  return w;
}

/** Hand-made books (→ECON-36): `cash` and `debt` with last season's income and wage bill. */
export function withBooks(
  w: World,
  club: Club,
  books: { cash: string; debt: string; income?: string; wages?: string },
): ClubBooks {
  const income = books.income ?? '0',
    wages = books.wages ?? '0';
  return (club.books = {
    seasons: [
      {
        year: w.year - 1,
        income,
        wages,
        costs: '0',
        result: (BigInt(income) - BigInt(wages)).toString(),
      },
    ],
    cash: books.cash,
    debt: books.debt,
  });
}
