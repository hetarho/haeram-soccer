import { describe, expect, it } from 'vitest';
import { TD, TEAM_DETAIL_SIZE } from '../../../../packages/contracts/src/detail';
import type { Incident, MatchRecord } from '../../../../packages/contracts/src/types';
import { M } from '../../../../packages/engine/src/grid/record';
import type { LabSample } from './protocol';
import { estimate, summarizeRun } from './summary';

/** A synthetic lab match (fixture sides home/away): only what the summary reads. */
function sample(
  index: number,
  leftHome: boolean,
  score: [number, number],
  extra: {
    shots?: [number, number];
    highlights?: MatchRecord['highlights'];
    incidents?: Incident[];
  } = {},
): LabSample {
  const metrics = score.map((goals, side) => {
    const m = Array<number>(12).fill(0);
    m[M.goals] = goals;
    m[M.shots] = extra.shots?.[side] ?? 10;
    m[M.possession] = side ? 40 : 50;
    return m;
  }) as MatchRecord['metrics'];
  const detail = [0, 1].map(() => {
    const d = Array<number>(TEAM_DETAIL_SIZE).fill(0);
    d[TD.corners] = 5;
    return d;
  }) as MatchRecord['detail'];
  const record = {
    id: `lab:t:${index}`,
    score: { home: score[0], away: score[1] },
    metrics,
    detail,
    xg: [120, 80],
    players: [],
    highlights: extra.highlights ?? [],
    incidents: extra.incidents ?? [],
    tactics: ['balanced', 'counter'],
  } as unknown as MatchRecord;
  return {
    index,
    leftHome,
    sample: { record, incidentsTracked: true, condition: 'lab', fixture: record.id },
  };
}

const row = (s: ReturnType<typeof summarizeRun>, id: string) => s.sides.find((r) => r.id === id)!;

describe('lab run summary', () => {
  it('outcome counts', () => {
    const s = summarizeRun([
      sample(2, true, [0, 3]), // right wins
      sample(0, true, [2, 1]), // left wins
      sample(1, false, [1, 1]), // draw
      sample(3, false, [2, 0]), // right, at home, wins
    ]);
    expect(s.matches).toBe(4);
    expect(s.outcome).toMatchObject({ leftWins: 1, draws: 1, rightWins: 2 });
    // Left scored 2, 1, 0, 0 and right 1, 1, 3, 2 in match order.
    expect(s.outcome.leftGoals.value).toBeCloseTo(0.75);
    expect(s.outcome.rightGoals.value).toBeCloseTo(1.75);
    expect(row(s, 'goals').left.value).toBeCloseTo(0.75);
    expect(s.match).toBeUndefined();
  });

  it('side table intervals', () => {
    // Left's shots 8, 12, 10, 14 whichever side it played on; right's always 5.
    const s = summarizeRun([
      sample(0, true, [0, 0], { shots: [8, 5] }),
      sample(1, false, [0, 0], { shots: [5, 12] }),
      sample(2, true, [0, 0], { shots: [10, 5] }),
      sample(3, false, [0, 0], { shots: [5, 14] }),
    ]);
    const shots = row(s, 'shots');
    const sd = Math.sqrt(((8 - 11) ** 2 + (12 - 11) ** 2 + (10 - 11) ** 2 + (14 - 11) ** 2) / 3);
    expect(shots.left.value).toBeCloseTo(11);
    expect(shots.left.interval[0]).toBeCloseTo(11 - (1.96 * sd) / 2);
    expect(shots.left.interval[1]).toBeCloseTo(11 + (1.96 * sd) / 2);
    expect(shots.right).toEqual({ value: 5, interval: [5, 5] });
    // Possession follows the side too: 50 minutes of 90 at home, 40 away.
    expect(row(s, 'possession').left.value).toBeCloseTo(((50 + 40 + 50 + 40) / 4 / 90) * 100);
    expect(row(s, 'corners').left.value).toBe(5);
    expect(estimate([3])).toEqual({ value: 3, interval: [3, 3] });
  });

  it('single-match details', () => {
    const s = summarizeRun(
      [
        sample(0, false, [1, 2], {
          highlights: [
            { minute: 12, side: 0, player: 'Home Scorer', action: '골' },
            { minute: 30, side: 1, player: 'Away Keeper', action: '선방' },
            { minute: 77, side: 1, player: 'Away Scorer', action: '골' },
            { minute: 88, side: 1, player: 'Away Scorer', action: '골' },
          ],
          incidents: [
            { minute: 40, side: 0, kind: 'yellow', player: 'p1' },
            { minute: 60, side: 1, kind: 'sub', player: 'p2', other: 'p3' },
            { minute: 70, side: 1, kind: 'red', player: 'p4' },
          ],
        }),
      ],
      { names: (id) => `name-${id}` },
    );
    expect(s.matches).toBe(1);
    // Right was at home: the fixture's home side is lab side 1.
    expect(s.match).toEqual({
      score: [2, 1],
      goals: [
        { minute: 12, side: 1, name: 'Home Scorer' },
        { minute: 77, side: 0, name: 'Away Scorer' },
        { minute: 88, side: 0, name: 'Away Scorer' },
      ],
      cards: [
        { minute: 40, side: 1, player: 'name-p1', kind: 'yellow' },
        { minute: 70, side: 0, player: 'name-p4', kind: 'red' },
      ],
    });
    expect(row(s, 'shots').left).toEqual({ value: 10, interval: [10, 10] });
    // A single match has no spread on MATCH-23's rows either.
    const goals = s.targets.find((t) => t.id === 'goals')!;
    expect(goals.estimate).toEqual({ value: 3, interval: [3, 3] });
  });

  it('rows without data stay missing, never pass', () => {
    const s = summarizeRun([sample(0, true, [1, 1]), sample(1, false, [0, 2])]);
    // The synthetic samples carry no grid diagnostics.
    const possessions = s.targets.find((t) => t.id === 'possessions')!;
    expect(possessions.status).toBe('missing');
    expect(possessions.pass).toBeUndefined();
    expect(possessions.estimate).toBeUndefined();
    expect(possessions.real).toEqual([85, 105]);
  });

  it('notes sides of different averages', () => {
    const samples = [sample(0, true, [1, 0])];
    expect(summarizeRun(samples, { averages: [70, 72] }).unequalSides).toBe(false);
    expect(summarizeRun(samples, { averages: [70, 72.5] }).unequalSides).toBe(true);
    expect(summarizeRun(samples).unequalSides).toBe(false);
  });
});
