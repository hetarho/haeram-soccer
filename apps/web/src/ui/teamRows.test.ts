import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, type Position } from '../../../../packages/contracts/src/player';
import type { Manager, Player, Staff, World } from '../../../../packages/contracts/src/types';
import { academyRows, coachRows, firstTeamRows, listCoaches, listPlayers } from './teamRows';
import { CLUB_POSTS as COACH_POSTS } from '../../../../packages/engine/src/staff-info';

/** Synthetic people only: no engine world, catalog or progression. */
function player(id: string, name: string, position: Position, extra: Partial<Player> = {}) {
  return {
    id,
    name,
    position,
    positions: { [position]: 3 },
    born: 1930,
    attrs: Object.fromEntries(ATTRIBUTES.map((key) => [key, 60])),
    potential: 70.4,
    fatigue: 12.6,
    wage: '1200',
    until: 1953,
    status: 'active',
    ...extra,
  } as unknown as Player;
}
const manager = (extra: Partial<Manager> = {}) =>
  ({
    id: 'm1',
    name: '김감독',
    ability: 61.6,
    wage: '3000',
    until: 1952,
    interim: false,
    ...extra,
  }) as Manager;
const coach = (role: Staff['role'], name: string, extra: Partial<Staff> = {}) =>
  ({
    id: `s-${role}`,
    role,
    name,
    ability: 55,
    wage: '0',
    since: 1950,
    until: 1951,
    ...extra,
  }) as Staff;
function world(extra: Partial<World> = {}) {
  return {
    year: 1951,
    round: 2,
    calendar: { day: 10 },
    players: [],
    manager: manager(),
    ...extra,
  } as unknown as World;
}

describe("팀's first team and academy rows (→WEB-112)", () => {
  const w = world({
    players: [
      player('p1', '박공격', 'ST', { loanUntil: 1952 }),
      player('p2', '이수비', 'CB', { injury: { year: 1951, day: 15, label: '발목' } }),
      player('p3', '최떠남', 'GK', { status: 'sold' }),
      player('p4', '정은퇴', 'CM', { status: 'retired' }),
      player('p5', '강불만', 'GK', {
        unhappy: { reason: 'renewal-declined', year: 1951, day: 3 },
        born: 1925,
      }),
    ],
    academy: {
      players: [
        player('y1', '한유망', 'LW', { born: 1935, potential: 81, developed: 42 }),
        player('y2', '오기대', 'DM', { born: 1934, potential: 74 }),
      ],
    },
  });

  it('reads only our active players, with their actual loan, injury and contract facts', () => {
    const rows = firstTeamRows(w);
    expect(rows.map((row) => row.id)).toEqual(['p1', 'p2', 'p5']);
    expect(rows[0]).toMatchObject({
      name: '박공격',
      position: 'ST',
      age: 21,
      potential: 70,
      fatigue: 13,
      wage: '1200',
      until: 1953,
      loan: true,
      unhappy: false,
    });
    expect(rows[0]).not.toHaveProperty('injuryDays');
    expect(rows[1]).toMatchObject({ loan: false, injuryDays: 5 });
    expect(rows[2]).toMatchObject({ unhappy: true, age: 26 });
    // An older save without recorded growth shows none rather than zero.
    expect(rows[0]).not.toHaveProperty('developed');
    expect(rows.every((row) => Number.isInteger(row.ovr))).toBe(true);
  });

  it('reads prospects only from the academy, never the first team', () => {
    expect(academyRows(w).map((row) => row.id)).toEqual(['y1', 'y2']);
    expect(academyRows(w)[0]).toMatchObject({ age: 16, potential: 81, developed: 42 });
    expect(academyRows(world())).toEqual([]);
  });

  it('searches names and sorts by position line, ability, potential, age or name', () => {
    const rows = firstTeamRows(w);
    expect(listPlayers(rows, '', 'position').map((row) => row.position)).toEqual([
      'GK',
      'CB',
      'ST',
    ]);
    expect(listPlayers(rows, '', 'age').map((row) => row.id)).toEqual(['p1', 'p2', 'p5']);
    expect(listPlayers(rows, '', 'name').map((row) => row.name)).toEqual([
      '강불만',
      '박공격',
      '이수비',
    ]);
    expect(listPlayers(rows, ' 수비 ', 'ovr').map((row) => row.id)).toEqual(['p2']);
    expect(listPlayers(rows, '없는이름', 'ovr')).toEqual([]);
    expect(listPlayers(academyRows(w), '', 'potential').map((row) => row.id)).toEqual(['y1', 'y2']);
    // Sorting never reorders the source.
    expect(rows.map((row) => row.id)).toEqual(['p1', 'p2', 'p5']);
  });
});

describe("팀's coaches (→WEB-112)", () => {
  const label = (post: string) => (post === 'manager' ? '감독' : post);

  it('lists the manager and all eight posts, a vacancy without a person', () => {
    const rows = coachRows(
      world({
        staff: [
          coach('assistant', '조수석', { ability: 70, born: 1910, wage: '900' }),
          coach('scout', '나스카'),
        ],
      }),
    );
    expect(rows.map((row) => row.post)).toEqual(COACH_POSTS);
    expect(COACH_POSTS).toEqual([
      'manager',
      'director',
      'scout',
      'assistant',
      'attack',
      'defense',
      'goalkeeping',
      'fitness',
      'youth',
    ]);
    expect(rows[0].coach).toMatchObject({ name: '김감독', ability: 62, interim: false });
    // The founding manager and volunteers have no recorded age or potential.
    expect(rows[0].coach).not.toHaveProperty('age');
    expect(rows[0].coach).not.toHaveProperty('potential');
    expect(rows.find((row) => row.post === 'assistant')?.coach).toMatchObject({
      name: '조수석',
      age: 41,
      wage: '900',
    });
    expect(rows.find((row) => row.post === 'scout')?.coach).not.toHaveProperty('age');
    for (const post of ['director', 'attack', 'defense', 'goalkeeping', 'fitness', 'youth'])
      expect(rows.find((row) => row.post === post)).toEqual({ post });
  });

  it('marks an interim manager and keeps his retained person for the career link', () => {
    const [row] = coachRows(world({ manager: manager({ interim: true, person: 'person-7' }) }));
    expect(row.coach).toMatchObject({ interim: true, person: 'person-7' });
  });

  it('searches people and posts; other orders put vacancies last in post order', () => {
    const rows = coachRows(
      world({ staff: [coach('youth', '가육성', { ability: 80 }), coach('scout', '나스카')] }),
    );
    expect(listCoaches(rows, '', 'post', label)).toEqual(rows);
    expect(listCoaches(rows, '', 'ability', label).map((row) => row.post)).toEqual([
      'youth',
      'manager',
      'scout',
      'director',
      'assistant',
      'attack',
      'defense',
      'goalkeeping',
      'fitness',
    ]);
    expect(
      listCoaches(rows, '', 'name', label)
        .map((row) => row.post)
        .slice(0, 3),
    ).toEqual(['youth', 'manager', 'scout']);
    expect(listCoaches(rows, '나스', 'post', label).map((row) => row.post)).toEqual(['scout']);
    expect(listCoaches(rows, 'fitness', 'post', label)).toEqual([{ post: 'fitness' }]);
  });
});
