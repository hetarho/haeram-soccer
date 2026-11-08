import { lineOf } from '../../../../../packages/engine/src/player';
import { describe, expect, it } from 'vitest';
import type { World } from '../../../../../packages/contracts/src/types';
import {
  operate,
  progressFacilityWorks,
  settleRound,
} from '../../../../../packages/engine/src/index';
import { careerWorld } from '../../../../../packages/engine/src/career.testkit';
import { addEvent } from '../../../../../packages/engine/src/events';
import { sellPlayer, startWork } from '../../../../../packages/engine/src/testing';
import { settingsOf } from '../../../../../packages/engine/src/responsibilities';
import { describeOutcome, newEvents } from './outcome';

const world = () => careerWorld({ country: 'ENG', seed: 'outcome' });
const after = (w: World, apply: (copy: World) => void) => {
  const copy = structuredClone(w);
  apply(copy);
  return copy;
};

describe('action outcome summaries', () => {
  it('shows a work under way opening with its new level and record', () => {
    // No command starts a work (→ECON-32); one under way in a saved world opens as the rounds
    // pass, and the round's summary names the new level.
    const before = world();
    before.cash = '100000000';
    before.trainingGround = 0;
    startWork(before, 'training');
    const next = after(before, (w) => {
      w.facilityWorks!.training!.day -= 90;
      progressFacilityWorks(w);
    });
    const outcome = describeOutcome({ type: 'advance', rounds: 1 }, before, next)!;
    expect(outcome.title).toBe('한 라운드를 진행했어요');
    expect(outcome.changes.find((c) => c.label === '훈련장')).toMatchObject({
      previous: '0단계',
      value: '1단계',
      trend: 'up',
    });
    expect(outcome.events.map((event) => event.title)).toContain(
      next.events.findLast((event) => event.kind === 'facility-open')!.title,
    );
  });

  it('names 선수단 › 스태프 as the home of a coach change', () => {
    const before = world();
    const next = structuredClone(before);
    const role = before.staff![0].role;
    expect(describeOutcome({ type: 'renew-staff', role }, before, next)!.note).toContain(
      '선수단 › 스태프',
    );
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

  it('leaves a settings change to the control that shows it, without a card or toast', () => {
    const before = world();
    const settings = { ...settingsOf(before), mode: 'manual' as const };
    const next = after(before, (w) => (w.settings = settings));
    expect(describeOutcome({ type: 'settings', settings }, before, next)).toBeUndefined();
  });

  it('finds new records even when the view keeps a bounded event tail', () => {
    const before = world();
    const next = after(before, (w) => {
      operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
      addEvent(w, 'facility-open', '훈련장 완공 · 1단계', '선수 성장 기반 +0.03');
      w.events = w.events.slice(-2);
    });
    expect(newEvents(before, next).map((e) => e.kind)).toEqual(['sponsor-sign', 'facility-open']);
  });

  it('leaves routine ledger records to the cash change instead of listing raw units', () => {
    const before = world();
    const command = { type: 'sign-sponsor', slot: 'local', offer: 0 } as const;
    const next = after(before, (w) => {
      settleRound(w);
      operate(w, command);
    });
    const outcome = describeOutcome(command, before, next)!;
    const signed = next.events.at(-1)!;
    expect(next.events.some((event) => event.kind === 'operating-cost')).toBe(true);
    expect(signed.kind).toBe('sponsor-sign');
    expect(outcome.events.map((event) => event.title)).toEqual([signed.title]);
  });
});
