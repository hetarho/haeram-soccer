import { describe, expect, it } from 'vitest';
import type { World } from '../../../../../packages/contracts/src/types';
import {
  defaultSettings,
  RESPONSIBILITY_KEYS,
} from '../../../../../packages/engine/src/responsibilities';
import { delegationCounts } from './officeSummary';

describe('office delegation counts', () => {
  it('counts observations and all seven responsibilities without conflating them', () => {
    const w = { settings: defaultSettings() } as unknown as World;
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'direct';
    w.settings!.observations = { matchEve: true, windowOpen: true };
    expect(delegationCounts(w)).toEqual({ delegated: 0, direct: 9, total: 9 });
    w.settings!.responsibilities.sponsors = 'delegated';
    w.settings!.observations.windowOpen = false;
    expect(delegationCounts(w)).toEqual({ delegated: 2, direct: 7, total: 9 });
  });
});
