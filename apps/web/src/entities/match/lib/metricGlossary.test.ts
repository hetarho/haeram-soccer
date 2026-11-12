import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../../../../../../packages/contracts/src/types';
import {
  emptyPlayerDetail,
  emptyTeamDetail,
} from '../../../../../../packages/contracts/src/detail';
import { cellName } from '../../../../../../packages/engine/src/match/pitch';
import { matchComparison } from './advanced';
import { GLOSSARY, glossaryEntry } from '../../../shared/ui/glossaryEntries';

const metrics = () => Array<number>(12).fill(0);

describe('metrics glossary', () => {
  it('has an entry for every comparison row and the pitch zones', () => {
    const record: MatchRecord = {
      id: 'm',
      year: 1950,
      round: 1,
      kind: 'league',
      home: 'h',
      away: 'a',
      country: 'ENG',
      groupKey: 'g',
      score: { home: 0, away: 0 },
      metrics: [metrics(), metrics()],
      players: [{ id: 'p', metrics: metrics(), detail: emptyPlayerDetail() }],
      highlights: [],
      tactics: ['balanced', 'balanced'],
      xg: [0, 0],
      detail: [emptyTeamDetail(), emptyTeamDetail()],
      lineCounts: [1, 0],
    };
    const rows = matchComparison(record);
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) expect(glossaryEntry(row.term), row.label).toBeDefined();
    for (const id of [
      'box-entry',
      'front-of-box-entry',
      'line-breaking',
      'xt',
      'cross',
      'cut-back',
      'through-ball',
      'progressive-carry',
      'fouls',
      'cards',
      'offside',
      'set-piece',
      'pitch-zones',
      'action-record',
    ])
      expect(glossaryEntry(id), id).toBeDefined();
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(GLOSSARY.length);
    for (const entry of GLOSSARY)
      for (const text of [entry.term, entry.standard, entry.here, entry.read])
        expect(text.trim(), entry.id).not.toBe('');

    // The 40 named cells: 8 bands × 5 lanes, the attacking end on top.
    const zones = glossaryEntry('pitch-zones')!;
    expect(zones.table!.head).toEqual([
      '왼쪽 측면',
      '왼쪽 하프스페이스',
      '중앙',
      '오른쪽 하프스페이스',
      '오른쪽 측면',
    ]);
    expect(zones.table!.rows).toHaveLength(8);
    for (const row of zones.table!.rows) expect(row).toHaveLength(5);
    const cells = zones.table!.rows.flat();
    // Each cell reads as its full name with the column's lane in front, or is its own name.
    zones.table!.rows.forEach((row, i) =>
      row.forEach((text, lane) => {
        const cell = (7 - i) * 5 + lane;
        if (cell === 37) return expect(text).toBe('니어 포스트·파 포스트');
        expect([text, `${zones.table!.head[lane]} ${text}`]).toContain(cellName(cell));
      }),
    );
    for (const name of [
      '아크 정면',
      '페널티 스폿 부근',
      '왼쪽 컷백 구역',
      '오른쪽 박스 옆 측면',
      '왼쪽 코너 부근',
      '우리 골 에어리어',
      '상대 진영 중원',
    ])
      expect(cells).toContain(name);
    for (const name of ['수비 지역', '우리 진영 중원', '박스 앞', '박스 안', '골 에어리어'])
      expect(zones.here).toContain(name);

    // The recorded facts and the script's phases (→MATCH-15), never an unrecorded tag.
    const recorded = glossaryEntry('action-record')!;
    for (const fact of ['40칸', '세트피스', '라인을 깨뜨렸는지', '공을 따냈는지'])
      expect(recorded.here, fact).toContain(fact);
    for (const phase of ['빌드업', '전진', '파이널 서드', '역습', '세트피스'])
      expect(recorded.here, phase).toContain(phase);
    expect(glossaryEntry('touch-tags')).toBeUndefined();
    for (const entry of GLOSSARY)
      for (const text of [entry.term, entry.standard, entry.here, entry.read])
        // A through ball's space in behind is MATCH-13's own definition, so it is not listed here.
        for (const unrecorded of [
          '라인 사이',
          '채널',
          '압박 강도',
          '등지고',
          '수적 우위',
          '게겐프레싱',
        ])
          expect(text, `${entry.id}: ${unrecorded}`).not.toContain(unrecorded);
    // MATCH-18's offside rule and its restart.
    expect(glossaryEntry('offside')!.here).toContain('뒤에서 두 번째 상대');
    expect(glossaryEntry('offside')!.here).toContain('간접 프리킥');
  });
});
