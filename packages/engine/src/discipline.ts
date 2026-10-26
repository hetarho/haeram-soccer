import type {
  Ban,
  Unavailable,
  CompetitionKey,
  DisciplineState,
  Fixture,
  MatchRecord,
  Player,
  World,
} from '../../contracts/src/types';
import { dayCountedFrom } from './calendar';
import { pushInbox } from './inbox';
import { addEvent } from './events';
import { isInjured } from './world';

/**
 * Cards, suspensions and the injuries of clubs nobody owns (→MATCH-19, →LEAGUE-15): one
 * English-style rule for every league and era (spec/ssot/MATCH.md).
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
/** Each club's league rounds of the season, gathered once per fixture list. */
const clubRounds = new WeakMap<Fixture[], Map<string, number[]>>();
/** A club's league fixtures this season, and how many of them come up to `round`. */
function leagueRounds(w: World, club: string, round: number) {
  let map = clubRounds.get(w.fixtures);
  if (!map) {
    map = new Map();
    for (const f of w.fixtures)
      if (f.year === w.year && (f.kind === 'league' || f.kind === 'lower'))
        for (const id of [f.home, f.away]) {
          const rounds = map.get(id);
          if (rounds) rounds.push(f.round);
          else map.set(id, [f.round]);
        }
    clubRounds.set(w.fixtures, map);
  }
  const rounds = map.get(club) ?? [];
  return { rounds: rounds.length, reached: rounds.filter((r) => r <= round).length };
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

/**
 * Bans by player and by club, and injury entries by player, kept in step with the state's lists;
 * rebuilt whenever a list was replaced from outside (a load, a season close).
 */
interface Index {
  bans: Ban[];
  out: Unavailable[];
  byPlayer: Map<string, Ban[]>;
  byClub: Map<string, Ban[]>;
  outBy: Map<string, Unavailable[]>;
}
const indexes = new WeakMap<DisciplineState, Index>();
function add<T>(map: Map<string, T[]>, key: string, entry: T) {
  const rows = map.get(key);
  if (rows) rows.push(entry);
  else map.set(key, [entry]);
}
function drop<T>(map: Map<string, T[]>, key: string, entry: T) {
  const rows = map.get(key);
  if (!rows) return;
  rows.splice(rows.indexOf(entry), 1);
  if (!rows.length) map.delete(key);
}
function index(d: DisciplineState): Index {
  let ix = indexes.get(d);
  if (!ix || ix.bans !== d.bans || ix.out !== d.out) {
    ix = { bans: d.bans, out: d.out, byPlayer: new Map(), byClub: new Map(), outBy: new Map() };
    for (const b of d.bans) {
      add(ix.byPlayer, b.player, b);
      add(ix.byClub, b.club, b);
    }
    for (const o of d.out) add(ix.outBy, o.player, o);
    indexes.set(d, ix);
  }
  return ix;
}

function ban(w: World, next: Ban) {
  const d = state(w);
  const ix = index(d);
  d.bans.push(next);
  add(ix.byPlayer, next.player, next);
  add(ix.byClub, next.club, next);
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
        // Only a count at a threshold needs the club's rounds.
        if (count === 5 || count === 10 || count === 15) {
          const { rounds, reached } = leagueRounds(w, club, record.round);
          matches = leagueYellowBan(count, reached, rounds);
        }
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
  const ix = index(d);
  const competition = competitionOf(f);
  for (const club of [f.home, f.away])
    for (const b of [...(ix.byClub.get(club) ?? [])]) {
      if (!covers(b.scope, competition)) continue;
      if (--b.matches > 0) continue;
      d.bans.splice(d.bans.indexOf(b), 1);
      drop(ix.byPlayer, b.player, b);
      drop(ix.byClub, b.club, b);
    }
}

/** Whether a player is banned for the fixture's competition. */
export function isBanned(w: World, id: string, f: Pick<Fixture, 'kind' | 'groupKey'>) {
  const bans = w.discipline?.bans;
  if (!bans?.length) return false;
  const mine = index(w.discipline!).byPlayer.get(id);
  if (!mine) return false;
  const competition = competitionOf(f);
  return mine.some((b) => covers(b.scope, competition));
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
  const d = w.discipline;
  const mine = d?.out.length ? index(d).outBy.get(id) : undefined;
  return !!mine?.some((o) => o.until.day - dayCountedFrom(w, o.until.year) > 0);
}

/** Another club's player out injured for `days` from today (→LEAGUE-15). */
export function recordNpcInjury(w: World, player: string, club: string, days: number) {
  const d = state(w);
  const ix = index(d);
  const entry = { player, club, until: { year: w.year, day: dayCountedFrom(w, w.year) + days } };
  d.out.push(entry);
  add(ix.outBy, player, entry);
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
