import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { advanceDays, operate } from '../../../../packages/engine/src/index';
import { judgePromises } from '../../../../packages/engine/src/promises';
import { historyWorld, liveHistory } from '../../../../packages/engine/src/history';
import { pricedClubs, tierFortune } from '../../../../packages/engine/src/club-value';
import { pays } from '../../../../packages/engine/src/listing';
import { takeOver, takeoverLoan } from '../../../../packages/engine/src/takeover';
import { CLUB_BOOKS, TAKEOVER_DEBT } from '../../../../packages/engine/src/owner-config';
import { scaleBy } from '../../../../packages/engine/src/primitives';
import { FUTURE_FILES, delegatedCareer } from '../../../../tests/fixtures/club-identity';
import { featureState } from '../../../../tests/fixtures/feature-state';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { openedSaveFile, roundTrip } from '../../../../tests/fixtures/save-roundtrip';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { input } from './host.testkit';

const features = () => cachedWorld('feature-state', () => featureState());

describe('a game saved into its database and opened again (→SAVE-2/3/5)', () => {
  it('opens a played career exactly as it was saved', () => {
    const w = simulatedWorld(input, { rounds: 2 });
    w.facilityAutoUpgrade = { training: 'armed', academy: 'awaiting-funds' };
    expect(canonical(roundTrip(w))).toBe(canonical(w));
  });

  it('refuses a newer game’s data as incompatible, never as corruption (→SAVE-11)', async () => {
    const w = delegatedCareer('save-round-trip-future');
    for (const [name, write] of Object.entries(FUTURE_FILES))
      await expect(openedSaveFile(await write(w)), name).rejects.toBeInstanceOf(
        SaveCompatibilityError,
      );
    const earlier = { ...w, engine: '3.0.0' };
    expect(() => roundTrip(earlier)).toThrow(SaveCompatibilityError);
  });
});

it('feature-state-lossless-roundtrip and continued-career-parity preserve roles, money, draws and promise judgements', () => {
  const original = features(),
    restored = roundTrip(original);
  expect(canonical(restored)).toBe(canonical(original));
  const player = Object.values(original.playingCoachProposals!)[0].person;
  for (const w of [original, restored]) {
    const cash = w.cash;
    operate(w, { type: 'answer-playing-coach', player, accept: true });
    expect(w.cash).toBe(cash);
    advanceDays(w, 2, undefined, false);
  }
  expect(canonical(restored)).toBe(canonical(original));
  for (const w of [original, restored]) {
    const promise = w.promises!.find((p) => p.status === 'pending')!;
    w.year = promise.deadline.year;
    w.calendar = { day: promise.deadline.day + 1 };
    w.round = Math.floor(w.calendar.day / 7);
    delete w.scorerSeason;
    judgePromises(w);
    const after = canonical(w);
    judgePromises(w);
    expect(canonical(w)).toBe(after);
  }
  expect(canonical(restored)).toBe(canonical(original));
  expect(canonical(roundTrip(restored))).toBe(canonical(original));
});

describe('a taken-over career (→SAVE-27)', () => {
  it('round-trips the owner, the takeover loan, every club’s books and the seasons before the owner', () => {
    // The world after its 1930/31 season, nobody's yet: every league club keeps books and the
    // season is archived (→ECON-36, HIST-2).
    const generated = cachedWorld('ownerless-1931', () =>
      liveHistory(historyWorld('persist-takeover'), 1931),
    );
    const w = structuredClone(generated);
    const fortune = tierFortune(w, 'oil');
    // Under LEAGUE-10's means level with ECON-36's competition money no club nobody owns owes
    // anything after 1930/31, so the case turns an affordable club's cash into a debt of the same
    // amount: a balance the close can leave, its cash kept to `cashSeasons` of income, within the
    // `debtSeasons` write-off. A debt lowers the price (→ECON-37), so the club stays affordable.
    const indebted = pricedClubs(w).find(
      (priced) => BigInt(priced.club.books?.cash ?? '0') > 0n && pays(w, priced, fortune),
    )!;
    expect(indebted).toBeDefined();
    const prepared = indebted.club.books!,
      debt = prepared.cash,
      income = prepared.seasons[0]!.income;
    expect(BigInt(debt)).toBeLessThanOrEqual(
      BigInt(scaleBy(income, CLUB_BOOKS.cashSeasons, 1000n)),
    );
    expect(BigInt(debt)).toBeLessThanOrEqual(
      BigInt(scaleBy(income, CLUB_BOOKS.debtSeasons, 1000n)),
    );
    indebted.club.books = { ...prepared, cash: '0', debt };
    takeOver(w, indebted.club.id, { tier: 'oil', traits: ['politician', 'marketer'] });
    expect(w.owner?.takeover).toMatchObject({ year: 1931, clubId: indebted.club.id });
    expect(w.owner?.takeover.lastIncome).toBeDefined();
    expect(w.loan).toEqual(takeoverLoan(debt));
    expect(w.loan?.seasonsLeft).toBe(TAKEOVER_DEBT.seasons);
    w.owner!.starSaleWindow = { year: w.year, kind: 'summer' };
    expect(w.history.map((season) => season.year)).toEqual([1930]);
    // The model the world ran since 1930 is tracked from the takeover (→SAVE-23, OWNER-4).
    expect(generated.matchModel?.activated.year).toBe(1930);
    expect(w.matchModel).toMatchObject({
      activated: { year: 1931, day: 0 },
      trackedFrom: { year: 1931, day: 1, round: 1 },
      coverage: 'founding',
    });
    expect(w.npcSeason?.trackedFrom).toEqual(w.matchModel!.trackedFrom);
    expect(w.managerHistory?.coverage).toBe('founding');
    const books = w.clubs.filter((club) => club.books);
    expect(books.length).toBeGreaterThan(100);
    expect(indebted.club.books).toBeUndefined();
    const loaded = roundTrip(w);
    expect(canonical(loaded)).toBe(canonical(w));
    expect(loaded.owner).toEqual(w.owner);
    expect(loaded.owner!.starSaleWindow).toEqual({ year: w.year, kind: 'summer' });
    expect(loaded.loan).toEqual(w.loan);
    expect(loaded.clubs.filter((club) => club.books)).toEqual(books);
  });
});
