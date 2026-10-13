import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import {
  createWorld,
  operate,
  progressFacilityWorks,
  settleRound,
} from '../../../../packages/engine/src/index';
import { sellPlayer } from '../../../../packages/engine/src/testing';
import { managerCriteriaOf } from '../../../../packages/engine/src/hiring';
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
    const command = { type: 'facility', part: 'training' } as const;
    // Started, then opened 90 days later: the level moves once the work is done (→ECON-32).
    const next = after(before, (w) => {
      operate(w, command);
      w.facilityWorks!.training!.day -= 90;
      progressFacilityWorks(w);
    });
    const outcome = describeOutcome(command, before, next)!;
    expect(outcome.title).toBe('시설 공사를 시작했어요');
    expect(outcome.changes.find((c) => c.label === '훈련장')).toMatchObject({
      previous: '0단계',
      value: '1단계',
      trend: 'up',
    });
    const cash = outcome.changes.find((c) => c.label === '운영 자금')!;
    expect(cash.trend).toBe('down');
    expect(cash.value).toContain('(−');
    expect(outcome.events.map((event) => event.title)).toContain(
      next.events.findLast((event) => event.kind === 'facility')!.title,
    );
    expect(outcome.note).toContain('유지비');
  });

  it('names 사람 › 코치진 as the home of a coach change', () => {
    const before = world();
    const next = structuredClone(before);
    const role = before.staff![0].role;
    expect(describeOutcome({ type: 'renew-staff', role }, before, next)!.note).toContain(
      '사람 › 코치진',
    );
    const criteria = managerCriteriaOf(before);
    expect(
      describeOutcome({ type: 'hiring', role: 'manager', criteria }, before, next)!.note,
    ).toContain('사람 › 감독');
  });

  it('summarizes a care action with its fatigue and morale change', () => {
    const before = world();
    for (const player of before.players) player.fatigue = 40;
    const next = after(before, (w) => operate(w, { type: 'care', kind: 'rest-day' }));
    const outcome = describeOutcome({ type: 'care', kind: 'rest-day' }, before, next)!;
    expect(outcome.title).toBe('구단주 요청을 전했어요');
    expect(outcome.changes.find((c) => c.label === '선발 평균 피로')).toMatchObject({
      previous: '40',
      value: '34',
      trend: 'down',
    });
    expect(outcome.changes.find((c) => c.label === '팀 분위기')).toMatchObject({ trend: 'up' });
    expect(outcome.events[0].title).toBe('휴식일 부여 요청');
  });

  it('lists only facts that changed and the squad size after a sale', () => {
    const before = world();
    const id = before.players.find((p) => p.role === 'MID' && p.status === 'active')!.id;
    const next = after(before, (w) => sellPlayer(w, id));
    const outcome = describeOutcome(
      { type: 'transfer-stance', id, stance: 'listed' },
      before,
      next,
    )!;
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
      operate(w, { type: 'facility', part: 'stadium' });
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
