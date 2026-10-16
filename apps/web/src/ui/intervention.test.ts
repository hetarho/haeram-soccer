import { describe, expect, it } from 'vitest';
import type { Command } from '../../../../packages/contracts/src/types';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import type { GameClient } from '../runtime/client';
import { applyResponsibilitySettings, decisionOwner, RESPONSIBILITY_LABELS } from './intervention';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Responsibility Town',
    color: '#225588',
    seed: 'intervention',
    level: 'normal',
  });
describe('central business responsibility presentation', () => {
  it('labels exactly seven decisions and distinguishes acquisition from sale authority', () => {
    const w = world();
    expect(Object.keys(RESPONSIBILITY_LABELS)).toHaveLength(7);
    expect(decisionOwner(w, 'staff')).toEqual({ key: 'staff', name: '스태프 인사', auto: true });
    w.settings!.responsibilities.recruitment = 'delegated';
    expect(decisionOwner(w, 'recruitment').auto).toBe(true);
    expect(decisionOwner(w, 'sales').auto).toBe(false);
  });
  it('sends one complete settings command only on explicit apply', async () => {
    const w = world(),
      sent: Command[] = [];
    const client = {
      command: (command: Command) => {
        sent.push(command);
        if (command.type === 'settings') operate(w, command);
        return Promise.resolve();
      },
    } as unknown as GameClient;
    const draft = structuredClone(w.settings!);
    draft.responsibilities.sales = 'delegated';
    expect(decisionOwner(w, 'sales').auto).toBe(false);
    expect(sent).toEqual([]);
    await applyResponsibilitySettings(client, draft);
    expect(sent).toEqual([{ type: 'settings', settings: draft }]);
    expect(decisionOwner(w, 'sales').auto).toBe(true);
  });
});
