import { describe, expect, it } from 'vitest';
import type {
  Club,
  Highlight,
  MatchRecord,
  SeasonArchive,
} from '../../../../packages/contracts/src/types';
import { currency, priceIndex } from '../../../../packages/catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  createWorld,
  prepareSeason,
} from '../../../../packages/engine/src/index';
import { cachedWorld, DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { cupRoute, nationName, runLine, runResult, type TieRow } from './cupRoute';

const club = (id: string, country: string): Club => ({
  id,
  country,
  name: id,
  short: id.slice(0, 3),
  tier: 0,
  group: 0,
  strength: 60,
  reputation: 50,
  fans: 1000,
  color: '#224433',
});
const OWN = 'ENG:club';
const clubs = [
  club(OWN, 'ENG'),
  club('ENG:reserve:2', 'ENG'),
  club('ENG:1:0:3', 'ENG'),
  club('ENG:0:0:5', 'ENG'),
  club('euro:4', 'GRE'),
  club('GER:0:0:1', 'GER'),
  club('euro:9', 'SCO'),
  club('euro:12', 'TUR'),
];
const w = { clubs, playerClub: OWN };
const at = (id: string) => clubs.findIndex((entry) => entry.id === id);

function match(
  id: string,
  round: number,
  home: string,
  away: string,
  score: [number, number],
  highlights: Highlight[] = [],
  xg?: [number, number],
): MatchRecord {
  return {
    id,
    year: Number(id.split(':')[0]),
    round,
    kind: id.includes(':cup:') ? 'cup' : 'europe',
    home,
    away,
    country: 'ENG',
    groupKey: '',
    score: { home: score[0], away: score[1] },
    metrics: [[], []],
    players: [],
    highlights,
    tactics: ['balanced', 'balanced'],
    ...(xg ? { xg } : {}),
  };
}
const goal = (minute: number, side: 0 | 1, player: string): Highlight => ({
  minute,
  side,
  player,
  action: '골',
});
const shootout = (side: 0 | 1): Highlight => ({
  minute: 120,
  side,
  player: '승부차기',
  action: `승부차기 ${side ? '원정' : '홈'} 승리`,
});
const season = (
  europe: SeasonArchive['europe'] = [],
  standings: number[][] = [],
): Pick<SeasonArchive, 'standings' | 'europe' | 'runs'> => ({ standings, europe, runs: [] });

describe('our cup road', () => {
  it('reads a domestic run in playing order with tiers, scorers, xG and the shoot-out', () => {
    const standings = [
      [at(OWN), 4, 0, 50, 40, 30],
      [at('ENG:1:0:3'), 1, 0, 60, 50, 40],
      [at('ENG:0:0:5'), 0, 0, 70, 60, 20],
    ];
    const matches = [
      match('1987:cup:ENG:k2:3', 16, OWN, 'ENG:0:0:5', [0, 2]),
      match(
        '1987:cup:ENG:k0:4',
        5,
        OWN,
        'ENG:reserve:2',
        [3, 1],
        [
          goal(58, 0, 'Arthur Brooks'),
          goal(26, 0, 'Arthur Brooks'),
          goal(70, 1, 'Visitor'),
          goal(37, 0, 'Henry Turner'),
        ],
        [1.84, 0.92],
      ),
      match(
        '1987:cup:ENG:k1:7',
        11,
        'ENG:1:0:3',
        OWN,
        [1, 1],
        [goal(80, 1, 'Henry Turner'), shootout(1)],
      ),
      // Other competitions and seasons stay out of the road.
      match('1987:ENG:4:0:3:1', 4, OWN, 'ENG:reserve:2', [5, 0]),
      match('1986:cup:ENG:k0:1', 5, OWN, 'ENG:reserve:2', [1, 0]),
    ];
    const rows = cupRoute(w, 1987, 'cup', { season: season([], standings), matches }) as TieRow[];
    expect(rows.map((row) => [row.label, row.opponent, row.tag, row.result, row.decided])).toEqual([
      ['1라운드', 'ENG:reserve:2', '아마추어', '진출', undefined],
      ['64강', 'ENG:1:0:3', '2부', '진출', '승부차기 승'],
      ['32강', 'ENG:0:0:5', '1부', '탈락', undefined],
    ]);
    expect(rows[0]).toMatchObject({ summary: '홈 3–1', xg: 'xG 1.8–0.9' });
    expect(rows[0].legs[0]).toMatchObject({
      leg: undefined,
      home: true,
      score: [3, 1],
      scorers: 'Arthur Brooks 26′ 58′ · Henry Turner 37′',
    });
    expect(rows[1]).toMatchObject({ summary: '원정 1–1' });
    expect(rows[1].xg).toBeUndefined();
    expect(rows[1].legs[0].scorers).toBe('Henry Turner 80′');
    expect(rows[2].legs[0].scorers).toBe('');
    // Without the season's table no division is claimed.
    expect(cupRoute(w, 1987, 'cup', { matches }).every((row) => !('tag' in row))).toBe(true);
  });

  it('settles level two-legged ties on away goals before 2021 and on the shoot-out after', () => {
    const legs = [
      match('1987:ucl:k0:5', 9, 'euro:4', OWN, [0, 1], [goal(12, 1, 'Arthur Brooks')]),
      match('1987:ucl:k0:5:2', 10, OWN, 'euro:4', [1, 2], [goal(44, 0, 'Henry Turner')]),
    ];
    const [tie] = cupRoute(w, 1987, 'ucl', { season: season(), matches: legs }) as TieRow[];
    expect(tie).toMatchObject({
      label: '32강',
      tag: '그리스',
      summary: '1차전 원정 1–0 · 2차전 홈 1–2 · 합계 2–2',
      result: '탈락',
      decided: '원정 다득점 패',
    });
    expect(tie.legs.map((leg) => [leg.leg, leg.scorers])).toEqual([
      [1, 'Arthur Brooks 12′'],
      [2, 'Henry Turner 44′'],
    ]);
    const later = [
      match('2021:uel:k0:3', 32, 'euro:4', OWN, [1, 1]),
      match('2021:uel:k0:3:2', 33, OWN, 'euro:4', [1, 1], [shootout(0)]),
      match('2021:uel:k1:0', 36, 'GER:0:0:1', OWN, [2, 0]),
      match('2021:uel:k1:0:2', 37, OWN, 'GER:0:0:1', [3, 0]),
      match('2021:uel:k2:1', 39, OWN, 'euro:9', [0, 0]),
      match('2021:uel:k2:1:2', 40, 'euro:9', OWN, [1, 1]),
      match('2021:uel:k3:0', 43, OWN, 'euro:12', [0, 1]),
    ];
    const rows = cupRoute(w, 2021, 'uel', { season: season(), matches: later }) as TieRow[];
    expect(rows.map((row) => [row.label, row.tag, row.result, row.decided])).toEqual([
      ['16강', '그리스', '진출', '승부차기 승'],
      ['8강', '독일', '진출', undefined],
      // From 2021 a level tie goes to penalties whatever the away goals; with no shoot-out
      // recorded, the final we played next shows we went through.
      ['4강', '스코틀랜드', '진출', '승부차기 승'],
      ['결승', '튀르키예', '준우승', undefined],
    ]);
    expect(rows[0].summary).toBe('1차전 원정 1–1 · 2차전 홈 1–1 · 합계 2–2');
  });

  it('places the league phase by the stored table and the play-off and round of 16 after it', () => {
    const others = clubs.filter((entry) => entry.id !== OWN).map((entry) => at(entry.id));
    const table = Array.from({ length: 36 }, (_, i) =>
      i === 10 ? [at(OWN), 11, 8, 14, 12, 8] : [others[i % others.length] + 100, i + 1, 8, 9, 9, 9],
    );
    const results: [number, number][] = [
      [2, 0],
      [1, 1],
      [0, 1],
      [3, 1],
      [2, 2],
      [1, 0],
      [0, 2],
      [3, 1],
    ];
    const phase = results.map((score, i) =>
      match(`2024:ucl:phase:${i * 18}`, [7, 9, 12, 14, 17, 19, 25, 26][i], OWN, 'euro:4', score),
    );
    const knockout = [
      match('2024:ucl:k0:2', 29, OWN, 'euro:9', [2, 0]),
      match('2024:ucl:k0:2:2', 30, 'euro:9', OWN, [1, 0]),
      match('2024:ucl:k1:4', 32, OWN, 'GER:0:0:1', [0, 1]),
      match('2024:ucl:k1:4:2', 33, 'GER:0:0:1', OWN, [2, 2]),
    ];
    const rows = cupRoute(w, 2024, 'ucl', {
      season: season([
        { kind: 'ucl', name: 'Champions League', winner: 'GER:0:0:1', field: 36, standings: table },
      ]),
      matches: [...knockout, ...phase],
    });
    expect(rows.map((row) => [row.kind, row.label, row.result])).toEqual([
      ['phase', '리그 페이즈', '진출'],
      ['tie', '플레이오프', '진출'],
      ['tie', '16강', '탈락'],
    ]);
    expect(rows[0]).toMatchObject({
      record: '4승 2무 2패 · 12득점 8실점',
      standing: '11위 · 36팀 · 승점 14',
    });
    // No table kept: the points from our own matches, and no place is claimed.
    expect(cupRoute(w, 2024, 'ucl', { matches: phase })[0]).toMatchObject({
      standing: '승점 14',
      result: '탈락',
    });
  });

  it('ranks our group among the clubs we met by their place in the whole stage', () => {
    const rivals = ['euro:4', 'GER:0:0:1', 'euro:9'];
    const groups = rivals.flatMap((rival, i) => [
      match(`2010:ucl:phase:${i * 2}`, [7, 9, 12][i], OWN, rival, [1, 1]),
      match(`2010:ucl:phase:${i * 2 + 1}`, [14, 17, 19][i], rival, OWN, [0, 2]),
    ]);
    const table = [
      [at('GER:0:0:1'), 3, 6, 13, 10, 4],
      [at(OWN), 9, 6, 12, 9, 3],
      [at('euro:4'), 14, 6, 7, 6, 8],
      [at('euro:9'), 27, 6, 2, 3, 13],
      [at('euro:12'), 1, 6, 18, 15, 2],
    ];
    const [row] = cupRoute(w, 2010, 'ucl', {
      season: season([
        { kind: 'ucl', name: 'Champions League', winner: 'euro:12', field: 32, standings: table },
      ]),
      matches: groups,
    });
    expect(row).toMatchObject({
      kind: 'phase',
      label: '조별 리그',
      record: '3승 3무 0패 · 9득점 3실점',
      standing: '조 2위 · 4팀 · 승점 12',
      result: '탈락',
    });
    // The 1999–2002 second group stage reads its own table.
    const second = [
      match('1999:ucl:phase:0', 7, OWN, 'euro:4', [1, 0]),
      match('1999:ucl:second:0', 25, OWN, 'euro:9', [0, 0]),
    ];
    const rows = cupRoute(w, 1999, 'ucl', {
      season: season([
        {
          kind: 'ucl',
          name: 'Champions League',
          winner: 'euro:12',
          field: 32,
          standings: [
            [at(OWN), 2, 1, 3, 1, 0],
            [at('euro:4'), 30, 1, 0, 0, 1],
          ],
          secondStandings: [
            [at('euro:9'), 5, 1, 1, 0, 0],
            [at(OWN), 7, 1, 1, 0, 0],
          ],
        },
      ]),
      matches: second,
    });
    expect(
      rows.map((entry) => [entry.label, entry.result, 'standing' in entry && entry.standing]),
    ).toEqual([
      ['조별 리그', '진출', '조 1위 · 2팀 · 승점 3'],
      ['2차 조별 리그', '탈락', '조 2위 · 2팀 · 승점 1'],
    ]);
  });

  it('names our result and our nations as media do', () => {
    expect(runResult({ key: 'cup', name: '잉글랜드 컵', reached: '결승', champion: true })).toBe(
      '우승',
    );
    expect(runResult({ key: 'cup', name: '잉글랜드 컵', reached: '결승' })).toBe('준우승');
    expect(runResult({ key: 'ucl', name: 'European Cup', reached: '조별 리그' })).toBe(
      '조별 리그 탈락',
    );
    const runs = [{ key: 'ucl', name: 'European Cup', reached: '8강' }];
    expect(runLine({ runs }, 'ucl')).toBe('우리 클럽 · 8강 탈락');
    expect(runLine({ runs }, 'cup')).toBe('우리 클럽은 나서지 않았어요');
    expect(runLine({}, 'cup')).toBe('우리 클럽의 컵 성적은 기록되지 않은 시즌이에요');
    expect(['GER', 'GRE', 'SCO', 'XYZ'].map(nationName)).toEqual([
      '독일',
      '그리스',
      '스코틀랜드',
      'XYZ',
    ]);
  });

  it('agrees with the archived runs of a played 1980 season, the Cup Winners Cup included', () => {
    // Played on the pre-feature path: the cup route, not the match model, is the subject.
    const world = cachedWorld('eng-1980-closed', () => {
      const world = createWorld(
        {
          country: 'ENG',
          name: 'Route Rovers',
          color: '#2a4d3a',
          seed: 'cup-route',
          level: 'normal' as const,
        },
        DISABLED_RELEASE,
      );
      world.year = 1980;
      world.currency = currency('ENG', 1980).code;
      world.priceIndex = priceIndex('ENG', 1980).value;
      world.manager.until = 1983;
      for (const p of world.players) p.until = 1982;
      // Last season's cup winners enter the Cup Winners Cup.
      world.lastChampions = [{ country: 'ENG', club: 'ENG:0:0:0', cup: world.playerClub }];
      prepareSeason(world);
      while (world.round < 46) advanceRound(world, undefined, false);
      closeSeason(world);
      return world;
    });
    const archived = world.history.at(-1)!;
    const matches = world.ownMatches.filter((m) => m.year === 1980);
    expect(archived.runs!.map((run) => run.key).sort()).toEqual(['cup', 'cwc']);
    for (const run of archived.runs!) {
      const rows = cupRoute(world, 1980, run.key, { season: archived, matches }) as TieRow[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.at(-1)!.label).toBe(run.reached);
      expect(rows.at(-1)!.result).toBe(
        run.champion ? '우승' : run.reached === '결승' ? '준우승' : '탈락',
      );
      expect(rows.slice(0, -1).every((row) => row.result === '진출')).toBe(true);
      expect(rows.every((row) => row.tag)).toBe(true);
      // Every recorded own match of the competition is on the road, each once.
      expect(rows.flatMap((row) => row.legs.map((leg) => leg.match.id)).sort()).toEqual(
        matches
          .filter((m) => (run.key === 'cup' ? m.kind === 'cup' : m.groupKey === run.key))
          .map((m) => m.id)
          .sort(),
      );
    }
  });
});
