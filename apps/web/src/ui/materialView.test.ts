import { describe, expect, it } from 'vitest';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { REPORT_SLOTS } from '../../../../packages/engine/src/material';
import { cellName, cellOf } from '../../../../packages/engine/src/grid/pitch';
import {
  dotRadius,
  heatCells,
  heatOf,
  px,
  py,
  reportView,
  shotDots,
  sideReport,
} from './materialView';

/** A saved own match: the own club away, only its two lines kept, after the §9.4 layout. */
function savedRecord() {
  const heat = new Array<number>(4 * 40).fill(0);
  // Line 0: 6 touches in one cell, 2 in another; the own total and the opponent's after the lines.
  heat[cellOf([60, 30])] = 6;
  heat[cellOf([90, 10])] = 2;
  heat[2 * 40 + cellOf([60, 30])] = 6;
  heat[2 * 40 + cellOf([90, 10])] = 2;
  heat[3 * 40 + cellOf([20, 34])] = 5;
  const report = new Array<number>(60).fill(0);
  const own = 30;
  report[own + REPORT_SLOTS.finalThirdEntries + 3] = 12;
  report[own + REPORT_SLOTS.finalThirdEntries + 2] = 4;
  report[own + REPORT_SLOTS.boxEntries + 3] = 5;
  report[own + REPORT_SLOTS.regains + 1] = 7;
  report[own + REPORT_SLOTS.losses + 0] = 3;
  report[own + REPORT_SLOTS.setPieceShots] = 2;
  report[own + REPORT_SLOTS.setPieceGoals] = 1;
  return {
    id: 'm',
    year: 1950,
    home: 'H',
    away: 'A',
    players: [
      { id: 'p1', metrics: [] },
      { id: 'p2', metrics: [] },
    ],
    lineCounts: [0, 2],
    material: {
      // Own goal by p1 (0.45 xG, header); opponent miss (0.05 xG, foot).
      shots: [1, 0, 950, 340, 45, 0, 1, 0, 3, 800, 200, 5, 3, 0],
      heat,
      network: [600, 300, 8, 400, 340, 0],
      report,
    },
  } as unknown as MatchRecord;
}
const w = {
  playerClub: 'A',
  players: [
    { id: 'p1', name: 'Jack Smith' },
    { id: 'p2', name: 'Tom Brown' },
  ],
  history: [],
} as unknown as World;

describe('post-match material views', () => {
  it('scales shot dots by xG', () => {
    const dots = shotDots(savedRecord(), w);
    expect(dots).toHaveLength(2);
    const goal = dots.find((d) => d.goal)!,
      miss = dots.find((d) => !d.goal)!;
    // The goal is drawn last, on top; its area grows with xG (0.45 against 0.05).
    expect(dots.at(-1)).toBe(goal);
    expect(goal.r).toBeGreaterThan(miss.r);
    expect(goal.r).toBeCloseTo(dotRadius(0.45));
    expect(dotRadius(0.4) - dotRadius(0)).toBeCloseTo(2 * (dotRadius(0.1) - dotRadius(0)));
    expect(goal).toMatchObject({ own: true, header: true, cx: px(95), cy: py(34) });
    expect(goal.label).toContain('Jack Smith');
    expect(goal.label).toContain('헤더');
    expect(miss).toMatchObject({ own: false, header: false });
    expect(miss.label).toContain('상대 선수');
  });

  it('shades heat cells by share', () => {
    const record = savedRecord();
    const cells = heatCells(heatOf(record, w, 'p1'));
    expect(cells).toHaveLength(40);
    const busy = cells[cellOf([60, 30])]!,
      quiet = cells[cellOf([90, 10])]!;
    expect(busy.share).toBeCloseTo(0.75);
    expect(busy.shade).toBe(1);
    expect(quiet.share).toBeCloseTo(0.25);
    expect(quiet.shade).toBeCloseTo(1 / 3);
    expect(cells.filter((c) => c.touches === 0).every((c) => c.shade === 0)).toBe(true);
    expect(busy.label).toBe(`${cellName(busy.cell)} · 터치 6번 (75%)`);
    // The own total equals the one player here; the opponent has its own map.
    expect(heatCells(heatOf(record, w, 'own'))[busy.cell]!.share).toBeCloseTo(0.75);
    expect(heatCells(heatOf(record, w, 'opponent'))[cellOf([20, 34])]!.shade).toBe(1);
    // An empty map shades nothing.
    expect(heatCells(undefined).every((c) => c.shade === 0 && c.share === 0)).toBe(true);
  });

  it('builds report sentences with lane names', () => {
    const view = sideReport(savedRecord(), 1)!;
    expect(view.sentences).toContain('오른쪽 하프스페이스로 12번 진입했어요');
    expect(view.sentences).toContain('파이널 서드 진입은 모두 16번이에요');
    expect(
      view.sentences.some((line) => line.includes('오른쪽 하프스페이스로 가장 많이(5번)')),
    ).toBe(true);
    expect(view.sentences).toContain('공은 중원에서 가장 많이 되찾았어요 (7번)');
    expect(view.sentences).toContain('공은 수비 지역에서 가장 많이 잃었어요 (3번)');
    expect(view.sentences).toContain('세트피스에서 슛 2번, 골 1번이 나왔어요');
    expect(view.lanes.map((l) => l.label)).toEqual([
      '왼쪽 측면',
      '왼쪽 하프스페이스',
      '중앙',
      '오른쪽 하프스페이스',
      '오른쪽 측면',
    ]);
    expect(view.lanes[3]).toEqual({ label: '오른쪽 하프스페이스', entries: 12, box: 5 });
    // 으로 after a final consonant: 측면, 중앙.
    const wide = reportView({
      finalThirdEntries: [9, 0, 0, 0, 0],
      boxEntries: [0, 0, 0, 0, 0],
      regains: [0, 0, 0] as [number, number, number],
      losses: [0, 0, 0] as [number, number, number],
      setPieceShots: 0,
      setPieceGoals: 0,
      aerials: { won: 0, total: 0 },
      takeOns: { won: 0, total: 0 },
      tackles: { won: 0, total: 0 },
      counterAttacks: 0,
      counterShots: 0,
      highRegains: 0,
      crosses: 0,
      cutBacks: 0,
      throughBalls: 0,
    });
    expect(wide.sentences[0]).toBe('왼쪽 측면으로 9번 진입했어요');
    expect(wide.sentences).toContain('세트피스에서 나온 슛은 없었어요');
  });
});
