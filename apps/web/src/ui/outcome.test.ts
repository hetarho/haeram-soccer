import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { createWorld, operate, settleRound } from '../../../../packages/engine/src/index';
import { describeOutcome, newEvents } from './outcome';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Outcome',
    color: '#24664f',
    seed: 'outcome',
    difficulty: 2,
  });
const after = (w: World, apply: (copy: World) => void) => {
  const copy = structuredClone(w);
  apply(copy);
  return copy;
};

describe('action outcome summaries', () => {
  it('explains an investment with its recorded cost, level and engine record', () => {
    const before = world();
    const next = after(before, (w) => operate(w, { type: 'facility' }));
    const outcome = describeOutcome({ type: 'facility' }, before, next)!;
    expect(outcome.title).toBe('구장 시설을 확장했어요');
    expect(outcome.changes.find((c) => c.label === '시설')).toMatchObject({
      previous: 'Lv.0',
      value: 'Lv.1',
      trend: 'up',
    });
    const cash = outcome.changes.find((c) => c.label === '운영 자금')!;
    expect(cash.trend).toBe('down');
    expect(cash.value).toContain('(−');
    expect(outcome.events[0].title).toBe(next.events.at(-1)!.title);
    expect(outcome.note).toContain('유지비');
  });

  it('summarizes a care action with its fatigue and morale change', () => {
    const before = world();
    for (const player of before.players) player.fatigue = 40;
    const next = after(before, (w) => operate(w, { type: 'care', kind: 'rest-day' }));
    const outcome = describeOutcome({ type: 'care', kind: 'rest-day' }, before, next)!;
    expect(outcome.title).toBe('선수단을 챙겼어요');
    expect(outcome.changes.find((c) => c.label === '선발 평균 피로')).toMatchObject({
      previous: '40',
      value: '34',
      trend: 'down',
    });
    expect(outcome.changes.find((c) => c.label === '선수단 사기')).toMatchObject({ trend: 'up' });
    expect(outcome.events[0].title).toBe('휴식일');
  });

  it('lists only facts that changed and the squad size after a sale', () => {
    const before = world();
    const id = before.players.find((p) => p.role === 'MID' && p.status === 'active')!.id;
    const next = after(before, (w) => operate(w, { type: 'sell', id }));
    const outcome = describeOutcome({ type: 'sell', id }, before, next)!;
    const labels = outcome.changes.map((c) => c.label);
    expect(labels).toContain('선수단');
    expect(labels).toContain('운영 자금');
    expect(labels).not.toContain('시설');
    expect(labels).not.toContain('날짜');
  });

  it('never summarizes a match that live playback has yet to reveal', () => {
    const before = world();
    expect(describeOutcome({ type: 'next-match' }, before, before)).toBeUndefined();
  });

  it('finds new records even when the view keeps a bounded event tail', () => {
    const before = world();
    const next = after(before, (w) => {
      operate(w, { type: 'facility' });
      operate(w, { type: 'support' });
      w.events = w.events.slice(-2);
    });
    expect(newEvents(before, next).map((e) => e.kind)).toEqual(['facility', 'support']);
  });

  it('leaves routine ledger records to the cash change instead of listing raw units', () => {
    const before = world();
    const next = after(before, (w) => {
      settleRound(w);
      operate(w, { type: 'support' });
    });
    const outcome = describeOutcome({ type: 'support' }, before, next)!;
    expect(next.events.some((event) => event.kind === 'operating-cost')).toBe(true);
    expect(outcome.events.map((event) => event.title)).toEqual(['구단주 추가 출자']);
  });
});
