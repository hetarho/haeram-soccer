import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { BallonDorPlace, Player, SeasonArchive, World } from '../../contracts/src/types';
import type { NpcCompetitionStats } from '../../contracts/src/match-model';
import {
  activePlayers,
  BALLON_DOR_CONFIG,
  ballonDorPodium,
  ballonDorPremium,
  ballonDorRecord,
  ballonDorStar,
  overall,
  payBallonDorBonus,
  ratio,
  settleClauses,
  zeroMetrics,
} from './index';
import { M } from './match/record';
import { careerWorld } from './career.testkit';
import { ballonDorProduction } from './ballon-dor';

/** A world in 1960 whose season aggregates are filled in by each case. */
function season() {
  const w = careerWorld({ seed: 'ballon-dor' });
  w.year = 1960;
  w.europe = [];
  w.npcSeason = {
    year: 1960,
    model: w.npcSeason?.model ?? 'candidate-1',
    trackedFrom: { year: 1960, day: 1, round: 1 },
    competitions: [],
  } as World['npcSeason'];
  const top = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0 && !c.representative);
  return { w, top };
}
/** One of our squad rated `ability` at every attribute. */
function rated(w: World, index: number, ability: number): Player {
  const p = activePlayers(w)[index]!;
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  p.position = 'ST';
  p.positions = { ST: 3 };
  return p;
}
/** His season in one competition for one club: appearances, goals and assists. */
function played(
  w: World,
  scope: Pick<NpcCompetitionStats, 'kind' | 'groupKey'>,
  p: Pick<Player, 'id' | 'name' | 'position'>,
  club: string,
  appearances: number,
  goals = 0,
  assists = 0,
) {
  const stats = w.npcSeason!;
  let competition = stats.competitions.find(
    (c) => c.kind === scope.kind && c.groupKey === scope.groupKey,
  );
  if (!competition) stats.competitions.push((competition = { ...scope, clubs: [], players: [] }));
  const metrics = zeroMetrics();
  metrics[M.goals] = goals;
  metrics[M.assists] = assists;
  competition.players.push({
    id: p.id,
    name: p.name,
    position: p.position,
    clubs: [{ club, appearances, starts: appearances, metrics, detail: zeroMetrics() }],
  });
}
const LEAGUE = { kind: 'league', groupKey: 'ENG:0:0' } as const;
const CUP = { kind: 'cup', groupKey: 'cup:ENG' } as const;
const champions = (club: string, cup?: string): SeasonArchive['champions'] => [
  { country: 'ENG', club, cup: cup ?? '' },
];

/** A finished top-flight table with an explicit order, independent of the generated club IDs. */
function finish(w: World, order: World['clubs']) {
  order.forEach((club, index) =>
    Object.assign(w.tables[club.id], { played: 38, points: 100 - index, gf: 70, ga: 30 }),
  );
}

describe('the Ballon d’Or podium (→PLAYER-27)', () => {
  it('ranks bounded individual production, class and substantial team honours, winner first', () => {
    const { w, top } = season();
    const [a, b, c] = [rated(w, 0, 70), rated(w, 1, 70), rated(w, 2, 80)];
    played(w, LEAGUE, a, top[0]!.id, 38, 30, 5);
    played(w, LEAGUE, b, top[1]!.id, 38, 25, 10);
    played(w, LEAGUE, c, top[2]!.id, 38, 10, 4);
    const podium = ballonDorPodium(w, champions(top[1]!.id))!;
    // Production a=75, b=74, c=47; b's title adds 120, c's class adds 20.
    expect(overall(c)).toBe(80);
    expect(podium.map((place) => [place.id, place.points])).toEqual([
      [b.id, 194],
      [a.id, 75],
      [c.id, 67],
    ]);
    expect(podium[0]).toMatchObject({
      club: top[1]!.id,
      goals: 25,
      assists: 10,
      appearances: 38,
      honours: ['league'],
    });
  });

  it('credits a trophy only to players who played for the winner in that competition', () => {
    const { w, top } = season();
    const [league, cup] = [rated(w, 0, 70), rated(w, 1, 70)];
    // Both play the league for the cup winner; only one played its cup run.
    played(w, LEAGUE, league, top[0]!.id, 30, 10);
    played(w, LEAGUE, cup, top[0]!.id, 30, 10);
    played(w, CUP, cup, top[0]!.id, 4, 2);
    const podium = ballonDorPodium(w, champions(top[1]!.id, top[0]!.id))!;
    const of = (id: string) => podium.find((place) => place.id === id)!;
    expect(of(cup.id).honours).toEqual(['cup']);
    expect(of(league.id).honours).toEqual([]);
    expect(of(cup.id).points - of(league.id).points).toBe(5 + BALLON_DOR_CONFIG.honours.cup);
  });

  it('an extreme mid-table scorer cannot overwhelm a title winner with unlimited goals', () => {
    const { w, top } = season();
    const [scorer, winner] = [rated(w, 0, 90), rated(w, 1, 90)];
    finish(w, top);
    played(w, LEAGUE, scorer, top[13]!.id, 38, 1000, 30);
    played(w, LEAGUE, winner, top[0]!.id, 38, 25, 10);
    const podium = ballonDorPodium(w, champions(top[0]!.id))!;
    expect(podium[0]!.id).toBe(winner.id);
    expect(podium[0]!.points).toBe(314);
    expect(podium[1]!.points).toBeLessThanOrEqual(BALLON_DOR_CONFIG.production.maximum + 40);
    expect(ballonDorProduction(0, 0)).toBe(0);
    expect(ballonDorProduction(1000, 30)).toBeGreaterThan(ballonDorProduction(80, 10));
    expect(ballonDorProduction(1_000_000, 0)).toBeLessThanOrEqual(
      BALLON_DOR_CONFIG.production.maximum,
    );
  });

  it('credits the final top-six league place even without a trophy', () => {
    const { w, top } = season();
    const [first, second, seventh] = [rated(w, 0, 70), rated(w, 1, 70), rated(w, 2, 70)];
    finish(w, top);
    played(w, LEAGUE, first, top[0]!.id, 38, 10);
    played(w, LEAGUE, second, top[1]!.id, 38, 10);
    played(w, LEAGUE, seventh, top[6]!.id, 38, 10);
    expect(ballonDorPodium(w, [])!.map((place) => [place.id, place.points])).toEqual([
      [first.id, 120],
      [second.id, 100],
      [seventh.id, 40],
    ]);
  });

  it('uses a transferred player’s best contributed league finish once', () => {
    const { w, top } = season();
    const player = rated(w, 0, 70);
    finish(w, top);
    played(w, LEAGUE, player, top[1]!.id, 15, 5);
    // The same stable identity has contributions at two clubs after a move.
    w.npcSeason!.competitions[0]!.players[0]!.clubs.push({
      club: top[0]!.id,
      appearances: 15,
      starts: 15,
      metrics: zeroMetrics(),
      detail: zeroMetrics(),
    });
    const podium = ballonDorPodium(w, [])!;
    expect(podium[0]!.points).toBe(24 + BALLON_DOR_CONFIG.leaguePlaces[0]!);
    expect(podium[0]!.appearances).toBe(30);
  });

  it('does not award an unplayed league place or a cup-only club’s league finish', () => {
    const { w, top } = season();
    const player = rated(w, 0, 70);
    played(w, LEAGUE, player, top[8]!.id, 38, 10);
    played(w, CUP, player, top[0]!.id, 1);
    finish(w, top);
    expect(ballonDorPodium(w, [])![0]!.points).toBe(40);
    w.tables[top[8]!.id]!.played = 0;
    w.tables[top[8]!.id]!.points = 150;
    expect(ballonDorPodium(w, [])![0]!.points).toBe(40);
  });

  it('needs 15 top-flight league appearances, whatever else he scored', () => {
    const { w, top } = season();
    const lower = w.clubs.find((c) => c.country === 'ENG' && c.tier === 1)!;
    const [short, below, regular] = [rated(w, 0, 90), rated(w, 1, 90), rated(w, 2, 60)];
    played(w, LEAGUE, short, top[0]!.id, 14, 30);
    played(w, { kind: 'league', groupKey: 'ENG:1:0' }, below, lower.id, 40, 40);
    played(w, LEAGUE, regular, top[0]!.id, 15, 1);
    expect(ballonDorPodium(w, champions(top[1]!.id))!.map((place) => place.id)).toEqual([
      regular.id,
    ]);
  });

  it('awards nothing before 1955/56 or for a season not tracked from its first day', () => {
    const { w, top } = season();
    played(w, LEAGUE, rated(w, 0, 70), top[0]!.id, 30, 20);
    expect(ballonDorPodium(w, champions(top[0]!.id))).toHaveLength(1);
    w.year = 1954;
    w.npcSeason!.year = 1954;
    expect(ballonDorPodium(w, champions(top[0]!.id))).toBeUndefined();
    w.year = w.npcSeason!.year = 1960;
    w.npcSeason!.trackedFrom = { year: 1960, day: 40, round: 6 };
    expect(ballonDorPodium(w, champions(top[0]!.id))).toBeUndefined();
  });

  it('splits a club’s team credit among its players by individual points', () => {
    const { w, top } = season();
    finish(w, top);
    const [star, second, third, rival] = [85, 85, 85, 85].map((ability, i) => rated(w, i, ability));
    played(w, LEAGUE, star!, top[0]!.id, 38, 30, 10);
    played(w, LEAGUE, second!, top[0]!.id, 38, 20, 10);
    played(w, LEAGUE, third!, top[0]!.id, 38, 15, 10);
    played(w, LEAGUE, rival!, top[1]!.id, 38, 28, 10);
    const podium = ballonDorPodium(w, champions(top[0]!.id))!;
    // Individual points (production + class 30): 108, 99, 94, 107. The champions' title and first
    // place (200) count in full, ×0.55 and ×0.35; the runner-up's second place (60) in full.
    expect(podium.map((place) => [place.id, place.points])).toEqual([
      [star!.id, 308],
      [second!.id, 209],
      [rival!.id, 167],
    ]);
    expect(podium[1]!.honours).toEqual(['league']);
  });
});

const place = (id: string): BallonDorPlace => ({
  id,
  name: id,
  club: 'c',
  position: 'ST',
  goals: 1,
  assists: 0,
  appearances: 30,
  points: 4,
  honours: [],
});
/** Archived podiums: `p` won in 1956 and 1959, was second in 1957 and third in 1960. */
const history = [
  { year: 1956, ballonDor: [place('p'), place('x'), place('y')] },
  { year: 1957, ballonDor: [place('x'), place('p'), place('y')] },
  { year: 1958, ballonDor: [place('x'), place('y'), place('z')] },
  { year: 1959, ballonDor: [place('p'), place('x'), place('y')] },
  { year: 1960, ballonDor: [place('x'), place('y'), place('p')] },
];

describe('Ballon d’Or records and the contract premium (→HIST-13, CLUB-26)', () => {
  it('derives a player’s wins and podium places by his identity', () => {
    expect(ballonDorRecord(history, 'p')).toEqual({
      wins: [1956, 1959],
      podiums: [
        { year: 1957, place: 2 },
        { year: 1960, place: 3 },
      ],
    });
    expect(ballonDorRecord(history, 'nobody')).toEqual({ wins: [], podiums: [] });
  });

  it('prices a win ×2 and a podium ×1.4 for the three closed seasons before', () => {
    expect(ballonDorPremium(history, 1961, 'p')).toEqual({ factor: 2, place: 1, year: 1959 });
    expect(ballonDorPremium(history, 1963, 'p')).toEqual({ factor: 1.4, place: 3, year: 1960 });
    expect(ballonDorPremium(history, 1964, 'p')).toEqual({ factor: 1 });
    expect(ballonDorPremium(history, 1959, 'p')).toEqual({ factor: 2, place: 1, year: 1956 });
    expect(ballonDorPremium(history, 1960, 'y')).toEqual({ factor: 1.4, place: 3, year: 1959 });
    expect(ballonDorPremium(history, 1961, 'z')).toEqual({ factor: 1.4, place: 3, year: 1958 });
  });
});

it('raises repeated recent winners progressively, independent of archive order', () => {
  const recent = [
    { year: 1958, ballonDor: [place('p')] },
    { year: 1959, ballonDor: [place('p')] },
    { year: 1960, ballonDor: [place('p')] },
  ];
  expect(ballonDorPremium(recent, 1961, 'p')).toEqual({ factor: 2.8, place: 1, year: 1960 });
  expect(ballonDorPremium([...recent].reverse(), 1961, 'p')).toEqual(
    ballonDorPremium(recent, 1961, 'p'),
  );
  expect(ballonDorPremium(recent, 1962, 'p').factor).toBe(2.4);
  expect(ballonDorPremium(recent, 1963, 'p').factor).toBe(2);
  expect(ballonDorPremium(recent, 1964, 'p').factor).toBe(1);
});

describe('the Ballon d’Or bonus clause (→CLUB-29)', () => {
  it('keeps the promotion and relegation draws and adds the bonus only for a star', () => {
    const { w } = season();
    const p = rated(w, 0, 85);
    let carried = 0;
    for (let day = 0; day < 400; day++) {
      const plain = settleClauses(w.seed, p, 5, w.year, day),
        star = settleClauses(w.seed, p, 5, w.year, day, true);
      expect(plain.ballonDor).toBeUndefined();
      expect({ ...star, ballonDor: undefined }).toEqual({ ...plain, ballonDor: undefined });
      if (!star.ballonDor) continue;
      carried++;
      expect(star.ballonDor).toBeGreaterThanOrEqual(BALLON_DOR_CONFIG.clause.to[0]);
      expect(star.ballonDor).toBeLessThanOrEqual(BALLON_DOR_CONFIG.clause.to[1]);
    }
    // A 5-rated agent wins it in 90% of a star's contracts.
    expect(carried / 400).toBeCloseTo(BALLON_DOR_CONFIG.clause.share[1], 1);
  });

  it('counts a player rated 80+ or on a recent podium as a star', () => {
    const { w } = season();
    const [star, squad] = [rated(w, 0, 80), rated(w, 1, 70)];
    expect(ballonDorStar(w, star)).toBe(true);
    expect(ballonDorStar(w, squad)).toBe(false);
    w.history.push({
      ...w.history[0],
      year: 1959,
      ballonDor: [place('x'), place(squad.id)],
    } as SeasonArchive);
    expect(ballonDorStar(w, squad)).toBe(true);
  });

  it('pays our winner his clause once at the close, and a second place nothing', () => {
    const { w } = season();
    const p = rated(w, 0, 85);
    p.clauses = { ballonDor: 50 };
    const before = BigInt(w.cash),
      events = w.events.length;
    payBallonDorBonus(w, [place('x'), { ...place(p.id) }]);
    expect(BigInt(w.cash)).toBe(before);
    payBallonDorBonus(w, [{ ...place(p.id) }]);
    const bonus = ratio(p.wage, 50n, 100n);
    expect(BigInt(w.cash)).toBe(before - BigInt(bonus));
    expect(w.events.slice(events)).toEqual([
      expect.objectContaining({ kind: 'ballon-dor-bonus', amount: bonus }),
    ]);
    // A loan carries no clause of ours.
    p.loanUntil = w.year + 1;
    payBallonDorBonus(w, [{ ...place(p.id) }]);
    expect(BigInt(w.cash)).toBe(before - BigInt(bonus));
  });
});
