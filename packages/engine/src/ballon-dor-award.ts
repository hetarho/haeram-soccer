import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The season close's Ballon d'Or (→PLAYER-27): the podium from the season's complete settled
 * aggregates (→HIST-17), and the bonus a won award pays under its contract clause (→CLUB-29).
 */
import type {
  BallonDorHonour,
  BallonDorPlace,
  Club,
  Position,
  SeasonArchive,
  World,
} from '../../contracts/src/types';
import { BALLON_DOR_CONFIG, ballonDorProduction } from './ballon-dor';
import { cupKey } from './competition-keys';
import { europeFinal } from './europe';
import { addEvent } from './events';
import { moneyLabel } from './finance';
import { M } from './grid/record';
import { groupKey, ranked as rankedClubs } from './league-fixtures';
import { overall } from './player-state';
import { compareIds, ratio } from './primitives';
import { debit } from './transactions';
import { squad } from './world';

/** A competition a club won, by fixture kind and, when it has one, its group key. */
interface Won {
  kind: string;
  groupKey?: string;
  club: string;
  honour: BallonDorHonour;
}
interface Candidate {
  id: string;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  appearances: number;
  /** Top-flight league appearances, the eligibility measure. */
  top: number;
  /** Top-flight clubs with an actual league contribution, for one best-finish bonus. */
  leagueClubs: Set<string>;
  /** The club of his last league contribution, else his last contribution. */
  club: string;
  /** `kind|groupKey|club` of every competition he played in for a club. */
  played: Set<string>;
}

/** What each club won this season: league titles, domestic cups and continental competitions. */
function seasonHonours(w: World, champions: SeasonArchive['champions']): Won[] {
  const won: Won[] = [];
  for (const entry of champions) {
    won.push({ kind: 'league', club: entry.club, honour: 'league' });
    if (entry.cup)
      won.push({ kind: 'cup', groupKey: cupKey(entry.country), club: entry.cup, honour: 'cup' });
  }
  for (const t of w.europe) {
    if (!t.winner || t.key === 'super') continue;
    if (t.key !== 'ucl') {
      won.push({ kind: 'europe', groupKey: t.key, club: t.winner, honour: 'continental' });
      continue;
    }
    won.push({ kind: 'europe', groupKey: t.key, club: t.winner, honour: 'europe' });
    const final = europeFinal(w, t);
    if (final)
      won.push({ kind: 'europe', groupKey: t.key, club: final.runnerUp, honour: 'europe-final' });
  }
  return won;
}

/** Every named participant's season over all competitions, under his stable identity. */
function candidates(w: World): Candidate[] {
  const clubs = new Map(w.clubs.map((club) => [club.id, club]));
  const players = new Map<string, Candidate>();
  for (const competition of w.npcSeason!.competitions) {
    for (const entry of competition.players) {
      let candidate = players.get(entry.id);
      if (!candidate)
        players.set(
          entry.id,
          (candidate = {
            id: entry.id,
            name: entry.name,
            position: entry.position,
            goals: 0,
            assists: 0,
            appearances: 0,
            top: 0,
            leagueClubs: new Set(),
            club: '',
            played: new Set(),
          }),
        );
      for (const part of entry.clubs) {
        candidate.goals += part.metrics[M.goals] ?? 0;
        candidate.assists += part.metrics[M.assists] ?? 0;
        candidate.appearances += part.appearances;
        if (!part.appearances) continue;
        const club = clubs.get(part.club);
        const league = competition.kind === 'league';
        if (league && club?.tier === 0 && !club.representative) {
          candidate.top += part.appearances;
          candidate.leagueClubs.add(part.club);
        }
        if (league || !candidate.club) candidate.club = part.club;
        candidate.played.add(`${competition.kind}|${competition.groupKey}|${part.club}`);
        if (league) candidate.played.add(`league||${part.club}`);
      }
    }
  }
  return [...players.values()];
}

/** Actual final places before promotion/relegation, using the same ordering as league titles. */
function leaguePlacePoints(w: World): Map<string, number> {
  const groups = new Map<string, Club[]>();
  for (const club of w.clubs) {
    if (club.tier !== 0 || club.representative) continue;
    const key = groupKey(club);
    const clubs = groups.get(key) ?? [];
    clubs.push(club);
    groups.set(key, clubs);
  }
  const points = new Map<string, number>();
  for (const clubs of groups.values())
    rankedClubs(w, clubs).forEach((club, index) => {
      if ((w.tables[club.id]?.played ?? 0) > 0)
        points.set(club.id, BALLON_DOR_CONFIG.leaguePlaces[index] ?? 0);
    });
  return points;
}

/**
 * Each club's eligible players in order of individual points (then OVR, then ID): the share of the
 * club's honours and place that each receives (→PLAYER-27), teammates splitting the votes.
 */
function clubShares(
  eligible: readonly { candidate: Candidate; ovr: number; individual: number }[],
): (club: string, id: string) => number {
  const shares = BALLON_DOR_CONFIG.shares;
  const order = [...eligible].sort(
    (a, b) =>
      b.individual - a.individual || b.ovr - a.ovr || compareIds(a.candidate.id, b.candidate.id),
  );
  const rank = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const { candidate } of order)
    for (const club of new Set([...candidate.played].map((key) => key.split('|')[2]!))) {
      const index = seen.get(club) ?? 0;
      seen.set(club, index + 1);
      rank.set(`${club}|${candidate.id}`, index);
    }
  return (club, id) => {
    const index = rank.get(`${club}|${id}`) ?? 0;
    return shares[Math.min(index, shares.length - 1)] ?? 1;
  };
}

/** His OVR at the close: our player's, else his club's squad's; none when he is found nowhere. */
function closingOvr(w: World, candidate: Candidate) {
  const own = w.players.find((p) => p.id === candidate.id);
  if (own) return overall(own);
  const club = w.clubs.find((entry) => entry.id === candidate.club);
  const player = club && squad(w, club).find((p) => p.id === candidate.id);
  return player ? overall(player) : undefined;
}

/**
 * The season's podium, winner first (→PLAYER-27), or nothing before 1955/56 or for a season whose
 * aggregates were not tracked from its first day. Read before the close moves any club or player.
 */
export function ballonDorPodium(
  w: World,
  champions: SeasonArchive['champions'],
): BallonDorPlace[] | undefined {
  const config = BALLON_DOR_CONFIG,
    stats = w.npcSeason;
  if (w.year < config.first || !stats || stats.year !== w.year) return undefined;
  if (stats.trackedFrom.day !== 1 || stats.trackedFrom.round !== 1) return undefined;
  const won = seasonHonours(w, champions);
  const finishes = leaguePlacePoints(w);
  const eligible = candidates(w)
    .filter((candidate) => candidate.top >= config.appearances)
    .map((candidate) => {
      const ovr = closingOvr(w, candidate) ?? 0;
      const individual =
        ballonDorProduction(candidate.goals, candidate.assists) +
        Math.max(0, ovr - config.classFrom) * config.classWeight;
      return { candidate, ovr, individual };
    });
  const share = clubShares(eligible);
  const ranked = eligible
    .map(({ candidate, ovr, individual }) => {
      // Each honour once, at his share of the club that won it with him.
      const credit = new Map<BallonDorHonour, number>();
      for (const entry of won) {
        if (!candidate.played.has(`${entry.kind}|${entry.groupKey ?? ''}|${entry.club}`)) continue;
        const value = config.honours[entry.honour] * share(entry.club, candidate.id);
        credit.set(entry.honour, Math.max(credit.get(entry.honour) ?? 0, value));
      }
      const place = Math.max(
        0,
        ...[...candidate.leagueClubs].map(
          (id) => (finishes.get(id) ?? 0) * share(id, candidate.id),
        ),
      );
      const team = [...credit.values()].reduce((sum, value) => sum + value, place);
      const points = Math.round(individual + team);
      return { candidate, honours: [...credit.keys()], ovr, points };
    })
    .sort(
      (a, b) => b.points - a.points || b.ovr - a.ovr || compareIds(a.candidate.id, b.candidate.id),
    )
    .slice(0, config.places);
  if (!ranked.length) return undefined;
  return ranked.map(({ candidate, honours, points }) => ({
    id: candidate.id,
    name: candidate.name,
    club: candidate.club,
    position: candidate.position,
    goals: candidate.goals,
    assists: candidate.assists,
    appearances: candidate.appearances,
    points,
    honours,
  }));
}

/**
 * A won award pays our player's Ballon d'Or bonus once (→CLUB-29): his clause's percent of the
 * yearly wage he is paid at the close, owed even when cash is short. Places 2 and 3, loans and
 * contracts without the clause pay nothing.
 */
export function payBallonDorBonus(w: World, podium: readonly BallonDorPlace[] | undefined) {
  const winner = podium?.[0];
  const p =
    winner && w.players.find((x) => x.id === winner.id && x.status === 'active' && !x.loanUntil);
  const percent = p?.clauses?.ballonDor;
  if (!p || !percent) return;
  const amount = ratio(p.wage, BigInt(percent), 100n);
  debit(w, amount, true);
  addEvent(
    w,
    'ballon-dor-bonus',
    sourceMessage('copy.ballon_dor_award.60f59909ad', { p0: p.name }),
    sourceMessage('copy.ballon_dor_award.63976aa959', { p0: moneyLabel(w, p.wage), p1: percent }),
    amount,
  );
}
