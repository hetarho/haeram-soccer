import type { Club, ClubBooks, World } from '../../contracts/src/types';
import { createWorld } from './founding';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import type { MatchModelRelease } from './match-model';

/**
 * A world nobody owns a club in, on a season's first day (→WORLD-13), as the takeover finds it,
 * made fast for unit tests: a founded 1950 world whose founded club, its players and their careers
 * leave again, so every professional club is for sale, no club keeps books and no season is
 * archived. A world the history runner made (`generateHistory`) is taken over in
 * `takeover.season.test.ts`.
 */
export function ownerlessWorld(
  seed = 'ownerless',
  release: MatchModelRelease = DISABLED_RELEASE,
): World {
  const w = createWorld(
    { country: 'ENG', name: 'Vanished Athletic', color: '#445566', seed, level: 'normal' },
    release,
  );
  const own = w.playerClub;
  w.clubs = w.clubs.filter((c) => c.id !== own);
  delete w.tables[own];
  w.fixtures = w.fixtures.filter((f) => f.kind !== 'lower');
  for (const id of Object.keys(w.people ?? {})) if (id.startsWith(`${own}:`)) delete w.people![id];
  w.playerClub = '';
  w.lower = false;
  w.players = [];
  w.staff = [];
  w.academy = { players: [] };
  w.events = [];
  w.bids = [];
  w.inbox = [];
  w.cash = '0';
  for (const key of [
    'managerHistory',
    'matchModel',
    'npcSeason',
    'shortlist',
    'rankHistory',
    'scorerSeason',
    'build',
    'policy',
    'direction',
  ] as const)
    delete w[key];
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
