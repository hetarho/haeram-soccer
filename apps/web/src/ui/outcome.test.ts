import { lineOf } from '../../../../packages/engine/src/player';
import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import {
  createWorld,
  operate,
  progressFacilityWorks,
  settleRound,
} from '../../../../packages/engine/src/index';
import { sellPlayer } from '../../../../packages/engine/src/testing';
import { makePlayer } from '../../../../packages/engine/src/world';
import { resolveCare } from '../../../../packages/engine/src/care';
import { describeOutcome, newEvents } from './outcome';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Outcome',
    color: '#24664f',
    seed: 'outcome',
    level: 'easy' as const,
  });
const after = (w: World, apply: (copy: World) => void) => {
  const copy = structuredClone(w);
  apply(copy);
  return copy;
};

describe('action outcome summaries', () => {
  it('explains an investment with its recorded cost, level and engine record', () => {
    const before = world();
    // The first training ground level costs more than a founding club's cash (→ECON-32).
    before.cash = '100000000';
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

  it('names 선수단 › 스태프 as the home of a coach change', () => {
    const before = world();
    const next = structuredClone(before);
    const role = before.staff![0].role;
    expect(describeOutcome({ type: 'renew-staff', role }, before, next)!.note).toContain(
      '선수단 › 스태프',
    );
    expect(
      describeOutcome({ type: 'direction', key: 'manager', option: 'young' }, before, next)!.note,
    ).toContain('이 방향으로');
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
    expect(outcome.changes.find((c) => c.label === '팀 분위기')).toMatchObject({
      previous: '60',
      value: '58',
      trend: 'down',
    });
    expect(outcome.events[0].title).toBe('휴식일 부여 요청');
  });

  it('lists only facts that changed and the squad size after a sale', () => {
    const before = world();
    const id = before.players.find((p) => lineOf(p.position) === 'MF' && p.status === 'active')!.id;
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

describe('care outcome units', () => {
  it.each(['backing', 'rest-day'] as const)(
    'reports the actual gain and morale loss for %s on one synthetic player',
    (kind) => {
      const player = makePlayer('ENG', 'care-summary', 'only-player', 1950, 40, 'CM', 25);
      player.fatigue = 40;
      const before = {
        id: 'care-summary',
        seed: 'care-summary',
        year: 1950,
        round: 0,
        revision: 0,
        playerClub: 'own',
        clubs: [{ id: 'own', country: 'ENG', tier: 0, fans: 800 }],
        players: [player],
        manager: { trust: 50, name: 'Synthetic manager' },
        cash: '1000',
        morale: 60,
        tables: {},
        stadium: 0,
        tactic: 'balanced',
        events: [],
      } as unknown as World;
      const next = structuredClone(before);
      resolveCare(next, kind);
      const outcome = describeOutcome({ type: 'care', kind }, before, next)!;
      expect(outcome.changes.find((one) => one.label === '팀 분위기')).toMatchObject({
        previous: '60',
        value: '58',
        trend: 'down',
      });
      expect(
        outcome.changes.find(
          (one) => one.label === (kind === 'backing' ? '감독 신뢰' : '선발 평균 피로'),
        ),
      ).toMatchObject({ trend: kind === 'backing' ? 'up' : 'down' });
    },
  );
});
