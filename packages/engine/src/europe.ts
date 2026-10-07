import type { World, EuropeTournament, Fixture } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { random, integer, compareIds, clamp } from './primitives';
import { addEvent, clubOf, findClub } from './world';
import { emptyTable, recordMatch, resolveTie } from './season';
import { simulateMatch } from './match';
import { credit } from './operations';
import { quote } from './world';
export interface Era {
  key: string;
  name: string;
  field: number;
  format: EuropeTournament['format'];
  games: number;
  qualifier?: number;
}
export function europeanEras(year: number): Era[] {
  const eras: Era[] = [];
  if (year >= 1955)
    eras.push({
      key: 'ucl',
      name: year < 1992 ? 'European Cup' : 'Champions League',
      field:
        year === 1955
          ? 16
          : year < 1994
            ? 32
            : year < 1997
              ? 16
              : year < 1999
                ? 24
                : year < 2024
                  ? 32
                  : 36,
      format:
        year < 1991
          ? 'knockout'
          : year < 1999
            ? 'groups'
            : year < 2003
              ? 'double-groups'
              : year < 2024
                ? 'groups'
                : 'league',
      games: year < 1991 ? 0 : year < 2024 ? 6 : 8,
      ...(year >= 1991 && year < 1994 ? { qualifier: 8 } : {}),
    });
  if (year >= 1971)
    eras.push({
      key: 'uel',
      name: year < 2009 ? 'UEFA Cup' : 'Europa League',
      field: year < 2004 ? 64 : year < 2009 ? 40 : year < 2021 ? 48 : year < 2024 ? 32 : 36,
      format: year < 2004 ? 'knockout' : year < 2024 ? 'groups' : 'league',
      games: year < 2004 ? 0 : year < 2009 ? 4 : year < 2024 ? 6 : 8,
    });
  if (year >= 2021)
    eras.push({
      key: 'uecl',
      name: year < 2024 ? 'Europa Conference League' : 'Conference League',
      field: year < 2024 ? 32 : 36,
      format: year < 2024 ? 'groups' : 'league',
      games: 6,
    });
  if (year >= 1960 && year <= 1998)
    eras.push({ key: 'cwc', name: 'Cup Winners Cup', field: 32, format: 'knockout', games: 0 });
  return eras;
}
export function ensureRepresentatives(w: World) {
  if (w.clubs.some((c) => c.id === 'euro:0')) return;
  const places = [
    'AUT',
    'SCO',
    'SUI',
    'TUR',
    'GRE',
    'POL',
    'CZE',
    'DEN',
    'SWE',
    'NOR',
    'ROU',
    'CRO',
    'SRB',
    'UKR',
    'FIN',
    'HUN',
  ];
  for (let i = 0; i < 160; i++) {
    const r = random(`${w.seed}:euro:${i}`),
      code = places[i % places.length];
    w.clubs.push({
      id: `euro:${i}`,
      country: code,
      name: `${code} ${['Railway', 'Riverside', 'Harbour', 'Foundry'][Math.floor(i / places.length) % 4]} ${Math.floor(i / places.length) + 1}`,
      short: `${code}${Math.floor(i / places.length) + 1}`,
      tier: 0,
      group: 0,
      strength: integer(r, 50, 84),
      reputation: integer(r, 30, 75),
      fans: integer(r, 3000, 40000),
      color: '#456b73',
      representative: true,
    });
    w.tables[`euro:${i}`] = emptyTable();
  }
}
function order(w: World, code: string) {
  const last = w.history.at(-1);
  if (last)
    return last.standings
      .filter((row) => w.clubs[row[0]].country === code && row[1] === 0)
      .sort(
        (a, b) =>
          b[3] - a[3] ||
          b[4] - b[5] - (a[4] - a[5]) ||
          b[4] - a[4] ||
          compareIds(w.clubs[a[0]].id, w.clubs[b[0]].id),
      )
      .map((row) => w.clubs[row[0]].id);
  return w.clubs
    .filter((c) => c.country === code && c.tier === 0 && !c.representative)
    .sort((a, b) => b.strength - a.strength || compareIds(a.id, b.id))
    .map((c) => c.id);
}
function fixture(
  w: World,
  t: EuropeTournament,
  home: string,
  away: string,
  label: string,
  round: number,
): Fixture {
  return {
    id: `${w.year}:${t.key}:${label}`,
    year: w.year,
    round,
    kind: 'europe',
    home,
    away,
    country: 'UEFA',
    groupKey: t.key,
  };
}
export function leaguePhasePairs(ids: string[], games: number) {
  if (ids.length !== 36 || ![6, 8].includes(games)) throw new Error('36팀 리그 페이즈 설정 오류');
  const result: [string, string, number][] = [];
  // Balanced circulant graph: each opponent unique, exactly games/2 at home and away.
  for (let shift = 1; shift <= games / 2; shift++)
    for (let i = 0; i < ids.length; i++)
      result.push([ids[i], ids[(i + shift) % ids.length], shift * 2 - (i % 2)]);
  return result;
}
function groupPairs(ids: string[], size: number, double: boolean) {
  const result: [string, string, number][] = [];
  for (let g = 0; g < ids.length; g += size) {
    const ring: (string | null)[] = ids.slice(g, g + size);
    if (ring.length % 2) ring.push(null);
    const n = ring.length;
    for (let r = 0; r < (n - 1) * (double ? 2 : 1); r++) {
      for (let i = 0; i < n / 2; i++) {
        let a = ring[i],
          b = ring[n - 1 - i];
        if (!a || !b) continue;
        if (((r % (n - 1)) % 2 === 1) !== r >= n - 1) [a, b] = [b, a];
        result.push([a, b, r + 1]);
      }
      ring.splice(1, 0, ring.pop()!);
    }
  }
  return result;
}
function play(w: World, t: EuropeTournament, f: Fixture) {
  if (f.score) return;
  const own = f.home === w.playerClub || f.away === w.playerClub;
  const p = simulateMatch(w, f, false, own);
  f.score = p.record.score;
  recordMatch(w, p);
  for (const [id, gf, ga] of [
    [f.home, f.score.home, f.score.away],
    [f.away, f.score.away, f.score.home],
  ] as [string, number, number][]) {
    const row = t.standings[id];
    row.played++;
    row.gf += gf;
    row.ga += ga;
    if (gf > ga) {
      row.won++;
      row.points += 3;
    } else if (gf === ga) {
      row.drawn++;
      row.points++;
    } else row.lost++;
  }
  if (own) {
    credit(
      w,
      quote(
        clubOf(w).country,
        w.year,
        35 +
          (p.record.score.home === p.record.score.away
            ? 10
            : (f.home === w.playerClub ? f.score.home > f.score.away : f.score.away > f.score.home)
              ? 25
              : 0),
      ),
    );
    clubOf(w).reputation = clamp(clubOf(w).reputation + 0.2);
  }
}
function knockout(w: World, t: EuropeTournament, ids: string[], label: string, until = 1) {
  let next = ids,
    stage = 0;
  while (next.length > until) {
    const winners: string[] = [];
    for (let i = 0; i < next.length; i += 2) {
      if (!next[i + 1]) {
        winners.push(next[i]);
        continue;
      }
      const f = fixture(w, t, next[i], next[i + 1], `${label}:${stage}:${i}`, 47 + stage);
      t.fixtures.push(f);
      const winner = resolveTie(w, f);
      const stored = w.ownMatches.find((m) => m.id === f.id);
      f.score = stored?.score || simulateMatch(w, f).record.score;
      winners.push(winner);
      if (f.home === w.playerClub || f.away === w.playerClub) {
        credit(w, quote(clubOf(w).country, w.year, 60));
        if (winner !== w.playerClub) t.ownExit = `${label} ${next.length}강`;
      }
    }
    next = winners;
    stage++;
  }
  return next;
}
export function prepareEurope(w: World) {
  ensureRepresentatives(w);
  w.europe = [];
  const occupied = new Set<string>();
  for (const era of europeanEras(w.year).sort(
    (a, b) =>
      ['ucl', 'cwc', 'uel', 'uecl'].indexOf(a.key) - ['ucl', 'cwc', 'uel', 'uecl'].indexOf(b.key),
  )) {
    let eligible: string[] = [];
    for (const c of COUNTRIES) {
      const table = order(w, c.code),
        cup = w.lastChampions.find((ch) => ch.country === c.code)?.cup;
      if (era.key === 'ucl') eligible.push(...table.slice(0, w.year >= 1997 ? 2 : 1));
      else if (era.key === 'cwc') eligible.push(cup || table[1]);
      else if (era.key === 'uel')
        eligible.push(
          ...(w.year >= 1999 && cup ? [cup] : []),
          ...table.slice(w.year >= 1997 ? 2 : 1, w.year >= 1997 ? 4 : 3),
        );
      else eligible.push(...table.slice(4, 5));
    }
    const background = w.clubs
      .filter((c) => c.id.startsWith('euro:'))
      .sort(
        (a, b) =>
          random(`${w.seed}:${w.year}:${a.id}`)() - random(`${w.seed}:${w.year}:${b.id}`)() ||
          compareIds(a.id, b.id),
      )
      .map((c) => c.id);
    eligible = [...new Set([...eligible, ...background])]
      .filter((id) => id && !occupied.has(id))
      .slice(0, era.field);
    if (eligible.length !== era.field) throw new Error('유럽대회 참가팀 부족');
    eligible.forEach((id) => occupied.add(id));
    const t: EuropeTournament = {
      ...era,
      stage: era.format === 'knockout' ? '토너먼트 대기' : '리그/조별 단계',
      clubs: eligible,
      fixtures: [],
      standings: Object.fromEntries(eligible.map((id) => [id, emptyTable()])),
    };
    w.europe.push(t);
    const phase = era.qualifier ? knockout(w, t, eligible, '예선', era.qualifier) : eligible;
    if (era.format !== 'knockout') {
      const pairs =
        era.format === 'league'
          ? leaguePhasePairs(phase, era.games)
          : groupPairs(phase, era.games === 4 ? 5 : 4, era.games !== 4);
      for (let i = 0; i < pairs.length; i++) {
        const [a, b, r] = pairs[i];
        t.fixtures.push(
          fixture(
            w,
            t,
            a,
            b,
            `phase:${i}`,
            5 + Math.floor(((r - 1) * 36) / Math.max(1, era.games - 1)),
          ),
        );
      }
    }
    if (eligible.includes(w.playerClub))
      addEvent(
        w,
        'europe-qualification',
        `${t.name} 참가`,
        '지난 시즌 리그/컵 성적에 따른 데모 배분 · 실제 UEFA 접근 목록을 단순화했습니다.',
      );
  }
}
export function advanceEurope(w: World) {
  for (const t of w.europe)
    for (const f of t.fixtures) if (!f.score && f.round <= w.round) play(w, t, f);
}
function sorted(t: EuropeTournament, ids: string[]) {
  return [...ids].sort((a, b) => {
    const x = t.standings[a],
      y = t.standings[b];
    return y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || compareIds(a, b);
  });
}
export function finishEurope(w: World) {
  for (const t of w.europe) {
    for (const f of t.fixtures) if (!f.score) play(w, t, f);
    if (t.format !== 'knockout') t.firstStandings = phaseRows(w, t, t.clubs);
    let qualified = t.clubs;
    if (t.format === 'league') {
      const table = sorted(t, t.clubs);
      qualified = [
        ...table.slice(0, 8),
        ...knockout(w, t, table.slice(8, 24), '리그 페이즈 플레이오프', 8),
      ];
      if (table.slice(24).includes(w.playerClub)) t.ownExit = '리그 페이즈 탈락';
    } else if (t.format !== 'knockout') {
      const phaseIds = [
        ...new Set(
          t.fixtures.filter((f) => f.id.includes(':phase:')).flatMap((f) => [f.home, f.away]),
        ),
      ];
      const size = t.games === 4 ? 5 : 4;
      qualified = [];
      for (let i = 0; i < phaseIds.length; i += size) {
        // Recover seeded group membership from the initial order, not fixture iteration.
        const members = t.clubs.filter((id) => phaseIds.includes(id));
        qualified.push(
          ...sorted(t, members.slice(i, i + size)).slice(
            0,
            t.field === 40 ? 3 : t.field === 16 || t.field >= 32 ? 2 : 1,
          ),
        );
      }
      if (t.clubs.length === 24)
        qualified.push(
          ...sorted(
            t,
            t.clubs.filter((id) => !qualified.includes(id)),
          ).slice(0, 2),
        );
      if (t.clubs.includes(w.playerClub) && !qualified.includes(w.playerClub))
        t.ownExit = '조별 단계 탈락';
      if (t.format === 'double-groups') {
        const second = qualified.slice(0, 16);
        for (const id of second) t.standings[id] = emptyTable();
        const pairs = groupPairs(second, 4, true);
        pairs.forEach(([a, b, r], i) => {
          const f = fixture(w, t, a, b, `second:${i}`, 47 + r);
          t.fixtures.push(f);
          play(w, t, f);
        });
        t.secondStandings = phaseRows(w, t, second);
        qualified = [];
        for (let i = 0; i < second.length; i += 4)
          qualified.push(...sorted(t, second.slice(i, i + 4)).slice(0, 2));
      }
    }
    t.winner = knockout(w, t, qualified, '본선')[0];
    t.stage = '우승 확정';
    if (t.format === 'knockout') {
      for (const id of t.clubs) t.standings[id] = emptyTable();
      for (const f of t.fixtures)
        if (f.score)
          for (const [id, gf, ga] of [
            [f.home, f.score.home, f.score.away],
            [f.away, f.score.away, f.score.home],
          ] as [string, number, number][]) {
            const row = t.standings[id];
            row.played++;
            row.gf += gf;
            row.ga += ga;
            if (gf > ga) {
              row.won++;
              row.points += 3;
            } else if (gf === ga) {
              row.drawn++;
              row.points++;
            } else row.lost++;
          }
      t.firstStandings = phaseRows(w, t, t.clubs);
    }
    if (t.winner === w.playerClub) {
      credit(w, quote(clubOf(w).country, w.year, 500));
      clubOf(w).reputation = clamp(clubOf(w).reputation + 8);
      addEvent(
        w,
        'europe-honor',
        `${t.name} 우승`,
        `${w.year}/${String(w.year + 1).slice(2)} · 유럽의 정상`,
      );
    }
  }
  if (w.year >= 1973) {
    const ucl = w.europe.find((t) => t.key === 'ucl')?.winner,
      other = w.europe.find((t) => t.key === (w.year < 1999 ? 'cwc' : 'uel'))?.winner;
    if (ucl && other && ucl !== other) {
      const t: EuropeTournament = {
        key: 'super',
        name: 'UEFA Super Cup',
        field: 2,
        format: 'knockout',
        games: 1,
        stage: '우승 확정',
        clubs: [ucl, other],
        fixtures: [],
        standings: { [ucl]: emptyTable(), [other]: emptyTable() },
      };
      t.winner = knockout(w, t, [ucl, other], '슈퍼컵')[0];
      w.europe.push(t);
    }
  }
}
export const continentalClub = findClub;

export function europeanCoefficient(w: World) {
  return w.ownMatches
    .filter((m) => m.kind === 'europe' && m.year >= w.year - 5)
    .reduce((sum, m) => {
      const own = m.home === w.playerClub ? m.score.home : m.score.away,
        opponent = m.home === w.playerClub ? m.score.away : m.score.home;
      return sum + (own > opponent ? 2 : own === opponent ? 1 : 0);
    }, 0);
}

function phaseRows(w: World, t: EuropeTournament, ids: string[]) {
  return sorted(t, ids).map((id, i) => {
    const row = t.standings[id];
    return [w.clubs.findIndex((c) => c.id === id), i + 1, row.played, row.points, row.gf, row.ga];
  });
}
