import { describe, expect, it } from 'vitest';
import { staffAuthority } from './testing';
import { validateWorld } from '../../contracts/src/index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { academyPlayers, simulateSeason, FOUNDING_YEAR } from './index';
import { lastRound, world } from './academy.testkit';

describe('season boundary', () => {
  it('carries prospects across a real season close', () => {
    const { w, first } = cachedWorld('academy-close', () => {
      const w = world('academy-close');
      w.settings = staffAuthority(1);
      simulateSeason(w);
      const first = academyPlayers(w).map((player) => player.id);
      w.settings = staffAuthority(2);
      return { w: lastRound(w), first };
    });
    expect(first.length).toBe(3);
    simulateSeason(w);
    expect(
      academyPlayers(w).some((player) => player.id.includes(`:academy:${FOUNDING_YEAR + 1}:`)),
    ).toBe(true);
    expect(academyPlayers(w).every((player) => w.year - player.born < 22)).toBe(true);
    validateWorld(w);
  });
});
