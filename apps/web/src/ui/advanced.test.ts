import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { emptyPlayerDetail, emptyTeamDetail } from '../../../../packages/contracts/src/detail';
import { matchComparison, sideLines, TD } from './advanced';

const metrics = () => Array<number>(12).fill(0);

/** A grid-engine record: both sides' counters and `lineCounts` for 12 home and 11 away lines. */
function gridRecord(): MatchRecord {
  const home = emptyTeamDetail(),
    away = emptyTeamDetail();
  Object.assign(home, {
    [TD.boxEntries]: 18,
    [TD.frontOfBoxEntries]: 31,
    [TD.lineBreakingPasses]: 42,
    [TD.xtAdded]: 1234,
    [TD.crosses]: 15,
    [TD.crossesCompleted]: 4,
    [TD.cutBacks]: 2,
    [TD.throughBalls]: 3,
    [TD.throughBallsCompleted]: 1,
    [TD.progressiveCarries]: 19,
    [TD.fouls]: 9,
    [TD.yellowCards]: 2,
    [TD.redCards]: 1,
    [TD.corners]: 6,
    [TD.offsides]: 1,
  });
  Object.assign(away, { [TD.fouls]: 12, [TD.xtAdded]: 805, [TD.corners]: 4 });
  const line = (id: string) => ({ id, metrics: metrics(), detail: emptyPlayerDetail() });
  return {
    id: 'm',
    year: 1950,
    round: 1,
    kind: 'league',
    home: 'h',
    away: 'a',
    country: 'ENG',
    groupKey: 'g',
    score: { home: 1, away: 0 },
    metrics: [metrics(), metrics()],
    players: [
      ...Array.from({ length: 12 }, (_, i) => line(`h${i}`)),
      ...Array.from({ length: 11 }, (_, i) => line(`a${i}`)),
    ],
    highlights: [],
    tactics: ['balanced', 'press'],
    xg: [1.2, 0.8],
    detail: [home, away],
    lineCounts: [12, 11],
  };
}

describe('match report read model', () => {
  it('adds the spatial counters to the comparison', () => {
    const rows = matchComparison(gridRecord());
    const labels = rows.map((row) => row.label);
    const spatial = [
      '박스 진입',
      '박스 앞 진입',
      '라인 브레이킹 패스',
      '위협도 기여(xT)',
      '크로스 (성공)',
      '컷백',
      '침투 패스 (성공)',
      '전진 운반',
      '파울',
      '경고·퇴장',
      '코너킥',
      '오프사이드',
    ];
    // After the existing rows, in this order.
    expect(labels.slice(-spatial.length)).toEqual(spatial);
    expect(labels.indexOf('선방')).toBe(labels.length - spatial.length - 1);
    const by = (label: string) => rows.find((row) => row.label === label)!;
    expect(by('위협도 기여(xT)')).toMatchObject({
      term: 'xt',
      home: '1.23',
      away: '0.81',
      lead: 0,
    });
    expect(by('크로스 (성공)')).toMatchObject({ term: 'cross', home: '15 (4)', away: '0 (0)' });
    expect(by('침투 패스 (성공)')).toMatchObject({ home: '3 (1)', term: 'through-ball' });
    expect(by('경고·퇴장')).toMatchObject({ term: 'cards', home: '2·1', away: '0·0', lead: 1 });
    // Fewer fouls leads.
    expect(by('파울')).toMatchObject({ term: 'fouls', home: '9', away: '12', lead: 0 });
    expect(by('코너킥')).toMatchObject({ term: 'set-piece', home: '6', away: '4' });
    expect(by('박스 진입').term).toBe('box-entry');

    // A duel-chain record has the older counters but none of these: no rows of zeros.
    const older = gridRecord();
    delete older.lineCounts;
    expect(matchComparison(older).map((row) => row.label)).not.toContain('박스 진입');
  });

  it('splits player lines by side', () => {
    const record = gridRecord();
    expect(sideLines(record, 0)).toHaveLength(12);
    expect(sideLines(record, 1).map((line) => line.id)).toEqual(
      Array.from({ length: 11 }, (_, i) => `a${i}`),
    );
    // A saved own match keeps the own lines only.
    const saved = {
      ...record,
      players: record.players.slice(12),
      lineCounts: [0, 11] as [number, number],
    };
    expect(sideLines(saved, 1)).toHaveLength(11);
    expect(sideLines(saved, 0)).toHaveLength(0);
    // Before `lineCounts`, the own eleven were saved whatever the side.
    const old = { ...record, players: record.players.slice(0, 11), lineCounts: undefined };
    expect(sideLines(old, 1)).toHaveLength(11);
  });
});
