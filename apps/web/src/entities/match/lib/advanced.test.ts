import { afterEach, describe, expect, it } from 'vitest';
import type { MatchRecord } from '../../../../../../packages/contracts/src/types';
import {
  emptyPlayerDetail,
  emptyTeamDetail,
} from '../../../../../../packages/contracts/src/detail';
import { createLocaleFormatters } from '../../../presentation/locale';
import { setLocaleFormatters } from '../../../presentation/format';
import { hundredths, matchComparison, per90, share, sideLines, TD } from './advanced';

afterEach(() => setLocaleFormatters());

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
  const ratioRecord = () => {
    const record = gridRecord();
    for (const side of [0, 1] as const) {
      record.metrics[side][2] = 10;
      record.metrics[side][3] = side === 0 ? 6 : 8;
      record.detail![side][TD.finalThirdPasses] = 10;
      record.detail![side][TD.finalThirdCompleted] = side === 0 ? 6 : 8;
      record.detail![side][TD.pressActions] = 5;
      record.detail![side][TD.buildUpPasses] = side === 0 ? 25 : 50;
    }
    return record;
  };

  describe.each(['ppda', 'pass-accuracy', 'final-third'])('%s sample availability', (term) => {
    it.each([[0], [1], [0, 1]])('keeps missing sides %j neutral', (...missing) => {
      const record = ratioRecord();
      for (const index of missing) {
        const side = index as 0 | 1;
        if (term === 'ppda') record.detail![side][TD.pressActions] = 0;
        else if (term === 'final-third') {
          record.detail![side][TD.finalThirdPasses] = 0;
          record.detail![side][TD.finalThirdCompleted] = 0;
        } else {
          record.metrics[side][2] = 0;
          record.metrics[side][3] = 0;
        }
      }
      const before = structuredClone(record);
      const row = matchComparison(record).find((entry) => entry.term === term)!;
      expect(row.lead).toBeUndefined();
      expect(row.homeShare).toBe(0.5);
      for (const side of missing) expect(side === 0 ? row.home : row.away).toContain('—');
      expect(record).toEqual(before);
    });

    it('compares a recorded zero with a valid denominator', () => {
      const record = ratioRecord();
      if (term === 'ppda') record.detail![1][TD.buildUpPasses] = 0;
      else if (term === 'final-third') record.detail![0][TD.finalThirdCompleted] = 0;
      else record.metrics[0][3] = 0;
      const row = matchComparison(record).find((entry) => entry.term === term)!;
      expect(row.home).not.toContain('—');
      expect(row.lead).toBe(term === 'ppda' ? 0 : 1);
      expect(row.homeShare).toBe(term === 'ppda' ? 1 : 0);
    });
  });

  it('preserves comparisons of fully observed ratios and counts', () => {
    const rows = matchComparison(ratioRecord());
    const by = (term: string) => rows.find((entry) => entry.term === term)!;
    expect(by('pass-accuracy')).toMatchObject({ home: '60% · 6/10', away: '80% · 8/10', lead: 1 });
    expect(by('pass-accuracy').homeShare).toBeCloseTo(0.6 / 1.4);
    expect(by('final-third')).toMatchObject({ home: '60% · 6/10', away: '80% · 8/10', lead: 1 });
    expect(by('ppda')).toMatchObject({ home: '10.0', away: '5.0', lead: 1 });
    expect(by('ppda').homeShare).toBeCloseTo(1 / 3);
    expect(by('fouls')).toMatchObject({ home: '9', away: '12', lead: 0, homeShare: 12 / 21 });
  });

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

describe('localized match-statistic formatting', () => {
  it('keeps default precision and undefined samples', () => {
    setLocaleFormatters(createLocaleFormatters('ko-KR'));
    expect(hundredths(145)).toBe('1.45');
    expect(per90(1, 200)).toBe('0.45');
    expect(per90(2, 300, 1)).toBe('0.6');
    expect(share(1, 3)).toBe('33%');
    expect(per90(1, 0)).toBe('—');
    expect(share(0, 0)).toBe('—');
    expect(share(0, 10)).toBe('0%');
  });

  it('uses German decimal separators without changing comparisons or stored facts', () => {
    const record = gridRecord(),
      before = structuredClone(record);
    const baseline = matchComparison(record).map(({ term, lead, homeShare }) => ({
      term,
      lead,
      homeShare,
    }));
    setLocaleFormatters(createLocaleFormatters('de-DE'));
    expect(hundredths(145)).toBe('1,45');
    expect(per90(1, 200)).toBe('0,45');
    const rows = matchComparison(record);
    expect(rows.find((row) => row.term === 'xg')).toMatchObject({ home: '1,20', away: '0,80' });
    expect(rows.find((row) => row.term === 'xt')).toMatchObject({ home: '1,23', away: '0,81' });
    expect(rows.map(({ term, lead, homeShare }) => ({ term, lead, homeShare }))).toEqual(baseline);
    expect(record).toEqual(before);
  });

  it('uses Arabic digits in percentages, count pairs and ratio denominators', () => {
    setLocaleFormatters(createLocaleFormatters('ar-SA'));
    const record = gridRecord();
    record.metrics[0][2] = 10;
    record.metrics[0][3] = 3;
    record.detail![0][TD.finalThirdPasses] = 3;
    record.detail![0][TD.finalThirdCompleted] = 1;
    const rows = matchComparison(record);
    expect(share(1, 3)).toBe('٣٣%');
    expect(hundredths(145)).toBe('١٫٤٥');
    expect(rows.find((row) => row.term === 'cross')?.home).toBe('١٥ (٤)');
    expect(rows.find((row) => row.term === 'pass-accuracy')?.home).toBe('٣٠% · ٣/١٠');
    expect(rows.find((row) => row.term === 'final-third')?.home).toBe('٣٣% · ١/٣');
  });
});
