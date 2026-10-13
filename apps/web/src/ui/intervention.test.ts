import { describe, expect, it } from 'vitest';
import type { Command, World } from '../../../../packages/contracts/src/types';
import { COACH_KEYS, createWorld } from '../../../../packages/engine/src/index';
import type { GameClient } from '../runtime/client';
import type { ProgressionController, StopOn } from '../runtime/progression';
import {
  applyInterventionLevel,
  delegatedDecisions,
  INTERVENTION_LEVELS,
  interventionLevel,
  LEVEL_KEYS,
  levelName,
} from './intervention';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Intervention Town',
    color: '#225588',
    seed: 'intervention',
    difficulty: 1,
  });
/** Applies a level to `w` as the worker would, returning the commands it sent. */
function apply(w: World, index: number) {
  const sent: Command[] = [];
  let stops: StopOn | undefined;
  const client = {
    command: (command: Command) => {
      sent.push(command);
      return Promise.resolve();
    },
  } as unknown as GameClient;
  const controller = {
    setStopOnAll: (stopOn: StopOn) => void (stops = stopOn),
  } as unknown as ProgressionController;
  applyInterventionLevel(client, controller, w, index);
  for (const command of sent)
    if (command.type === 'delegate')
      w.delegation = { ...w.delegation, [command.key]: command.value };
  return { sent, stops: stops! };
}

describe('intervention levels (→WEB-45)', () => {
  it('level 2 is the new-club default and reads 2 whatever the training switch', () => {
    const w = world();
    const level2 = INTERVENTION_LEVELS[1];
    expect(w.delegation?.training).toBe(true);
    expect(interventionLevel(level2.stopOn, w)).toBe(1);
    w.delegation = { ...w.delegation, training: false };
    expect(interventionLevel(level2.stopOn, w)).toBe(1);
    // No level sets or reads the training focus: it belongs to 훈련 (→WEB-70).
    expect(LEVEL_KEYS).not.toContain('training');
    for (const level of INTERVENTION_LEVELS)
      expect(level.delegation).not.toHaveProperty('training');
    const { sent } = apply(w, 0);
    expect(sent.some((command) => command.type === 'delegate' && command.key === 'training')).toBe(
      false,
    );
    expect(w.delegation?.training).toBe(false);
  });

  it('one coaching department switched alone reads 맞춤', () => {
    const w = world();
    w.delegation = { ...w.delegation, 'coach:scout': true };
    const level = interventionLevel(INTERVENTION_LEVELS[1].stopOn, w);
    expect(level).toBe(-1);
    expect(levelName(level)).toBe('맞춤');
    // A stop changed on its own reads 맞춤 too.
    const fresh = world();
    expect(
      interventionLevel({ ...INTERVENTION_LEVELS[1].stopOn, 'staff-report': true }, fresh),
    ).toBe(-1);
  });

  it('level 4 delegates every department and the manager post', () => {
    const w = world();
    const { sent, stops } = apply(w, 3);
    expect(
      sent.map((command) => command.type === 'delegate' && [command.key, command.value]),
    ).toEqual([
      ['transfers', true],
      ['business', true],
      ...COACH_KEYS.map((key) => [key, true]),
      ['manager', true],
    ]);
    expect(interventionLevel(stops, w)).toBe(3);
    expect(levelName(3)).toBe('운영진에 모두 맡기기');
    // Back to level 2: the academy and contract talks stay with the staff, the rest come back.
    const back = apply(w, 1);
    expect(interventionLevel(back.stops, w)).toBe(1);
    expect(w.delegation).toMatchObject({
      academy: true,
      contracts: true,
      transfers: false,
      business: false,
      manager: false,
      'coach:assistant': false,
      'coach:scout': false,
    });
  });

  it('delegatedDecisions names each switched-on decision with its home', () => {
    const w = world();
    expect(delegatedDecisions(w)).toEqual([
      { key: 'training', label: '훈련 방향', home: { page: 'training', view: 'training' } },
      { key: 'academy', label: '유소년 승격·방출', home: { page: 'training', view: 'academy' } },
      { key: 'contracts', label: '선수 계약 협상', home: { page: 'people', view: 'players' } },
    ]);
    apply(w, 3);
    const decisions = delegatedDecisions(w);
    expect(decisions.map((decision) => decision.label)).toEqual([
      '훈련 방향',
      '유소년 승격·방출',
      '선수 계약 협상',
      '이적 제안 응답',
      '스폰서 계약',
      '수석코치 선임·재계약',
      '공격 코치 선임·재계약',
      '수비 코치 선임·재계약',
      '골키퍼 코치 선임·재계약',
      '피지컬 코치 선임·재계약',
      '유스 디렉터 선임·재계약',
      '수석 스카우트 선임·재계약',
      '감독 선임',
    ]);
    expect(decisions.find((decision) => decision.key === 'transfers')!.home).toEqual({
      page: 'people',
      view: 'market',
    });
    expect(decisions.find((decision) => decision.key === 'business')!.home).toEqual({
      page: 'business',
      view: 'sponsor',
    });
    expect(decisions.find((decision) => decision.key === 'coach:youth')!.home).toEqual({
      page: 'people',
      view: 'coaches',
    });
    expect(decisions.find((decision) => decision.key === 'manager')!.home).toEqual({
      page: 'people',
      view: 'manager',
    });
    apply(w, 0);
    expect(delegatedDecisions(w).map((decision) => decision.key)).toEqual(['training']);
  });
});
