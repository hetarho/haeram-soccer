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
  createWorld,
  overall,
  payBallonDorBonus,
  ratio,
  settleClauses,
  zeroMetrics,
} from './index';
import { M } from './grid/record';

/** A world in 1960 whose season aggregates are filled in by each case. */
function season() {
  const w = createWorld({
    country: 'ENG',
    name: 'Ballon d Or',
    color: '#224466',
    seed: 'ballon-dor',
    level: 'normal',
  });
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

describe('the Ballon d’Or podium (→PLAYER-27)', () => {
  it('ranks by goals ×4, assists ×3, class and team honours, winner first', () => {
    const { w, top } = season();
    const [a, b, c] = [rated(w, 0, 70), rated(w, 1, 70), rated(w, 2, 80)];
    played(w, LEAGUE, a, top[0]!.id, 38, 30, 5);
    played(w, LEAGUE, b, top[1]!.id, 38, 25, 10);
    played(w, LEAGUE, c, top[2]!.id, 38, 10, 4);
    const podium = ballonDorPodium(w, champions(top[1]!.id))!;
    // a 30×4 + 5×3 = 135; b 25×4 + 10×3 + title 25 = 155; c 10×4 + 4×3 + (80 − 70) × 2 = 72.
    expect(overall(c)).toBe(80);
    expect(podium.map((place) => [place.id, place.points])).toEqual([
      [b.id, 155],
      [a.id, 135],
      [c.id, 72],
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
    expect(of(cup.id).points - of(league.id).points).toBe(2 * 4 + BALLON_DOR_CONFIG.honours.cup);
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

  it('prices a win ×1.20 and a podium ×1.10 for the three closed seasons before', () => {
    expect(ballonDorPremium(history, 1961, 'p')).toEqual({ factor: 1.2, place: 1, year: 1959 });
    expect(ballonDorPremium(history, 1963, 'p')).toEqual({ factor: 1.1, place: 3, year: 1960 });
    expect(ballonDorPremium(history, 1964, 'p')).toEqual({ factor: 1 });
    expect(ballonDorPremium(history, 1959, 'p')).toEqual({ factor: 1.2, place: 1, year: 1956 });
    expect(ballonDorPremium(history, 1960, 'y')).toEqual({ factor: 1.1, place: 3, year: 1959 });
    expect(ballonDorPremium(history, 1961, 'z')).toEqual({ factor: 1.1, place: 3, year: 1958 });
  });
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
