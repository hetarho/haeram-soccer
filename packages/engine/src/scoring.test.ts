import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { currency } from '../../catalogs/src/index';
import {
  advanceDays,
  advanceRound,
  clubOf,
  createWorld,
  isScoringFixture,
  prepareSeason,
  rankedScorers,
  resolveTie,
  simulateMatch,
  simulateSeason,
  FOUNDING_YEAR,
} from './index';
import { cachedWorld, DISABLED_RELEASE } from '../../../tests/fixtures/worlds';
import { transferredScorerWorld } from '../../../tests/fixtures/transferred-scorer';

/** The scorer race's club on the pre-feature path: the league's scorer ledger is the subject. */
function world() {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Scoring United',
      color: '#223344',
      seed: 'goal-race',
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );
  w.cash = '999999999999';
  return w;
}
/** The world above after `rounds` unobserved rounds, each span built on the one before. */
function afterRounds(rounds: number): ReturnType<typeof world> {
  return cachedWorld(`rounds:${rounds}`, () => {
    const spans = [1, 2, 7],
      from = spans.filter((n) => n < rounds).at(-1),
      w = from ? afterRounds(from) : world();
    while (w.round < rounds) advanceRound(w, undefined, false);
    return w;
  });
}

describe('actual league scorer standings', () => {
  it('accounts for every real goal and starting appearance of every league club', () => {
    const w = afterRounds(7);
    // 조직력 moves with every settled round (→LEAGUE-12); the replay below needs the round's own.
    const cohesion = new Map(w.clubs.map((club) => [club.id, club.cohesion]));
    advanceRound(w, undefined, false);
    const season = w.scorerSeason!;
    expect(season.trackedSinceRound).toBe(1);
    const fixtureClubs = new Set(
      w.fixtures.filter((f) => isScoringFixture(w, f)).flatMap((f) => [f.home, f.away]),
    );
    expect(new Set(season.players.map((p) => p.club))).toEqual(fixtureClubs);
    for (const club of fixtureClubs) {
      const players = season.players.filter((p) => p.club === club);
      expect(players.reduce((goals, p) => goals + p.goals, 0)).toBe(w.tables[club].gf);
      expect(players.reduce((appearances, p) => appearances + p.appearances, 0)).toBe(
        w.tables[club].played * 11,
      );
    }
    for (const player of season.players.filter((p) => p.club === w.playerClub)) {
      // League goals only: cup ties count for the club, not for the league's scorers.
      const goals = w.ownMatches
        .filter((match) => match.kind === 'league' || match.kind === 'lower')
        .reduce(
          (total, match) =>
            total + (match.players.find((p) => p.id === player.id)?.metrics[0] || 0),
          0,
        );
      expect(player.goals).toBe(goals);
    }
    // Opponent-only fixtures use the very same deterministic goal/contribution stream.
    const fixture = w.fixtures.find(
      (f) =>
        isScoringFixture(w, f) &&
        f.score &&
        f.round === w.round &&
        f.home !== w.playerClub &&
        f.away !== w.playerClub,
    )!;
    const settled = new Map(w.clubs.map((club) => [club.id, club.cohesion]));
    for (const club of w.clubs) club.cohesion = cohesion.get(club.id);
    const replay = simulateMatch(w, fixture, false, true);
    for (const club of w.clubs) club.cohesion = settled.get(club.id);
    expect(replay.record.score).toEqual(fixture.score);
    expect(replay.record.highlights.filter((h) => h.action === '골').length).toBe(
      fixture.score!.home + fixture.score!.away,
    );
    expect(replay.record.players.reduce((goals, p) => goals + p.metrics[0], 0)).toBe(
      fixture.score!.home + fixture.score!.away,
    );
    validateWorld(w);
  });

  it('counts an appearance for every player who took the pitch, substitutes included', () => {
    const w = cachedWorld('modern:3', () => {
      const w = world();
      w.year = 2024;
      w.currency = currency('ENG', 2024).code;
      prepareSeason(w);
      for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
      return w;
    });
    advanceRound(w, undefined, false);
    const own = w.scorerSeason!.players.filter((p) => p.club === w.playerClub);
    const played = w.ownMatches
      .filter((m) => isScoringFixture(w, m))
      .flatMap((m) => m.players.filter((p) => p.metrics[10] > 0));
    expect(own.reduce((n, p) => n + p.appearances, 0)).toBe(played.length);
    // The modern era's substitutes come on, so the side counts more than its eleven starters.
    expect(played.length).toBeGreaterThan(11 * w.tables[w.playerClub].played);
    validateWorld(w);
  });

  it('stores cumulative real goals and exact ranking each round, independent of observation', () => {
    const observed = world();
    const fast = structuredClone(observed);
    for (let round = 0; round < 5; round++) {
      advanceRound(observed);
      advanceRound(fast, undefined, false);
      const season = observed.scorerSeason!;
      const rows = rankedScorers(season).map(({ player, index }) => [
        index,
        player.goals,
        player.appearances,
      ]);
      expect(season.history.at(-1)?.rows).toEqual(rows);
      expect(canonical(fast)).toBe(canonical(observed));
    }
    expect(observed.scorerSeason!.history.map((h) => h.round)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(observed.scorerSeason!.history[0].rows).toEqual([]);
  });

  it('preserves scorer references on off days and excludes cup goals from the league race', () => {
    const w = cachedWorld('days:7', () => {
      const w = world();
      advanceDays(w, 7, undefined, false);
      return w;
    });
    const season = w.scorerSeason;
    const history = season!.history;
    const before = canonical(season);
    advanceDays(w, 3, undefined, false);
    expect(w.scorerSeason).toBe(season);
    expect(w.scorerSeason!.history).toBe(history);
    expect(canonical(w.scorerSeason)).toBe(before);
    const fixture = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
    resolveTie(w, { ...fixture, id: 'scoring-cup', kind: 'cup' });
    expect(canonical(w.scorerSeason)).toBe(before);
    validateWorld(w);
  });

  it('starts older saves at the next actual league round without projecting past scorers', () => {
    const w = afterRounds(2);
    delete w.scorerSeason;
    advanceDays(w, 1, undefined, false);
    expect(w.scorerSeason!.trackedSinceRound).toBe(3);
    expect(w.scorerSeason!.players).toEqual([]);
    expect(w.scorerSeason!.history.map((h) => h.round)).toEqual([2]);
    advanceDays(w, 6, undefined, false);
    const trackedGoals = w.fixtures
      .filter((f) => isScoringFixture(w, f) && f.round === 3)
      .reduce((sum, f) => sum + (f.score?.home || 0) + (f.score?.away || 0), 0);
    expect(w.scorerSeason!.players.reduce((sum, p) => sum + p.goals, 0)).toBe(trackedGoals);
    expect(w.scorerSeason!.history.map((h) => h.round)).toEqual([2, 3]);
    validateWorld(w);
  });

  it('resets standings and competition membership when the season or league changes', () => {
    const previous = afterRounds(1).scorerSeason;
    // The rest of the season is setup: only its close (simulateSeason's last step) runs here.
    const w = cachedWorld('last-round', () => {
      const w = afterRounds(1);
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
    simulateSeason(w);
    expect(w.scorerSeason!.year).toBe(FOUNDING_YEAR + 1);
    expect(w.scorerSeason!.players).toEqual([]);
    expect(w.scorerSeason!.trackedSinceRound).toBe(1);
    expect(w.scorerSeason!.history).toEqual([{ round: 0, day: 0, rows: [] }]);
    expect(previous!.players.length).toBeGreaterThan(0);
    w.lower = true;
    clubOf(w).tier = 4;
    prepareSeason(w);
    advanceRound(w, undefined, false);
    expect(w.scorerSeason!.groupKey).toBe('lower');
    const lowerClubs = new Set(
      w.fixtures.filter((f) => f.kind === 'lower').flatMap((f) => [f.home, f.away]),
    );
    expect(lowerClubs.size).toBe(16);
    expect(w.scorerSeason!.players.every((p) => lowerClubs.has(p.club))).toBe(true);
    expect(w.scorerSeason!.players.reduce((sum, p) => sum + p.goals, 0)).toBe(
      w.fixtures
        .filter((f) => f.kind === 'lower' && f.score)
        .reduce((sum, f) => sum + f.score!.home + f.score!.away, 0),
    );
    validateWorld(w);
  });
});

describe('retained scorer transfers', () => {
  it('keeps one identity and exact per-club contributions through a real in-league sale', async () => {
    const transferred = () =>
      cachedWorld('transferred', () => transferredScorerWorld(undefined, DISABLED_RELEASE));
    const fixture = transferred(),
      { playerId, buyer } = fixture;
    let w = fixture.w;
    const rows = w.scorerSeason!.players.filter((p) => p.id === playerId);
    expect(rows).toHaveLength(1);
    expect(rows[0].club).toBe(buyer);
    expect(rows[0].clubs).toHaveLength(2);
    const ownAppearances = w.ownMatches.filter(
      (match) =>
        ['league', 'lower'].includes(match.kind) &&
        match.round <= 3 &&
        match.players.some((p) => p.id === playerId && p.metrics[10] > 0),
    ).length;
    expect(rows[0].clubs!.map((p) => p.appearances)).toEqual([ownAppearances, 1]);
    expect(rows[0].clubs!.reduce((sum, p) => sum + p.goals, 0)).toBe(rows[0].goals);
    validateWorld(w);
    for (const corrupt of [
      (copy: typeof w) => {
        copy.scorerSeason!.players.find((p) => p.id === playerId)!.clubs![0].goals++;
      },
      (copy: typeof w) => {
        const p = copy.scorerSeason!.players.find((p) => p.id === playerId)!;
        p.clubs![1].club = p.clubs![0].club;
      },
      (copy: typeof w) => {
        copy.scorerSeason!.players.find((p) => p.id === playerId)!.clubs![0].club = 'missing-club';
      },
    ]) {
      const copy = structuredClone(w);
      corrupt(copy);
      expect(() => validateWorld(copy)).toThrow();
    }
    // The rest of the season is setup: only its close (simulateSeason's last step) runs here.
    w = cachedWorld('transferred:last-round', () => {
      const { w } = transferred();
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
    simulateSeason(w);
    const archived = w.history.at(-1)!.scorers!.find((p) => p.name === rows[0].name)!;
    expect(archived).toBeDefined();
    expect(archived.clubs!.map((p) => w.clubs[p.club].id)).toEqual([w.playerClub, buyer]);
    expect(archived.clubs!.reduce((sum, p) => sum + p.goals, 0)).toBe(archived.goals);
    validateWorld(w);
    const malformed = structuredClone(w);
    malformed.history.at(-1)!.scorers!.find((p) => p.name === archived.name)!.clubs![0].goals++;
    expect(() => validateWorld(malformed)).toThrow('시즌 득점 기록');
  });
});
