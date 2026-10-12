import type {
  BracketArchive,
  CupFinal,
  Fixture,
  KnockoutRound,
  KnockoutTie,
  MatchPlayback,
  World,
} from '../../contracts/src/types';
import { compareIds, random } from './primitives';
import { simulateMatch } from './match';
import { recordMatch } from './season';
import { fixtureDay } from './calendar';

export type Settlement = (w: World, p: MatchPlayback) => void;

/** A fixture is due on its day, or, for whole-round jumps, once its round has been reached. */
export function isDue(w: World, f: Fixture, day?: number) {
  return !f.score && (day === undefined ? f.round <= w.round : fixtureDay(f) <= day);
}

/** Media name of a knockout round from the clubs it starts with: 결승, 4강, 8강 … or N라운드. */
export function roundLabel(clubs: number, index: number) {
  if (clubs === 2) return '결승';
  if (clubs <= 64 && (clubs & (clubs - 1)) === 0) return `${clubs}강`;
  return `${index + 1}라운드`;
}

/** Knockout rounds needed to find one winner among `n` clubs. */
export function roundsFor(n: number) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

/**
 * A first round that brings the field to a power of two: the strongest seeds (listed first) wait
 * for the next round, the rest play.
 */
export function splitByes(seeded: readonly string[]) {
  let size = 1;
  while (size * 2 <= seeded.length) size *= 2;
  if (size === seeded.length) return { playing: [...seeded], byes: [] as string[] };
  const byes = 2 * size - seeded.length;
  return { playing: seeded.slice(byes), byes: seeded.slice(0, byes) };
}

/** An open draw from the world's own stream; the first club drawn of each pair is at home. */
export function openDraw(w: World, clubs: readonly string[], key: string): KnockoutTie[] {
  const r = random(`${w.seed}:draw:${key}`);
  const pool = [...clubs].sort(compareIds);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ties: KnockoutTie[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) ties.push({ home: pool[i], away: pool[i + 1] });
  return ties;
}

/** Seeded pairing, best against worst; the better seed plays the (second) leg at home. */
export function seededDraw(seeded: readonly string[]): KnockoutTie[] {
  const ties: KnockoutTie[] = [];
  for (let i = 0; i < seeded.length / 2; i++)
    ties.push({ home: seeded[seeded.length - 1 - i], away: seeded[i] });
  return ties;
}

/** A tie's fixture ID; `year` reaches the fixtures of a season already closed. */
export function tieId(w: World, key: string, round: number, tie: number, year = w.year) {
  return `${year}:${key}:k${round}:${tie}`;
}

/** The fixtures of one tie: a single match, or a first leg and its return (a round later). */
export function tieFixtures(
  w: World,
  key: string,
  kind: Fixture['kind'],
  country: string,
  index: number,
  round: KnockoutRound,
  returnRound = round.round + 1,
): Fixture[] {
  return round.ties.flatMap((tie, t) => {
    const first: Fixture = {
      id: tieId(w, key, index, t),
      year: w.year,
      round: round.round,
      kind,
      home: tie.home,
      away: tie.away,
      country,
      groupKey: key,
    };
    return round.legs === 2
      ? [
          first,
          {
            ...first,
            id: `${first.id}:2`,
            round: returnRound,
            home: tie.away,
            away: tie.home,
          },
        ]
      : [first];
  });
}

/** The legs of tie `t` in round `index` of the `year` season, in playing order. */
export function legsOf(
  w: World,
  fixtures: readonly Fixture[],
  key: string,
  index: number,
  t: number,
  year = w.year,
) {
  const id = tieId(w, key, index, t, year);
  return fixtures
    .filter((f) => f.id === id || f.id === `${id}:2`)
    .sort((a, b) => a.round - b.round);
}

/** Plays one fixture through the shared match engine; the own club's playback is reported. */
export function playFixture(w: World, f: Fixture, settlement?: Settlement, observe = true) {
  if (f.score) return undefined;
  const own = f.home === w.playerClub || f.away === w.playerClub;
  const p = simulateMatch(w, f, observe && !!settlement && own, own);
  f.score = p.record.score;
  recordMatch(w, p);
  return p;
}

/**
 * Settles a tie once its legs are played: aggregate goals, then away goals while that rule lasted
 * (two-legged ties before 2021), then a shoot-out after extra time from the world's stream.
 */
export function decideTie(w: World, tie: KnockoutTie, legs: Fixture[], awayGoals: boolean) {
  if (tie.winner || !legs.length || legs.some((f) => !f.score)) return false;
  let home = 0,
    away = 0,
    homeAway = 0,
    awayAway = 0;
  for (const f of legs) {
    const hosted = f.home === tie.home;
    const forHome = hosted ? f.score!.home : f.score!.away,
      forAway = hosted ? f.score!.away : f.score!.home;
    home += forHome;
    away += forAway;
    if (hosted) awayAway += forAway;
    else homeAway += forHome;
  }
  if (home !== away) tie.winner = home > away ? tie.home : tie.away;
  else if (legs.length === 2 && awayGoals && homeAway !== awayAway) {
    tie.winner = homeAway > awayAway ? tie.home : tie.away;
    tie.decided = 'away';
  } else {
    const last = legs.at(-1)!;
    tie.winner = random(`${w.seed}:penalty:${last.id}`)() < 0.5 ? last.home : last.away;
    tie.decided = 'pens';
    // The stored own match keeps the shoot-out that settled it.
    const record = w.ownMatches.find((m) => m.id === last.id);
    if (record && !record.highlights.some((h) => h.player === '승부차기'))
      record.highlights.push({
        minute: 120,
        side: tie.winner === last.home ? 0 : 1,
        player: '승부차기',
        action: `승부차기 ${tie.winner === last.home ? '홈' : '원정'} 승리`,
      });
  }
  return true;
}

/** Aggregate score of a tie from the first-leg home side's view, for display. */
export function tieAggregate(tie: KnockoutTie, legs: readonly Fixture[]): [number, number] {
  return legs.reduce<[number, number]>(
    (sum, f) =>
      f.score
        ? f.home === tie.home
          ? [sum[0] + f.score.home, sum[1] + f.score.away]
          : [sum[0] + f.score.away, sum[1] + f.score.home]
        : sum,
    [0, 0],
  );
}

/** Clubs still standing after a fully decided round: seeded byes first, then the winners. */
export function survivors(round: KnockoutRound) {
  return [...(round.byes || []), ...round.ties.map((tie) => tie.winner!)];
}

export function roundDecided(round: KnockoutRound) {
  return round.ties.every((tie) => tie.winner);
}

/** The final of a finished bracket, for the season archive. */
export function finalOf(
  w: World,
  key: string,
  rounds: readonly KnockoutRound[],
  fixtures: readonly Fixture[],
): CupFinal | undefined {
  const index = rounds.length - 1,
    last = rounds[index];
  const tie = last?.ties.length === 1 ? last.ties[0] : undefined;
  if (!tie?.winner) return undefined;
  const legs = legsOf(w, fixtures, key, index, 0);
  const [home, away] = tieAggregate(tie, legs);
  const homeWon = tie.winner === tie.home;
  return {
    runnerUp: homeWon ? tie.away : tie.home,
    score: homeWon ? [home, away] : [away, home],
    ...(tie.decided === 'pens' ? { decided: 'pens' as const } : {}),
  };
}

/** Clubs an archived bracket starts from at most, as the live bracket tree does (→WEB-40). */
const ARCHIVED_FIELD = 32;

/**
 * A finished bracket for the season archive: from the first round of 32 clubs or fewer (byes
 * counted, qualifying rounds aside) through the final, as `BracketArchive` tie rows. Undefined
 * while any of those ties is undecided, so an archive never holds a half-played round.
 */
export function archivedRounds(
  w: World,
  key: string,
  rounds: readonly KnockoutRound[],
  fixtures: readonly Fixture[],
): BracketArchive['rounds'] | undefined {
  const index = new Map(w.clubs.map((club, i) => [club.id, i]));
  const kept = rounds
    .map((round, at) => ({ round, at }))
    .filter(({ round }) => !round.label.startsWith('예선'));
  const first = kept.findIndex(
    ({ round }) => 2 * round.ties.length + (round.byes?.length ?? 0) <= ARCHIVED_FIELD,
  );
  const final = kept.at(-1)?.round;
  if (first < 0 || final?.ties.length !== 1 || final.byes?.length) return undefined;
  const archived: BracketArchive['rounds'] = [];
  for (const { round, at } of kept.slice(first)) {
    const ties: number[][] = [];
    for (const [t, tie] of round.ties.entries()) {
      const legs = legsOf(w, fixtures, key, at, t),
        home = index.get(tie.home),
        away = index.get(tie.away);
      if (
        !tie.winner ||
        home === undefined ||
        away === undefined ||
        legs.length !== round.legs ||
        legs.some((f) => !f.score)
      )
        return undefined;
      const [leg1, leg2] = legs.map((f) => f.score!);
      ties.push([
        home,
        away,
        leg1.home,
        leg1.away,
        leg2?.home ?? 0,
        leg2?.away ?? 0,
        (tie.winner === tie.home ? 0 : 1) +
          (tie.decided === 'pens' ? 2 : tie.decided === 'away' ? 4 : 0),
      ]);
    }
    const byes = (round.byes || []).map((id) => index.get(id));
    if (byes.some((club) => club === undefined)) return undefined;
    archived.push({
      label: round.label,
      round: round.round,
      legs: round.legs,
      ties,
      ...(byes.length ? { byes: byes as number[] } : {}),
    });
  }
  return archived;
}

/**
 * The latest round the own club reached in a bracket: whether it went out there, is still in it,
 * or won the final.
 */
export function ownReached(w: World, rounds: readonly KnockoutRound[]) {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    const tie = round.ties.find((t) => t.home === w.playerClub || t.away === w.playerClub);
    if (tie)
      return {
        label: round.label,
        eliminated: !!tie.winner && tie.winner !== w.playerClub,
        champion: tie.winner === w.playerClub && round.ties.length === 1 && !round.byes?.length,
      };
    if (round.byes?.includes(w.playerClub))
      return { label: round.label, eliminated: false, champion: false };
  }
  return undefined;
}
