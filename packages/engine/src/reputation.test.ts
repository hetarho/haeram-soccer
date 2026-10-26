import { country } from '../../catalogs/src/index';
import { describe, it, expect } from 'vitest';
import { clubOf, finishCups, finishEurope, advanceRound, closeSeason } from './index';
import { divisionLevel, finishTerm, settleReputation, awardReputation } from './reputation';
import { leagueFinishes } from './season';
import { tieFixtures } from './knockout';
import type { KnockoutRound, EuropeTournament } from '../../contracts/src/types';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
/** The club on the pre-feature path: reputation, not the match model, is the subject. */
const world = () =>
  simulatedWorld(
    {
      country: 'ENG',
      name: 'Standing Reputation',
      color: '#224466',
      seed: 'standing-reputation',
      level: 'normal',
    },
    {},
    DISABLED_RELEASE,
  );
describe('standing-based reputation for every club', () => {
  it('uses next-division levels and symmetric champion/middle/last finish terms', () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => divisionLevel(t, 4))).toEqual([75, 60, 45, 30, 8, 8]);
    expect(divisionLevel(3, 3)).toBe(8);
    expect([1, 11, 21].map((r) => finishTerm(r, 21))).toEqual([3, 0, -3]);
    expect(finishTerm(1, 1)).toBe(0);
  });
  it('ranks each played domestic group independently and leaves unplayed clubs without a finish', () => {
    const w = world(),
      groups = [0, 1].map((group) =>
        w.clubs.filter((c) => c.country === 'ITA' && c.tier === 2 && c.group === group),
      );
    for (const clubs of groups) {
      expect(clubs.length).toBeGreaterThan(1);
      clubs.forEach((c, i) =>
        Object.assign(w.tables[c.id], { played: 1, points: clubs.length - i }),
      );
    }
    const finishes = leagueFinishes(w);
    for (const clubs of groups) {
      expect(finishes.get(clubs[0].id)).toBe(3);
      expect(finishes.get(clubs.at(-1)!.id)).toBe(-3);
    }
    expect(finishes.has(w.playerClub)).toBe(false);
  });
  it('pulls promoted/relegated/owner/unplayed clubs toward the next level without rounding decimals', () => {
    const w = world(),
      own = clubOf(w),
      [promoted, relegated, unplayed] = w.clubs.filter(
        (c) => c.id !== own.id && !c.representative && !c.id.startsWith('euro:'),
      );
    promoted.tier = 1;
    promoted.reputation = 45;
    relegated.tier = 2;
    relegated.reputation = 60;
    unplayed.tier = 0;
    unplayed.reputation = 10;
    own.tier = 2;
    own.reputation = 20.25;
    settleReputation(
      w,
      new Map([
        [promoted.id, 3],
        [relegated.id, -3],
        [own.id, 0.5],
      ]),
    );
    expect(promoted.reputation).toBe(51);
    expect(relegated.reputation).toBe(54);
    expect(unplayed.reputation).toBe(23);
    expect(own.reputation).toBeCloseTo(25.7);
  });
  it('converges through thirty identical middle-table seasons, clamps extremes and leaves representatives unchanged', () => {
    const w = world(),
      own = clubOf(w);
    own.tier = 2;
    own.reputation = 0;
    const representative = {
      ...w.clubs[0],
      id: 'euro:reputation-test',
      representative: true,
      reputation: 42.25,
    };
    w.clubs.push(representative);
    for (let i = 0; i < 30; i++) settleReputation(w, new Map());
    expect(Math.abs(own.reputation - 45)).toBeLessThan(1);
    expect(representative.reputation).toBe(42.25);
    own.reputation = 99;
    awardReputation(w, own.id, 8);
    expect(own.reputation).toBe(100);
    own.reputation = 0;
    own.tier = 4;
    settleReputation(w, new Map([[own.id, -3]]));
    expect(own.reputation).toBe(0);
    awardReputation(w, representative.id, 8);
    expect(representative.reputation).toBe(42.25);
  });
  it('settles every native club exactly once at the actual close using old finishes and new tiers', () => {
    // The founding season's 46 rounds are built once; the close is lived here.
    const w = cachedWorld('final-round', () => {
      const w = world();
      w.cash = '999999999999';
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
    finishCups(w);
    finishEurope(w);
    const before = new Map(w.clubs.map((c) => [c.id, c.reputation])),
      finishes = leagueFinishes(w);
    closeSeason(w);
    for (const club of w.clubs) {
      if (club.representative || club.id.startsWith('euro:')) continue;
      const previous = before.get(club.id)!;
      const expected = Math.max(
        0,
        Math.min(
          100,
          previous +
            0.2 * (divisionLevel(club.tier, country(club.country).groups.length) - previous) +
            (finishes.get(club.id) ?? 0),
        ),
      );
      expect(club.reputation, club.id).toBeCloseTo(expected, 10);
    }
  });
  it('awards the domestic cup winner two points even when nobody owns that club, once', () => {
    const w = world(),
      [a, b] = w.clubs.filter((c) => c.country === 'ENG' && c.id !== w.playerClub && c.tier === 0);
    const round: KnockoutRound = {
      label: '결승',
      round: 1,
      legs: 1,
      ties: [{ home: a.id, away: b.id }],
    };
    w.cups = [
      {
        country: 'ENG',
        name: 'Synthetic Cup Final',
        clubs: [a.id, b.id],
        rounds: [round],
        fixtures: tieFixtures(w, 'cup:ENG', 'cup', 'ENG', 0, round),
      },
    ];
    const before = new Map([
      [a.id, a.reputation],
      [b.id, b.reputation],
    ]);
    finishCups(w);
    const winner = w.clubs.find((c) => c.id === w.cups![0].winner)!;
    expect(winner.reputation).toBe(before.get(winner.id)! + 2);
    const rep = winner.reputation;
    finishCups(w);
    expect(winner.reputation).toBe(rep);
  });
  it('awards both real continental participants and the unowned champion, excluding a Super Cup title bonus', () => {
    for (const key of ['ucl', 'super']) {
      const w = world(),
        [a, b] = w.clubs.filter(
          (c) => c.country === 'ENG' && c.id !== w.playerClub && c.tier === 0,
        );
      const round: KnockoutRound = {
        label: '결승',
        round: 1,
        legs: 1,
        ties: [{ home: a.id, away: b.id }],
      };
      const tournament: EuropeTournament = {
        key,
        name: 'Synthetic Continental Final',
        field: 2,
        format: 'knockout',
        games: 1,
        stage: '결승',
        clubs: [a.id, b.id],
        rounds: [round],
        fixtures: tieFixtures(w, key, 'europe', 'EU', 0, round),
        standings: {},
      };
      w.europe = [tournament];
      const before = new Map([
        [a.id, a.reputation],
        [b.id, b.reputation],
      ]);
      finishEurope(w);
      for (const club of [a, b])
        expect(club.reputation).toBeCloseTo(
          before.get(club.id)! + 0.2 + (key !== 'super' && tournament.winner === club.id ? 8 : 0),
        );
      const after = [a.reputation, b.reputation];
      finishEurope(w);
      expect([a.reputation, b.reputation]).toEqual(after);
    }
  });
});
