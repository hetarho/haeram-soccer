import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../../contracts/src/types';
import { retireAtClose } from './careers';
import { activePlayers, createWorld } from './index';
import { zeroMetrics } from './primitives';

describe('career farewells (→HIST-13)', () => {
  it('counts a farewell appearance only with minutes played', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Farewell Town',
      color: '#334455',
      seed: 'farewell',
      level: 'normal',
    });
    const p = activePlayers(w)[0];
    const line = (minutes: number) => {
      const metrics = zeroMetrics();
      metrics[10] = minutes;
      return { id: p.id, metrics };
    };
    // Played once, then named on the bench without coming on.
    w.ownMatches.push(
      { ...w.fixtures[0], id: 'played', players: [line(90)] } as unknown as MatchRecord,
      { ...w.fixtures[1], id: 'unused', players: [line(0)] } as unknown as MatchRecord,
    );
    p.retiring = w.year;
    retireAtClose(w);
    const farewell = w.events.find((e) => e.kind === 'retirement')!;
    expect(farewell.detail).toContain('우리 클럽 1경기');
  });
});
