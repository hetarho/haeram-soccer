import { describe, expect, it } from 'vitest';
import type { Command } from '../../../../packages/contracts/src/types';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import type { GameClient } from '../runtime/client';
import { LEVEL_STOPS } from '../runtime/progression';
import {
  applyInterventionLevel,
  decisionOwner,
  INTERVENTION_LEVELS,
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

describe('intervention levels (→WEB-45)', () => {
  it('names the four levels in order, from deciding everything to leaving it to the staff', () => {
    expect(INTERVENTION_LEVELS.map(({ level }) => level)).toEqual([1, 2, 3, 4]);
    expect(INTERVENTION_LEVELS.map(({ level }) => levelName(level))).toEqual([
      '모든 결정 확인',
      '중요한 결정만',
      '이적만 직접',
      '운영진에 모두 맡기기',
    ]);
    // Fewer stops level by level; the match eve stops only up to level 2.
    for (const level of [2, 3, 4] as const)
      expect(LEVEL_STOPS[level].length).toBeLessThan(LEVEL_STOPS[(level - 1) as 1 | 2 | 3].length);
    expect(LEVEL_STOPS[2]).toContain('match');
    expect(LEVEL_STOPS[3]).not.toContain('match');
  });

  it('sends one command and lets the level alone say who decides', async () => {
    const w = world();
    const sent: Command[] = [];
    const client = {
      command: (command: Command) => {
        sent.push(command);
        if (command.type === 'intervention') operate(w, command);
        return Promise.resolve();
      },
    } as unknown as GameClient;
    // New clubs start at level 2: the staff take training, the academy and contract talks.
    expect(decisionOwner(w, 'training')).toEqual({ level: 2, name: '중요한 결정만', auto: true });
    expect(decisionOwner(w, 'transfers').auto).toBe(false);
    await applyInterventionLevel(client, 4);
    expect(sent).toEqual([{ type: 'intervention', level: 4 }]);
    expect(decisionOwner(w, 'coach:scout')).toEqual({
      level: 4,
      name: '운영진에 모두 맡기기',
      auto: true,
    });
    expect(decisionOwner(w, 'business').auto).toBe(true);
    await applyInterventionLevel(client, 1);
    expect(decisionOwner(w, 'training')).toEqual({ level: 1, name: '모든 결정 확인', auto: false });
  });
});
