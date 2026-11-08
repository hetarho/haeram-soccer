import type { Position } from '../../../../../../packages/contracts/src/player';
import { POSITIONS } from '../../../../../../packages/contracts/src/player';
import type { Player, StaffRole, World } from '../../../../../../packages/contracts/src/types';
import { injuryDaysLeft, overall } from '../../../../../../packages/engine/src/player-state';
import { CLUB_POSTS } from '../../../../../../packages/engine/src/staff-info';

/**
 * Pure reads behind 팀's compact lists (→WEB-112): our actual first team, academy prospects and
 * coaching posts, each searched and sorted locally. Only facts the world holds are read; a fact
 * an older save or a volunteer lacks stays absent, never zero.
 */
export interface TeamPlayerRow {
  id: string;
  name: string;
  position: Position;
  age: number;
  ovr: number;
  potential: number;
  fatigue: number;
  wage: string;
  /** Season year whose close ends his contract. */
  until: number;
  loan: boolean;
  /** Days still out injured; absent when fit. */
  injuryDays?: number;
  unhappy: boolean;
  /** Mean attribute growth so far, in hundredths; absent in older saves. */
  developed?: number;
}
export interface TeamCoach {
  name: string;
  ability: number;
  potential?: number;
  /** Absent for volunteers and older saves. */
  age?: number;
  wage: string;
  until: number;
  /** The interim manager holds the post until one is appointed. */
  interim: boolean;
  /** The retained person whose career the coach link opens (→WEB-78). */
  person?: string;
}
export interface TeamCoachRow {
  /** 'manager' or the staff post. */
  post: 'manager' | StaffRole;
  /** Absent when the post is vacant: a vacancy is never shown as a person. */
  coach?: TeamCoach;
}

export const PLAYER_SORTS = ['position', 'ovr', 'age', 'name'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];
export const ACADEMY_SORTS = ['potential', 'ovr', 'age', 'name'] as const;
export type AcademySort = (typeof ACADEMY_SORTS)[number];
export const COACH_SORTS = ['post', 'ability', 'name'] as const;
export type CoachSort = (typeof COACH_SORTS)[number];

function playerRow(w: World, p: Player): TeamPlayerRow {
  const injury = injuryDaysLeft(w, p);
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    age: w.year - p.born,
    ovr: overall(p),
    potential: Math.round(p.potential),
    fatigue: Math.round(p.fatigue),
    wage: p.wage,
    until: p.until,
    loan: p.loanUntil !== undefined,
    ...(injury > 0 ? { injuryDays: injury } : {}),
    unhappy: !!p.unhappy,
    ...(p.developed !== undefined ? { developed: p.developed } : {}),
  };
}

/** Our first team: active players of our club, those with us on loan included. */
export function firstTeamRows(w: World): TeamPlayerRow[] {
  return w.players.filter((p) => p.status === 'active').map((p) => playerRow(w, p));
}
/** Our academy's prospects, who are not first-team players until promoted. */
export function academyRows(w: World): TeamPlayerRow[] {
  return (w.academy?.players ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => playerRow(w, p));
}
/** The manager and every supported staff post, a vacant one without a person. */
export function coachRows(w: World): TeamCoachRow[] {
  const staff = new Map((w.staff ?? []).map((member) => [member.role, member]));
  return CLUB_POSTS.map((post) => {
    if (post === 'manager') {
      const m = w.manager;
      return {
        post,
        coach: {
          name: m.name,
          ability: Math.round(m.ability),
          ...(m.potential !== undefined ? { potential: Math.round(m.potential) } : {}),
          ...(m.born !== undefined ? { age: w.year - m.born } : {}),
          wage: m.wage,
          until: m.until,
          interim: m.interim,
          ...(m.person ? { person: m.person } : {}),
        },
      };
    }
    const member = staff.get(post);
    if (!member) return { post };
    return {
      post,
      coach: {
        name: member.name,
        ability: Math.round(member.ability),
        ...(member.potential !== undefined ? { potential: Math.round(member.potential) } : {}),
        ...(member.born !== undefined ? { age: w.year - member.born } : {}),
        wage: member.wage,
        until: member.until,
        interim: false,
        ...(member.person ? { person: member.person } : {}),
      },
    };
  });
}

const matches = (name: string, query: string) =>
  !query.trim() || name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
const byName = (a: { name: string; id?: string }, b: { name: string; id?: string }) =>
  a.name.localeCompare(b.name, 'ko') || (a.id ?? '').localeCompare(b.id ?? '');
const positionIndex = (position: Position) => POSITIONS.indexOf(position);

/** First-team or academy rows by name search and sort; ties fall to the stable player ID. */
export function listPlayers(
  rows: readonly TeamPlayerRow[],
  query: string,
  sort: PlayerSort | AcademySort,
): TeamPlayerRow[] {
  const listed = rows.filter((row) => matches(row.name, query));
  const order: Record<PlayerSort | AcademySort, (a: TeamPlayerRow, b: TeamPlayerRow) => number> = {
    position: (a, b) =>
      positionIndex(a.position) - positionIndex(b.position) || b.ovr - a.ovr || byName(a, b),
    ovr: (a, b) => b.ovr - a.ovr || b.potential - a.potential || byName(a, b),
    potential: (a, b) => b.potential - a.potential || b.ovr - a.ovr || byName(a, b),
    age: (a, b) => a.age - b.age || b.ovr - a.ovr || byName(a, b),
    name: byName,
  };
  return listed.sort(order[sort]);
}
/**
 * Coach rows by search (a person's name or the post's label) and sort. A vacancy keeps its post's
 * place in the post order and follows every person in the other orders.
 */
export function listCoaches(
  rows: readonly TeamCoachRow[],
  query: string,
  sort: CoachSort,
  label: (post: TeamCoachRow['post']) => string,
): TeamCoachRow[] {
  const listed = rows.filter(
    (row) => matches(label(row.post), query) || (!!row.coach && matches(row.coach.name, query)),
  );
  if (sort === 'post') return listed;
  const vacant = (row: TeamCoachRow) => (row.coach ? 0 : 1);
  const compare = (a: TeamCoach, b: TeamCoach) =>
    sort === 'ability' ? b.ability - a.ability : a.name.localeCompare(b.name, 'ko');
  return listed
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        vacant(a.row) - vacant(b.row) ||
        (a.row.coach && b.row.coach ? compare(a.row.coach, b.row.coach) : 0) ||
        a.index - b.index,
    )
    .map(({ row }) => row);
}
