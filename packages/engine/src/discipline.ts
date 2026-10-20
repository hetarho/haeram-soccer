import type {
  Ban,
  CompetitionKey,
  DisciplineState,
  Fixture,
  MatchRecord,
  Player,
  World,
} from '../../contracts/src/types';
import { dayCountedFrom } from './calendar';
import { pushInbox } from './inbox';
import { addEvent, isInjured } from './world';

/**
 * Cards, suspensions and the injuries of clubs nobody owns (→MATCH-19, →LEAGUE-15): one
 * English-style rule for every league and era (docs/MATCH-ENGINE-DESIGN.md §13.3).
 */

/** The competition a card or a ban counts in. */
export function competitionOf(f: Pick<Fixture, 'kind' | 'groupKey'>): CompetitionKey {
  return f.kind === 'cup' ? `cup:${f.groupKey}` : f.kind === 'europe' ? 'europe' : 'league';
}
/** Whether a ban's scope covers a competition: domestic is the league and every cup. */
const covers = (scope: Ban['scope'], competition: CompetitionKey) =>
  scope === competition || (scope === 'domestic' && competition !== 'europe');
/** Matches banned for a red card, by its reason. */
const RED_BAN: Partial<Record<Ban['reason'], number>> = {
  secondYellow: 1,
  dogso: 1,
  dissent: 2,
  serious: 3,
  violent: 3,
};
/** Every 3rd yellow in a cup competition, domestic or continental, bans for its next match. */
const CUP_YELLOWS = 3;

function state(w: World): DisciplineState {
  return (w.discipline ??= { year: w.year, yellows: {}, bans: [], out: [] });
}
/** A club's league fixtures this season, and how many of them come up to `round`. */
function leagueRounds(w: World, club: string, round: number) {
  let rounds = 0,
    reached = 0;
  for (const f of w.fixtures)
    if (
      f.year === w.year &&
      (f.kind === 'league' || f.kind === 'lower') &&
      (f.home === club || f.away === club)
    ) {
      rounds++;
      if (f.round <= round) reached++;
    }
  return { rounds, reached };
}
/** Matches banned when a player's league yellows reach `count` at the club's `reached`th match. */
function leagueYellowBan(count: number, reached: number, rounds: number) {
  if (count === 5 && reached <= Math.ceil(rounds / 2)) return 1;
  if (count === 10 && reached <= Math.round(0.84 * rounds)) return 2;
  return count === 15 ? 3 : 0;
}
const SCOPE_LABEL = (scope: Ban['scope']) =>
  scope === 'domestic'
    ? '국내 대회'
    : scope === 'league'
      ? '리그'
      : scope === 'europe'
        ? '유럽 대회'
        : '컵 대회';
const REASON_LABEL: Record<Ban['reason'], string> = {
  yellows: '경고 누적',
  secondYellow: '경고 누적 퇴장',
  dogso: '득점 기회 저지 퇴장',
  dissent: '항의·폭언 퇴장',
  serious: '심한 반칙 퇴장',
  violent: '폭력 행위 퇴장',
  reckless: '퇴장',
  tactical: '퇴장',
};

function ban(w: World, next: Ban) {
  state(w).bans.push(next);
  if (next.club !== w.playerClub) return;
  const p = w.players.find((player) => player.id === next.player);
  if (!p) return;
  const text = `${p.name} 출장 정지 ${next.matches}경기 (${SCOPE_LABEL(next.scope)}) — ${REASON_LABEL[next.reason]}`;
  addEvent(w, 'suspension', text, `${p.position} · 감독이 다른 선수로 선발을 짜요.`);
  pushInbox(w, {
    kind: 'staff-report',
    title: `징계 통보: ${text}`,
    detail: `${p.position} · 다음 ${next.matches}경기(${SCOPE_LABEL(next.scope)})에 나설 수 없어요. 감독이 다른 선수로 선발을 짜요.`,
    attention: false,
    ref: p.id,
  });
}

/**
 * Turns a recorded fixture's cards into yellow counts and bans. Called once per fixture, after
 * `serveBans` for the same fixture, so a ban never counts the match that produced it.
 */
export function applyDiscipline(w: World, record: MatchRecord) {
  const cards = record.incidents?.filter((x) => x.kind !== 'sub' && x.kind !== 'injury');
  if (!cards?.length) return;
  const competition = competitionOf(record);
  const d = state(w);
  for (const card of cards) {
    const club = card.side === 0 ? record.home : record.away;
    if (card.kind === 'yellow' || card.kind === 'secondYellow') {
      // A second yellow counts towards accumulation too (→MATCH-19).
      const counts = (d.yellows[card.player] ??= {});
      const count = (counts[competition] = (counts[competition] ?? 0) + 1);
      let matches = 0;
      if (competition === 'league') {
        const { rounds, reached } = leagueRounds(w, club, record.round);
        matches = leagueYellowBan(count, reached, rounds);
      } else if (count % CUP_YELLOWS === 0) matches = 1;
      if (matches)
        ban(w, { player: card.player, club, matches, scope: competition, reason: 'yellows' });
    }
    if (card.kind === 'secondYellow' || card.kind === 'red') {
      const reason: Ban['reason'] =
        card.kind === 'secondYellow' ? 'secondYellow' : (card.reason ?? 'serious');
      ban(w, {
        player: card.player,
        club,
        matches: RED_BAN[reason] ?? 1,
        // A red card bans in every domestic competition, or in Europe for a European red.
        scope: competition === 'europe' ? 'europe' : 'domestic',
        reason,
      });
    }
  }
}

/** Every earlier ban of both clubs that covers this fixture's competition serves one match. */
export function serveBans(w: World, f: Fixture) {
  const d = w.discipline;
  if (!d?.bans.length) return;
  const competition = competitionOf(f);
  d.bans = d.bans.flatMap((b) =>
    (b.club === f.home || b.club === f.away) && covers(b.scope, competition)
      ? b.matches > 1
        ? [{ ...b, matches: b.matches - 1 }]
        : []
      : [b],
  );
}

/** Whether a player is banned for the fixture's competition. */
export function isBanned(w: World, id: string, f: Pick<Fixture, 'kind' | 'groupKey'>) {
  const bans = w.discipline?.bans;
  if (!bans?.length) return false;
  const competition = competitionOf(f);
  return bans.some((b) => b.player === id && covers(b.scope, competition));
}
/**
 * Injured (an own player's injury, another club's `out` entry) or banned for the fixture's
 * competition.
 */
export function isUnavailable(
  w: World,
  player: Player | string,
  club: string,
  f: Pick<Fixture, 'kind' | 'groupKey'>,
) {
  const id = typeof player === 'string' ? player : player.id;
  if (isBanned(w, id, f)) return true;
  if (club === w.playerClub) {
    const p = typeof player === 'string' ? w.players.find((x) => x.id === id) : player;
    return !!p && isInjured(w, p);
  }
  return !!w.discipline?.out.some(
    (o) => o.player === id && o.until.day - dayCountedFrom(w, o.until.year) > 0,
  );
}

/** Another club's player out injured for `days` from today (→LEAGUE-15). */
export function recordNpcInjury(w: World, player: string, club: string, days: number) {
  state(w).out.push({
    player,
    club,
    until: { year: w.year, day: dayCountedFrom(w, w.year) + days },
  });
}

/** One league yellow short of a ban that still applies at the club's next league match. */
export function yellowWarning(w: World, p: Player) {
  const count = w.discipline?.yellows[p.id]?.league ?? 0;
  if (count !== 4 && count !== 9 && count !== 14) return false;
  const next = w.fixtures
    .filter(
      (f) =>
        f.year === w.year &&
        !f.score &&
        (f.kind === 'league' || f.kind === 'lower') &&
        (f.home === w.playerClub || f.away === w.playerClub),
    )
    .reduce((first, f) => Math.min(first, f.round), Infinity);
  if (next === Infinity) return false;
  const { rounds, reached } = leagueRounds(w, w.playerClub, next);
  return leagueYellowBan(count + 1, reached, rounds) > 0;
}

/**
 * The season turns: yellow counts reset, other clubs' injuries go with their regenerated squads,
 * unserved bans carry over by player.
 */
export function closeDisciplineSeason(w: World) {
  const d = w.discipline;
  if (!d) return;
  d.year = w.year;
  d.yellows = {};
  d.out = [];
}
