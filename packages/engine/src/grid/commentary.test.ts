import { describe, expect, it } from 'vitest';
import { createWorld } from '../index';
import { describe as narrate, type CommentaryEntry } from './commentary';
import { playGrid } from './engine';
import { cellName, cellOf, toEngine, type Point } from './pitch';
import { buildGridSetup } from './setup';

const names: [string[], string[]] = [
  ['김민재', '손흥민', '이강인'],
  ['엘링 홀란', '모하메드 살라', '데브라위너'],
];
const ctx = { names };
const entry = (e: Partial<CommentaryEntry>): CommentaryEntry => ({
  period: 1,
  side: 0,
  idx: 1,
  action: 'pass',
  outcome: 'complete',
  ...e,
});
const tags = (over: Partial<NonNullable<CommentaryEntry['tags']>>) => ({
  phase: 'progression' as const,
  orientation: 'facing' as const,
  betweenLines: false,
  pocket: false,
  inBehind: false,
  channel: false,
  overload: 0,
  ...over,
});
/** A header from `at` off a cross played from `from`, both in the attack frame of `side`. */
const header = (side: 0 | 1, from: Point, at: Point) =>
  narrate(
    entry({
      side,
      action: 'cross',
      outcome: 'shot',
      from: toEngine(side, from),
      cell: cellOf(from),
      receiver: 2,
      shotAt: toEngine(side, at),
      result: 'goal',
      header: true,
    }),
    ctx,
  );

describe('grid commentary', () => {
  it('names the cell of a pass', () => {
    for (const side of [0, 1] as const) {
      const from: Point = [60, 20];
      const cell = cellOf(from);
      const text = narrate(
        entry({ side, from: toEngine(side, from), cell, receiver: 2, kind: 'short' }),
        ctx,
      );
      expect(text).toBe(`${names[side][1]}, ${cellName(cell)}에서 ${names[side][2]}에게 패스`);
    }
    expect(cellName(cellOf([60, 20]))).toBe('왼쪽 하프스페이스 상대 진영 중원');
  });

  it('describes a through ball into the space in behind', () => {
    const text = narrate(entry({ kind: 'through', receiver: 2, cell: cellOf([65, 34]) }), ctx);
    expect(text).toBe('손흥민의 침투 패스 — 이강인이 뒷공간으로');
    const shot = narrate(
      entry({
        action: 'shot',
        outcome: 'shot',
        from: [96, 30],
        cell: cellOf([96, 30]),
        result: 'goal',
        tags: tags({ inBehind: true, phase: 'counter' }),
      }),
      ctx,
    );
    expect(shot).toBe('역습 — 뒷공간으로 빠져나간 손흥민, 페널티 스폿 부근에서 슛 — 골!');
  });

  it('marks receiving between the lines', () => {
    const text = narrate(
      entry({ receiver: 0, cell: cellOf([75, 34]), tags: tags({ betweenLines: true }) }),
      ctx,
    );
    expect(text).toBe('라인 사이에서 받은 손흥민, 아크 정면에서 김민재에게 패스');
  });

  it('names cut-backs, headers, cards, substitutions and offside', () => {
    const cutBack = narrate(
      entry({
        action: 'cutBack',
        outcome: 'shot',
        from: [102, 20],
        cell: cellOf([102, 20]),
        receiver: 2,
        shotAt: [93, 30],
        result: 'save',
        by: [1, 0],
      }),
      ctx,
    );
    expect(cutBack).toBe(
      '왼쪽 컷백 구역에서 손흥민의 컷백 — 이강인이 페널티 스폿 부근에서 슛 — 엘링 홀란 선방',
    );
    expect(header(0, [80, 4], [93, 36])).toBe(
      '손흥민, 왼쪽 측면 박스 앞에서 크로스 — 이강인이 페널티 스폿 부근에서 헤더 — 골!',
    );
    const card = (action: string, idx = 0) =>
      narrate(entry({ side: 1, idx, action, outcome: 'incident' }), ctx);
    expect(card('yellow')).toBe('엘링 홀란 경고');
    expect(card('secondYellow', 1)).toBe('모하메드 살라 경고 누적 퇴장');
    expect(card('red', 2)).toBe('데브라위너 퇴장');
    expect(narrate(entry({ action: 'sub', outcome: 'incident', other: 2 }), ctx)).toBe(
      '손흥민 ↔ 이강인 교체',
    );
    expect(narrate(entry({ outcome: 'offside', receiver: 2 }), ctx)).toBe('이강인 오프사이드');
    expect(
      narrate(entry({ outcome: 'foul', by: [1, 1], to: [50, 30], cell: cellOf([50, 30]) }), ctx),
    ).toBe('모하메드 살라의 파울 — 손흥민 넘어짐');
  });

  it("uses near and far post by the ball's side", () => {
    for (const side of [0, 1] as const) {
      expect(header(side, [95, 5], [101, 31])).toContain('니어 포스트에서 헤더');
      expect(header(side, [95, 5], [101, 37])).toContain('파 포스트에서 헤더');
      expect(header(side, [95, 63], [101, 31])).toContain('파 포스트에서 헤더');
      expect(header(side, [95, 63], [101, 37])).toContain('니어 포스트에서 헤더');
    }
    const shot = entry({
      action: 'shot',
      outcome: 'shot',
      from: [101, 31],
      cell: cellOf([101, 31]),
      result: 'miss',
    });
    expect(narrate(shot, { names, ballSide: 'left' })).toBe('손흥민, 니어 포스트에서 슛 — 빗나감');
    expect(narrate(shot, { names, ballSide: 'right' })).toBe('손흥민, 파 포스트에서 슛 — 빗나감');
    expect(narrate(shot, ctx)).toBe('손흥민, 골 에어리어에서 슛 — 빗나감');
  });

  it('uses only verified terms over a whole match', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Commentary Lab',
      color: '#2a5d8f',
      seed: 'grid-commentary',
      level: 'normal',
    });
    const [home, away] = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    const setup = buildGridSetup(
      w,
      { ...w.fixtures[0]!, id: 'commentary', home: home!.id, away: away!.id },
      { observe: true, recordPlayers: false },
    );
    const result = playGrid(setup);
    const all = { names: setup.rosters.map((r) => r.map((p) => p.name)) as [string[], string[]] };
    const texts = result.trace!.map((e) => narrate(e, all));
    expect(texts.every((t) => t.length > 0 && !t.includes('선수'))).toBe(true);
    for (const banned of ['골든 존', '존 5', '존 14', '포켓', '하프 턴', 'undefined'])
      expect(
        texts.some((t) => t.includes(banned)),
        banned,
      ).toBe(false);
    expect(texts.filter((t) => t.endsWith('골!'))).toHaveLength(
      result.record.score.home + result.record.score.away,
    );
  });
});
